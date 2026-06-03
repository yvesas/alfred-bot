import { Schema, model, Document } from "mongoose";

export type UserStatus = "awaiting_name" | "awaiting_email" | "complete";
export type AiModel = "gemini" | "gpt";

export interface IUserBase {
  telegramId: string;
  name?: string;
  email?: string;
  phone?: string;
  status: UserStatus;
  aiModel?: AiModel;
}

export type IUserCreate = Omit<IUserBase, "_id">;

export interface IUser extends IUserBase, Document {}

const UserSchema = new Schema<IUser>(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
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
  },
  {
    timestamps: true,
  },
);

export const UserModel = model<IUser>("User", UserSchema);
