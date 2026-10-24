"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import {
  GAME_EVENTS as E,
  PROTOCOL_VERSION,
  type CommandRequest,
  type CommandResult,
  type GameError,
  type GameMotion,
  type GameUpdate,
  type Snapshot,
} from "@/features/game/protocol";
import type { GameCommand, GameEffect, GameState } from "@/features/game/types";
import { applyMotion, applyUpdate } from "@/features/game/client-state";
import { heroToRoster } from "@/features/game/serialize";
import { useGameStore } from "@/features/store/gameStore";

export interface SocketState {
  connected: boolean;
  status: "connecting" | "synchronizing" | "ready" | "reconnecting" | "error";
  error: string | null;
}
type GameListener = (state: GameState, effects: GameEffect[]) => void;
let socket: Socket | null = null;
let game: GameState | null = null;
let frame = 0;
let status: SocketState = { connected: false, status: "connecting", error: null };
let desiredPaused = false;
let retryTimer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<(state: SocketState) => void>();
const gameListeners = new Set<GameListener>();
const pending = new Map<string, { request: CommandRequest; sentAt: number }>();
function publishPending(): void {
  useGameStore
    .getState()
    .setPendingHeroes(
      [...pending.values()].flatMap(({ request }) =>
        request.command.type === "pause" ? [] : [request.command.heroId],
      ),
    );
}

function setStatus(patch: Partial<SocketState>): void {
  status = { ...status, ...patch };
  useGameStore.getState().setConnectionLost(status.status !== "ready");
  for (const listener of listeners) listener(status);
}
function render(effects: GameEffect[] = []): void {
  if (!game) return;
  const store = useGameStore.getState();
  store.hydrateFromServer(game.coins, game.stage);
  store.hydrateRoster(
    Object.values(game.heroes).map((hero) => ({
      ...heroToRoster(hero),
      recoveryAt: Object.values(game!.bombs).some((bomb) => bomb.heroId === hero.id)
        ? undefined
        : hero.recoveryAt,
    })),
  );
  store.setPaused(game.paused);
  for (const listener of gameListeners) listener(game, effects);
}
function acknowledgeSnapshot(): void {
  if (!game || !socket?.connected || !gameListeners.size) return;
  socket.emit(E.SYNC, { action: "ready", runId: game.runId, revision: game.revision });
  setStatus({ connected: true, status: "ready", error: null });
  if (game.paused !== desiredPaused) sendGameCommand({ type: "pause", paused: desiredPaused });
  replayPending();
}
function replayPending(): void {
  if (!game || !socket?.connected || status.status !== "ready") return;
  for (const [id, entry] of pending) {
    if (entry.request.runId !== game.runId) {
      pending.delete(id);
      publishPending();
      continue;
    }
    if (Date.now() - entry.sentAt < 2000) continue;
    socket.emit(E.COMMAND, entry.request);
    entry.sentAt = Date.now();
  }
}
export function requestGameSync(): void {
  if (!socket?.connected) return;
  setStatus({ status: "synchronizing" });
  socket.emit(E.SYNC, { action: "request" });
}
export function initSocket(): Socket {
  if (socket) return socket;
  desiredPaused = typeof document !== "undefined" && (document.hidden || !document.hasFocus());
  const url = process.env.NEXT_PUBLIC_WS_URL;
  if (!url) useGameStore.getState().setSessionError("The game server is not configured.");
  socket = io(url ?? "", {
    auth: {
      token: localStorage.getItem("bm_token") ?? "",
      sessionId: crypto.randomUUID(),
      protocolVersion: PROTOCOL_VERSION,
    },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on("connect", () => setStatus({ connected: true, status: "synchronizing", error: null }));
  socket.on("disconnect", (reason: string) => {
    if (status.status === "error") return;
    setStatus({ connected: false, status: "reconnecting" });
    if (reason === "io server disconnect") setTimeout(() => socket?.connect(), 1000);
  });
  socket.on("connect_error", (error: Error) => {
    const terminal = error.message.startsWith("AUTH_") || error.message === "RELOAD_REQUIRED";
    setStatus({
      connected: false,
      status: terminal ? "error" : "reconnecting",
      error: error.message,
    });
    if (terminal)
      useGameStore
        .getState()
        .setSessionError(
          error.message === "RELOAD_REQUIRED"
            ? "Please reload to update the game."
            : "Your session expired. Please log in again.",
        );
  });
  socket.on(E.SNAPSHOT, (snapshot: Snapshot) => {
    if (snapshot.protocolVersion !== PROTOCOL_VERSION) {
      useGameStore.getState().setSessionError("Please reload to update the game.");
      return;
    }
    game = snapshot.state;
    frame = snapshot.frame;
    setStatus({ status: "synchronizing" });
    render();
    acknowledgeSnapshot();
  });
  socket.on(E.UPDATE, (update: GameUpdate) => {
    if (!game || status.status !== "ready") return;
    const next = applyUpdate(game, update);
    if (!next) {
      requestGameSync();
      return;
    }
    if (next === game) return;
    game = next;
    render(update.effects);
  });
  socket.on(E.MOTION, (motion: GameMotion) => {
    if (!game || status.status !== "ready") return;
    const next = applyMotion(game, motion, frame);
    if (next === game) return;
    game = next;
    frame = motion.frame;
    for (const listener of gameListeners) listener(game, []);
  });
  socket.on(E.RESULT, (result: CommandResult) => {
    pending.delete(result.requestId);
    publishPending();
    useGameStore
      .getState()
      .setDeployError(result.ok ? null : (result.code ?? "Command rejected").replaceAll("_", " "));
    if (game && result.revision > game.revision) requestGameSync();
  });
  socket.on(E.ERROR, (error: GameError) => {
    if (!error.retryable) {
      setStatus({ status: "error", error: error.code });
      useGameStore.getState().setSessionError(error.message);
      socket?.disconnect();
      return;
    }
    setStatus({ status: "synchronizing", error: error.code });
    setTimeout(requestGameSync, 2000);
  });
  retryTimer = setInterval(replayPending, 1000);
  return socket;
}
export function sendGameCommand(command: GameCommand): boolean {
  if (!game || !socket?.connected || status.status !== "ready" || pending.size >= 32) return false;
  const request: CommandRequest = { requestId: crypto.randomUUID(), runId: game.runId, command };
  pending.set(request.requestId, { request, sentAt: 0 });
  publishPending();
  replayPending();
  return true;
}
export function sendHeroDeploy(heroId: string, onMap: boolean): boolean {
  return sendGameCommand({ type: onMap ? "deploy" : "recall", heroId });
}
export function setGameVisibility(paused: boolean): void {
  desiredPaused = paused;
  sendGameCommand({ type: "pause", paused });
}
export function subscribeGame(listener: GameListener): () => void {
  gameListeners.add(listener);
  if (game) {
    listener(game, []);
    acknowledgeSnapshot();
  }
  return () => {
    gameListeners.delete(listener);
  };
}
export function getSocket(): Socket | null {
  return socket;
}
export function getSocketState(): SocketState {
  return status;
}
export function subscribeSocketState(listener: (state: SocketState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function destroySocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  game = null;
  frame = 0;
  pending.clear();
  clearInterval(retryTimer);
  publishPending();
  setStatus({ connected: false, status: "connecting", error: null });
}
const SocketContext = createContext<SocketState>(status);
export function SocketProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(status);
  useEffect(() => subscribeSocketState(setState), []);
  return <SocketContext.Provider value={state}>{children}</SocketContext.Provider>;
}
export const useSocketState = () => useContext(SocketContext);
export const useSocket = () => socket;
