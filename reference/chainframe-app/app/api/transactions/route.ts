import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";
import { findPendingByWallet } from "@/lib/modules/transactions-pending/server.repository";
import {
  listProcessedHistory,
  readAnalyticsReceipts,
} from "@/lib/modules/transactions-processed/server.repository";
import { toPendingTransactionDto } from "@/lib/api/dto/transactions";
import { decodeCursor } from "@/lib/utils/logs/history";
export const dynamic = "force-dynamic";
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(256).optional(),
  direction: z.enum(["older", "newer"]).default("older"),
});
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      { ok: false, error: "Invalid query parameters" },
      request,
      { status: 400 },
    );
  let cursor;
  try {
    cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : undefined;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid cursor" }, request, {
      status: 400,
    });
  }
  try {
    const history = await listProcessedHistory(auth.wallet, {
      ...parsed.data,
      cursor,
    });
    const jobs = await findPendingByWallet(auth.wallet, parsed.data.limit);
    const followUpJobs = jobs.filter(
      (job) =>
        job.referralPolicyVersion === 1 || job.marketFeePolicyVersion === 1,
    );
    const completed = new Set(
      (
        await readAnalyticsReceipts(
          followUpJobs.map((job) => job.signature),
          Date.now(),
        )
      )
        .filter((receipt) => receipt.wallet === auth.wallet)
        .map((receipt) => receipt.key),
    );
    const pending = jobs
      .filter((job) => !completed.has(job.signature))
      .map(toPendingTransactionDto);
    return jsonResponse({ ok: true, pending, ...history }, request);
  } catch {
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
