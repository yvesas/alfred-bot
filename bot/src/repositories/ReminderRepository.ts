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

  // Exclui todos os lembretes das identidades informadas (exclusão de conta).
  async deleteByIdentities(
    identities: { platform: Platform; externalId: string }[],
  ): Promise<number> {
    if (!identities.length) return 0;
    const result = await ReminderModel.deleteMany({
      $or: identities.map((i) => ({ platform: i.platform, externalId: i.externalId })),
    }).exec();
    return result.deletedCount ?? 0;
  }

  // Migra os lembretes de uma identidade para outra (merge de conta anônima → logada).
  async reassignExternalId(
    platform: Platform,
    oldExternalId: string,
    newExternalId: string,
  ): Promise<number> {
    const result = await ReminderModel.updateMany(
      { platform, externalId: oldExternalId },
      { $set: { externalId: newExternalId } },
    ).exec();
    return result.modifiedCount ?? 0;
  }
}
