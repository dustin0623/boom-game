/**
 * GET /api/wallet/balance
 *
 * Returns the signed-in Hive account's HASH token balance, or native HIVE with asset=HIVE, through the
 * Hive balance-read event. The session wallet is the authenticated Hive username.
 */

import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";
import { getBalance } from "@/lib/chains/modules/hive/server/events/get-balance/action";
import { config } from "@/lib/config/config";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;
  const asset = z
    .enum(["HASH", "HIVE"])
    .safeParse(new URL(request.url).searchParams.get("asset") ?? "HASH");
  if (!asset.success)
    return jsonResponse(
      { ok: false, error: "Invalid wallet balance asset" },
      request,
      { status: 400 },
    );
  const native = asset.data === "HIVE";

  try {
    const result = await getBalance(
      auth.wallet,
      native ? "HIVE" : config.blockchain.token,
      native ? 3 : config.blockchain.tokenPrecision,
    );
    const balance = {
      balance: Number(native ? result.hive : result.token),
      symbol: asset.data,
      precision: native ? 3 : result.precision.token,
    };
    return jsonResponse({ ok: true, ...balance }, request, { status: 200 });
  } catch {
    return jsonResponse(
      { ok: false, error: "Unable to read Hive wallet balance" },
      request,
      { status: 503 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
