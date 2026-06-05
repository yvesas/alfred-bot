import { inject, injectable } from "inversify";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { IReminder } from "../models/Reminder";
import { Platform } from "../core/IncomingMessage";
import { Language } from "../models/User";

// Hora do dia (local) em que os lembretes disparam.
const REMINDER_HOUR = 9;
export const MAX_DAY_OF_MONTH = 28; // evita meses sem dia 29-31

// Próxima ocorrência do dia do mês a partir de `from` (estritamente futura).
export function nextOccurrence(dayOfMonth: number, from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  let candidate = new Date(year, month, dayOfMonth, REMINDER_HOUR, 0, 0, 0);
  if (candidate.getTime() <= from.getTime()) {
    candidate = new Date(year, month + 1, dayOfMonth, REMINDER_HOUR, 0, 0, 0);
  }
  return candidate;
}

@injectable()
export class ReminderService {
  constructor(@inject(ReminderRepository) private reminderRepo: ReminderRepository) {}

  async list(platform: Platform, externalId: string): Promise<IReminder[]> {
    return await this.reminderRepo.findByUser(platform, externalId);
  }

  async add(
    platform: Platform,
    externalId: string,
    dayOfMonth: number,
    description: string,
    language: Language = "pt",
    from: Date = new Date(),
  ): Promise<IReminder> {
    return await this.reminderRepo.create({
      platform,
      externalId,
      description,
      dayOfMonth,
      nextRun: nextOccurrence(dayOfMonth, from),
      active: true,
      language,
    });
  }

  // Remove o n-ésimo (1-based) lembrete na ordem de list(). Retorna o removido ou null.
  async removeNth(platform: Platform, externalId: string, nStr: string): Promise<IReminder | null> {
    const n = Number(nStr);
    if (!Number.isInteger(n) || n < 1) return null;
    const all = await this.reminderRepo.findByUser(platform, externalId);
    const target = all[n - 1];
    if (!target) return null;
    return await this.reminderRepo.deleteOwned(String(target._id), platform, externalId);
  }

  async findDue(now: Date = new Date()): Promise<IReminder[]> {
    return await this.reminderRepo.findDue(now);
  }

  // Reprograma para o próximo mês após disparar.
  async markNotified(reminder: IReminder, now: Date = new Date()): Promise<void> {
    await this.reminderRepo.setNextRun(
      String(reminder._id),
      nextOccurrence(reminder.dayOfMonth, now),
      now,
    );
  }
}
