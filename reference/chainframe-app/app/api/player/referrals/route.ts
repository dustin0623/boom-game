import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";
import { getReferralHiveEarned } from "@/lib/modules/logs/server.repository";

import {
  findPlayerByWallet,
  playerRepository,
} from "@/lib/modules/players/server.repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;

  try {
    const player = await findPlayerByWallet(auth.wallet);
    if (!player)
      return jsonResponse({ ok: false, error: "Player not found" }, request, {
        status: 404,
      });
    const referred = await playerRepository.listReferred(auth.wallet);
    const result = {
      referralCode: player.username,
      referralCount: player.referralCount ?? 0,
      referralEarned: player.referralEarned ?? 0,
      referralHiveEarned: await getReferralHiveEarned(auth.wallet),
      referred: referred.map((r) => ({
        username: r.username,
        wallet: r.wallet,
        joinedAt: r.registrationTime,
      })),
    };
    return jsonResponse({ ok: true, ...result }, request, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[player/referrals GET]", err);
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
