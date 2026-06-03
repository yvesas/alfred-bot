import { inject, injectable } from "inversify";
import { ProductRepository } from "../repositories/ProductRepository";
import { IProduct, IProductCreate } from "../models/Product";

@injectable()
export class ProductService {
  constructor(@inject(ProductRepository) private productRepo: ProductRepository) {}

  async addProduct(product: IProductCreate): Promise<IProduct> {
    if (!product.name || product.quantity < 0) {
      throw new Error("Invalid product data");
    }
    return await this.productRepo.create(product);
  }

  async getUserProducts(userId: string): Promise<IProduct[]> {
    return await this.productRepo.findByUser(userId);
  }

  async updateProductQuantity(
    userId: string,
    productName: string,
    quantity: number,
  ): Promise<IProduct | null> {
    return await this.productRepo.updateQuantity(userId, productName, quantity);
  }
}
