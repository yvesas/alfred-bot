import "reflect-metadata";
import { injectable } from "inversify";
import { ReminderModel, IReminder, IReminderCreate } from "../models/Reminder";
import { Platform } from "../core/IncomingMessage";

@injectable()
export class ReminderRepository {
  async create(reminder: IReminderCreate): Promise<IReminder> {
    return await ReminderModel.create(reminder);
  }

  // Lembretes do usuário, ordenados pelo dia (ordem estável para numeração no /lembretes).
  async findByUser(platform: Platform, externalId: string): Promise<IReminder[]> {
    return await ReminderModel.find({ platform, externalId })
      .sort({ dayOfMonth: 1, createdAt: 1 })
      .exec();
  }

  // Lembretes ativos cujo disparo já venceu (nextRun <= now).
  async findDue(now: Date): Promise<IReminder[]> {
    return await ReminderModel.find({ active: true, nextRun: { $lte: now } })
      .sort({ nextRun: 1 })
      .exec();
  }

  // Exclui escopado ao dono (platform+externalId) — segurança.
  async deleteOwned(id: string, platform: Platform, externalId: string): Promise<IReminder | null> {
    return await ReminderModel.findOneAndDelete({ _id: id, platform, externalId }).exec();
  }

  async setNextRun(id: string, nextRun: Date, lastNotifiedAt: Date): Promise<IReminder | null> {
    return await ReminderModel.findByIdAndUpdate(
      id,
      { nextRun, lastNotifiedAt },
      { new: true },
    ).exec();
  }
}
