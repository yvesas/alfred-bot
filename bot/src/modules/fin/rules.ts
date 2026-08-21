import {
  ProactiveRule,
  ProactiveCandidate,
  ProactiveContext,
  PRIORITY,
} from "../../core/proactive/ProactiveRule";
import { currency } from "../../core/format";
import { dayKey } from "../tasks/rules";
import { t } from "../../i18n";

// Regras proativas do módulo fin.
//
// O `BudgetService` já avisa **ao salvar uma compra** — reativo, e continua. Aqui é
// diferente: avisa mesmo que a pessoa não registre nada, porque o mês passa e o teto
// se aproxima sozinho.

/** Fração do orçamento a partir da qual vale avisar sem ser perguntado. */
const WARN_RATIO = 0.8;

/**
 * Orçamento estourado ou perto do teto.
 *
 * Uma categoria por vez, a pior — listar cinco de uma vez é relatório, não aviso, e
 * quem quer relatório digita `/orcamento`.
 */
export const budgetRule: ProactiveRule = {
  id: "budget-threshold",
  moduleId: "fin",

  async evaluate({
    user,
    userId,
    lang,
    now,
    deps,
  }: ProactiveContext): Promise<ProactiveCandidate[]> {
    const budgets = user.budgets ?? [];
    if (budgets.length === 0) return [];

    const report = await deps.purchaseService.getSpendingReport(userId, "current_month");

    // A categoria mais estourada, proporcionalmente — não a de maior valor absoluto.
    let worst: { category: string; spent: number; limit: number; ratio: number } | null = null;
    for (const budget of budgets) {
      if (budget.limit <= 0) continue;
      const spent = spentOn(report.byCategory, budget.category);
      const ratio = spent / budget.limit;
      if (ratio >= WARN_RATIO && (!worst || ratio > worst.ratio)) {
        worst = { category: budget.category, spent, limit: budget.limit, ratio };
      }
    }
    if (!worst) return [];

    const over = worst.ratio >= 1;
    const cur = currency(lang);
    // A chave inclui o mês, não o dia: o teto é mensal, e repetir todo dia sobre o
    // mesmo estouro é ruído. Volta no mês que vem, ou se outra categoria estourar.
    const key = `budget:${over ? "over" : "warn"}:${worst.category.toLowerCase()}:${monthKey(now)}`;

    return [
      {
        key,
        text: t(lang, over ? "proactive_budget_over" : "proactive_budget_warn", {
          category: worst.category,
          spent: `${cur} ${worst.spent.toFixed(2)}`,
          limit: `${cur} ${worst.limit.toFixed(2)}`,
          pct: Math.round(worst.ratio * 100),
        }),
        priority: over ? PRIORITY.budgetOver : PRIORITY.budgetWarning,
      },
    ];
  },
};

function spentOn(byCategory: Record<string, number>, category: string): number {
  const target = category.toLowerCase();
  return Object.entries(byCategory)
    .filter(([name]) => name.toLowerCase() === target)
    .reduce((sum, [, value]) => sum + value, 0);
}

function monthKey(date: Date): string {
  return dayKey(date).slice(0, 7);
}

export const FIN_RULES: ProactiveRule[] = [budgetRule];
