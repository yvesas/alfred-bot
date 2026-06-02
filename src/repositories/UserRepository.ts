import "reflect-metadata";
import { injectable } from "inversify";
import { UserModel, IUser, IUserCreate } from "../models/User";

@injectable()
export class UserRepository {
  async findByTelegramId(telegramId: string): Promise<IUser | null> {
    return await UserModel.findOne({ telegramId }).exec();
  }

  async create(user: IUserCreate): Promise<IUser> {
    return await UserModel.create(user);
  }

  async update(telegramId: string, patch: Partial<IUserCreate>): Promise<IUser | null> {
    return await UserModel.findOneAndUpdate({ telegramId }, patch, { new: true }).exec();
  }
}
