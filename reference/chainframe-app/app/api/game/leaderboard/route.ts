import { findEquipmentsByIds } from "@/lib/modules/equipments/server.repository";
import { equippedIds, resolvedPlayerStats } from "@/features/types/game/stats";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { jsonResponse, corsHeaders } from "@/lib/api/cors";
import { readLeaderboardPlayerBatches } from "@/lib/modules/players/server.repository";
import {
  createLeaderboardAccumulator,
  toLeaderboardDto,
} from "@/lib/api/dto/leaderboard";
import type { LeaderboardSnapshot } from "@/lib/api/dto/leaderboard";

export const dynamic = "force-dynamic";
const querySchema = z
  .object({
    page: z.enum(["1", "2", "3", "4"]).default("1"),
  })
  .strict();
let cached: LeaderboardSnapshot | undefined;
let pending: Promise<LeaderboardSnapshot> | undefined;
async function snapshot() {
  const now = Date.now();
  if (cached && now >= cached.asOf && now - cached.asOf < 60_000) return cached;
  if (pending) return pending;
  pending = (async () => {
    const accumulator = createLeaderboardAccumulator(now);
    for await (const batch of readLeaderboardPlayerBatches()) {
      const gear = await findEquipmentsByIds(batch.flatMap(equippedIds));
      for (const player of batch) accumulator.accept({ ...player, stats: resolvedPlayerStats(player, gear) });
    }
    return accumulator.finish();
  })();
  try {
    cached = await pending;
    return cached;
  } finally {
    pending = undefined;
  }
}
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "no-store");
    return auth;
  }
  const headers = { "Cache-Control": "no-store" };
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      { ok: false, error: "Invalid query parameters" },
      request,
      { status: 400, headers },
    );
  try {
    return jsonResponse(
      toLeaderboardDto(await snapshot(), Number(parsed.data.page), auth.wallet),
      request,
      { headers },
    );
  } catch {
    return jsonResponse(
      { ok: false, error: "Unable to read leaderboard" },
      request,
      { status: 503, headers },
    );
  }
}
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  });
}
