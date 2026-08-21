import { inject, injectable } from "inversify";
import { TaskRepository } from "../../repositories/TaskRepository";
import { ITask } from "../../models/Task";

// Regra de negócio do módulo de tarefas. Mora no módulo, como o `PurchaseFlow` do
// fin — é domínio: sabe o que é tarefa, prazo e conclusão (ADR-0004).

/** Quantas tarefas a listagem do chat mostra. Mais que isso vira parede de texto. */
export const TASK_PAGE_SIZE = 20;

@injectable()
export class TaskService {
  constructor(@inject(TaskRepository) private taskRepo: TaskRepository) {}

  async add(userId: string, description: string, dueDate?: Date): Promise<ITask> {
    return this.taskRepo.create({ userId, description, dueDate });
  }

  async listPending(userId: string): Promise<ITask[]> {
    return this.taskRepo.findPending(userId, TASK_PAGE_SIZE);
  }

  async countPending(userId: string): Promise<number> {
    return this.taskRepo.countPending(userId);
  }

  /**
   * Conclui a n-ésima pendente da listagem (1-based, como o usuário vê).
   * `null` quando o número não corresponde a nada.
   */
  async completeNth(userId: string, nth: number, now: Date = new Date()): Promise<ITask | null> {
    const task = await this.nth(userId, nth);
    if (!task) return null;
    return this.taskRepo.complete(userId, String(task._id), now);
  }

  async removeNth(userId: string, nth: number): Promise<ITask | null> {
    const task = await this.nth(userId, nth);
    if (!task) return null;
    return this.taskRepo.deleteById(userId, String(task._id));
  }

  /** O que já venceu ou vence até o fim do dia de `now`. */
  async dueBy(userId: string, now: Date = new Date()): Promise<ITask[]> {
    return this.taskRepo.findDue(userId, endOfDay(now));
  }

  private async nth(userId: string, nth: number): Promise<ITask | null> {
    if (!Number.isInteger(nth) || nth < 1) return null;
    return this.taskRepo.findNthPending(userId, nth - 1, TASK_PAGE_SIZE);
  }
}

// ---------- Auxiliares puros ----------

export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Lê um prazo no formato `DD/MM` — o jeito que se escreve data no Brasil.
 *
 * Deliberadamente restrito: interpretar linguagem natural ("sexta", "semana que vem")
 * é trabalho da IA no fluxo de conversa, não de um parser de comando. Aqui, comando é
 * atalho — e atalho tem que ser previsível.
 *
 * Data já passada neste ano vira a do ano seguinte: quem escreve "01/02" em dezembro
 * quer fevereiro que vem, não o que passou.
 */
export function parseDueDate(token: string, now: Date = new Date()): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(token.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = new Date(now.getFullYear(), month - 1, day, 23, 59, 59, 999);
  // Rejeita 31/02 e afins: o Date normaliza para março, então o mês muda.
  if (candidate.getMonth() !== month - 1) return null;

  if (candidate.getTime() < now.getTime()) {
    return new Date(now.getFullYear() + 1, month - 1, day, 23, 59, 59, 999);
  }
  return candidate;
}
