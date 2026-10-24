import { findEquipmentsByIds } from "@/lib/modules/equipments/server.repository";
import { equippedIds, resolvedPlayerStats } from "@/features/types/game/stats";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { jsonResponse, corsHeaders } from "@/lib/api/cors";
import { GAME_STATS_METRICS } from "@/lib/api/types";
import type { GameStatsSummaryDto } from "@/lib/api/types";
import { readRegisteredMiningBatches } from "@/lib/modules/players/server.repository";
import { readAnalyticsLogBatches } from "@/lib/modules/logs/server.repository";
import { readAnalyticsReceipts } from "@/lib/modules/transactions-processed/server.repository";
import { currentMiningPerSecond } from "@/features/types/game/mining";
import {
  analyticsReceiptKey,
  createGameStatsAccumulator,
  toGameStatsDaily,
  toGameStatsSummary,
} from "@/lib/api/dto/game-stats";
import type { GameStatsAggregate } from "@/lib/api/dto/game-stats";

export const dynamic = "force-dynamic";
const querySchema = z
  .object({
    metric: z.enum(GAME_STATS_METRICS).optional(),
    days: z.enum(["7", "30", "90"]).default("30"),
  })
  .strict();
type Snapshot = {
  aggregate: GameStatsAggregate;
  mining: GameStatsSummaryDto["mining"];
};
let cached: Snapshot | undefined;
let pending: Promise<Snapshot> | undefined;
const day = (time: number) => Math.floor(time / 86_400_000);

/** HTTP aggregate read coordination only; all queries belong to their own repositories. */
async function snapshot(): Promise<Snapshot> {
  const now = Date.now();
  if (
    cached &&
    now >= cached.aggregate.asOf &&
    now - cached.aggregate.asOf < 60_000 &&
    day(now) === day(cached.aggregate.asOf)
  )
    return cached;
  if (pending) {
    const result = await pending;
    // A computation that crossed midnight cannot satisfy a new-day request.
    if (day(now) === day(result.aggregate.asOf)) return result;
    return snapshot();
  }
  const work = async (): Promise<Snapshot> => {
    const asOf = now;
    const mining = { registeredPlayers: 0, hashPerSecond: 0, hashPerDay: 0 };
    for await (const batch of readRegisteredMiningBatches()) {
      const gear = await findEquipmentsByIds(batch.flatMap(equippedIds));
      for (const player of batch) {
        const rate = currentMiningPerSecond({ ...player, stats: resolvedPlayerStats(player, gear) }, asOf);
        if (!Number.isFinite(rate) || rate < 0)
          throw new Error("Invalid mining input");
        mining.registeredPlayers++;
        mining.hashPerSecond += rate;
      }
    }
    mining.hashPerDay = mining.hashPerSecond * 86_400;
    if (!Number.isFinite(mining.hashPerDay))
      throw new Error("Mining aggregate overflow");
    const accumulator = createGameStatsAccumulator(asOf);
    for await (const batch of readAnalyticsLogBatches(asOf)) {
      const keys = [
        ...new Set(
          batch.map(analyticsReceiptKey).filter((key): key is string => !!key),
        ),
      ];
      const receipts = new Map(
        (await readAnalyticsReceipts(keys, asOf)).map((receipt) => [
          receipt.key,
          receipt,
        ]),
      );
      for (const log of batch)
        accumulator.accept(log, receipts.get(analyticsReceiptKey(log) ?? ""));
    }
    return { aggregate: accumulator.finish(), mining };
  };
  pending = work();
  try {
    const result = await pending;
    cached = result;
    return result;
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
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const headers = { "Cache-Control": "no-store" };
  if (!parsed.success)
    return jsonResponse(
      { ok: false, error: "Invalid query parameters" },
      request,
      { status: 400, headers },
    );
  try {
    const data = await snapshot();
    const body = parsed.data.metric
      ? toGameStatsDaily(
          data.aggregate,
          parsed.data.metric,
          Number(parsed.data.days) as 7 | 30 | 90,
        )
      : toGameStatsSummary(data.aggregate, data.mining);
    return jsonResponse(body, request, { headers });
  } catch {
    return jsonResponse(
      { ok: false, error: "Unable to read game statistics" },
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
