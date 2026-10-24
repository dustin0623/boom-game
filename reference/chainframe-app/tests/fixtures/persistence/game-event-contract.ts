import type { CustomJsonEvent } from "hivexph-sdk";

export type GameEventStatus =
  | "observed"
  | "queued"
  | "processed"
  | "rejected"
  | "failed"
  | "reconciliation";

export interface GameEventRecord {
  result?: unknown;
  randomSeed?: string;
  event?: CustomJsonEvent;
  nonce?: string;
  attempts?: number;
  claimUntil?: number;
  claimToken?: string;
  eventKey: string;
  transactionId: string;
  operationIndex: number;
  blockNumber: number;
  transactionIndex: number;
  eventId: string;
  actor: string;
  status: GameEventStatus;
  reason?: string;
  updatedAt: number;
}

export interface GameStreamDiagnostics {
  queueDepth: number;
  streamLag: number | null;
  retryCount: number;
  rejectedEventCount: number;
}

export interface GameEventRepository {
  /** Claims a new event. Terminal events are never claimable again. */
  get(eventKey: string): Promise<GameEventRecord | null>;
  findNonce(
    actor: string,
    nonce: string,
    exceptKey: string,
  ): Promise<GameEventRecord | null>;
  listRecoverable(): Promise<CustomJsonEvent[]>;
  claim(
    event: CustomJsonEvent,
    token?: string,
  ): Promise<
    "claimed" | "processed" | "rejected" | "in-flight" | "reconciliation"
  >;
  beginEffects(eventKey: string, token?: string): Promise<void>;
  clearEffects(eventKey: string): Promise<void>;
  park(eventKey: string, reason: string, token?: string): Promise<void>;
  markProcessed(
    eventKey: string,
    result?: unknown,
    token?: string,
  ): Promise<void>;
  markRejected(eventKey: string, reason: string, token?: string): Promise<void>;
  markFailed(eventKey: string, reason: string, token?: string): Promise<void>;
  acquireLease(owner: string, ttlMs: number): Promise<boolean>;
  renewLease(owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(owner: string): Promise<void>;
  getDiagnostics(): Promise<GameStreamDiagnostics>;
}

import {
  gameEventKey,
  toGameEventRecord,
} from "@/lib/utils/game/event-identity.server";
export { gameEventKey, toGameEventRecord };
