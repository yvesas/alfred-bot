import { Schema, model, Document } from "mongoose";
import { Platform } from "../core/IncomingMessage";
import { Language } from "./User";

// Lembrete recorrente mensal (ex.: conta a pagar no dia 10). Dispara um push na
// plataforma de origem (platform+externalId) quando `nextRun` vence.
export interface IReminderBase {
  platform: Platform;
  externalId: string; // como alcançar o usuário (push)
  description: string;
  dayOfMonth: number; // 1..28 (dia do vencimento/recorrência)
  nextRun: Date; // próximo disparo
  active: boolean;
  language: Language; // idioma para localizar o push
  lastNotifiedAt?: Date;
}

export type IReminderCreate = IReminderBase;

export interface IReminder extends IReminderBase, Document {}

const ReminderSchema = new Schema<IReminder>(
  {
    platform: { type: String, required: true },
    externalId: { type: String, required: true },
    description: { type: String, required: true },
    dayOfMonth: { type: Number, required: true, min: 1, max: 28 },
    nextRun: { type: Date, required: true },
    active: { type: Boolean, default: true },
    language: { type: String, enum: ["pt", "en", "es"], default: "pt" },
    lastNotifiedAt: { type: Date },
  },
  { timestamps: true },
);

// Disparo eficiente: busca por (active, nextRun) no ciclo do scheduler.
ReminderSchema.index({ active: 1, nextRun: 1 });
// Lista por usuário.
ReminderSchema.index({ platform: 1, externalId: 1 });

export const ReminderModel = model<IReminder>("Reminder", ReminderSchema);
