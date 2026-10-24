import { verifyLoginSignature } from "@/features/events/backend/wallet-auth/verify";
import { jsonResponse } from "@/lib/api/cors";
import { z } from "zod";
import { hiveUsernameSchema } from "@/lib/utils/hive/validation";

export const dynamic = "force-dynamic";

const verifyInput = z.object({
  wallet: hiveUsernameSchema,
  signature: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { wallet, signature } = verifyInput.parse(body);
    const result = await verifyLoginSignature(wallet, signature);
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, request, {
        status: 401,
      });
    }
    return jsonResponse(
      { ok: true, token: result.token, wallet: result.payload?.wallet },
      request,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonResponse(
        { ok: false, error: "Invalid request", issues: err.issues },
        request,
        { status: 400 },
      );
    }
    // eslint-disable-next-line no-console
    console.error("[auth/verify]", err);
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
    headers: { "Access-Control-Allow-Methods": "POST, OPTIONS" },
  });
}
