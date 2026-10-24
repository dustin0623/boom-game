/** Isolated real-transport/real-database soak. Never accepts the application database. */
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { io as client, type Socket } from "socket.io-client";
import { GameService } from "../server/game-websocket-engine/runtime/GameService";
import {
  GameRepository,
  prepareGameDatabase,
} from "../server/game-websocket-engine/persistence/GameRepository";
import { PlayerModel } from "../lib/modules/players/model.server";
import { HeroModel } from "../lib/modules/heroes/model.server";
import { HeroRarity, HeroType } from "../features/types/HeroRarity";
import { GAME_EVENTS as E, type Snapshot, type GameUpdate } from "../features/game/protocol";

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !new URL(uri).pathname.startsWith("/boom_game_test_load"))
  throw new Error("Use TEST_MONGODB_URI with a dedicated boom_game_test_load* database");
const sessions = Number(process.env.LOAD_SESSIONS ?? 100);
const duration = Number(process.env.LOAD_SECONDS ?? 900);
await mongoose.connect(uri);
globalThis._mongooseConnection = Promise.resolve(mongoose);
await mongoose.connection.dropDatabase();
await prepareGameDatabase();
await PlayerModel.insertMany(
  Array.from({ length: sessions }, (_, i) => ({
    wallet: `load-${i}`,
    registrationTime: Date.now(),
    coins: 0,
  })),
);
await HeroModel.insertMany(
  Array.from({ length: sessions * 10 }, (_, i) => ({
    ownerWallet: `load-${Math.floor(i / 10)}`,
    minted_number: i + 1,
    name: "Ricky",
    type: HeroType.Ricky,
    rarity: HeroRarity.Legendary,
    currentEnergy: 10_000_000,
    maxEnergy: 10_000_000,
    onMap: true,
    attributes: { power: 20, speed: 2, stamina: 100_000, bombNumber: 2, bombRange: 3 },
  })),
);
const http = createServer(),
  io = new Server(http);
const storage = new GameRepository();
const latencies: number[] = [];
const service = new GameService(io, {
  load: storage.load.bind(storage),
  receipt: storage.receipt.bind(storage),
  commit: async (input) => {
    const start = performance.now();
    try {
      return await storage.commit(input);
    } finally {
      if (latencies.length < 100_000) latencies.push(performance.now() - start);
    }
  },
});
io.on("connection", (socket) => {
  socket.data.wallet = socket.handshake.auth.wallet;
  void service.connect(socket).catch((error) => {
    console.error(error);
    socket.disconnect(true);
  });
});
await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
const port = (http.address() as { port: number }).port;
service.start();
const errors: string[] = [];
let messages = 0;
const revisions = new Map<number, number>();
const sockets: Socket[] = [];
await Promise.all(
  Array.from(
    { length: sessions },
    (_, i) =>
      new Promise<void>((resolve, reject) => {
        const socket = client(`http://127.0.0.1:${port}`, {
          auth: { wallet: `load-${i}` },
          transports: ["websocket"],
        });
        sockets.push(socket);
        const timeout = setTimeout(
          () => reject(new Error(`session ${i} did not initialize`)),
          120_000,
        );
        socket.on(E.SNAPSHOT, (snapshot: Snapshot) => {
          revisions.set(i, snapshot.state.revision);
          socket.emit(E.SYNC, {
            action: "ready",
            runId: snapshot.state.runId,
            revision: snapshot.state.revision,
          });
          clearTimeout(timeout);
          resolve();
        });
        socket.onAny(() => messages++);
        socket.on(E.UPDATE, (update: GameUpdate) => {
          if (update.previousRevision !== revisions.get(i))
            errors.push(`revision gap session ${i}`);
          revisions.set(i, update.revision);
        });
        socket.on(E.ERROR, (error: { code: string }) => errors.push(`session ${i}: ${error.code}`));
      }),
  ),
);
const samples: { seconds: number; heapMb: number; active: number; queued: number }[] = [];
const started = Date.now();
const sample = () => {
  const record = {
    seconds: Math.round((Date.now() - started) / 1000),
    heapMb: Math.round(process.memoryUsage().heapUsed / 1048576),
    active: service.games.size,
    queued: [...service.games.values()].reduce((sum, r) => sum + r.queueDepth, 0),
  };
  samples.push(record);
  console.log(
    JSON.stringify({
      ...record,
      commits: service.metrics.commits,
      failures: service.metrics.failures,
    }),
  );
};
sample();
const sampler = setInterval(sample, 30_000);
await new Promise((resolve) => setTimeout(resolve, duration * 1000));
clearInterval(sampler);
sample();
sockets.forEach((socket) => socket.disconnect());
await new Promise((resolve) => setTimeout(resolve, 65_000));
sample();
const retainedAfterRelease = service.games.size;
await service.stop();
await new Promise<void>((resolve) => io.close(() => resolve()));
latencies.sort((a, b) => a - b);
const report = {
  sessions,
  heroesPerSession: 10,
  durationSeconds: duration,
  messages,
  errors: errors.slice(0, 100),
  retainedAfterRelease,
  metrics: service.metrics,
  commitP50Ms: latencies[Math.floor(latencies.length * 0.5)],
  commitP95Ms: latencies[Math.floor(latencies.length * 0.95)],
  samples,
};
await mkdir(".cache", { recursive: true });
await writeFile(".cache/game-load-report.json", JSON.stringify(report, null, 2));
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
console.log(JSON.stringify(report));
if (errors.length || retainedAfterRelease || service.metrics.failures) process.exitCode = 1;
