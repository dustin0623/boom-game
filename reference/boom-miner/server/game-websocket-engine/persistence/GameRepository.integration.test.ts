import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { GameRepository, prepareGameDatabase } from "./GameRepository";
import { GameEventModel } from "./events.server";
import { PlayerModel } from "@/lib/modules/players/model.server";
import { HeroModel } from "@/lib/modules/heroes/model.server";
import { StageMapModel } from "@/lib/modules/stage-maps/model.server";
import { stepSimulation, simulationCandidate } from "@/features/game/simulation";
import type { GameState } from "@/features/game/types";
import { HeroType, HeroRarity } from "@/features/types/HeroRarity";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("standalone MongoDB atomic gameplay", () => {
  const repository = new GameRepository();
  let state: GameState;
  const lease = {
    wallet: "integration-player",
    instanceId: "integration",
    fencingToken: 1,
    expiresAt: new Date(Date.now() + 3600000),
  };
  beforeAll(async () => {
    const database = new URL(uri!).pathname.slice(1);
    if (!database.startsWith("boom_game_test"))
      throw new Error("TEST_MONGODB_URI must use a dedicated boom_game_test* database");
    await mongoose.connect(uri!);
    await prepareGameDatabase();
  });
  beforeEach(async () => {
    await Promise.all([
      PlayerModel.deleteMany({}),
      HeroModel.deleteMany({}),
      StageMapModel.deleteMany({}),
      GameEventModel.deleteMany({}),
    ]);
    await PlayerModel.create({
      wallet: lease.wallet,
      registrationTime: Date.now(),
      coins: 100,
      game: {
        lease: {
          instanceId: lease.instanceId,
          fencingToken: lease.fencingToken,
          expiresAt: lease.expiresAt,
        },
      },
    });
    await HeroModel.create({
      ownerWallet: lease.wallet,
      name: "Ricky",
      minted_number: 1,
      type: HeroType.Ricky,
      rarity: HeroRarity.Common,
      currentEnergy: 200,
      maxEnergy: 200,
      onMap: true,
      attributes: { power: 3, speed: 2, stamina: 2, bombNumber: 2, bombRange: 3 },
    });
    state = await repository.load(lease.wallet, lease);
    const candidate = structuredClone(state);
    candidate.nodes = {
      "3,1": { x: 3, y: 1, kind: "chest", hp: 3, maxHp: 3, coins: 800, destroyed: false },
      "9,9": { x: 9, y: 9, kind: "chest", hp: 30, maxHp: 30, coins: 800, destroyed: false },
    };
    candidate.mapId = "integration-map";
    const heroId = Object.keys(candidate.heroes)[0];
    candidate.bombs = { b: { id: "b", heroId, x: 1, y: 1, range: 3, power: 3, dueAt: 0 } };
    state = await repository.commit({
      before: state,
      candidate,
      lease,
      eventId: "setup",
      rewards: [],
    });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  async function explode(eventId = "explode") {
    const candidate = simulationCandidate(state);
    const outcome = stepSimulation(candidate, 100, Date.now());
    return repository.commit({
      before: state,
      candidate,
      lease,
      eventId,
      rewards: outcome.rewards,
    });
  }
  it("persists damage, reward receipt, coins, and energy together across reload", async () => {
    const committed = await explode();
    const loaded = await repository.load(lease.wallet, lease);
    expect(loaded.revision).toBe(committed.revision);
    expect(loaded.nodes["3,1"].destroyed).toBe(true);
    expect(loaded.coins).toBe(900);
    expect(Object.values(loaded.heroes)[0].energy).toBe(199);
    expect(await repository.receipt(lease.wallet, "explode")).not.toBeNull();
    expect((await PlayerModel.findOne({ wallet: lease.wallet }).lean())?.game).toBeTruthy();
  });
  it("returns a committed operation after a duplicate retry without paying again", async () => {
    await explode();
    await explode();
    expect((await PlayerModel.findOne({ wallet: lease.wallet }).lean())!.coins).toBe(900);
    expect(await repository.receipt(lease.wallet, "explode")).not.toBeNull();
  });
  it("rejects stale revisions and expired authority without partial writes", async () => {
    await explode();
    await expect(explode("stale")).rejects.toThrow();
    expect((await PlayerModel.findOne({ wallet: lease.wallet }).lean())!.coins).toBe(900);
    await PlayerModel.updateOne(
      { wallet: lease.wallet },
      { $set: { "game.lease.expiresAt": new Date(0) } },
    );
    await expect(
      repository.commit({
        before: state,
        candidate: state,
        lease,
        eventId: "expired",
        rewards: [],
      }),
    ).rejects.toThrow("AUTHORITY_LOST");
    expect(await repository.receipt(lease.wallet, "expired")).toBeNull();
  });
  it("increments fresh balance rather than overwriting a changed balance", async () => {
    await PlayerModel.updateOne({ wallet: lease.wallet }, { $inc: { coins: -50 } });
    const committed = await explode();
    expect(committed.coins).toBe(850);
  });
  it("enforces the cap atomically and preserves destroyed chests without rewards", async () => {
    await PlayerModel.updateOne(
      { wallet: lease.wallet },
      { $set: { dailyChestsCleared: 12, dailyChestsResetAt: Date.now() } },
    );
    const committed = await explode();
    expect(committed.coins).toBe(100);
    expect(committed.nodes["3,1"].destroyed).toBe(true);
    expect((await PlayerModel.findOne({ wallet: lease.wallet }).lean())?.dailyChestsCleared).toBe(
      12,
    );
  });
  it("recovers a repeated commit from its atomically stored operation receipt", async () => {
    const committed = await explode();
    const replayed = await repository.commit({
      before: state,
      candidate: simulationCandidate(state),
      lease,
      eventId: "explode",
      rewards: [],
    });
    expect(replayed.revision).toBe(committed.revision);
    expect(replayed.coins).toBe(900);
    expect((await PlayerModel.findOne({ wallet: lease.wallet }).lean())?.coins).toBe(900);
  });
  it("initializes legacy checkpoints idempotently without refilling deployed heroes", async () => {
    const legacyNodes = structuredClone(state.nodes);
    legacyNodes["3,1"].destroyed = true;
    legacyNodes["3,1"].hp = 0;
    await StageMapModel.create({
      playerId: lease.wallet,
      stage: state.stage,
      seed: state.seed,
      width: 41,
      height: 25,
      nodes: legacyNodes,
    });
    await PlayerModel.updateOne({ wallet: lease.wallet }, { $unset: { "game.state": 1 } });
    await HeroModel.updateMany(
      {},
      { $set: { currentEnergy: 50, lastRegenAt: Date.now() - 86400000 } },
    );
    const first = await repository.load(lease.wallet, lease),
      second = await repository.load(lease.wallet, lease);
    expect(first.runId).toBe(second.runId);
    expect(first.mapId).toBe(second.mapId);
    expect(first.nodes["3,1"].destroyed).toBe(true);
    expect(first.coins).toBe(100);
    expect(Object.values(first.heroes)[0].energy).toBe(50);
    expect(await GameEventModel.countDocuments({ kind: "reward" })).toBe(0);
  });
});
