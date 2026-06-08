import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// MongoDB em memória para testar os repositórios (queries/aggregations reais, sem mock frágil).
let mongod: MongoMemoryServer | undefined;

export async function connectMemoryMongo(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function disconnectMemoryMongo(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
}

export async function clearCollections(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
