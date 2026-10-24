/**
 * GET /api/wallet/treasury-balance
 *
 * Returns the public treasury Hive account's HASH token balance.
 */

import { jsonResponse } from "@/lib/api/cors";
import { getBalance } from "@/lib/chains/modules/hive/server/events/get-balance/action";
import { config } from "@/lib/config/config";
import { HiveOperationError } from "@/lib/utils/hive/error";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "no-store");
    return auth;
  }
  try {
    if (!config.blockchain.treasuryAccount)
      throw new HiveOperationError(
        "INVALID_ACCOUNT",
        "Hive treasury account is not configured",
      );
    const result = await getBalance(
      config.blockchain.treasuryAccount,
      config.blockchain.token,
      config.blockchain.tokenPrecision,
    );
    const balance = {
      balance: Number(result.token),
      symbol: "HASH",
      precision: result.precision.token,
    };
    return jsonResponse({ ok: true, ...balance }, request, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonResponse(
      { ok: false, error: "Unable to read Hive treasury balance" },
      request,
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}
