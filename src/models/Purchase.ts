import { Schema, model, Document } from "mongoose";

export interface IPurchaseItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category?: string;
}

const PurchaseItemSchema = new Schema<IPurchaseItem>({
  description: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  total: { type: Number, required: true },
  category: { type: String },
});

export interface ITaxInfo {
  federal: number;
  state: number;
  icms: number;
}

const TaxInfoSchema = new Schema<ITaxInfo>({
  federal: { type: Number },
  state: { type: Number },
  icms: { type: Number },
});

export interface IStoreInfo {
  name: string;
  cnpj: string;
}
const StoreSchema = new Schema<IStoreInfo>({
  name: { type: String },
  cnpj: { type: String },
});

export interface IPurchaseBase {
  userId: string;
  description: string;
  total: number;
  date: Date;
  store?: IStoreInfo;
  tax?: ITaxInfo;
  items: IPurchaseItem[];
}

export type IPurchaseCreate = Omit<IPurchaseBase, "_id">;
export interface IPurchase extends IPurchaseBase, Document {}

const PurchaseSchema = new Schema<IPurchase>(
  {
    userId: { type: String, required: true },
    description: { type: String, required: true },
    total: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    tax: { type: TaxInfoSchema },
    store: { type: StoreSchema },
    items: { type: [PurchaseItemSchema] },
  },
  {
    timestamps: true,
  },
);

export const PurchaseModel = model<IPurchase>("Purchase", PurchaseSchema);
