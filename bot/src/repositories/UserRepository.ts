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
}
