import { Schema, model, Document } from "mongoose";

// Estado que atravessa duas mensagens: compra aguardando "sim/não", e-mail aguardando
// código, token de vínculo esperando o deep-link.
//
// Vivia na memória do processo, o que impedia rodar com mais de uma réplica — a
// confirmação caía numa instância que não tinha a pendente (C2). Uma coleção só, com
// três `kind`, porque o índice de TTL se define uma vez e os três se comportam igual:
// escreve, lê uma vez, expira.
//
// ⚠️ O varredor de TTL do Mongo roda a cada ~60 s, então um documento vencido continua
// legível por até um minuto. **Toda leitura filtra por `expiresAt` também** — o índice
// serve para limpar, não para dar a resposta.

export type ConversationStateKind = "purchase" | "email" | "link";

export interface IConversationStateBase {
  kind: ConversationStateKind;
  /** Chave de conversa ("platform:externalId") ou o próprio token, conforme o kind. */
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  expiresAt: Date;
}

export interface IConversationState extends IConversationStateBase, Document {}

const ConversationStateSchema = new Schema<IConversationState>(
  {
    kind: { type: String, required: true, enum: ["purchase", "email", "link"] },
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Um estado por (kind, chave): gravar de novo sobrescreve, que é o comportamento que
// o Map em memória tinha.
ConversationStateSchema.index({ kind: 1, key: 1 }, { unique: true });
// TTL: o Mongo apaga sozinho o que venceu. Sem isto a coleção cresce para sempre.
ConversationStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ConversationStateModel = model<IConversationState>(
  "ConversationState",
  ConversationStateSchema,
);
