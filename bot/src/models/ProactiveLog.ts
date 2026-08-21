import { Schema, model, Document } from "mongoose";

// O que o Alfred já disse sem ser perguntado.
//
// Serve a três coisas, nesta ordem de importância:
//
// 1. **Não repetir.** Sem isto, o mesmo "esta tarefa vence hoje" sairia a cada ciclo
//    até a pessoa concluir a tarefa — e ela desinstalaria antes.
// 2. **Respeitar o teto.** Quantos avisos saíram hoje para este usuário.
// 3. **Saber se serviu.** `respondedAt` é preenchido quando a pessoa escreve logo
//    depois de um aviso. É a métrica que diz se a proatividade ajuda ou incomoda —
//    sem ela, ajustaríamos as regras no escuro.
export interface IProactiveLogBase {
  userId: string;
  /** Identidade do aviso, vinda da regra. Ex.: "task-due:t1:2026-09-10". */
  key: string;
  /** Qual regra gerou. Para medir regra por regra. */
  ruleId: string;
  sentAt: Date;
  delivered: boolean;
  /** Quando a pessoa escreveu depois do aviso, se escreveu. */
  respondedAt?: Date;
}

export interface IProactiveLog extends IProactiveLogBase, Document {}

const ProactiveLogSchema = new Schema<IProactiveLog>(
  {
    userId: { type: String, required: true },
    key: { type: String, required: true },
    ruleId: { type: String, required: true },
    sentAt: { type: Date, required: true },
    delivered: { type: Boolean, required: true },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

// "Já falei disto?" — a consulta de todo ciclo.
ProactiveLogSchema.index({ userId: 1, key: 1 }, { unique: true });
// "Quantos hoje?" e "houve resposta?".
ProactiveLogSchema.index({ userId: 1, sentAt: -1 });

export const ProactiveLogModel = model<IProactiveLog>("ProactiveLog", ProactiveLogSchema);
