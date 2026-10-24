import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { io as client, type Socket as ClientSocket } from "socket.io-client";
import { GameService } from "./GameService";
import { prepareGameDatabase } from "../persistence/GameRepository";
import { PlayerModel } from "@/lib/modules/players/model.server";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import { StageMapModel } from "@/lib/modules/stage-maps/model.server";
import { GameEventModel } from "../persistence/events.server";
import { HeroRarity, HeroType } from "@/features/types/HeroRarity";
import { GAME_EVENTS as E, type Snapshot, type CommandResult } from "@/features/game/protocol";
import type { GameState } from "@/features/game/types";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("real socket game lifecycle", () => {
  let http: HttpServer, io: Server, service: GameService, address: string;
  let latest: GameState;
  const clients: ClientSocket[] = [];
  beforeAll(async () => {
    const url = new URL(uri!);
    if (!url.pathname.startsWith("/boom_game_test"))
      throw new Error("Use an isolated boom_game_test database");
    url.pathname += "_runtime";
    await mongoose.connect(url.toString());
    globalThis._mongooseConnection = Promise.resolve(mongoose);
    await prepareGameDatabase();
  });
  beforeEach(async () => {
    await Promise.all([
      PlayerModel.deleteMany({}),
      HeroModel.deleteMany({}),
      StageMapModel.deleteMany({}),
      GameEventModel.deleteMany({}),
    ]);
    await PlayerModel.create({ wallet: "socket-player", registrationTime: Date.now(), coins: 0 });
    await HeroModel.create({
      ownerWallet: "socket-player",
      minted_number: 1,
      name: "Ricky",
      type: HeroType.Ricky,
      rarity: HeroRarity.Common,
      currentEnergy: 200,
      maxEnergy: 200,
      attributes: { power: 3, speed: 2, stamina: 2, bombNumber: 1, bombRange: 2 },
    });
    http = createServer();
    io = new Server(http);
    service = new GameService(io);
    io.on("connection", (socket) => {
      socket.data.wallet = "socket-player";
      void service.connect(socket);
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    address = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    clients.forEach((socket) => socket.disconnect());
    clients.length = 0;
    await service.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    globalThis._mongooseConnection = undefined;
  });
  function connect(ready = true): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = client(address, { transports: ["websocket"], reconnection: false });
      clients.push(socket);
      const timer = setTimeout(() => reject(new Error("snapshot timed out")), 5000);
      socket.on(E.SNAPSHOT, (snapshot: Snapshot) => {
        latest = snapshot.state;
        if (ready)
          socket.emit(E.SYNC, { action: "ready", runId: latest.runId, revision: latest.revision });
        clearTimeout(timer);
        resolve(socket);
      });
    });
  }
  it("does not enable simulation until the snapshot has been acknowledged", async () => {
    const socket = await connect(false);
    const runtime = service.games.get("socket-player")!;
    service.tick();
    await runtime.drain();
    expect(runtime.ready).toBe(false);
    expect(runtime.state.time).toBe(0);
    socket.emit(E.SYNC, { action: "ready", runId: latest.runId, revision: latest.revision });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(runtime.ready).toBe(true);
  });
  it("deduplicates commands and reconnects to durable state", async () => {
    const socket = await connect();
    const request = {
      requestId: crypto.randomUUID(),
      runId: latest.runId,
      command: { type: "deploy", heroId: Object.keys(latest.heroes)[0] },
    };
    const send = () =>
      new Promise<CommandResult>((resolve) => {
        socket.once(E.RESULT, resolve);
        socket.emit(E.COMMAND, request);
      });
    const first = await send(),
      duplicate = await send();
    expect(first.ok).toBe(true);
    expect(duplicate).toEqual(first);
    const runId = latest.runId;
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await connect();
    expect(latest.runId).toBe(runId);
    expect(latest.heroes[request.command.heroId].onMap).toBe(true);
  });
  it("replaces the old tab and prevents it from driving the player", async () => {
    const first = await connect();
    const replaced = new Promise<{ code: string }>((resolve) => first.once(E.ERROR, resolve));
    const second = await connect();
    expect((await replaced).code).toBe("REPLACED_BY_NEW_TAB");
    expect(service.games.get("socket-player")!.socketId).toBe(second.id);
  });
  it("freezes on disconnect and does not simulate offline time on reconnect", async () => {
    const socket = await connect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const runtime = service.games.get("socket-player")!;
    service.tick();
    await runtime.drain();
    const time = runtime.state.time;
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    for (let i = 0; i < 100; i++) service.tick();
    await runtime.drain();
    expect(runtime.state.time).toBe(time);
    await connect();
    expect(latest.time).toBe(time);
  });
  it("renews authority during an idle period longer than the lease", async () => {
    service.start();
    const socket = await connect();
    await new Promise((resolve) => setTimeout(resolve, 16_000));
    const runtime = service.games.get("socket-player")!;
    expect(runtime.lease.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const result = new Promise<CommandResult>((resolve) => socket.once(E.RESULT, resolve));
    socket.emit(E.COMMAND, {
      requestId: crypto.randomUUID(),
      runId: latest.runId,
      command: { type: "deploy", heroId: Object.keys(latest.heroes)[0] },
    });
    expect((await result).ok).toBe(true);
  }, 25_000);
});
