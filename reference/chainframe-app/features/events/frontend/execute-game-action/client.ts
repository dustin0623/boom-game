import { useAuthStore } from "@/features/stores/authStore";
import {
  broadcastGameAction,
  BroadcastPending,
} from "@/features/events/frontend/broadcast-game-action/client";
import { TransactionRejected } from "@/features/events/frontend/confirm-transaction/client";
import { parseGameActionPayload } from "@/lib/utils/game/action-protocol";
import type {
  GameActionFlowOptions,
  GameActionFlowHandlers,
  GameActionLifecycle,
  GameActionExecutionContext,
} from "@/features/types/game/actions";
export function captureGameActionContext(): GameActionExecutionContext {
  const { mode, address, connectedAt } = useAuthStore.getState();
  return { session: { mode, address, connectedAt }, signer: address };
}
export function isGameActionSessionCurrent(
  context: GameActionExecutionContext,
): boolean {
  const current = useAuthStore.getState();
  return (
    current.mode === context.session.mode &&
    current.address === context.session.address &&
    current.connectedAt === context.session.connectedAt
  );
}
/** Gameplay changes arrive through personal history; this workflow never mutates player state. */
export async function executeGameAction(
  options: GameActionFlowOptions,
  handlers: GameActionFlowHandlers,
): Promise<GameActionLifecycle> {
  const context = options.context ?? captureGameActionContext();
  handlers.onError(null);
  handlers.onTransactionId(null);
  if (!isGameActionSessionCurrent(context)) {
    handlers.onError("Wallet session changed before signing");
    handlers.onLifecycle("failed");
    return "failed";
  }
  handlers.onLifecycle("broadcasting");
  let broadcasted = false;
  try {
    const payload = parseGameActionPayload(options.build(crypto.randomUUID()));
    await broadcastGameAction(payload, {
      signal: options.signal,
      onBroadcast: (id) => {
        broadcasted = true;
        handlers.onTransactionId(id);
        handlers.onLifecycle("broadcast");
        handlers.onSubmitted?.();
      },
      onAwaiting: handlers.onAwaiting,
    });
    if (!isGameActionSessionCurrent(context)) {
      handlers.onError(
        "Wallet session changed; the transaction may still settle. Check its history before signing again.",
      );
      return "broadcast";
    }
    handlers.onLifecycle("processed");
    return "processed";
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : "Action failed");
    const lifecycle =
      error instanceof TransactionRejected ||
      (!broadcasted && !(error instanceof BroadcastPending))
        ? "failed"
        : "broadcast";
    handlers.onLifecycle(lifecycle);
    return lifecycle;
  }
}
