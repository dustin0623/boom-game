import type { CustomJsonEvent, NormalizedBlock } from "hivexph-sdk";
import type { ObservedPayment } from "@/lib/utils/game/hive-activity";
import type { GameActionRegistry } from "./processing";

export type GameActionStream = AsyncIterable<CustomJsonEvent | NormalizedBlock>;
export interface GameActionStreamPosition {
  blockNumber?: number;
}
export interface GameActionStreamWorkerOptions {
  stream?: GameActionStream;
  createStream?: (signal: AbortSignal, startBlock: number) => GameActionStream;
  position?: GameActionStreamPosition;
  signal?: AbortSignal;
  resolveStartBlock?: (signal: AbortSignal) => Promise<number>;
  onEvent?: (event: CustomJsonEvent) => void;
  actionRegistry?: GameActionRegistry;
  onPayment?: (payment: ObservedPayment) => Promise<void>;
  onStart?: (
    checkLease: () => Promise<void>,
    recover: () => Promise<void>,
  ) => Promise<void>;
  onStop?: () => Promise<void>;
}
