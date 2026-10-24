// src/lib/config/database.ts
// Mongoose singleton — reuses the connection across hot-reloads in dev.
import mongoose from "mongoose";
import { config } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnection: Promise<typeof mongoose> | undefined;
}

export async function connectDatabase(): Promise<typeof mongoose> {
  if (global._mongooseConnection) return global._mongooseConnection;
  if (!config.mongoUri) throw new Error("MONGODB_URI is not set");
  global._mongooseConnection = mongoose
    .connect(config.mongoUri, {
      dbName: config.mongoDb,
      bufferCommands: false,
    })
    .catch((error) => {
      global._mongooseConnection = undefined;
      throw error;
    });
  return global._mongooseConnection;
}
