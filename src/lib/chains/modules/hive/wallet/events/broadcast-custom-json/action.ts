import { z } from "zod";
import { getHiveClient, type HiveClient } from "../../../client";
import { hiveChainConfig } from "../../../../config";
import { HiveAccountSchema, MetadataSchema, ok, fail, type HiveActionResult } from "../../../types";

export const BroadcastCustomJsonInput = z.object({
  /** Hive account signing in the browser via Keychain. */
  username: HiveAccountSchema,
  /** Standardized game action, e.g. "purchase_item". */
  action: z.string().trim().min(1),
  metadata: MetadataSchema,
  /** custom_json id. Defaults to the app's configured id. */
  id: z.string().trim().min(1).optional(),
  /** Posting is enough for game actions; active only when value moves. */
  authority: z.enum(["posting", "active"]).default("posting"),
  /** Text shown inside the Keychain popup. */
  message: z.string().trim().optional(),
  client: z.custom<HiveClient>().optional(),
});

export type BroadcastCustomJsonInput = z.input<typeof BroadcastCustomJsonInput>;

export type BroadcastResult = { transactionId: string | null; id: string; action: string };

/** Broadcast a standardized `{ action, metadata }` game event through Hive Keychain. */
export async function broadcastCustomJson(
  input: BroadcastCustomJsonInput,
): Promise<HiveActionResult<BroadcastResult>> {
  const parsed = BroadcastCustomJsonInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { username, action, metadata, authority, message } = parsed.data;
  const id = parsed.data.id ?? hiveChainConfig.applicationId;
  const hive = parsed.data.client ?? getHiveClient();

  try {
    if (!hive.keychain.isAvailable()) return fail(new Error("Hive Keychain not found. Install the extension."));
    const result = await hive.keychain.customJson({
      username,
      id,
      action,
      metadata: metadata ?? null,
      authority,
      ...(message ? { message } : {}),
    });
    return ok({ transactionId: result.transactionId, id, action });
  } catch (error) {
    return fail(error);
  }
}
