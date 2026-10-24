import { corsHeaders } from "@/lib/api/cors";

import { getContractReadiness } from "@/lib/modules/game-stats/server.repository";
import { config } from "@/lib/config/config";
import { getJwtSecret } from "@/lib/auth/secret.server";

async function readHealth() {
  let worker: { available: boolean; reason: string };
  try {
    getJwtSecret();
    const lease = await getContractReadiness();
    const now = Date.now();
    const reason =
      !lease?.leaseOwner || !lease.leaseExpiresAt || lease.leaseExpiresAt <= now
        ? "worker-unavailable"
        : !lease.workerReady
          ? "worker-starting"
          : !lease.lastCheckedAt ||
              now - lease.lastCheckedAt >
                Math.max(90_000, 18 * config.game.stream.pollMs)
            ? "stream-stalled"
            : "ready";
    worker = { available: reason === "ready", reason };
  } catch {
    worker = { available: false, reason: "service-unavailable" };
  }
  return { ok: true, status: "ok", worker };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json(await readHealth(), {
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
