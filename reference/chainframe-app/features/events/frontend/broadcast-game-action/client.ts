"use client";
import { describeShopItems } from "@/features/types/game/inventory";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { useAuthStore } from "@/features/stores/authStore";
import { GAME_ACTION_CUSTOM_JSON_ID } from "@/lib/chains/modules/hive/client";
import {
  parseGameActionPayload,
  gameActionAuthority,
  type GameActionPayload,
} from "@/lib/utils/game/action-protocol";
import { broadcastCustomJson } from "@/lib/chains/modules/hive/wallet/events/custom-json/action";
import {
  waitForTransaction,
  claimSubmission,
  releaseSubmission,
  recordSubmittedTransaction,
  type Confirmation,
} from "@/features/events/frontend/confirm-transaction/client";
export class BroadcastPending extends Error {
  constructor(
    public transactionId: string | null,
    message: string,
  ) {
    super(message);
  }
}
export interface BroadcastOptions {
  signal?: AbortSignal;
  operationIndex?: number;
  requireLog?: string;
  onBroadcast?: (id: string | null) => void;
  onAwaiting?: (awaiting: boolean) => void;
  onSubmitted?: () => void;
}
export type BroadcastOutcome = {
  transactionId: string;
  confirmation: Confirmation;
};
/** Broadcast once for the connected account, then subscribe to authoritative receipts. */
export async function broadcastGameAction(
  payload: GameActionPayload,
  options: BroadcastOptions = {},
): Promise<BroadcastOutcome> {
  const session = useAuthStore.getState();
  const signer = (session.address ?? "").trim().toLowerCase();
  if (!signer)
    throw new Error("Enter a Hive username before signing a game action");
  if (session.mode !== "wallet" || !session.apiConnected)
    throw new Error("Sign in with Hive Keychain to perform this action");
  if (session.isRegistered !== true)
    throw new Error("Register your account before playing");
  if (options.signal?.aborted)
    throw new Error("Action cancelled before broadcast");
  const validated = parseGameActionPayload(payload);
  const isCurrent = () => {
    const current = useAuthStore.getState();
    return (
      current.address === session.address &&
      current.connectedAt === session.connectedAt &&
      current.mode === session.mode
    );
  };
  const metadata = Object.fromEntries(
    Object.entries(validated.metadata)
      .filter(([key]) => key !== "nonce")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const lock = claimSubmission(
    { session, isCurrent },
    "game:" + validated.action + ":" + JSON.stringify(metadata),
  );
  if (!lock) throw new Error("This action is already awaiting confirmation");
  let submitted = false;
  try {
    await requireWorkerReadiness(isCurrent);
    if (options.signal?.aborted)
      throw new Error("Action cancelled before broadcast");
    const result = await broadcastCustomJson({
      username: signer,
      id: GAME_ACTION_CUSTOM_JSON_ID,
      authority: gameActionAuthority(validated.action),
      json: JSON.stringify(validated),
      message: "Chainframe game action: " + validated.action,
    });
    if (!result.ok) throw new Error(result.error);
    submitted = true;
    const detail =
      typeof metadata.amount === "number"
        ? ` · ${metadata.amount} HASH`
        : typeof metadata.price === "number"
          ? ` · ${String(metadata.itemId)} · ${metadata.price} HIVE`
          : typeof metadata.quantity === "number"
            ? ` · ${describeShopItems(String(metadata.itemId ?? "items"), metadata.quantity)}`
            : typeof metadata.target === "string"
              ? ` · @${metadata.target}`
              : typeof metadata.stat === "string"
                ? ` · ${metadata.stat.replace(/([A-Z])/g, " $1").toLowerCase()}`
                : typeof metadata.equipmentId === "string"
                  ? ` · ${metadata.equipmentId}`
                  : typeof metadata.itemId === "string"
                    ? ` · ${metadata.itemId}`
                    : typeof metadata.kind === "string" &&
                        typeof metadata.templateId === "number"
                      ? ` · ${metadata.kind} #${metadata.templateId}`
                      : "";
    recordSubmittedTransaction(
      { session, isCurrent },
      {
        kind: "game",
        label: validated.action.replaceAll("_", " ") + detail,
        transactionId: result.transactionId,
        type: "game_action",
        operationIndex: options.operationIndex ?? 0,
        requireLog: options.requireLog,
      },
      lock,
    );
    if (isCurrent()) {
      options.onBroadcast?.(result.transactionId);
      options.onSubmitted?.();
    }
    if (!result.transactionId)
      throw new BroadcastPending(
        null,
        "Broadcast submitted without a transaction id. Check your Hive history before signing again.",
      );
    options.onAwaiting?.(true);
    try {
      const confirmation = await waitForTransaction(
        result.transactionId,
        session,
        {
          type: "game_action",
          signal: options.signal,
          operationIndex: options.operationIndex ?? 0,
          requireLog: options.requireLog,
        },
      );
      return { transactionId: result.transactionId, confirmation };
    } finally {
      options.onAwaiting?.(false);
    }
  } finally {
    if (!submitted) releaseSubmission(lock);
  }
}
