import "reflect-metadata";
import { ProductService } from "../services/ProductService";
import { ProductRepository } from "../repositories/ProductRepository";
import { IProduct, IProductCreate, ProductModel } from "../models/Product";
import sinon from "sinon";

describe("ProductService", () => {
  let productRepoMock: sinon.SinonStubbedInstance<ProductRepository>;
  let productService: ProductService;

  beforeEach(() => {
    productRepoMock = sinon.createStubInstance(ProductRepository);
    productService = new ProductService(productRepoMock);
  });

  it("should add a valid product", async () => {
    const product: IProductCreate = {
      userId: "123",
      name: "Milk",
      quantity: 2,
    };

    const productMock = new ProductModel({
      ...product,
      _id: "mocked_id",
    }) as IProduct;

    productRepoMock.create.resolves(productMock);

    const result = await productService.addProduct(product);
    expect(result).toEqual(productMock);
    expect(productRepoMock.create.calledOnce).toBeTruthy();
  });

  it("should throw an error when product data is invalid", async () => {
    const product: Partial<IProduct> = {
      userId: "123",
      name: "",
      quantity: -1,
    };

    await expect(productService.addProduct(product as IProduct)).rejects.toThrow(
      "Invalid product data",
    );
  });
});
