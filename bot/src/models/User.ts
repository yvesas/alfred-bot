import { Schema, model, Document } from "mongoose";
import { Platform } from "../core/IncomingMessage";

export type UserStatus = "awaiting_name" | "awaiting_email" | "complete";
export type AiModel = "gemini" | "gpt";
export type Language = "pt" | "en" | "es";

// Identidade do usuário numa plataforma (telegram id, número do WhatsApp, ...).
// Um usuário pode ter várias (multi-plataforma).
export interface IIdentity {
  platform: Platform;
  externalId: string;
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

export const UserModel = model<IUser>("User", UserSchema);
