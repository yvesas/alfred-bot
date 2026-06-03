import { Schema, model, Document } from "mongoose";

export interface IProductBase {
  userId: string;
  name: string;
  quantity: number;
  expirationDate?: Date;
  image?: string;
}

export type IProductCreate = Omit<IProductBase, "_id">;

export interface IProduct extends IProductCreate, Document {}

const ProductSchema = new Schema<IProduct>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    expirationDate: { type: Date },
    image: { type: String },
  },
  {
    timestamps: true,
  },
);

export const ProductModel = model<IProduct>("Product", ProductSchema);
