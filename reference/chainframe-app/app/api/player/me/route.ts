import { findEquipmentsByIds } from "@/lib/modules/equipments/server.repository";
import { equippedIds, resolvedPlayerStats } from "@/features/types/game/stats";
import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";
import { findPlayerByWallet } from "@/lib/modules/players/server.repository";
import { initializePlayerProfileForWallet } from "@/features/events/backend/player-lifecycle/initialize";
import { toPlayerDto } from "@/lib/api/dto/player";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;
  try {
    let player = await findPlayerByWallet(auth.wallet);
    const refUsername = new URL(request.url).searchParams.get("ref");
    if (
      !player ||
      player.profileInitialized === false ||
      (refUsername &&
        !player.isRegistered &&
        !player.referredBy &&
        !player.registrationTxId)
    )
      player = await initializePlayerProfileForWallet(auth.wallet, refUsername);
    if (!player)
      return jsonResponse({ ok: false, error: "Player not found" }, request, {
        status: 404,
      });
    return jsonResponse({ ok: true, player: toPlayerDto(player, resolvedPlayerStats(player, await findEquipmentsByIds(equippedIds(player)))) }, request);
  } catch (err) {
    console.error("[player/me GET]", err);
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
