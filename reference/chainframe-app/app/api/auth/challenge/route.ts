import { generateLoginChallenge } from "@/features/events/backend/wallet-auth/challenge";
import { jsonResponse } from "@/lib/api/cors";
import { z } from "zod";
import { hiveUsernameSchema } from "@/lib/utils/hive/validation";

export const dynamic = "force-dynamic";

const challengeInput = z.object({
  wallet: hiveUsernameSchema,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { wallet } = challengeInput.parse(body);
    const nonce = await generateLoginChallenge(wallet);
    return jsonResponse({ ok: true, nonce }, request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonResponse(
        { ok: false, error: "Invalid request", issues: err.issues },
        request,
        { status: 400 },
      );
    }
    // eslint-disable-next-line no-console
    console.error("[auth/challenge]", err);
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
