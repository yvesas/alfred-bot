import { registered, RegisteredCommand, RegisteredCommandContext } from "../../core/CommandContext";
import { currency } from "../../core/format";
import { PurchaseService } from "../../services/PurchaseService";
import { t } from "../../i18n";

// Os comandos do módulo fin. Saíram do `switch` de 19 casos do `BotCore` (C4) e vieram
// para onde o domínio mora (ADR-0004): quem sabe o que é compra, orçamento e despensa
// é o módulo, não o chassi.
//
// Comando é atalho — o caminho principal é conversa. Quando a frente de UX chegar,
// é aqui que os botões do Telegram se penduram, um comando por vez.

const PAGE_SIZE = 5;

// ---------- Consulta de gastos ----------

const gastos = registered("gastos", async ({ reply, userId, lang, deps }) => {
  await deps.purchaseFlow.handleSpendingQuery(reply, userId, lang, "current_month");
});

// ---------- Histórico de compras ----------

/** Página pedida em `/compras 3`. Entrada inválida cai na primeira, sem reclamar. */
export function parsePage(arg?: string): number {
  const n = Number(arg);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

const compras = registered("compras", async ({ reply, lang, userId, args, deps }) => {
  const page = parsePage(args[0]);
  const cur = currency(lang);
  const {
    items,
    total,
    pages,
    page: current,
  } = await deps.purchaseService.getUserPurchasesPage(userId, page, PAGE_SIZE);

  if (total === 0) {
    await reply.text(t(lang, "purchases_empty"));
    return;
  }

  const offset = (current - 1) * PAGE_SIZE;
  const body = items
    .map((p, i) =>
      t(lang, "purchases_item", {
        index: offset + i + 1,
        description: p.description,
        total: `${cur} ${p.total.toFixed(2)}`,
        date: p.date.toLocaleDateString(),
      }),
    )
    .join("\n");

  let footer = `\n\n${t(lang, "purchases_page_info", { current, pages, total })}`;
  if (current < pages) {
    footer += `\n${t(lang, "purchases_more", { next: current + 1 })}`;
  }
  footer += `\n${t(lang, "purchases_fix_hint")}`;

  await reply.text(`${t(lang, "purchases_header")}\n\n${body}${footer}`);
});

// ---------- Editar / excluir compras (A2) ----------

/**
 * Resolve o n-ésimo item (1-based) na ordem de `/compras` — numeração absoluta,
 * atravessando as páginas.
 *
 * Nota: carrega o histórico inteiro para pegar um item (C9). O repositório já tem
 * `findByUserPaged`, que resolveria com uma query; trocar aqui é mudança de
 * comportamento? Não — mas é mudança, e este refactor não muda comportamento.
 */
async function nthRecentPurchase(purchaseService: PurchaseService, userId: string, nStr: string) {
  const n = Number(nStr);
  if (!Number.isInteger(n) || n < 1) return null;
  const all = await purchaseService.getUserPurchases(userId);
  return all[n - 1] ?? null;
}

const excluir = registered("excluir", async ({ reply, lang, userId, args, deps }) => {
  const target = await nthRecentPurchase(deps.purchaseService, userId, args[0]);
  if (!target) {
    await reply.text(t(lang, "delete_invalid"));
    return;
  }
  await deps.purchaseService.deletePurchase(userId, String(target._id));
  await reply.text(
    t(lang, "delete_done", { description: target.description, total: target.total.toFixed(2) }),
  );
});

const editar = registered("editar", async ({ reply, lang, userId, args, deps }) => {
  const field = (args[1] ?? "").toLowerCase();
  const value = args.slice(2).join(" ").trim();
  const target = await nthRecentPurchase(deps.purchaseService, userId, args[0] ?? "");

  if (!target || !field || !value) {
    await reply.text(t(lang, "edit_usage"));
    return;
  }

  const patch: { total?: number; description?: string } = {};
  if (field === "total" || field === "valor") {
    const v = Number(value.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      await reply.text(t(lang, "edit_invalid_value"));
      return;
    }
    patch.total = v;
  } else if (field === "descrição" || field === "descricao" || field === "desc") {
    patch.description = value;
  } else {
    await reply.text(t(lang, "edit_invalid_field"));
    return;
  }

  const updated = await deps.purchaseService.updatePurchase(userId, String(target._id), patch);
  if (!updated) {
    await reply.text(t(lang, "edit_failed"));
    return;
  }
  await reply.text(
    t(lang, "edit_done", { description: updated.description, total: updated.total.toFixed(2) }),
  );
});

// ---------- Categorias personalizadas (A3) ----------

const categorias = registered(
  "categorias",
  async ({ reply, platform, externalId, lang, args, deps }) => {
    const sub = (args[0] ?? "").toLowerCase();
    const name = args.slice(1).join(" ").trim();

    if (sub === "add" || sub === "adicionar") {
      if (!name) {
        await reply.text(t(lang, "categories_add_usage"));
        return;
      }
      const cats = await deps.userService.addCategory(platform, externalId, name);
      await reply.text(t(lang, "categories_added", { list: cats.join(", ") }));
      return;
    }

    if (isRemoveSubcommand(sub)) {
      if (!name) {
        await reply.text(t(lang, "categories_remove_usage"));
        return;
      }
      const cats = await deps.userService.removeCategory(platform, externalId, name);
      const list = cats.length ? cats.join(", ") : t(lang, "categories_default_label");
      await reply.text(t(lang, "categories_removed", { list }));
      return;
    }

    // Sem subcomando: lista.
    const cats = await deps.userService.getCategories(platform, externalId);
    if (cats.length === 0) {
      await reply.text(t(lang, "categories_default_hint"));
      return;
    }
    await reply.text(t(lang, "categories_list", { list: cats.join(", ") }));
  },
);

// ---------- Orçamento mensal (o alerta sai no PurchaseFlow, ao salvar) ----------

const orcamento = registered(
  "orcamento",
  async ({ reply, platform, externalId, userId, lang, args, deps }) => {
    const sub = (args[0] ?? "").toLowerCase();
    const cur = currency(lang);

    if (isRemoveSubcommand(sub)) {
      const category = args.slice(1).join(" ").trim();
      if (!category) {
        await reply.text(t(lang, "budget_remove_usage"));
        return;
      }
      const budgets = await deps.userService.removeBudget(platform, externalId, category);
      const list = budgets.length
        ? budgets.map((b) => `• ${b.category}: ${cur} ${b.limit.toFixed(2)}`).join("\n")
        : t(lang, "budget_none_label");
      await reply.text(t(lang, "budget_removed", { list }));
      return;
    }

    // Definir: "/orcamento <categoria...> <valor>". O último token é o limite.
    if (args.length >= 2) {
      const limit = Number(args[args.length - 1].replace(",", "."));
      const category = args.slice(0, -1).join(" ").trim();
      if (!category || !Number.isFinite(limit) || limit <= 0) {
        await reply.text(t(lang, "budget_set_usage"));
        return;
      }
      await deps.userService.setBudget(platform, externalId, category, limit);
      await reply.text(t(lang, "budget_set", { category, limit: limit.toFixed(2) }));
      return;
    }

    // Sem argumentos: lista os orçamentos com o gasto do mês atual.
    const budgets = await deps.userService.getBudgets(platform, externalId);
    if (budgets.length === 0) {
      await reply.text(t(lang, "budget_empty"));
      return;
    }

    const report = await deps.purchaseService.getSpendingReport(userId, "current_month");
    const lines = budgets.map((b) => {
      const spent = Object.entries(report.byCategory)
        .filter(([k]) => k.toLowerCase() === b.category.toLowerCase())
        .reduce((sum, [, v]) => sum + v, 0);
      const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      return `• ${b.category}: ${cur} ${spent.toFixed(2)} / ${cur} ${b.limit.toFixed(2)} (${pct}%)`;
    });

    await reply.text(
      `${t(lang, "budget_list_header")}\n${lines.join("\n")}\n\n${t(lang, "budget_list_footer")}`,
    );
  },
);

// ---------- Lembretes (push recorrente; entrega via ReminderScheduler) ----------

const lembretes = registered(
  "lembretes",
  async ({ reply, platform, externalId, lang, args, deps }) => {
    const sub = (args[0] ?? "").toLowerCase();

    if (sub === "add" || sub === "adicionar") {
      const day = Number(args[1]);
      const description = args.slice(2).join(" ").trim();
      // Até 28 porque todo mês tem dia 28 — evita o lembrete que some em fevereiro.
      if (!Number.isInteger(day) || day < 1 || day > 28 || !description) {
        await reply.text(t(lang, "reminder_add_usage"));
        return;
      }
      const reminder = await deps.reminderService.add(platform, externalId, day, description, lang);
      await reply.text(
        t(lang, "reminder_created", {
          description: reminder.description,
          day: reminder.dayOfMonth,
        }),
      );
      return;
    }

    if (isRemoveSubcommand(sub)) {
      const removed = await deps.reminderService.removeNth(platform, externalId, args[1] ?? "");
      if (!removed) {
        await reply.text(t(lang, "reminder_remove_invalid"));
        return;
      }
      await reply.text(t(lang, "reminder_removed", { description: removed.description }));
      return;
    }

    // Sem subcomando: lista.
    const list = await deps.reminderService.list(platform, externalId);
    if (list.length === 0) {
      await reply.text(t(lang, "reminder_empty"));
      return;
    }
    const body = list
      .map((r, i) =>
        t(lang, "reminder_list_item", {
          index: i + 1,
          day: r.dayOfMonth,
          description: r.description,
        }),
      )
      .join("\n");
    await reply.text(
      `${t(lang, "reminder_list_header")}\n\n${body}\n\n${t(lang, "reminder_list_footer")}`,
    );
  },
);

// ---------- Estoque / despensa ----------

const estoque = registered("estoque", async ({ reply, lang, userId, args, deps }) => {
  const sub = (args[0] ?? "").toLowerCase();

  if (sub === "add" || sub === "adicionar") {
    const quantity = Number(args[1]);
    const name = args.slice(2).join(" ").trim();
    if (!Number.isInteger(quantity) || quantity <= 0 || !name) {
      await reply.text(t(lang, "stock_add_usage"));
      return;
    }
    const product = await deps.productService.addOrIncrement(userId, name, quantity);
    await reply.text(t(lang, "stock_added", { name: product.name, quantity: product.quantity }));
    return;
  }

  if (isRemoveSubcommand(sub)) {
    const name = args.slice(1).join(" ").trim();
    if (!name) {
      await reply.text(t(lang, "stock_remove_usage"));
      return;
    }
    const removed = await deps.productService.removeProduct(userId, name);
    await reply.text(t(lang, removed ? "stock_removed" : "stock_not_found", { name }));
    return;
  }

  // Sem subcomando: lista.
  const products = await deps.productService.getUserProducts(userId);
  if (products.length === 0) {
    await reply.text(t(lang, "stock_empty"));
    return;
  }
  const body = products
    .map((p) => t(lang, "stock_item", { name: p.name, quantity: p.quantity }))
    .join("\n");
  await reply.text(`${t(lang, "stock_header")}\n\n${body}\n\n${t(lang, "stock_footer")}`);
});

// ---------- Exportação (CSV) ----------

const exportar = registered("exportar", async ({ reply, lang, userId, deps }) => {
  // Nem toda plataforma entrega arquivo — o Replier declara isso como opcional.
  if (!reply.document) {
    await reply.text(t(lang, "export_unavailable"));
    return;
  }
  const csv = await deps.exportService.purchasesCsv(userId);
  if (csv.split("\n").length <= 1) {
    await reply.text(t(lang, "export_empty"));
    return;
  }
  await reply.document(Buffer.from(csv, "utf8"), "alfred-compras.csv", "text/csv");
  await reply.text(t(lang, "export_done"));
});

// ---------- Auxiliares ----------

/** Os quatro jeitos de dizer "remover" que o bot aceita, em português e inglês. */
function isRemoveSubcommand(sub: string): boolean {
  return sub === "remover" || sub === "remove" || sub === "rm" || sub === "del";
}

export const FIN_COMMANDS: RegisteredCommand[] = [
  gastos,
  compras,
  editar,
  excluir,
  categorias,
  orcamento,
  lembretes,
  estoque,
  exportar,
];

export type { RegisteredCommandContext };
