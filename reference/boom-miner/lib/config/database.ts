import mongoose from "mongoose";
import { config } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnection: Promise<typeof mongoose> | undefined;
}

/**
 * Singleton Mongoose connection.
 * Caches the connection across hot-reloads in development.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  if (global._mongooseConnection) {
    return global._mongooseConnection;
  }

  if (!config.mongoUri) {
    throw new Error("MONGODB_URI environment variable is not set.");
  }

  global._mongooseConnection = mongoose.connect(config.mongoUri, {
    bufferCommands: false,
  });

  return global._mongooseConnection;
}
