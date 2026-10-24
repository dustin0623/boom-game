import { connectDatabase } from "@/lib/config/database";
import { apiOk, apiError } from "@/lib/api/error-response";

/**
 * GET /api/health
 *
 * Phase A exit-criteria endpoint.
 * Verifies the MongoDB connection is reachable and returns a success response.
 */
export async function GET(): Promise<Response> {
  try {
    await connectDatabase();
    return apiOk({ status: "ok", db: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError(message, "DB_CONNECTION_ERROR", 503);
  }
}
