"use client";
import { GAME_ACTION_PROTOCOL_VERSION } from "@/lib/chains/modules/hive/client";
import {
  parseGameActionPayload,
  type GameActionName,
} from "@/lib/utils/game/action-protocol";
import { broadcastGameAction } from "./client";
import type { SignedActionOutcome } from "@/features/types/game/actions";
/** Broadcast once, then subscribe to receipts from the personal poller. */
export async function submitSignedGameAction(
  action: GameActionName,
  metadata: Record<string, unknown>,
  onSubmitted?: () => void,
): Promise<SignedActionOutcome> {
  const payload = parseGameActionPayload({
    version: GAME_ACTION_PROTOCOL_VERSION,
    action,
    metadata: { ...metadata, nonce: crypto.randomUUID() },
  });
  const outcome = await broadcastGameAction(payload, {
    onSubmitted,
    requireLog:
      action === "claim"
        ? "claim"
        : action === "open_chest"
          ? "chest"
          : undefined,
  });
  const log = outcome.confirmation?.log;
  return {
    ok: true,
    transactionId: outcome.transactionId,
    ...(action === "claim" && typeof log?.amount === "number"
      ? { amount: log.amount }
      : {}),
    ...(action === "open_chest" && typeof log?.data?.itemId === "string"
      ? { itemId: log.data.itemId }
      : {}),
  };
}
