import { Schema, model, Document } from "mongoose";
import { Platform } from "../core/IncomingMessage";

export type UserStatus = "awaiting_name" | "awaiting_email" | "complete";
export type AiModel = "gemini" | "gpt";
export type Language = "pt" | "en" | "es";
export type Plan = "free" | "pro";

// Identidade do usuário numa plataforma (telegram id, número do WhatsApp, ...).
// Um usuário pode ter várias (multi-plataforma).
export interface IIdentity {
  platform: Platform;
  externalId: string;
}

// Orçamento mensal por categoria (ex.: { category: "Alimentação", limit: 500 }).
export interface IBudget {
  category: string;
  limit: number;
}

export interface IUserBase {
  identities: IIdentity[];
  telegramId?: string; // legado (compat com usuários criados antes do identities[])
  name?: string;
  email?: string;
  phone?: string;
  status: UserStatus;
  aiModel?: AiModel;
  categories?: string[]; // categorias personalizadas; vazio = usa as padrão
  language?: Language; // idioma preferido (default "pt")
  budgets?: IBudget[]; // orçamentos mensais por categoria
  // Identificadores VERIFICADOS (Fase 6) — chaves de auto-vínculo entre contas.
  verifiedEmail?: string; // verificado via WorkOS (login/Magic Auth)
  verifiedPhone?: string; // verificado pela plataforma (WhatsApp; Telegram via "compartilhar contato")
  plan?: Plan; // plano de uso (default "free")
  consentVersion?: string; // versão da Política de Privacidade aceita (LGPD)
  consentAt?: Date; // quando o consentimento foi registrado
}

export type IUserCreate = Omit<IUserBase, "_id">;

export interface IUser extends IUserBase, Document {}

const IdentitySchema = new Schema<IIdentity>(
  {
    platform: { type: String, required: true },
    externalId: { type: String, required: true },
  },
  { _id: false },
);

const BudgetSchema = new Schema<IBudget>(
  {
    category: { type: String, required: true },
    limit: { type: Number, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    identities: { type: [IdentitySchema], default: [] },
    telegramId: { type: String, unique: true, sparse: true }, // legado
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    status: {
      type: String,
      enum: ["awaiting_name", "awaiting_email", "complete"],
      default: "awaiting_name",
      required: true,
    },
    aiModel: { type: String, enum: ["gemini", "gpt"] },
    categories: { type: [String], default: [] },
    language: { type: String, enum: ["pt", "en", "es"], default: "pt" },
    budgets: { type: [BudgetSchema], default: [] },
    // Índices declarados abaixo via schema.index (evita índice duplicado).
    verifiedEmail: { type: String },
    verifiedPhone: { type: String },
    plan: { type: String, enum: ["free", "pro"], default: "free" },
    consentVersion: { type: String },
    consentAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

// Uma identidade (platform+externalId) pertence a no máximo um usuário.
UserSchema.index(
  { "identities.platform": 1, "identities.externalId": 1 },
  { unique: true, sparse: true },
);
// Busca rápida por identificador verificado (auto-vínculo). Não-único: durante o merge
// duas contas podem coexistir brevemente com o mesmo valor antes da fusão.
UserSchema.index({ verifiedEmail: 1 }, { sparse: true });
UserSchema.index({ verifiedPhone: 1 }, { sparse: true });

export const UserModel = model<IUser>("User", UserSchema);
