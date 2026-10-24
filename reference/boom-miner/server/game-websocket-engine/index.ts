import { createServer } from "node:http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { connectDatabase } from "@/lib/config/database";
import { authMiddleware } from "./socket/auth";
import { GameService } from "./runtime/GameService";
import { prepareGameDatabase } from "./persistence/GameRepository";
import { SERVICE_CONFIG, validateServiceConfig } from "./config";

async function main(): Promise<void> {
  validateServiceConfig();
  await connectDatabase();
  await prepareGameDatabase();
  let stopping = false;
  const http = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(stopping || mongoose.connection.readyState !== 1 ? 503 : 200, {
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify({
        ready: !stopping && mongoose.connection.readyState === 1,
        activeGames: service.games.size,
        queueDepth: [...service.games.values()].reduce((sum, game) => sum + game.queueDepth, 0),
        ...service.metrics,
      }),
    );
  });
  const io = new Server(http, {
    cors: { origin: "*" },
    pingInterval: SERVICE_CONFIG.pingInterval,
    pingTimeout: SERVICE_CONFIG.pingTimeout,
    maxHttpBufferSize: 16_384,
  });
  const service = new GameService(io);
  io.use((socket, next) =>
    stopping ? next(new Error("SERVER_SHUTTING_DOWN")) : authMiddleware(socket, next),
  );
  io.on("connection", (socket) => {
    void service.connect(socket).catch((error) => {
      console.error("Game initialization failed", error);
      socket.disconnect(true);
    });
  });
  service.start();
  const port = Number(process.env.PORT ?? 4000);
  http.listen(port, () => console.log(`Game service ready on port ${port} (protocol 2)`));
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 20_000).unref();
    try {
      await service.stop();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await mongoose.disconnect();
      clearTimeout(deadline);
    } catch (error) {
      console.error("Game shutdown failed", error);
      process.exitCode = 1;
    }
  };
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}
main().catch((error) => {
  console.error("Game service startup failed", error);
  process.exitCode = 1;
});
