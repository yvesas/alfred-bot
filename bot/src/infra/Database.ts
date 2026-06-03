import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export class Database {
  public async connect(): Promise<void> {
    try {
      await mongoose.connect(process.env.DATABASE_URL as string);
      // {
      //   useNewUrlParser: true,
      //   useUnifiedTopology: true,
      //   useFindAndModify: false,
      //   useCreateIndex: true,
      // }
      console.log("✅ Connected to MongoDB Atlas");
    } catch (err) {
      console.error("❌ Error connecting to MongoDB:", err);
    }
  }
}
