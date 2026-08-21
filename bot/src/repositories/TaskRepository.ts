import "reflect-metadata";
import { injectable } from "inversify";
import { TaskModel, ITask, ITaskCreate } from "../models/Task";

@injectable()
export class TaskRepository {
  async create(task: ITaskCreate): Promise<ITask> {
    return await TaskModel.create(task);
  }

  /**
   * Pendentes do usuário, as que vencem primeiro à frente. Tarefa sem prazo vai para
   * o fim — ela não é urgente, só existe.
   *
   * São duas consultas, e não um `sort({ dueDate: 1 })`, porque **o Mongo ordena
   * documento sem o campo ANTES dos que têm** — ausente conta como null, e null vem
   * primeiro no crescente. Um sort ingênuo colocaria justamente as tarefas sem prazo
   * no topo da lista. Um teste pegou isso.
   */
  async findPending(userId: string, limit = 20): Promise<ITask[]> {
    const pending = { userId, done: false };

    const withDue = await TaskModel.find({ ...pending, dueDate: { $ne: null } })
      .sort({ dueDate: 1 })
      .limit(limit)
      .exec();

    if (withDue.length >= limit) return withDue;

    const withoutDue = await TaskModel.find({ ...pending, dueDate: null })
      .sort({ createdAt: 1 })
      .limit(limit - withDue.length)
      .exec();

    return [...withDue, ...withoutDue];
  }

  /**
   * A n-ésima pendente (0-based), na mesma ordem da listagem.
   *
   * Índice sobre a mesma página que a pessoa viu, e não sobre o histórico inteiro:
   * ela só consegue citar um número que apareceu na tela, e a tela tem teto. É a
   * diferença para o `/editar` do módulo fin, que carrega tudo (C9).
   */
  async findNthPending(userId: string, index: number, limit = 20): Promise<ITask | null> {
    if (index < 0 || index >= limit) return null;
    const page = await this.findPending(userId, limit);
    return page[index] ?? null;
  }

  async countPending(userId: string): Promise<number> {
    return await TaskModel.countDocuments({ userId, done: false }).exec();
  }

  /** Marca como concluída. Escopo por `userId` na própria query. */
  async complete(userId: string, id: string, now: Date): Promise<ITask | null> {
    return await TaskModel.findOneAndUpdate(
      { _id: id, userId, done: false },
      { $set: { done: true, doneAt: now } },
      { new: true },
    ).exec();
  }

  async deleteById(userId: string, id: string): Promise<ITask | null> {
    return await TaskModel.findOneAndDelete({ _id: id, userId }).exec();
  }

  /** Tudo que vence até `until` e ainda está pendente — a consulta que a proatividade vai usar. */
  async findDue(userId: string, until: Date): Promise<ITask[]> {
    return await TaskModel.find({ userId, done: false, dueDate: { $lte: until } })
      .sort({ dueDate: 1 })
      .exec();
  }

  /** Exclusão de conta (LGPD): apaga tudo do usuário. */
  async deleteByUser(userId: string): Promise<number> {
    const result = await TaskModel.deleteMany({ userId }).exec();
    return result.deletedCount ?? 0;
  }
}
