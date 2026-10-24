/**
 * Database connection configuration (server-only).
 *
 * Mode resolution:
 * - `MONGODB_URI` set   → "mongodb": lazily connects a shared MongoClient.
 * - `MONGODB_URI` unset → "mock": repositories use the in-memory store in
 *   `src/features/stores/mock/database.ts` and this module is never touched.
 *
 * Env vars (NAMES only here, values live in secrets):
 * - MONGODB_URI    — full connection string, e.g. mongodb+srv://...
 * - MONGODB_DB_NAME — optional database name override (default: "game").
 */

export type DatabaseMode = "mock" | "mongodb";

export const databaseEnv = {
  uri: "MONGODB_URI",
  dbName: "MONGODB_DB_NAME",
} as const;

const DEFAULT_DB_NAME = "game";

/** Which storage backend the repositories should use. */
export function getDatabaseMode(): DatabaseMode {
  return process.env[databaseEnv.uri] ? "mongodb" : "mock";
}

export function getDatabaseName(): string {
  return process.env[databaseEnv.dbName] ?? DEFAULT_DB_NAME;
}

// ---- MongoDB connection (lazy, shared) ----

type MongoClientType = import("mongodb").MongoClient;
type DbType = import("mongodb").Db;

let clientPromise: Promise<MongoClientType> | null = null;

async function connectMongo(): Promise<MongoClientType> {
  const uri = process.env[databaseEnv.uri];
  if (!uri) {
    throw new Error(
      `${databaseEnv.uri} is not set — running in mock mode, MongoDB connection skipped.`,
    );
  }
  // Lazy import so the driver never ships in client bundles and is only
  // loaded when a real connection is requested.
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri);
  await client.connect();
  return client;
}

/** Shared MongoClient, connected on first use and reused afterwards. */
export function getMongoClient(): Promise<MongoClientType> {
  clientPromise ??= connectMongo();
  return clientPromise;
}

/** The application database. Throws if MONGODB_URI is not configured. */
export async function getDb(): Promise<DbType> {
  const client = await getMongoClient();
  return client.db(getDatabaseName());
}
