import { findEquipmentsByIds } from "@/lib/modules/equipments/server.repository";
import { equippedIds, resolvedPlayerStats } from "@/features/types/game/stats";
import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";

import {
  findPlayerByWallet,
  findRaidTargets,
} from "@/lib/modules/players/server.repository";
import { toRaidTarget } from "@/lib/api/dto/raid-targets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const defense = Number(searchParams.get("defense") ?? "0");

  if (!Number.isFinite(defense) || defense <= 0) {
    return jsonResponse(
      { ok: false, error: "defense must be a positive number" },
      request,
      { status: 400 },
    );
  }

  try {
    const attacker = await findPlayerByWallet(auth.wallet);
    if (!attacker)
      return jsonResponse({ ok: false, error: "Player not found" }, request, {
        status: 404,
      });

    const targets = await findRaidTargets(defense, auth.wallet);
    const gear = await findEquipmentsByIds(targets.flatMap(equippedIds));
    const at = Date.now();
    const rivals = targets.map((target) => toRaidTarget(target, auth.wallet, at, resolvedPlayerStats(target, gear)));
    return jsonResponse({ ok: true, rivals }, request);
  } catch (err) {
    console.error("[game/raid/targets]", err);
    return jsonResponse(
      { ok: false, error: "Internal server error" },
      request,
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
