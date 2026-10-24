import type { CustomJsonEvent } from "hivexph-sdk";
import { GAME_ACTION_CUSTOM_JSON_ID } from "@/lib/chains/modules/hive/client";
import {
  buildClaimAction,
  type GameActionPayload,
} from "@/lib/utils/game/action-protocol";

export function hiveGameActionEvent(
  payload: GameActionPayload = buildClaimAction({ nonce: "validation-123456" }),
  overrides: Partial<CustomJsonEvent> = {},
): CustomJsonEvent {
  const active = payload.action === "request_withdrawal";
  const actor = overrides.account ?? "alice";
  const requiredAuths = active ? [actor] : [];
  const requiredPostingAuths = active ? [] : [actor];
  return {
    eventId: "100-0-0",
    transactionId: "tx-validation",
    blockNumber: 100,
    blockTimestamp: "2026-10-10T00:00:00",
    transactionIndex: 0,
    operationIndex: 0,
    account: "alice",
    id: GAME_ACTION_CUSTOM_JSON_ID,
    action: payload.action,
    metadata: payload.metadata,
    requiredAuths,
    requiredPostingAuths,
    raw: [
      "custom_json",
      {
        id: GAME_ACTION_CUSTOM_JSON_ID,
        required_auths: requiredAuths,
        required_posting_auths: requiredPostingAuths,
        json: JSON.stringify(payload),
      },
    ],
    ...overrides,
  };
}
