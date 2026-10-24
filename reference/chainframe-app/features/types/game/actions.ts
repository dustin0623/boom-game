import type { GameActionPayload } from "@/lib/utils/game/action-protocol";
export type GameActionLifecycle =
  "idle" | "broadcasting" | "broadcast" | "processed" | "failed";

export interface GameActionExecutionContext {
  session: {
    mode: string | null;
    address: string | null;
    connectedAt: number | null;
  };
  signer: string | null;
}

export interface GameActionFlowOptions {
  build: (nonce: string) => GameActionPayload;
  signal?: AbortSignal;
  context?: GameActionExecutionContext;
}

export interface GameActionFlowHandlers {
  onSubmitted?: () => void;
  onLifecycle: (lifecycle: GameActionLifecycle) => void;
  onTransactionId: (transactionId: string | null) => void;
  onError: (message: string | null) => void;
  onAwaiting: (awaiting: boolean) => void;
}

export interface SignedActionOutcome {
  ok: boolean;
  error?: string;
  transactionId?: string;
  amount?: number;
  itemId?: string;
}
export type EquipmentActionKind = "equip" | "unequip" | "upgrade" | "salvage";
