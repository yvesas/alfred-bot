import { inject, injectable } from "inversify";
import { Platform } from "../../core/IncomingMessage";
import { Replier } from "../../core/Replier";
import { currency } from "../../core/format";
import { conversationKey } from "../../core/conversationKey";
import { ConversationStateStore } from "../../core/ConversationStateStore";
import { PurchaseService } from "../../services/PurchaseService";
import { BudgetService } from "../../services/BudgetService";
import { PlanService } from "../../services/PlanService";
import {
  ModelResponse,
  SpendingGroupBy,
  SpendingPeriod,
} from "../../services/MessageProcessingService";
import {
  convertModelResponseToPurchase,
  validatePurchaseData,
} from "../../infra/converters/purchaseConverter";
import { IPurchaseCreate } from "../../models/Purchase";
import { Language, Plan } from "../../models/User";
import { MessageKey, t } from "../../i18n";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";

// O fluxo de compra do módulo fin: o que fazer com o que a IA entendeu, a confirmação
// "sim/não", a gravação e o alerta de orçamento — mais a consulta de gastos, que é a
// outra ponta do mesmo domínio.
//
// Saiu do `BotCore` (C4) porque é regra de NEGÓCIO: sabe o que é compra, cupom e
// orçamento. O que ficou lá é o chassi — normalizar, resolver o usuário e despachar.
// Ver ADR-0004 e `modules/README.md`.

// Respostas aceitas na confirmação de compra ("sim/não").
const AFFIRMATIVE = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "confirmar",
  "confirma",
  "ok",
  "isso",
  "👍",
  "✅",
]);
const NEGATIVE = new Set(["não", "nao", "n", "no", "cancelar", "cancela", "cancelado"]);

@injectable()
export class PurchaseFlow {
  constructor(
    @inject(PurchaseService) private purchaseService: PurchaseService,
    @inject(BudgetService) private budgetService: BudgetService,
    @inject(PlanService) private planService: PlanService,
    // Compras aguardando confirmação. Saíram de um Map do processo para o store
    // compartilhado (C2): a pergunta pode sair de uma réplica e o "sim" chegar noutra.
    @inject(ConversationStateStore) private pending: ConversationStateStore,
  ) {}

  // ---------- Roteamento da resposta da IA ----------

  async handleProcessed(
    reply: Replier,
    platform: Platform,
    externalId: string,
    userId: string,
    lang: Language,
    plan: Plan,
    processed: ModelResponse,
  ): Promise<void> {
    if (processed.intent === "query") {
      await this.handleSpendingQuery(reply, userId, lang, processed.period, processed.groupBy);
      return;
    }

    if (processed.intent !== "purchase") {
      // processed.message vem da IA já no idioma do usuário; senão, fallback localizado.
      await reply.text(processed.message || t(lang, "not_understood"));
      return;
    }

    const purchaseData = convertModelResponseToPurchase(processed);
    purchaseData.userId = userId; // garante a identidade canônica (Fase 6)

    // Deduplicação de cupom fiscal (NFC-e): não registra o mesmo cupom duas vezes.
    if (purchaseData.fiscalKey) {
      const existing = await this.purchaseService.findByFiscalKey(userId, purchaseData.fiscalKey);
      if (existing) {
        await reply.text(t(lang, "receipt_already_registered"));
        return;
      }
    }

    // Limite do plano free (compras/mês). Pro é ilimitado.
    if (!(await this.planService.canRegister(userId, plan))) {
      await reply.text(t(lang, "plan_limit_reached", { limit: this.planService.freeLimit }));
      return;
    }

    const validation = validatePurchaseData(purchaseData);
    if (!validation.ok) {
      await reply.text(t(lang, validation.reason));
      return;
    }

    // Confirmação antes de salvar: guarda a pendente e pede "sim/não".
    if (config.confirmPurchase) {
      await this.pending.put(
        "purchase",
        conversationKey(platform, externalId),
        purchaseData,
        config.pendingPurchaseTtlMs,
      );
      await reply.text(
        t(lang, "purchase_confirm", {
          description: purchaseData.description,
          total: purchaseData.total.toFixed(2),
        }),
      );
      return;
    }

    await this.savePurchase(reply, platform, externalId, lang, purchaseData);
  }

  // ---------- Confirmação de compra (A1) ----------

  // Interpreta a mensagem como resposta a uma compra pendente.
  // Retorna true se consumiu a mensagem (salvou/cancelou); false se não havia pendente
  // ou se a resposta não foi sim/não (nesse caso, abandona a pendente e segue o fluxo normal).
  async resolvePendingConfirmation(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    text: string,
  ): Promise<boolean> {
    const key = conversationKey(platform, externalId);
    const pending = await this.pending.get<IPurchaseCreate>("purchase", key);
    if (!pending) return false;

    const answer = text.trim().toLowerCase();

    if (AFFIRMATIVE.has(answer)) {
      await this.pending.remove("purchase", key);
      await this.savePurchase(reply, platform, externalId, lang, pending);
      return true;
    }
    if (NEGATIVE.has(answer)) {
      await this.pending.remove("purchase", key);
      await reply.text(t(lang, "purchase_cancelled"));
      return true;
    }

    // Resposta diferente de sim/não: descarta a pendente e processa a mensagem normalmente.
    await this.pending.remove("purchase", key);
    return false;
  }

  private async savePurchase(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    purchaseData: IPurchaseCreate,
  ): Promise<void> {
    try {
      await this.purchaseService.addPurchase(purchaseData);

      // Alertas de orçamento (se a categoria desta compra tiver limite definido).
      const alerts = await this.budgetService.alertsForPurchase(
        platform,
        externalId,
        purchaseData,
        lang,
      );
      const suffix = alerts.length ? `\n\n${alerts.join("\n")}` : "";

      await reply.text(
        t(lang, "purchase_saved", {
          description: purchaseData.description,
          total: purchaseData.total.toFixed(2),
        }) + suffix,
      );
    } catch (error) {
      logger.error({ err: error }, "Erro ao registrar compra");
      await reply.text(t(lang, "purchase_save_error"));
    }
  }

  // ---------- Consulta de gastos ----------

  async handleSpendingQuery(
    reply: Replier,
    userId: string,
    lang: Language,
    period: SpendingPeriod = "current_month",
    groupBy?: SpendingGroupBy,
  ): Promise<void> {
    const report = await this.purchaseService.getSpendingReport(userId, period);
    const label = periodLabel(report.period, lang);

    if (report.count === 0) {
      await reply.text(t(lang, "spending_empty", { period: label }));
      return;
    }

    let message = t(lang, "spending_report", {
      period: label,
      total: report.total.toFixed(2),
      count: report.count,
    });

    if (groupBy === "category") {
      message += formatBreakdown(t(lang, "breakdown_category"), report.byCategory, lang);
    } else if (groupBy === "store") {
      message += formatBreakdown(t(lang, "breakdown_store"), report.byStore, lang);
    }

    await reply.text(message);
  }
}

// ---------- Auxiliares puros ----------

export function periodLabel(period: SpendingPeriod, lang: Language): string {
  const key: MessageKey =
    period === "last_month"
      ? "period_last_month"
      : period === "all"
        ? "period_all"
        : "period_current_month";
  return t(lang, key);
}

export function formatBreakdown(
  title: string,
  data: Record<string, number>,
  lang: Language,
): string {
  const cur = currency(lang);
  const lines = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => `• ${key}: ${cur} ${value.toFixed(2)}`);

  if (lines.length === 0) {
    return "";
  }
  return `\n\n${title}:\n${lines.join("\n")}`;
}
