import { registered, RegisteredCommand } from "../../core/CommandContext";
import { parseDueDate } from "./TaskService";
import { ITask } from "../../models/Task";
import { Language } from "../../models/User";
import { t } from "../../i18n";

// `/tarefas` — o comando do módulo. Um só, com subcomandos, como `/estoque` e
// `/categorias` já fazem: `add`, `ok`, `remover`, e sem subcomando lista.
//
// Comando é atalho. O caminho principal — "lembra de renovar o seguro dia 10" — é
// conversa, e entra quando o roteador de intenção chegar (Fase 3 do roadmap).

const tarefas = registered("tarefas", async ({ reply, lang, userId, args, deps }) => {
  const sub = (args[0] ?? "").toLowerCase();

  if (sub === "add" || sub === "adicionar") {
    return addTask(reply, lang, userId, args.slice(1), deps.taskService);
  }

  if (sub === "ok" || sub === "concluir" || sub === "done") {
    const task = await deps.taskService.completeNth(userId, Number(args[1]));
    await reply.text(
      task
        ? t(lang, "task_completed", { description: task.description })
        : t(lang, "task_invalid_number"),
    );
    return;
  }

  if (isRemoveSubcommand(sub)) {
    const task = await deps.taskService.removeNth(userId, Number(args[1]));
    await reply.text(
      task
        ? t(lang, "task_removed", { description: task.description })
        : t(lang, "task_invalid_number"),
    );
    return;
  }

  // Sem subcomando: lista as pendentes.
  const tasks = await deps.taskService.listPending(userId);
  if (tasks.length === 0) {
    await reply.text(t(lang, "task_empty"));
    return;
  }

  const body = tasks.map((task, i) => formatTask(task, i + 1, lang)).join("\n");
  await reply.text(`${t(lang, "task_header")}\n\n${body}\n\n${t(lang, "task_footer")}`);
});

async function addTask(
  reply: { text(message: string): Promise<void> },
  lang: Language,
  userId: string,
  args: string[],
  taskService: { add(userId: string, description: string, dueDate?: Date): Promise<ITask> },
): Promise<void> {
  // O prazo, se vier, é o primeiro token. Se não casar com DD/MM, é parte da
  // descrição — "comprar 12/24 garrafas" não vira prazo por engano... e sim,
  // vira, se for exatamente DD/MM. É o preço de um atalho previsível.
  const due = args[0] ? parseDueDate(args[0]) : null;
  const description = (due ? args.slice(1) : args).join(" ").trim();

  if (!description) {
    await reply.text(t(lang, "task_add_usage"));
    return;
  }

  const task = await taskService.add(userId, description, due ?? undefined);
  await reply.text(
    task.dueDate
      ? t(lang, "task_added_with_due", {
          description: task.description,
          due: formatDue(task.dueDate),
        })
      : t(lang, "task_added", { description: task.description }),
  );
}

// ---------- Formatação ----------

export function formatDue(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function formatTask(task: ITask, index: number, lang: Language, now = new Date()): string {
  if (!task.dueDate) {
    return t(lang, "task_item", { index, description: task.description });
  }
  // Vencida ganha marcação própria: numa lista longa, o que já passou tem que
  // saltar sem a pessoa comparar datas de cabeça.
  const key = task.dueDate.getTime() < now.getTime() ? "task_item_overdue" : "task_item_with_due";
  return t(lang, key, {
    index,
    description: task.description,
    due: formatDue(task.dueDate),
  });
}

function isRemoveSubcommand(sub: string): boolean {
  return sub === "remover" || sub === "remove" || sub === "rm" || sub === "del";
}

export const TASK_COMMANDS: RegisteredCommand[] = [tarefas];
