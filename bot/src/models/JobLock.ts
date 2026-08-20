import { Schema, model, Document } from "mongoose";

// Lock de job periódico. Uma linha por job, com dono e validade.
//
// Existe porque os schedulers rodam `setInterval` dentro do processo do bot: com N
// réplicas, N deles acordam juntos. O de lembretes mandaria N vezes a mesma mensagem;
// o de retenção, que **apaga contas**, rodaria concorrente consigo mesmo (C3).
//
// Mora no Mongo de propósito: lock de job é uma linha no banco que já existe, e não
// depende da decisão pendente sobre onde guardar o estado de conversa (C2).

export interface IJobLockBase {
  /** Nome do job: "reminders", "retention". Chave primária lógica. */
  job: string;
  /** Quem segurou. Só para diagnóstico — o dono não influencia a exclusão mútua. */
  owner: string;
  /** Até quando vale. Depois disso, outra instância pode tomar. */
  lockedUntil: Date;
}

export interface IJobLock extends IJobLockBase, Document {}

const JobLockSchema = new Schema<IJobLock>(
  {
    job: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
  },
  { timestamps: true },
);

export const JobLockModel = model<IJobLock>("JobLock", JobLockSchema);
