import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  GAME_EVENTS as E,
  PROTOCOL_VERSION,
  type CommandResult,
  type GameUpdate,
  type SyncRequest,
} from "@/features/game/protocol";
import type { GameState, SimulationResult } from "@/features/game/types";
import { applyCommand, stepSimulation, simulationCandidate } from "@/features/game/simulation";
import { PlayerModel } from "@/lib/modules/players/model.server";
import { WalletAuthority } from "../authority/WalletAuthority";
import {
  GameRepository,
  GamePersistenceError,
  type GameStorage,
} from "../persistence/GameRepository";
import { SERVICE_CONFIG } from "../config";
import { GameRuntime } from "./GameRuntime";

const commandSchema = z
  .object({
    requestId: z.string().uuid(),
    runId: z.string().min(8).max(128),
    command: z.discriminatedUnion("type", [
      z.object({ type: z.literal("deploy"), heroId: z.string().max(128) }).strict(),
      z.object({ type: z.literal("recall"), heroId: z.string().max(128) }).strict(),
      z.object({ type: z.literal("pause"), paused: z.boolean() }).strict(),
    ]),
  })
  .strict();
const syncSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request") }).strict(),
  z
    .object({
      action: z.literal("ready"),
      runId: z.string(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);

export class GameService {
  readonly games = new Map<string, GameRuntime>();
  private opening = new Map<string, Promise<GameRuntime>>();
  private timer?: ReturnType<typeof setInterval>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private renewing = false;
  private stopping = false;
  readonly metrics = { commits: 0, failures: 0, authorityFailures: 0, resyncs: 0, commitMs: 0 };
  constructor(
    private io: Server,
    private repository: GameStorage = new GameRepository(),
    private authority = new WalletAuthority(),
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      this.tick();
    }, SERVICE_CONFIG.tickMs);
    this.heartbeat = setInterval(() => {
      void this.renew();
    }, SERVICE_CONFIG.heartbeatMs);
  }
  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    clearInterval(this.heartbeat);
    await Promise.allSettled([...this.opening.values()]);
    for (const runtime of this.games.values()) {
      runtime.ready = false;
      runtime.socketId = null;
    }
    await Promise.all(
      [...this.games.values()].map((runtime) =>
        runtime.enqueue(async () => {
          if (runtime.disconnectedAt === null) await this.persist(
            runtime,
            structuredClone(runtime.state),
            [],
            [],
            `checkpoint:${randomUUID()}`,
          );
          await this.authority.release(runtime.lease.wallet, runtime.lease.fencingToken);
        }),
      ),
    );
  }
  private error(socket: Socket, code: string, retryable = true): void {
    socket.emit(E.ERROR, { code, message: code.replaceAll("_", " "), retryable });
  }
  private async open(wallet: string): Promise<GameRuntime> {
    const existing = this.games.get(wallet);
    if (existing) return existing;
    const pending = this.opening.get(wallet);
    if (pending) return pending;
    const work = (async () => {
      const lease = await this.authority.acquire(wallet);
      if (!lease) throw new GamePersistenceError("WALLET_ACTIVE_ELSEWHERE");
      try {
        const runtime = new GameRuntime(await this.repository.load(wallet, lease), lease);
        this.games.set(wallet, runtime);
        return runtime;
      } catch (error) {
        await this.authority.release(wallet, lease.fencingToken);
        throw error;
      }
    })();
    this.opening.set(wallet, work);
    try {
      return await work;
    } finally {
      this.opening.delete(wallet);
    }
  }
  async connect(socket: Socket): Promise<void> {
    if (this.stopping) {
      socket.disconnect(true);
      return;
    }
    let runtime: GameRuntime | undefined;
    socket.on("disconnect", () => {
      if (!runtime || runtime.socketId !== socket.id) return;
      runtime.ready = false;
      const current = runtime;
      void current
        .enqueue(async () => {
          if (current.socketId !== socket.id) return;
          current.socketId = null;
          current.disconnectedAt = Date.now();
          await this.persist(
            current,
            structuredClone(current.state),
            [],
            [],
            `checkpoint:${randomUUID()}`,
          );
        })
        .catch(() => {
          /* reconnect reloads the last committed checkpoint */
        });
    });
    const player = await PlayerModel.findOne({ wallet: socket.data.wallet as string }).lean();
    if (!player) {
      this.error(socket, "PLAYER_NOT_FOUND", false);
      socket.disconnect(true);
      return;
    }
    const wallet = player.wallet;
    try {
      runtime = await this.open(wallet);
      const current = runtime;
      await current.enqueue(async () => {
        if (this.stopping || !socket.connected) {
          current.disconnectedAt = Date.now();
          return;
        }
        const lease = await this.authority.acquire(wallet);
        if (!lease) throw new GamePersistenceError("WALLET_ACTIVE_ELSEWHERE");
        current.lease = lease;
        current.ready = false;
        const old = current.socketId ? this.io.sockets.sockets.get(current.socketId) : undefined;
        current.socketId = socket.id;
        current.disconnectedAt = null;
        if (old && old !== socket) {
          this.error(old, "REPLACED_BY_NEW_TAB", false);
          old.disconnect(true);
        }
        current.state = await this.repository.load(wallet, lease);
      });
      if (!socket.connected) return;
      socket.on(E.SYNC, (raw: unknown) => {
        const parsed = syncSchema.safeParse(raw);
        if (!parsed.success) {
          this.error(socket, "INVALID_SYNC", false);
          return;
        }
        void current
          .enqueue(() => this.sync(current, socket, parsed.data))
          .catch(() => this.error(socket, "RECOVERING"));
      });
      socket.on(E.COMMAND, (raw: unknown) => {
        void current
          .command(async () => {
            if (current.socketId !== socket.id || !current.ready) {
              this.error(socket, "NOT_READY");
              return;
            }
            const parsed = commandSchema.safeParse(raw);
            if (!parsed.success) {
              this.error(socket, "INVALID_COMMAND", false);
              return;
            }
            const request = parsed.data;
            if (request.runId !== current.state.runId) {
              this.snapshot(current, socket);
              return;
            }
            const eventId = `command:${request.requestId}`;
            const fingerprint = JSON.stringify(request);
            const receipt = await this.repository.receipt(wallet, eventId);
            if (receipt) {
              if (receipt.fingerprint !== fingerprint) {
                this.error(socket, "REQUEST_ID_REUSED", false);
                return;
              }
              socket.emit(E.RESULT, receipt.result);
              return;
            }
            const candidate = structuredClone(current.state);
            const code = applyCommand(candidate, request.command, Date.now());
            const result: CommandResult = {
              requestId: request.requestId,
              ok: !code,
              revision: current.state.revision + 1,
              ...(code ? { code } : {}),
            };
            const before = current.state;
            await this.persist(current, candidate, [], [], eventId, result, fingerprint);
            this.publish(current, before, []);
            socket.emit(E.RESULT, { ...result, revision: current.state.revision });
          })
          .catch((error: unknown) => {
            this.error(
              socket,
              error instanceof Error && error.message === "COMMAND_QUEUE_FULL"
                ? "COMMAND_QUEUE_FULL"
                : "RECOVERING",
            );
          });
      });
      this.snapshot(current, socket);
    } catch (error) {
      this.error(
        socket,
        error instanceof GamePersistenceError ? error.code : "INITIALIZATION_FAILED",
      );
      socket.disconnect(true);
    }
  }
  private snapshot(runtime: GameRuntime, socket: Socket): void {
    runtime.ready = false;
    runtime.frame = 0;
    this.metrics.resyncs++;
    socket.emit(E.SNAPSHOT, {
      protocolVersion: PROTOCOL_VERSION,
      frame: runtime.frame,
      state: runtime.state,
    });
  }
  private async sync(runtime: GameRuntime, socket: Socket, request: SyncRequest): Promise<void> {
    if (runtime.socketId !== socket.id) return;
    if (request.action === "ready") {
      if (request.runId !== runtime.state.runId || request.revision !== runtime.state.revision) {
        this.snapshot(runtime, socket);
        return;
      }
      runtime.ready = true;
      return;
    }
    runtime.ready = false;
    runtime.state = await this.repository.load(runtime.state.playerId, runtime.lease);
    this.snapshot(runtime, socket);
  }
  private async persist(
    runtime: GameRuntime,
    candidate: GameState,
    rewards: SimulationResult["rewards"],
    effects: SimulationResult["effects"],
    eventId: string,
    result?: CommandResult,
    fingerprint?: string,
  ): Promise<void> {
    const started = performance.now();
    try {
      runtime.state = await this.repository.commit({
        before: runtime.state,
        candidate,
        lease: runtime.lease,
        eventId,
        rewards,
        result,
        fingerprint,
      });
      for (const effect of effects)
        if (effect.type === "reward")
          effect.amount = rewards.find((r) => r.id === effect.id)?.amount ?? 0;
      this.metrics.commits++;
      this.metrics.commitMs += performance.now() - started;
    } catch (error) {
      runtime.ready = false;
      this.metrics.failures++;
      const socket = runtime.socketId ? this.io.sockets.sockets.get(runtime.socketId) : undefined;
      if (socket)
        this.error(
          socket,
          error instanceof GamePersistenceError ? error.code : "PERSISTENCE_FAILED",
        );
      throw error;
    }
  }
  private publish(
    runtime: GameRuntime,
    before: GameState,
    effects: SimulationResult["effects"],
  ): void {
    const socket = runtime.socketId ? this.io.sockets.sockets.get(runtime.socketId) : undefined;
    if (!socket) return;
    if (before.mapId !== runtime.state.mapId) {
      this.snapshot(runtime, socket);
      return;
    }
    const state = runtime.state;
    const update: GameUpdate = {
      runId: state.runId,
      mapId: state.mapId,
      previousRevision: before.revision,
      revision: state.revision,
      time: state.time,
      paused: state.paused,
      coins: state.coins,
      daily: state.daily,
      heroes: state.heroes,
      bombs: state.bombs,
      nodes: Object.fromEntries(
        Object.entries(state.nodes).filter(
          ([key, node]) =>
            node.hp !== before.nodes[key]?.hp || node.destroyed !== before.nodes[key]?.destroyed,
        ),
      ),
      effects,
    };
    socket.emit(E.UPDATE, update);
  }
  tick(): void {
    for (const [wallet, runtime] of this.games) {
      if (
        runtime.disconnectedAt !== null &&
        Date.now() - runtime.disconnectedAt > SERVICE_CONFIG.retentionMs
      ) {
        if (runtime.queueDepth === 0) {
          this.games.delete(wallet);
          void this.authority.release(wallet, runtime.lease.fencingToken).catch(() => undefined);
        }
        continue;
      }
      if (
        this.stopping ||
        !runtime.ready ||
        !runtime.socketId ||
        runtime.state.paused ||
        runtime.stepPending
      )
        continue;
      if (
        !Object.values(runtime.state.heroes).some((hero) => hero.onMap) &&
        !Object.keys(runtime.state.bombs).length
      )
        continue;
      runtime.stepPending = true;
      void runtime
        .enqueue(async () => {
          if (!runtime.ready || !runtime.socketId || runtime.state.paused) return;
          const before = runtime.state;
          const candidate = simulationCandidate(before);
          const result = stepSimulation(candidate, SERVICE_CONFIG.tickMs, Date.now());
          if (result.durable) {
            await this.persist(
              runtime,
              candidate,
              result.rewards,
              result.effects,
              `step:${before.runId}:${before.revision + 1}`,
            );
            this.publish(runtime, before, result.effects);
          } else {
            runtime.state = candidate;
            const socket = this.io.sockets.sockets.get(runtime.socketId!);
            if (
              Object.keys(candidate.bombs).length ||
              Object.values(candidate.heroes).some(
                (h) =>
                  h.onMap && (h.x !== before.heroes[h.id]?.x || h.y !== before.heroes[h.id]?.y),
              )
            ) {
              socket?.emit(E.MOTION, {
                runId: candidate.runId,
                mapId: candidate.mapId,
                revision: candidate.revision,
                frame: ++runtime.frame,
                time: candidate.time,
                heroes: Object.fromEntries(
                  Object.values(candidate.heroes)
                    .filter((h) => h.onMap)
                    .map((h) => [h.id, { x: h.x, y: h.y, phase: h.phase }]),
                ),
              });
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          runtime.stepPending = false;
        });
    }
  }
  private async renew(): Promise<void> {
    if (this.renewing || this.stopping) return;
    this.renewing = true;
    try {
      await Promise.all(
        [...this.games.values()].map(async (runtime) => {
          if (runtime.disconnectedAt !== null) return;
          try {
            const renewed = await this.authority.renew(runtime.lease);
            if (!renewed) throw new Error("AUTHORITY_LOST");
            runtime.lease = renewed;
          } catch {
            runtime.ready = false;
            this.metrics.authorityFailures++;
            const socket = runtime.socketId
              ? this.io.sockets.sockets.get(runtime.socketId)
              : undefined;
            if (socket) {
              this.error(socket, "AUTHORITY_LOST");
              socket.disconnect(true);
            }
          }
        }),
      );
    } finally {
      this.renewing = false;
    }
  }
}
