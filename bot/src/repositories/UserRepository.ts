import "reflect-metadata";
import { injectable } from "inversify";
import { UserModel, IUser, IUserCreate } from "../models/User";
import { Platform } from "../core/IncomingMessage";

@injectable()
export class UserRepository {
  // Busca por identidade (platform+externalId). Para Telegram, também tenta o campo
  // legado telegramId — assim usuários criados antes do identities[] continuam resolvendo.
  async findByIdentity(platform: Platform, externalId: string): Promise<IUser | null> {
    const byIdentity = { identities: { $elemMatch: { platform, externalId } } };
    const query =
      platform === "telegram" ? { $or: [byIdentity, { telegramId: externalId }] } : byIdentity;
    return await UserModel.findOne(query).exec();
  }

  async create(user: IUserCreate): Promise<IUser> {
    return await UserModel.create(user);
  }

  async updateByIdentity(
    platform: Platform,
    externalId: string,
    patch: Partial<IUserCreate>,
  ): Promise<IUser | null> {
    const byIdentity = { identities: { $elemMatch: { platform, externalId } } };
    const query =
      platform === "telegram" ? { $or: [byIdentity, { telegramId: externalId }] } : byIdentity;
    return await UserModel.findOneAndUpdate(query, patch, { new: true }).exec();
  }

  // Remove o documento de uma identidade (usado ao absorver a conta anônima no login).
  async deleteByIdentity(platform: Platform, externalId: string): Promise<void> {
    await UserModel.deleteOne({ identities: { $elemMatch: { platform, externalId } } }).exec();
  }

  // ---------- Identificadores verificados / por _id (Fase 6) ----------

  // Busca uma conta com o identificador verificado. `excludeId` evita casar consigo mesmo
  // (procurando o "gêmeo" a fundir).
  async findByVerifiedEmail(email: string, excludeId?: string): Promise<IUser | null> {
    const query: Record<string, unknown> = { verifiedEmail: email.toLowerCase() };
    if (excludeId) query._id = { $ne: excludeId };
    return await UserModel.findOne(query).exec();
  }

  async findByVerifiedPhone(phone: string, excludeId?: string): Promise<IUser | null> {
    const query: Record<string, unknown> = { verifiedPhone: phone };
    if (excludeId) query._id = { $ne: excludeId };
    return await UserModel.findOne(query).exec();
  }

  async findById(id: string): Promise<IUser | null> {
    return await UserModel.findById(id).exec();
  }

  async updateById(id: string, patch: Partial<IUserCreate>): Promise<IUser | null> {
    return await UserModel.findByIdAndUpdate(id, patch, { new: true }).exec();
  }

  async deleteById(id: string): Promise<void> {
    await UserModel.deleteOne({ _id: id }).exec();
  }

  // Sessões web ANÔNIMAS inativas (LGPD/retenção): só web, nunca logaram (sem verifiedEmail),
  // sem identidade Telegram/WhatsApp nem telegramId legado, e sem atividade desde `cutoff`.
  async findAnonymousInactive(cutoff: Date): Promise<IUser[]> {
    return await UserModel.find({
      verifiedEmail: { $exists: false },
      telegramId: { $exists: false },
      "identities.platform": { $nin: ["telegram", "whatsapp"] },
      updatedAt: { $lt: cutoff },
    }).exec();
  }
}
