import { SERVICE_CONFIG } from "../config";
import type { LeaseGrant } from "../authority/WalletAuthority";
import type { GameState } from "@/features/game/types";

/** The queue is the only owner of mutable gameplay and connection lifecycle. */
export class GameRuntime {
  socketId: string | null = null;
  ready = false;
  frame = 0;
  stepPending = false;
  commandCount = 0;
  queueDepth = 0;
  disconnectedAt: number | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    public state: GameState,
    public lease: LeaseGrant,
  ) {}
  enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    this.queueDepth++;
    const next = this.tail
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        this.queueDepth--;
      });
    this.tail = next;
    return next;
  }
  command<T>(operation: () => Promise<T>): Promise<T> {
    if (this.commandCount >= SERVICE_CONFIG.maxCommands)
      return Promise.reject(new Error("COMMAND_QUEUE_FULL"));
    this.commandCount++;
    return this.enqueue(operation).finally(() => {
      this.commandCount--;
    });
  }
  drain(): Promise<unknown> {
    return this.tail.catch(() => undefined);
  }
}
