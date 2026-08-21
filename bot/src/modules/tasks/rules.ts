import {
  ProactiveRule,
  ProactiveCandidate,
  ProactiveContext,
  PRIORITY,
} from "../../core/proactive/ProactiveRule";
import { ITask } from "../../models/Task";
import { t } from "../../i18n";

// Regras proativas do módulo de tarefas.
//
// Elas sabem o que é prazo e o que é urgente. **Não sabem** que existe teto de
// frequência, horário de silêncio ou deduplicação — isso é do motor (ADR-0004).
// Uma regra só responde: "há algo que valha dizer agora?"

/** Data no fuso local, como `YYYY-MM-DD`. Entra na chave para o aviso poder voltar amanhã. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Tarefa vencida ou vencendo hoje.
 *
 * Avisa **uma vez por dia**, não uma por tarefa: três avisos seguidos sobre três
 * tarefas é exatamente o comportamento que faz desinstalar. Quando há mais de uma, a
 * mensagem diz quantas e nomeia a mais urgente.
 */
export const tasksDueRule: ProactiveRule = {
  id: "tasks-due",
  moduleId: "tasks",

  async evaluate({ userId, lang, now, deps }: ProactiveContext): Promise<ProactiveCandidate[]> {
    const due = await deps.taskService.dueBy(userId, now);
    if (due.length === 0) return [];

    const overdue = due.filter((task) => isOverdue(task, now));
    const first = (overdue[0] ?? due[0]).description;

    // Vencida pesa mais que vencendo: uma já falhou, a outra ainda dá tempo.
    const isLate = overdue.length > 0;
    const key = `tasks-due:${isLate ? "overdue" : "today"}:${dayKey(now)}`;

    const text =
      due.length === 1
        ? t(lang, isLate ? "proactive_task_overdue" : "proactive_task_due_today", {
            description: first,
          })
        : t(lang, isLate ? "proactive_tasks_overdue" : "proactive_tasks_due_today", {
            count: due.length,
            description: first,
          });

    return [{ key, text, priority: isLate ? PRIORITY.overdue : PRIORITY.dueToday }];
  },
};

function isOverdue(task: ITask, now: Date): boolean {
  return task.dueDate !== undefined && task.dueDate.getTime() < now.getTime();
}

export const TASK_RULES: ProactiveRule[] = [tasksDueRule];
