import { EQUIPMENT_STATS_EFFECTIVE_AT } from "@/lib/config/constants/game";
import { itemUpgradeCost, upgradedStats } from "@/features/types/game/items";
import { debitSparks } from "@/lib/modules/players/server.repository";
import {
  loseSparksDebitAcknowledgment,
  staleSparksBalance,
} from "@/tests/fixtures/sparks-write-fault";
import {
  inspectRaidRecovery,
  resumeRaidRecovery,
} from "@/server/game-smart-contract/features/events/process-game-action/recovery";
import {
  createLog,
  publishRaidLog,
} from "@/lib/modules/logs/server.repository";
import { miningPerSecond } from "@/features/types/game/mining";
import { withGameExecution } from "@/lib/utils/game/execution-context.server";
import { equipItem as equipGameplayItem } from "@/features/events/backend/equipment/equip";
import { unequipItem as unequipGameplayItem } from "@/features/events/backend/equipment/unequip";
import { upgradeEquipment as upgradeGameplayItem } from "@/features/events/backend/equipment/upgrade";
import { settleTick } from "@/features/events/backend/tick-player/action";
import { helpTarget } from "@/features/events/backend/social-actions/help";
vi.mock("@/lib/auth/session", () => ({
  requireSession: async (request: Request) => ({
    wallet: request.headers.get("x-test-wallet") ?? "alice",
    username: request.headers.get("x-test-wallet") ?? "alice",
  }),
}));
import { HIVE_WORKER_LEASE_ID } from "@/lib/modules/game-stats/server.types";
import {
  issueLoginNonce,
  consumeLoginNonce,
  upsertPlayer,
  creditHash,
  applyStatSabotage,
  replaceStatEffect,
  clearStatEffects,
  reserveRaidCharge,
  claimRaidDefender,
  creditRaidProceeds,
  debitRaidRisk,
  readRegisteredMiningBatches,
  readLeaderboardPlayerBatches,
  findRaidTargets,
} from "@/lib/modules/players/server.repository";
import {
  readPlayerProfile,
  readTransactions,
  readRaidTargets,
} from "@/tests/fixtures/api-reads";
import { completePaymentJob } from "@/server/game-smart-contract/features/events/payment-processing/support";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
import {
  contractStreamRepository,
  gameStatsRepository,
} from "@/lib/modules/game-stats/server.repository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import type { StatEffect } from "@/features/types/game/stat-effects";
import { CHARGE_REGEN_MS, MAX_RAID_CHARGES } from "@/lib/config/constants/game";
const statEffect = (
  stat: StatEffect["stat"],
  appliedBy = "saboteur",
): StatEffect => ({
  stat,
  itemId: "sabotage-device",
  appliedBy,
  appliedAt: 1000,
  active: true,
  strength: 0.4,
  critical: false,
  helps: [],
});
const database = await vi.hoisted(async () => {
  const { config: loadEnvironment } = await import("dotenv");
  const { randomUUID } = await import("node:crypto");
  const environment: Record<string, string> = {};
  loadEnvironment({
    path: [".env.local", ".env"],
    processEnv: environment,
    quiet: true,
  });
  return {
    uri: process.env.MONGODB_URI ?? environment.MONGODB_URI,
    name: "chainframe_test_" + randomUUID().replaceAll("-", ""),
  };
});
vi.mock("@/lib/config/config", async (original) => {
  const actual = await original<typeof import("@/lib/config/config")>();
  return {
    config: {
      ...actual.config,
      mongoUri: database.uri ?? "",
      mongoDb: database.name,
      blockchain: { ...actual.config.blockchain, treasuryAccount: "treasury" },
    },
  };
});
import {
  initializeContractDatabase,
  disconnectContractDatabase,
} from "@/server/game-smart-contract/utils/database.server";
import {
  withDatabaseOperation,
  DatabaseOperationUncertainError,
} from "@/lib/utils/database/operation.server";

import { PlayerModel } from "@/lib/modules/players/server.model";
import { InventoryItemModel } from "@/lib/modules/items/server.model";
import { EquipmentModel } from "@/lib/modules/equipments/server.model";
import {
  grantInventoryItems,
  consumeInventoryItem,
  getInventoryQuantity,
} from "@/lib/modules/items/server.repository";
import { GameStatModel } from "@/lib/modules/game-stats/server.model";
import { LogModel } from "@/lib/modules/logs/server.model";
import {
  readAnalyticsLogBatches,
  logRepository,
} from "@/lib/modules/logs/server.repository";
import { decodeCursor } from "@/lib/utils/logs/history";
import { readAnalyticsReceipts } from "@/lib/modules/transactions-processed/server.repository";
import {
  analyticsReceiptKey,
  createGameStatsAccumulator,
  toGameStatsDaily,
} from "@/lib/api/dto/game-stats";
import { currentMiningPerSecond } from "@/features/types/game/mining";
import {
  createLeaderboardAccumulator,
  toLeaderboardDto,
} from "@/lib/api/dto/leaderboard";
import { InboundTransactionModel } from "@/lib/modules/transactions-pending/server.model";
import { ProcessedTransactionModel } from "@/lib/modules/transactions-processed/server.model";

import { registerPlayer } from "@/features/events/backend/player-lifecycle/register";
import { upgradeStat } from "@/features/events/backend/upgrade-stat/action";
import { createGameActionProcessor } from "@/server/game-smart-contract/features/events/process-game-action/action";
import { gameActionPersistence } from "@/server/game-smart-contract/features/events/process-game-action/persistence";
import {
  buildUpgradeStatAction,
  buildClaimAction,
  buildGameAction,
  buildRaidAction,
} from "@/lib/utils/game/action-protocol";
import { hiveGameActionEvent } from "@/tests/fixtures/hive-game-action";
import {
  interruptRaidWrite,
  interruptRaidFinalization,
  syntheticRaidSeed,
} from "@/tests/fixtures/raid-write-fault";
import { recoverDeferredGameActions } from "@/server/game-smart-contract/features/events/process-game-action/recovery";
import {
  gameplayDependencies,
  holdPaymentFulfillment,
} from "@/features/events/backend/raid/dependencies";
import {
  claimPendingGameAction,
  parkGameAction,
} from "@/lib/modules/transactions-pending/server.repository";
import {
  withPaymentDatabaseOperation,
  retryOrDie,
} from "@/server/game-smart-contract/features/events/payment-processing/support";
import { GameplayDependencyHold } from "@/features/events/backend/raid/dependencies";
import { dispatchTreasuryOnce } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import { SettlementUncertainError } from "@/server/game-smart-contract/features/events/treasury/errors.server";
vi.mock(
  "@/server/game-smart-contract/features/events/treasury/verify.server",
  () => ({
    verifyTreasuryTransfer: vi.fn(async () => ({
      status: "confirmed",
      evidence: { state: "confirmed", blockNumber: 100, operationIndex: 0 },
    })),
  }),
);
import { createGameActionRegistry } from "@/server/game-smart-contract/features/events/process-game-action/dispatch";
import { processJob } from "@/server/game-smart-contract/features/events/payment-processing/dispatch";
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-native-payment/action",
  () => ({ verifyNativePayment: vi.fn() }),
);
import { verifyNativePayment } from "@/lib/chains/modules/hive/server/events/verify-native-payment/action";
import { runGameActionStreamWorker } from "@/server/game-smart-contract/workers/game-action-stream-worker";
import { type GameActionStreamPosition } from "@/server/game-smart-contract/features/types/stream";

import {
  listRecoverableGameActions,
  beginQueuedDatabaseEffects,
  resumeReconciledPayment,
} from "@/lib/modules/transactions-pending/server.repository";
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-token-payment/action",
  () => ({
    verifyTokenPayment: vi.fn(async () => ({
      success: true,
      status: "confirmed",
      operationIndex: 0,
      from: "alice",
      to: "treasury",
      amount: "5",
      trigger: { action: "deposit", metadata: {} },
    })),
  }),
);
// Reuse the application URI, but override its database name for every test run.
function isolatedDatabase() {
  const db = mongoose.connection.db;
  if (
    db?.databaseName !== database.name ||
    !/^chainframe_test_[a-f0-9]{32}$/.test(database.name)
  )
    throw new Error("Refusing cleanup outside the isolated test database");
  return db;
}

describe.skipIf(!database.uri)(
  "MongoDB direct writes and queue recovery",
  () => {
    beforeAll(async () => {
      await initializeContractDatabase();
      expect(mongoose.connection.db?.databaseName).toBe(database.name);
    }, 60000);
    beforeEach(async () => {
      vi.spyOn(hiveClient, "resolveAccount").mockReturnValue({
        account: "treasury",
      } as never);
      isolatedDatabase();
      for (const model of Object.values(mongoose.models))
        await model.deleteMany({});
    });

    const raidAt = EQUIPMENT_STATS_EFFECTIVE_AT + 86400_000;
    async function seedOfflineRaid() {
      for (const wallet of ["alice", "bob"]) {
        await upsertPlayer({ wallet, username: wallet });
        await PlayerModel.updateOne(
          { wallet },
          {
            $set: {
              isRegistered: true,
              vault: wallet === "alice" ? 0.9 : 0,
              lastTickAt: raidAt - (wallet === "alice" ? 1 : 6) * 3600_000,
              lastSinkAt: raidAt,
              lastRaidRegenAt: raidAt,
              lastClaimRegenAt: raidAt,
              "statLevels.hackPower": wallet === "alice" ? 2 : 1,
            },
          },
        );
      }
    }
    const runRaidAt = async (at: number) => {
      const id = `offline-${at}-${crypto.randomUUID()}`;
      const event = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: id }),
        {
          transactionId: id,
          blockTimestamp: new Date(at).toISOString(),
        },
      );
      const { claimPendingGameAction } =
        await import("@/lib/modules/transactions-pending/server.repository");
      await claimPendingGameAction(event, "offline-claim");
      await InboundTransactionModel.updateOne(
        { signature: `${id}:0` },
        {
          $set: { "gameEvent.randomSeed": syntheticRaidSeed(`${id}:0`, true) },
        },
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      // Let the normal processor reclaim the saved operation.
      await InboundTransactionModel.updateOne(
        { signature: `${id}:0` },
        { $set: { "gameEvent.claimUntil": 0 } },
      );
      expect((await processor.process(event)).status).toBe("executed");
      const receipt = await ProcessedTransactionModel.findOne({
        txHash: `${id}:0`,
      }).lean();
      const result =
        receipt?.metadata?.type === "game_action"
          ? receipt.metadata.event.result
          : undefined;
      return { body: result as Record<string, unknown> };
    };

    it("excludes unregistered shells before the target cap and rejects direct raids without effects", async () => {
      await seedOfflineRaid();
      await PlayerModel.insertMany(
        Array.from({ length: 105 }, (_, index) => ({
          wallet: `shell-${index}`,
          username: `shell-${index}`,
          isRegistered: false,
          vault: 1000,
        })),
      );
      expect(
        (await findRaidTargets(1, "alice")).map((player) => player.wallet),
      ).toEqual(["bob"]);
      const before = await PlayerModel.find().sort({ wallet: 1 }).lean();
      const event = hiveGameActionEvent(
        buildRaidAction({
          target: "shell-1",
          nonce: "unregistered-target-123",
        }),
        {
          transactionId: "unregistered-target",
          blockTimestamp: new Date(raidAt).toISOString(),
        },
      );
      expect(
        await createGameActionProcessor(createGameActionRegistry()).process(
          event,
        ),
      ).toMatchObject({
        status: "rejected",
        reason: "Target registration is required",
      });
      expect(await PlayerModel.find().sort({ wallet: 1 }).lean()).toEqual(
        before,
      );
      expect(await LogModel.countDocuments({ type: "raid" })).toBe(0);
      expect(
        await PlayerModel.countDocuments({ activeRaid: { $exists: true } }),
      ).toBe(0);
      expect(
        await InboundTransactionModel.countDocuments({ type: "game_action" }),
      ).toBe(0);
    });

    it("reads offline target estimates with validated gear without persisting ticks", async () => {
      await seedOfflineRaid();
      const gear = await EquipmentModel.create({
        templateId: 1000,
        owner: "bob",
        name: "Offline Miner",
        slot: "asicMiner",
        rarity: "common",
        equipped: true,
        stats: { hashRate: 10 },
      });
      await PlayerModel.updateOne(
        { wallet: "bob" },
        { $set: { "equipment.asicMiner": gear._id, vaultStaked: 100 } },
      );
      const before = await PlayerModel.find().sort({ wallet: 1 }).lean();
      const clock = vi.spyOn(Date, "now").mockReturnValue(raidAt);
      try {
        const rivals = await readRaidTargets("alice", 20);
        expect(rivals).toHaveLength(1);
        expect(rivals[0]).toMatchObject({
          username: "bob",
          vault: 18,
          hashRate: 11,
        });
        expect(await PlayerModel.find().sort({ wallet: 1 }).lean()).toEqual(
          before,
        );
      } finally {
        clock.mockRestore();
      }
    });

    it("settles ordinary defenders and attacker free space, then credits only new mining on successive raids", async () => {
      await seedOfflineRaid();
      const result = await runRaidAt(raidAt);
      expect(result.body).toMatchObject({ success: true, stolen: 0.016667 });
      let attacker = (await PlayerModel.findOne({ wallet: "alice" }).lean())!;
      let defender = (await PlayerModel.findOne({ wallet: "bob" }).lean())!;
      expect(attacker).toMatchObject({
        vault: 1,
        lastTickAt: raidAt,
        raidCharges: 7,
        milestones: { totalMined: 0.083333 },
      });
      expect(defender).toMatchObject({
        lastTickAt: raidAt,
        milestones: { totalMined: 0.5 },
      });
      expect(defender.vault + Number(result.body.takenFromVault)).toBeCloseTo(
        0.5,
        6,
      );
      const protectedResult = await runRaidAt(raidAt);
      expect(protectedResult.body).toMatchObject({
        success: false,
        reason: "blocked",
        stolen: 0,
      });
      expect(
        (await PlayerModel.findOne({ wallet: "bob" }).lean())!.vault,
      ).toBeCloseTo(defender.vault, 6);
      const next = await runRaidAt(raidAt + 60_000);
      expect(next.body).toMatchObject({ success: true, stolen: 0 });
      attacker = (await PlayerModel.findOne({ wallet: "alice" }).lean())!;
      defender = (await PlayerModel.findOne({ wallet: "bob" }).lean())!;
      expect(attacker.milestones.totalMined).toBe(0.083333);
      expect(defender.milestones.totalMined).toBe(0.501389);
      expect(defender.lastTickAt).toBe(raidAt + 60_000);
    });

    it("settles historical Hash Rate effects before clearing them and retains attacker effects", async () => {
      await seedOfflineRaid();
      const effect: StatEffect = {
        ...statEffect("hashRate"),
        appliedAt: raidAt - 3 * 3600_000,
        strength: 0.5,
        active: false,
        helps: [
          {
            itemId: "help-kit",
            appliedBy: "helper",
            appliedAt: raidAt - 3600_000,
            strength: 0.5,
            critical: false,
          },
        ],
      };
      const attackerEffect = {
        ...statEffect("hackPower"),
        appliedAt: raidAt - 1000,
        strength: 0.1,
      };
      await PlayerModel.updateOne(
        { wallet: "bob" },
        { $set: { "statEffects.hashRate": effect } },
      );
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { "statEffects.hackPower": attackerEffect } },
      );
      const result = await runRaidAt(raidAt);
      expect(result.body.success).toBe(true);
      const defender = (await PlayerModel.findOne({ wallet: "bob" }).lean())!;
      expect(defender.milestones.totalMined).toBe(0.427083);
      expect(defender.vault + Number(result.body.takenFromVault)).toBeCloseTo(
        0.427083,
        6,
      );
      expect(defender.statEffects?.hashRate).toBeUndefined();
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())!.statEffects
          ?.hackPower,
      ).toMatchObject(attackerEffect);
    });

    it("uses the attacker's elapsed mining for failed-raid risk", async () => {
      await seedOfflineRaid();
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { vault: 0.2 } },
      );
      const firewall = await EquipmentModel.create({
        templateId: 1000,
        owner: "bob",
        name: "Test Firewall",
        slot: "asicMiner",
        rarity: "common",
        equipped: true,
        stats: { firewall: 99 },
      });
      await PlayerModel.updateOne(
        { wallet: "bob" },
        { $set: { "equipment.asicMiner": firewall._id } },
      );
      const result = await runRaidAt(raidAt);
      expect(result.body).toMatchObject({ success: false, reason: "failed" });
      expect(Number(result.body.riskAmount)).toBeGreaterThan(0);
      const attacker = (await PlayerModel.findOne({ wallet: "alice" }).lean())!;
      const defender = (await PlayerModel.findOne({ wallet: "bob" }).lean())!;
      expect(attacker.vault + Number(result.body.riskAmount)).toBeCloseTo(
        0.283333,
        6,
      );
      expect(attacker.milestones.totalMined).toBe(0.083333);
      expect(defender.vault).toBe(0.5);
      expect(defender.notoriety).toBe(result.body.riskAmount);
    });

    it.each([false, true])(
      "preserves raid settlement across receipt replay or interruption (interrupted=%s)",
      async (interrupted) => {
        await seedOfflineRaid();
        const event = hiveGameActionEvent(
          buildRaidAction({ target: "bob", nonce: "offline-raid-replay-0001" }),
          {
            blockTimestamp: new Date(raidAt).toISOString().slice(0, 19),
          },
        );
        let interrupt = interrupted;
        const processor = createGameActionProcessor(
          createGameActionRegistry(),
          async () => {
            if (
              interrupt &&
              (await LogModel.countDocuments({ type: "raid" }))
            ) {
              interrupt = false;
              throw new Error("raid receipt interrupted");
            }
          },
        );
        if (interrupted)
          expect((await processor.process(event)).status).toBe("deferred");
        else expect((await processor.process(event)).status).toBe("executed");
        const after = await PlayerModel.find().sort({ wallet: 1 }).lean();
        expect(after[0]).toMatchObject({
          lastTickAt: raidAt,
          raidCharges: 7,
          milestones: { totalMined: 0.083333 },
        });
        expect(after[1]).toMatchObject({
          lastTickAt: raidAt,
          milestones: { totalMined: 0.5 },
        });
        if (interrupted) {
          expect(
            await InboundTransactionModel.countDocuments({
              status: "failed",
              databaseEffectsStarted: true,
            }),
          ).toBe(1);
          expect((await processor.process(event)).status).toBe("executed");
        } else expect((await processor.process(event)).status).toBe("rejected");
        const withoutMarkers = (rows: typeof after) =>
          rows.map(
            ({ activeRaid: _activeRaid, updatedAt: _updatedAt, ...row }) => row,
          );
        expect(
          withoutMarkers(await PlayerModel.find().sort({ wallet: 1 }).lean()),
        ).toEqual(withoutMarkers(after));
        expect(await LogModel.countDocuments({ type: "raid" })).toBe(1);
        expect(await ProcessedTransactionModel.countDocuments()).toBe(1);
      },
    );

    it.each([
      "charge",
      "effects",
      "claim_regen",
      "defender_debit",
      "attacker_credit",
      "risk_debit",
      "defender_notoriety",
    ] as const)(
      "recovers %s before/after lost acknowledgments without repeated effects",
      async (stage) => {
        for (const afterAcknowledgment of [false, true]) {
          isolatedDatabase();
          for (const model of Object.values(mongoose.models))
            await model.deleteMany({});
          await seedOfflineRaid();
          const failed =
            stage === "risk_debit" || stage === "defender_notoriety";
          if (!failed)
            await PlayerModel.updateOne(
              { wallet: "bob" },
              { $set: { "statLevels.firewall": 0 } },
            );
          if (failed) {
            const gear = await EquipmentModel.create({
              templateId: 1000,
              owner: "bob",
              name: "Test Firewall",
              slot: "asicMiner",
              rarity: "common",
              equipped: true,
              stats: { firewall: 99 },
            });
            await PlayerModel.updateOne(
              { wallet: "bob" },
              { $set: { "equipment.asicMiner": gear._id } },
            );
          }
          const id = `fault-${stage}-${afterAcknowledgment}`;
          const event = hiveGameActionEvent(
            buildRaidAction({ target: "bob", nonce: id }),
            {
              transactionId: id,
              blockTimestamp: new Date(raidAt).toISOString(),
            },
          );
          await claimPendingGameAction(event);
          await InboundTransactionModel.updateOne(
            { signature: `${id}:0` },
            {
              $set: {
                "gameEvent.randomSeed": syntheticRaidSeed(`${id}:0`, !failed),
                "gameEvent.claimUntil": 0,
              },
            },
          );
          const processor = createGameActionProcessor(
            createGameActionRegistry(),
          );
          const fault = interruptRaidWrite(stage, afterAcknowledgment);
          let first;
          try {
            first = await processor.process(event);
            expect(fault.interrupted()).toBe(true);
          } finally {
            fault.restore();
          }
          expect(first.status).toBe(
            afterAcknowledgment ? "executed" : "deferred",
          );
          if (!afterAcknowledgment)
            expect((await processor.process(event)).status).toBe("executed");
          const attacker = (await PlayerModel.findOne({
            wallet: "alice",
          }).lean())!;
          expect(attacker.raidCharges).toBe(7);
          expect(attacker.activeRaid).toBeUndefined();
          const log = await LogModel.findOne({
            settlementKey: `raid:${id}:0`,
          }).lean();
          expect(log?.data?.success).toBe(!failed);
          expect(
            (await PlayerModel.findOne({ wallet: "bob" }).lean())?.activeRaid,
          ).toBeUndefined();
          const snapshot = await PlayerModel.find().sort({ wallet: 1 }).lean();
          expect((await processor.process(event)).status).toBe("rejected");
          expect(await PlayerModel.find().sort({ wallet: 1 }).lean()).toEqual(
            snapshot,
          );
          expect(
            await LogModel.countDocuments({ settlementKey: `raid:${id}:0` }),
          ).toBe(1);
          expect(
            await InboundTransactionModel.countDocuments({
              signature: `${id}:0`,
            }),
          ).toBe(0);
        }
      },
    );

    it.each(["log", "counters", "receipt", "cleanup"] as const)(
      "resumes %s finalization after pre-write failure and acknowledgment loss",
      async (stage) => {
        for (const afterAcknowledgment of [false, true]) {
          isolatedDatabase();
          for (const model of Object.values(mongoose.models))
            await model.deleteMany({});
          await seedOfflineRaid();
          const id = `finalize-${stage}-${afterAcknowledgment}`;
          const event = hiveGameActionEvent(
            buildRaidAction({ target: "bob", nonce: id }),
            {
              transactionId: id,
              blockTimestamp: new Date(raidAt).toISOString(),
            },
          );
          const processor = createGameActionProcessor(
            createGameActionRegistry(),
          );
          const fault = interruptRaidFinalization(stage, afterAcknowledgment);
          try {
            expect((await processor.process(event)).status).toBe("deferred");
            expect(fault.interrupted()).toBe(true);
          } finally {
            fault.restore();
          }
          const terminal = await ProcessedTransactionModel.findOne({
            txHash: `${id}:0`,
          }).lean();
          const pending = await InboundTransactionModel.findOne({
            signature: `${id}:0`,
          }).lean();
          if (stage !== "cleanup") {
            expect(
              (
                await logRepository.listHistory("alice", {
                  limit: 100,
                  category: "raids",
                })
              ).logs,
            ).toEqual([]);
          }
          if (terminal?.metadata?.type === "game_action") {
            expect(pending?.gameEvent?.raidSettlement).toEqual(
              terminal.metadata.event.raidSettlement,
            );
          }
          expect(
            (
              await createGameActionProcessor(
                createGameActionRegistry(),
              ).process(event)
            ).status,
          ).toBe("executed");
          expect(
            (await PlayerModel.findOne({ wallet: "alice" }).lean())
              ?.raidCharges,
          ).toBe(7);
          expect(
            await PlayerModel.countDocuments({ activeRaid: { $exists: true } }),
          ).toBe(0);
          expect(
            await LogModel.countDocuments({ settlementKey: `raid:${id}:0` }),
          ).toBe(1);
          expect(await InboundTransactionModel.countDocuments()).toBe(0);
          expect(
            await ProcessedTransactionModel.countDocuments({
              txHash: `${id}:0`,
            }),
          ).toBe(1);
          expect(await gameStatsRepository.get("totalRaids")).toBe(1);
          expect(
            (
              await logRepository.listHistory("alice", {
                limit: 100,
                category: "raids",
              })
            ).logs,
          ).toHaveLength(1);
        }
      },
    );

    it("releases held followers in blockchain order after proven raid recovery", async () => {
      await seedOfflineRaid();
      const event = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: "release-raid-12345" }),
        {
          transactionId: "release-raid",
          blockNumber: 100,
          blockTimestamp: new Date(raidAt).toISOString(),
        },
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      await claimPendingGameAction(event);
      await InboundTransactionModel.updateOne(
        { signature: "release-raid:0" },
        {
          $set: {
            "gameEvent.randomSeed": syntheticRaidSeed("release-raid:0", true),
            "gameEvent.claimUntil": 0,
          },
        },
      );
      const fault = interruptRaidWrite("attacker_credit", false);
      try {
        expect((await processor.process(event)).status).toBe("deferred");
      } finally {
        fault.restore();
      }
      const claim = hiveGameActionEvent(
        buildClaimAction({ nonce: "held-claim-12345" }),
        {
          transactionId: "held-claim",
          blockNumber: 101,
          blockTimestamp: new Date(raidAt).toISOString(),
        },
      );
      expect((await processor.process(claim)).status).toBe("deferred");
      const restarted = createGameActionProcessor(createGameActionRegistry());
      const handled: string[] = [];
      await recoverDeferredGameActions(
        async (saved) => {
          handled.push(saved.transactionId!);
          expect((await restarted.process(saved)).status).toBe("executed");
        },
        () => false,
      );
      expect(handled).toEqual(["release-raid", "held-claim"]);
      expect(
        await InboundTransactionModel.countDocuments({ type: "game_action" }),
      ).toBe(0);
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.raidCharges,
      ).toBe(7);
    });

    it("quarantines supported raids after eight failed attempts without repeating effects or announcing drafts", async () => {
      await seedOfflineRaid();
      const event = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: "retry-budget-raid" }),
        {
          transactionId: "retry-budget",
          blockTimestamp: new Date(raidAt).toISOString(),
        },
      );
      const processor = createGameActionProcessor(
        createGameActionRegistry(),
        async () => {
          if (await LogModel.countDocuments({ type: "raid" }))
            throw new Error("synthetic finalization unavailable");
        },
      );
      for (let attempt = 0; attempt < 8; attempt++)
        expect((await processor.process(event)).status).toBe("deferred");
      expect((await processor.process(event)).status).toBe("quarantined");
      expect((await processor.process(event)).status).toBe("quarantined");
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.raidCharges,
      ).toBe(7);
      expect(
        await InboundTransactionModel.countDocuments({
          signature: "retry-budget:0",
          status: "reconciliation",
          databaseEffectsStarted: true,
        }),
      ).toBe(1);
      expect(
        (await logRepository.listHistory("alice", { limit: 100 })).logs,
      ).toEqual([]);
      expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
      expect(await LogModel.countDocuments({ type: "raid" })).toBe(1);
      await expect(
        resumeRaidRecovery("retry-budget:0", async () => {
          throw new Error("synthetic lease lost");
        }),
      ).rejects.toThrow("lease lost");
      expect(
        await InboundTransactionModel.countDocuments({
          status: "reconciliation",
        }),
      ).toBe(1);
      expect(
        (await resumeRaidRecovery("retry-budget:0", async () => {})).status,
      ).toBe("executed");
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.raidCharges,
      ).toBe(7);
      expect(
        await PlayerModel.countDocuments({ activeRaid: { $exists: true } }),
      ).toBe(0);
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
    });

    it("parks mismatched atomic evidence immediately instead of retrying or compensating", async () => {
      await seedOfflineRaid();
      const event = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: "conflicting-raid-123" }),
        {
          transactionId: "conflicting",
          blockTimestamp: new Date(raidAt).toISOString(),
        },
      );
      await claimPendingGameAction(event);
      await InboundTransactionModel.updateOne(
        { signature: "conflicting:0" },
        {
          $set: {
            "gameEvent.randomSeed": syntheticRaidSeed("conflicting:0", true),
            "gameEvent.claimUntil": 0,
          },
        },
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      const fault = interruptRaidWrite("attacker_credit", false);
      try {
        expect((await processor.process(event)).status).toBe("deferred");
      } finally {
        fault.restore();
      }
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { "activeRaid.key": "unrelated-evidence" } },
      );
      const snapshot = await PlayerModel.find().sort({ wallet: 1 }).lean();
      expect((await processor.process(event)).status).toBe("quarantined");
      expect(await PlayerModel.find().sort({ wallet: 1 }).lean()).toEqual(
        snapshot,
      );
      expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
      expect(
        await InboundTransactionModel.countDocuments({
          signature: "conflicting:0",
          status: "reconciliation",
        }),
      ).toBe(1);
      await expect(inspectRaidRecovery("conflicting:0")).rejects.toThrow(
        "Conflicting raid marker",
      );
    });

    it("isolates legacy raids and holds dependent gameplay and paid fulfillment across restart", async () => {
      await seedOfflineRaid();
      await upsertPlayer({ wallet: "carol", username: "carol" });
      await PlayerModel.updateOne(
        { wallet: "carol" },
        { $set: { isRegistered: true } },
      );
      const legacy = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: "legacy-raid-12345" }),
        { transactionId: "legacy", blockNumber: 100 },
      );
      await claimPendingGameAction(legacy);
      await InboundTransactionModel.updateOne(
        { signature: "legacy:0" },
        { $set: { databaseEffectsStarted: true } },
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      expect((await processor.process(legacy)).status).toBe("quarantined");
      const snapshot = await PlayerModel.find().sort({ wallet: 1 }).lean();
      const follower = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: "follower-raid-123" }),
        { transactionId: "follower", account: "carol", blockNumber: 101 },
      );
      expect((await processor.process(follower)).status).toBe("deferred");
      const later = hiveGameActionEvent(
        buildClaimAction({ nonce: "later-carol-1234" }),
        { transactionId: "later", account: "carol", blockNumber: 102 },
      );
      expect((await processor.process(later)).status).toBe("deferred");
      expect(await PlayerModel.find().sort({ wallet: 1 }).lean()).toEqual(
        snapshot,
      );
      expect(
        await gameplayDependencies(
          ["carol"],
          hiveGameActionEvent(buildClaimAction({ nonce: "order-test-1234" }), {
            blockNumber: 99,
          }),
        ),
      ).toEqual([]);
      const restarted = createGameActionProcessor(createGameActionRegistry());
      expect((await restarted.process(legacy)).status).toBe("quarantined");
      await expect(
        resumeRaidRecovery("legacy:0", async () => {}),
      ).rejects.toThrow("Supported raid evidence");
      const payment = await InboundTransactionModel.create({
        signature: "held-deposit",
        type: "deposit",
        walletAddress: "alice",
        depositAmount: 1,
      });
      expect(await holdPaymentFulfillment(payment)).toBe(true);
      expect(
        (await InboundTransactionModel.findById(payment._id).lean())
          ?.retryCount,
      ).toBe(0);
      expect(
        (await InboundTransactionModel.findById(payment._id).lean())
          ?.dependencyKeys,
      ).toContain("legacy:0");
      const effect = vi.fn(async () => {});
      let held: unknown;
      try {
        await withPaymentDatabaseOperation(payment, effect);
      } catch (error) {
        held = error;
      }
      expect(held).toBeInstanceOf(GameplayDependencyHold);
      await retryOrDie(
        { checkLease: async () => {}, maxRetries: 8 },
        payment,
        "deposit",
        held,
      );
      expect(effect).not.toHaveBeenCalled();
      expect(
        (await InboundTransactionModel.findById(payment._id).lean())
          ?.databaseEffectsStarted,
      ).not.toBe(true);
      expect(
        (await InboundTransactionModel.findById(payment._id).lean())
          ?.retryCount,
      ).toBe(0);
      const execute = vi.fn(async () => ({ ok: true }));
      const unrelated = createGameActionProcessor({ claim: execute });
      const other = hiveGameActionEvent(
        buildClaimAction({ nonce: "unrelated-12345" }),
        { transactionId: "other", account: "david", blockNumber: 103 },
      );
      expect((await unrelated.process(other)).status).toBe("executed");
      expect(execute).toHaveBeenCalledOnce();
      expect(
        await ProcessedTransactionModel.countDocuments({
          txHash: { $in: ["legacy:0", "follower:0", "later:0"] },
        }),
      ).toBe(0);
      expect(
        await InboundTransactionModel.countDocuments({ type: "game_action" }),
      ).toBe(3);
    });

    it("never uses raid evidence to bypass interrupted non-raid or financial guards", async () => {
      await seedOfflineRaid();
      const event = hiveGameActionEvent(
        buildClaimAction({ nonce: "misplaced-journal-123" }),
        { transactionId: "misplaced" },
      );
      await claimPendingGameAction(event);
      await InboundTransactionModel.updateOne(
        { signature: "misplaced:0" },
        {
          $set: {
            databaseEffectsStarted: true,
            "gameEvent.raidSettlement": { version: 1, key: "misplaced:0" },
          },
        },
      );
      const before = await PlayerModel.find().sort({ wallet: 1 }).lean();
      await expect(
        createGameActionProcessor(createGameActionRegistry()).process(event),
      ).rejects.toThrow("operator review");
      expect(await PlayerModel.find().sort({ wallet: 1 }).lean()).toEqual(
        before,
      );
      await InboundTransactionModel.create({
        type: "registration",
        signature: "misplaced-payment",
        walletAddress: "alice",
        databaseEffectsStarted: true,
        gameEvent: {
          event: { action: "raid" },
          raidSettlement: { version: 1, key: "misplaced-payment" },
        },
      });
      await expect(
        beginQueuedDatabaseEffects("misplaced-payment"),
      ).rejects.toThrow("operator review");
    });

    it("publishes only new raid drafts beyond an already-drained history cursor", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
      try {
        await createLog({
          type: "raid",
          wallet: "alice",
          target: "bob",
          settlementKey: "draft-raid",
          settlementPending: true,
          data: { success: true },
        });
        await createLog({ type: "claim", wallet: "alice", amount: 1 });
        const before = await logRepository.listHistory("alice", { limit: 100 });
        expect(before.logs).toHaveLength(1);
        const cursor = decodeCursor(before.latestCursor!);
        await publishRaidLog("draft-raid");
        const after = await logRepository.listHistory("alice", {
          limit: 100,
          direction: "newer",
          cursor,
        });
        expect(after.logs).toHaveLength(1);
        expect(after.logs[0].type).toBe("raid");
        const publishedAt = (
          await LogModel.findOne({ settlementKey: "draft-raid" }).lean()
        )?.recordedAt;
        expect(publishedAt).toBeGreaterThan(cursor.time);
        await publishRaidLog("draft-raid");
        expect(
          (await LogModel.findOne({ settlementKey: "draft-raid" }).lean())
            ?.recordedAt,
        ).toBe(publishedAt);
        expect(after.logs[0]).not.toHaveProperty("settlementPending");
      } finally {
        clock.mockRestore();
      }
    });

    it("scans past more than a batch of held actions and caps runnable recovery at 100", async () => {
      const blocked = hiveGameActionEvent(
        buildRaidAction({ target: "bob", nonce: "batch-blocked-123" }),
        { transactionId: "batch-blocked", blockNumber: 1 },
      );
      await claimPendingGameAction(blocked);
      await parkGameAction("batch-blocked:0", "synthetic unresolved raid");
      const rows = Array.from({ length: 360 }, (_, index) => {
        const id = `batch-${index}`;
        const event = hiveGameActionEvent(
          buildClaimAction({ nonce: `${id}-12345678` }),
          {
            transactionId: id,
            account: index < 255 ? "alice" : `user-${index}`,
            blockNumber: index + 2,
          },
        );
        return {
          type: "game_action",
          signature: `${id}:0`,
          walletAddress: event.account,
          status: "pending",
          gameEvent: {
            event,
            eventKey: `${id}:0`,
            actor: event.account,
            blockNumber: event.blockNumber,
            transactionIndex: 0,
            operationIndex: 0,
            participants: [event.account!],
            claimUntil: 0,
            waitingFor: index < 255 ? ["batch-blocked:0"] : [],
          },
        };
      });
      await InboundTransactionModel.insertMany(rows);
      const handled: string[] = [];
      await recoverDeferredGameActions(
        async (event) => {
          handled.push(event.transactionId!);
        },
        () => false,
      );
      expect(handled).toHaveLength(100);
      expect(handled[0]).toBe("batch-255");
    }, 20_000);

    it("settles mining before direct equipment changes and resolves actual gear on authenticated reads", async () => {
      const start = EQUIPMENT_STATS_EFFECTIVE_AT + 1000;
      await upsertPlayer({ wallet: "gear-miner", username: "gear-miner" });
      await PlayerModel.updateOne(
        { wallet: "gear-miner" },
        {
          $set: {
            vault: 0,
            vaultStaked: 1000,
            sparks: 10000,
            lastTickAt: start,
            lastSinkAt: start,
          },
        },
      );
      const item = await EquipmentModel.create({
        templateId: 1000,
        owner: "gear-miner",
        name: "Test Miner",
        slot: "asicMiner",
        rarity: "common",
        stats: { hashRate: 10, hackPower: 5, luck: 2, exploit: 3 },
      });
      const runAt = <T>(at: number, execute: () => Promise<T>) =>
        withGameExecution(at, "isolated-equipment-seed", () =>
          withDatabaseOperation(execute),
        );
      await runAt(start + 1000, () =>
        equipGameplayItem("gear-miner", String(item._id)),
      );
      let record = await PlayerModel.findOne({ wallet: "gear-miner" }).lean();
      expect(record!.vault).toBeCloseTo(miningPerSecond(1), 6);
      const profile = await readPlayerProfile("gear-miner", null);
      expect(profile.stats).toMatchObject({
        hashRate: 11,
        hackPower: 15,
        luck: 7.078,
        exploit: 4,
      });
      await runAt(start + 2000, () => settleTick("gear-miner"));
      record = await PlayerModel.findOne({ wallet: "gear-miner" }).lean();
      expect(record!.stats.hashRate).toBe(11);
      expect(record!.vault).toBeCloseTo(
        miningPerSecond(1) + miningPerSecond(11),
        6,
      );
      await runAt(start + 3000, () =>
        upgradeGameplayItem("gear-miner", String(item._id)),
      );
      await runAt(start + 4000, () =>
        unequipGameplayItem("gear-miner", String(item._id)),
      );
      record = await PlayerModel.findOne({ wallet: "gear-miner" }).lean();
      expect(record!.vault).toBeCloseTo(
        miningPerSecond(1) + 2 * miningPerSecond(11) + miningPerSecond(11.5),
        5,
      );
      expect((await readPlayerProfile("gear-miner", null)).stats.hashRate).toBe(
        1,
      );
    });

    it("records a failed social roll once without changing effects or leaking execution evidence", async () => {
      await upsertPlayer({ wallet: "helper", username: "helper" });
      await upsertPlayer({ wallet: "target", username: "target" });
      await grantInventoryItems("helper", "help-kit", 2);
      await applyStatSabotage("target", statEffect("security"));
      const before = await PlayerModel.findOne({ wallet: "target" }).lean();
      const result = await withDatabaseOperation(() =>
        helpTarget("helper", "target", "help-kit", "security", () => 0.99),
      );
      expect(result).toMatchObject({
        ok: true,
        success: false,
        itemConsumed: true,
      });
      expect(await getInventoryQuantity("helper", "help-kit")).toBe(1);
      expect(
        (await PlayerModel.findOne({ wallet: "target" }).lean())!.statEffects,
      ).toEqual(before!.statEffects);
      const rows = await logRepository.listHistory("helper", { limit: 100 });
      expect(rows.logs.at(0)?.data).toMatchObject({
        success: false,
        itemConsumed: true,
      });
    });

    it("filters full personal history before paging, preserving participants, tie cursors and private-field exclusion", async () => {
      await LogModel.insertMany([
        ...Array.from({ length: 60 }, (_, index) => ({
          type: "salvage",
          wallet: "alice",
          participants: ["alice"],
          recordedAt: 3000 + index,
        })),
        ...Array.from({ length: 4 }, () => ({
          type: "claim",
          wallet: "alice",
          participants: ["alice"],
          recordedAt: 1000,
          amount: 0.1632,
          seed: "hidden",
          data: { serverSeed: "hidden" },
        })),
        {
          type: "claim",
          wallet: "other",
          participants: ["other"],
          recordedAt: 4000,
        },
        {
          type: "raid",
          wallet: "alice",
          target: "bob",
          participants: ["alice", "bob"],
          recordedAt: 2000,
        },
        {
          type: "raid",
          wallet: "bob",
          target: "alice",
          participants: ["bob", "alice"],
          recordedAt: 2000,
        },
        {
          type: "raid",
          wallet: "bob",
          target: "other",
          participants: ["bob", "other"],
          recordedAt: 2000,
        },
      ]);
      const first = await logRepository.listHistory("alice", {
        limit: 2,
        category: "claims",
      });
      const second = await logRepository.listHistory("alice", {
        limit: 2,
        category: "claims",
        cursor: decodeCursor(first.nextCursor!),
      });
      expect(first.logs).toHaveLength(2);
      expect(second.logs).toHaveLength(2);
      expect(
        new Set([...first.logs, ...second.logs].map((log) => log.id)).size,
      ).toBe(4);
      expect(second.nextCursor).toBeNull();
      expect(JSON.stringify([first, second])).not.toContain("hidden");
      expect(
        (await logRepository.listHistory("alice", { limit: 50 })).logs.every(
          (log) => log.type === "salvage",
        ),
      ).toBe(true);
      const raids = await logRepository.listHistory("alice", {
        limit: 50,
        category: "raids",
      });
      expect(raids.logs.map((log) => log.wallet).sort()).toEqual([
        "alice",
        "bob",
      ]);
    });
    it("selects actual category records and keeps paid withdrawals separate from queued requests and compensation", async () => {
      const inputs = [
        { type: "vault", data: { event: "stake" } },
        { type: "vault", data: { event: "mining" } },
        { type: "registration" },
        { type: "chest", data: { paidWith: "hash" } },
        { type: "chest", data: { paidWith: "hive", hiveAmount: 10 } },
        { type: "stat_upgrade" },
        { type: "upgrade" },
        { type: "salvage" },
        { type: "help" },
        { type: "sabotage" },
        { type: "deposit" },
        { type: "withdrawal", amount: -5 },
        { type: "withdrawal", amount: 5, data: { refunded: true } },
        { type: "game_action", data: { action: "request_withdrawal" } },
      ];
      await LogModel.insertMany(
        inputs.map((input) => ({
          ...input,
          wallet: "alice",
          participants: ["alice"],
          recordedAt: 1000,
        })),
      );
      for (const [category, types] of [
        ["staking-registration", ["vault", "registration"]],
        ["equipment-minted", ["chest", "chest"]],
        ["stat-upgrades", ["stat_upgrade"]],
        ["equipment-upgrades", ["upgrade"]],
        ["salvage", ["salvage"]],
        ["social", ["help", "sabotage"]],
        ["deposits-withdrawals", ["deposit", "withdrawal"]],
      ] as const) {
        const page = await logRepository.listHistory("alice", {
          limit: 50,
          category,
        });
        expect(page.logs.map((log) => log.type).sort()).toEqual(
          [...types].sort(),
        );
      }
      const all = await logRepository.listHistory("alice", {
        limit: 50,
        category: "all",
      });
      expect(all.logs).toHaveLength(inputs.length);
      expect(all.logs.find((log) => log.amount === 5)?.data?.refunded).toBe(
        true,
      );
    });
    it("returns the newest 100 personal market actions separately from 100 global HIVE sales", async () => {
      await LogModel.insertMany([
        ...Array.from({ length: 110 }, (_, index) => ({
          type: "market",
          wallet: "buyer",
          target: "alice",
          participants: ["buyer", "alice"],
          createdAt: new Date(1000 + index),
          data: {
            action: "bought",
            currency: "HIVE",
            price: 0.1,
            name: "Miner",
          },
        })),
        {
          type: "market_item",
          wallet: "alice",
          participants: ["alice"],
          createdAt: new Date(9000),
          data: { action: "listed", currency: "HIVE" },
        },
        {
          type: "market_item",
          wallet: "alice",
          participants: ["alice"],
          createdAt: new Date(9001),
          data: { action: "cancelled", currency: "HIVE" },
        },
        {
          type: "market",
          wallet: "alice",
          participants: ["alice"],
          createdAt: new Date(9002),
          data: { action: "refunded", currency: "HIVE" },
        },
        {
          type: "market",
          wallet: "charlie",
          target: "other",
          participants: ["charlie", "other"],
          createdAt: new Date(9003),
          data: { action: "bought", currency: "HIVE" },
        },
        {
          type: "market",
          wallet: "alice",
          target: "other",
          participants: ["alice", "other"],
          createdAt: new Date(9004),
          data: { action: "bought", currency: "HASH" },
        },
      ]);
      const personal = await logRepository.listMarketHistory("alice", 100);
      expect(personal).toHaveLength(100);
      expect(personal.slice(0, 3).map((log) => log.data?.action)).toEqual([
        "refunded",
        "cancelled",
        "listed",
      ]);
      expect(personal.every((log) => log.data?.currency === "HIVE")).toBe(true);
      const sales = await logRepository.listMarketSales(100);
      expect(sales).toHaveLength(100);
      expect(sales[0].wallet).toBe("charlie");
      expect(
        sales.every(
          (log) =>
            log.data?.action === "bought" && log.data.currency === "HIVE",
        ),
      ).toBe(true);
      expect(new Set(sales.map((log) => log.id)).size).toBe(100);
    });
    it("reads all registered ranking inputs in bounded pages without writes or private fields", async () => {
      const now = Date.now();
      await PlayerModel.insertMany(
        Array.from({ length: 251 }, (_, index) => ({
          wallet: `rank-${index.toString().padStart(3, "0")}`,
          username: `rank-${index}`,
          isRegistered: true,
          notoriety: 251 - index,
          xp: index * 1000,
          lastSinkAt: now,
          statLevels: { hashRate: 1 },
          hash: 20,
          vault: 1,
          loginNonce: "private",
        })),
      );
      await issueLoginNonce("shell", "secret", now + 60000);
      await PlayerModel.updateOne(
        { wallet: "shell" },
        {
          $set: {
            xp: 999999999,
            notoriety: 999999999,
            "statLevels.hashRate": 999999,
          },
        },
      );
      const before = await PlayerModel.findOne({ wallet: "rank-000" }).lean();
      const sizes: number[] = [];
      const accumulator = createLeaderboardAccumulator(now);
      for await (const batch of readLeaderboardPlayerBatches()) {
        sizes.push(batch.length);
        for (const row of batch) {
          expect(row).not.toHaveProperty("loginNonce");
          expect(row).not.toHaveProperty("hash");
          expect(row).not.toHaveProperty("vault");
          accumulator.accept(row);
        }
      }
      expect(sizes).toEqual([250, 1]);
      const result = toLeaderboardDto(accumulator.finish(), 4, "rank-000");
      expect(result).toMatchObject({
        registeredPlayers: 251,
        displayedPlayers: 100,
        self: {
          rank: 251,
          miningLevel: 1,
          notoriety: 251,
          xp: 0,
          score: 60,
          points: { notoriety: 30, mining: 30, progression: 0 },
        },
      });
      expect(result.entries).toHaveLength(25);
      expect(await PlayerModel.findOne({ wallet: "rank-000" }).lean()).toEqual(
        before,
      );
      expect(await LogModel.countDocuments()).toBe(0);
      expect(await GameStatModel.countDocuments()).toBe(0);
    });
    it("reads every analytics page without exposing player data or changing balances", async () => {
      await PlayerModel.insertMany(
        Array.from({ length: 251 }, (_, i) => ({
          wallet: `miner${i}`,
          username: `miner${i}`,
          isRegistered: true,
          hash: 5,
          vault: 1,
          statLevels: { hashRate: 1 },
          loginNonce: "private",
        })),
      );
      await PlayerModel.create({
        wallet: "shell",
        username: "shell",
        isRegistered: false,
      });
      const now = Date.now();
      let count = 0,
        rate = 0;
      const sizes: number[] = [];
      for await (const batch of readRegisteredMiningBatches()) {
        sizes.push(batch.length);
        for (const player of batch) {
          count++;
          rate += currentMiningPerSecond(player, now);
          expect(player.wallet).toMatch(/^miner/);
          expect(player).not.toHaveProperty("loginNonce");
        }
      }
      expect(sizes).toEqual([250, 1]);
      expect(count).toBe(251);
      expect(rate * 86400).toBeCloseTo(502, 8);
      expect(
        await PlayerModel.findOne({ wallet: "miner0" }).lean(),
      ).toMatchObject({ hash: 5, vault: 1 });
    });
    it("aggregates exact successful receipts across log pages and original UTC days", async () => {
      const now = Date.now(),
        before = new Date(now - 86400000);
      await LogModel.insertMany(
        Array.from({ length: 251 }, (_, i) => ({
          type: "claim",
          wallet: "alice",
          correlationKey: `analytics-${i}:0`,
          amount: 0.25,
          createdAt: before,
          updatedAt: before,
          recordedAt: now - 1,
          seed: "private",
          data: { serverSeed: "private" },
        })),
        { timestamps: false },
      );
      await ProcessedTransactionModel.insertMany(
        Array.from({ length: 251 }, (_, i) => ({
          txHash: `analytics-${i}:0`,
          wallet: "alice",
          type: "game_action",
          amount: 0,
          status: "success",
          processedAt: now - 1,
          metadata: {
            type: "game_action",
            event: {
              eventKey: `analytics-${i}:0`,
              status: "processed",
              operationIndex: 0,
              event: { action: "claim" },
            },
          },
        })),
      );
      const extra = [
        "unresolved",
        "failed",
        "late-receipt",
        "late-log",
        "wrong-actor",
        "wrong-action",
      ];
      await LogModel.insertMany(
        extra.map((key) => ({
          type: "claim",
          wallet: "alice",
          correlationKey: `${key}:0`,
          amount: 100,
          createdAt: before,
          updatedAt: before,
          recordedAt: key === "late-log" ? now + 1 : now - 1,
        })),
        { timestamps: false },
      );
      await ProcessedTransactionModel.insertMany(
        extra
          .filter((key) => key !== "unresolved")
          .map((key) => ({
            txHash: `${key}:0`,
            wallet: key === "wrong-actor" ? "bob" : "alice",
            type: "game_action",
            amount: 0,
            status: key === "failed" ? "failed" : "success",
            processedAt: key === "late-receipt" ? now + 1 : now - 1,
            metadata: {
              type: "game_action",
              event: {
                eventKey: `${key}:0`,
                status: "processed",
                operationIndex: 0,
                event: { action: key === "wrong-action" ? "raid" : "claim" },
              },
            },
          })),
      );
      const accumulator = createGameStatsAccumulator(now),
        sizes: number[] = [];
      for await (const batch of readAnalyticsLogBatches(now)) {
        sizes.push(batch.length);
        const keys = batch
          .map(analyticsReceiptKey)
          .filter((key): key is string => !!key);
        const evidence = new Map(
          (await readAnalyticsReceipts(keys, now)).map((row) => [row.key, row]),
        );
        for (const log of batch) {
          expect(log).not.toHaveProperty("seed");
          expect(log.data ?? {}).not.toHaveProperty("serverSeed");
          accumulator.accept(log, evidence.get(analyticsReceiptKey(log)!));
        }
      }
      expect(sizes).toEqual([250, 6]);
      const data = toGameStatsDaily(accumulator.finish(), "claimed", 7);
      expect(data.totals).toEqual([62.75, 251]);
      expect(
        data.points.find(
          (point) => point.day === before.toISOString().slice(0, 10),
        )?.values,
      ).toEqual([62.75, 251]);
      expect(JSON.stringify(data)).not.toMatch(/analytics-|private|alice|bob/);
    });
    afterAll(async () => {
      try {
        await isolatedDatabase().dropDatabase();
      } finally {
        await disconnectContractDatabase();
      }
    }, 30000);
    it("nested operations use direct writes and report partial failures without claiming rollback", async () => {
      await expect(
        withDatabaseOperation(async () => {
          await registerPlayer("alice", "registration");
          throw new Error("abort outer");
        }),
      ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
      expect(await PlayerModel.countDocuments()).toBe(1);
      expect(await gameStatsRepository.get("globalMinerate")).toBe(1);
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash,
      ).toBe(10);
      expect((await registerPlayer("alice", "registration")).changed).toBe(
        false,
      );
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash,
      ).toBe(10);
    });
    it("atomically registers competing requests once and adds starting HASH to an existing balance", async () => {
      await upsertPlayer({ wallet: "alice", username: "alice" });
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ isRegistered: false, hash: 0 });
      await creditHash("alice", 3.5);
      const outcomes = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          registerPlayer("alice", `registration-${index}`),
        ),
      );
      expect(outcomes.filter((outcome) => outcome.changed)).toHaveLength(1);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({
        isRegistered: true,
        hash: 13.5,
        xp: 0,
        sparks: 0,
        vault: 0,
        referralEarned: 0,
      });
      expect(await gameStatsRepository.get("globalMinerate")).toBe(1);
      expect((await registerPlayer("alice", "another-payment")).changed).toBe(
        false,
      );
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash,
      ).toBe(13.5);
      expect(
        await LogModel.countDocuments({
          type: { $in: ["claim", "deposit", "referral"] },
        }),
      ).toBe(0);
      // Previously registered records are not backfilled.
      await PlayerModel.create({
        wallet: "bob",
        username: "bob",
        isRegistered: true,
        hash: 7,
      });
      expect((await registerPlayer("bob", "new-payment")).changed).toBe(false);
      expect((await PlayerModel.findOne({ wallet: "bob" }).lean())?.hash).toBe(
        7,
      );
    });
    it.each([null, "equipment", "sabotage-device", "help-kit"])(
      "awards event inventory once and parks unknown grants at %s",
      async (fault) => {
        const timestamp = "2026-10-19T00:00:00";
        vi.mocked(verifyNativePayment).mockResolvedValue({
          success: true,
          status: "confirmed",
          symbol: "HIVE",
          transactionId: "event-registration",
          from: "alice",
          to: "treasury",
          amount: "75.000",
          operationIndex: 0,
          blockNumber: 100,
          blockTimestamp: timestamp,
          trigger: { action: "registration", metadata: {} },
        } as never);
        await upsertPlayer({ wallet: "alice", username: "alice" });
        await grantInventoryItems("alice", "help-kit", 3);
        const itemModule =
          await import("@/lib/modules/items/server.repository");
        const originalGrant = itemModule.grantInventoryItems;
        const grant = vi
          .spyOn(itemModule.inventoryItemRepository, "grant")
          .mockImplementation(async (wallet, itemId, quantity) => {
            await originalGrant(wallet, itemId, quantity);
            if (itemId === fault)
              throw new Error("simulated unknown grant acknowledgement");
          });
        const job = await InboundTransactionModel.create({
          type: "registration",
          signature: "event-registration",
          depositTxId: "event-registration",
          walletAddress: "alice",
          registrationHiveAmount: 75,
          referralPolicyVersion: 1,
          paymentOperationIndex: 0,
        });
        const context = { checkLease: async () => {}, maxRetries: 3 };
        await withGameExecution(
          Date.parse("2026-11-03T00:00:00Z"),
          "event-test",
          () => processJob(context, job),
        );
        const calls = grant.mock.calls.length;
        const fresh = await InboundTransactionModel.findById(job._id).lean();
        const receipt = await ProcessedTransactionModel.findOne({
          txHash: "event-registration",
        }).lean();
        expect(
          (await PlayerModel.findOne({ wallet: "alice" }).lean())!.hash,
        ).toBe(10);
        if (fault) {
          expect(fresh).toMatchObject({
            status: "reconciliation",
            databaseEffectsStarted: true,
            registrationStarterPack: {
              eventId: "chainframe-invite-challenge-2026-10",
            },
          });
          expect(receipt).toBeNull();
          await processJob(context, fresh as IInboundTransaction);
        } else {
          expect(fresh).toBeNull();
          expect(receipt).toMatchObject({
            status: "success",
            metadata: {
              startingHash: 10,
              startingItems: [
                { itemId: "equipment", quantity: 4 },
                { itemId: "sabotage-device", quantity: 10 },
                { itemId: "help-kit", quantity: 10 },
              ],
              registrationStarterPack: {
                paymentTime: Date.parse(timestamp + "Z"),
              },
            },
          });
          expect(await getInventoryQuantity("alice", "help-kit")).toBe(13);
          await processJob(context, job);
          const exposed = await readTransactions("alice", { limit: 100 });
          expect(JSON.stringify(exposed.history)).not.toContain(
            "registrationStarterPack",
          );
          expect(JSON.stringify(exposed.history)).toContain("startingItems");
        }
        expect(grant.mock.calls).toHaveLength(calls);
        expect(await getInventoryQuantity("alice", "equipment")).toBe(4);
        expect(await EquipmentModel.countDocuments()).toBe(0);
        expect(await LogModel.countDocuments({ type: "shop" })).toBe(0);
        expect(await gameStatsRepository.get("globalMinerate")).toBe(1);
        grant.mockRestore();
      },
    );

    it.each(["ack", "log", "counter", "receipt", "receipt-after", "cleanup"])(
      "preserves event grants across an interrupted %s",
      async (fault) => {
        await upsertPlayer({ wallet: "alice", username: "alice" });
        vi.mocked(verifyNativePayment).mockResolvedValue({
          success: true,
          status: "confirmed",
          symbol: "HIVE",
          transactionId: "event-fault",
          from: "alice",
          to: "treasury",
          amount: "75.000",
          operationIndex: 0,
          blockNumber: 100,
          blockTimestamp: "2026-10-19T00:00:00",
          trigger: { action: "registration", metadata: {} },
        } as never);
        const pendingModule =
          await import("@/lib/modules/transactions-pending/server.repository");
        const processedModule =
          await import("@/lib/modules/transactions-processed/server.repository");
        const statsModule =
          await import("@/lib/modules/game-stats/server.repository");
        const failure = new Error("simulated event interruption");
        const originalReceipt = processedModule.claimProcessedTransaction;
        const spy =
          fault === "ack"
            ? vi
                .spyOn(pendingModule, "recordRegistrationStarterGrant")
                .mockRejectedValueOnce(failure)
            : fault === "log"
              ? vi.spyOn(LogModel, "create").mockRejectedValueOnce(failure)
              : fault === "counter"
                ? vi
                    .spyOn(statsModule, "incrementStat")
                    .mockRejectedValueOnce(failure)
                : fault === "cleanup"
                  ? vi
                      .spyOn(pendingModule, "completeJob")
                      .mockRejectedValueOnce(
                        new DatabaseOperationUncertainError(failure),
                      )
                  : fault === "receipt-after"
                    ? vi
                        .spyOn(processedModule, "claimProcessedTransaction")
                        .mockImplementationOnce(async (input) => {
                          await originalReceipt(input);
                          throw failure;
                        })
                    : vi
                        .spyOn(processedModule, "claimProcessedTransaction")
                        .mockRejectedValueOnce(failure);
        const job = await InboundTransactionModel.create({
          type: "registration",
          signature: "event-fault",
          depositTxId: "event-fault",
          walletAddress: "alice",
          registrationHiveAmount: 75,
          referralPolicyVersion: 1,
          paymentOperationIndex: 0,
        });
        const context = { checkLease: async () => {}, maxRetries: 3 };
        try {
          await processJob(context, job);
        } finally {
          spy.mockRestore();
        }
        const before = await Promise.all(
          ["equipment", "sabotage-device", "help-kit"].map((id) =>
            getInventoryQuantity(
              "alice",
              id as "equipment" | "sabotage-device" | "help-kit",
            ),
          ),
        );
        const pending = await InboundTransactionModel.findById(job._id).lean();
        expect(pending?.status).toBe(
          fault === "cleanup" ? "failed" : "reconciliation",
        );
        const receipt = await ProcessedTransactionModel.findOne({
          txHash: "event-fault",
        }).lean();
        expect(!!receipt).toBe(
          fault === "cleanup" || fault === "receipt-after",
        );
        if (fault === "cleanup") {
          expect(pending?.registrationStarterPackArchived).toBe(true);
          expect(receipt?.status).toBe("success");
        } else {
          expect(pending?.databaseEffectsStarted).toBe(true);
          await expect(
            pendingModule.completeJob(String(job._id)),
          ).rejects.toThrow();
        }
        await processJob(context, pending as IInboundTransaction);
        expect(
          await Promise.all(
            ["equipment", "sabotage-device", "help-kit"].map((id) =>
              getInventoryQuantity(
                "alice",
                id as "equipment" | "sabotage-device" | "help-kit",
              ),
            ),
          ),
        ).toEqual(before);
        expect(
          (await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash,
        ).toBe(10);
        expect(
          await LogModel.countDocuments({ type: "registration" }),
        ).toBeLessThanOrEqual(1);
      },
    );

    it.each([false, true])(
      "keeps the registration award once when completion is interrupted: %s",
      async (interrupted) => {
        vi.mocked(verifyNativePayment).mockResolvedValue({
          success: true,
          status: "confirmed",
          from: "alice",
          to: "treasury",
          amount: "100.000",
          blockNumber: 100,
          blockTimestamp: "2026-10-18T12:00:00",
          operationIndex: 0,
          trigger: { action: "registration", metadata: {} },
        } as never);
        await upsertPlayer({ wallet: "alice", username: "alice" });
        await creditHash("alice", 3.5);
        const job = await InboundTransactionModel.create({
          type: "registration",
          signature: "registration-payment",
          depositTxId: "registration-payment",
          walletAddress: "alice",
          registrationHiveAmount: 100,
          referralPolicyVersion: 1,
          paymentOperationIndex: 0,
        });
        const failLog = interrupted
          ? vi
              .spyOn(LogModel, "create")
              .mockRejectedValueOnce(new Error("audit interrupted"))
          : null;
        const context = { checkLease: async () => {}, maxRetries: 3 };
        try {
          await processJob(context, job);
        } finally {
          failLog?.mockRestore();
        }
        expect(
          await PlayerModel.findOne({ wallet: "alice" }).lean(),
        ).toMatchObject({
          hash: 13.5,
          isRegistered: true,
          registrationTxId: "registration-payment",
          xp: 0,
        });
        if (interrupted) {
          const pending = (await InboundTransactionModel.findById(job._id))!;
          expect(pending).toMatchObject({
            status: "reconciliation",
            databaseEffectsStarted: true,
          });
          expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
          await processJob(context, pending);
          expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
        } else {
          expect(
            await LogModel.findOne({ type: "registration" }).lean(),
          ).toMatchObject({ amount: 100, data: { startingHash: 10 } });
          expect(
            await ProcessedTransactionModel.findOne({
              txHash: "registration-payment",
            }).lean(),
          ).toMatchObject({ amount: 100, metadata: { startingHash: 10 } });
          expect(await InboundTransactionModel.countDocuments()).toBe(0);
          await processJob(context, job);
          expect(await LogModel.countDocuments({ type: "registration" })).toBe(
            1,
          );
          const history = await readTransactions("alice", { limit: 10 });
          expect(history.history[0]).toMatchObject({
            amount: 100,
            metadata: { startingHash: 10 },
          });
        }
        expect(
          (await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash,
        ).toBe(13.5);
      },
    );
    it("lets one consumer spend the last consumable without changing other inventory", async () => {
      await grantInventoryItems("alice", "help-kit", 1);
      await grantInventoryItems("alice", "sabotage-device", 2);
      const results = await Promise.all([
        consumeInventoryItem("alice", "help-kit"),
        consumeInventoryItem("alice", "help-kit"),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(await getInventoryQuantity("alice", "help-kit")).toBe(0);
      expect(await getInventoryQuantity("alice", "sabotage-device")).toBe(2);
      expect(await consumeInventoryItem("missing", "help-kit")).toEqual({
        ok: false,
      });
      await expect(
        consumeInventoryItem("alice", "unknown" as never),
      ).rejects.toThrow();
    });
    it("merges competing first grants into one stack and keeps quantities safe", async () => {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          grantInventoryItems("alice", "equipment", 2),
        ),
      );
      expect(
        await InventoryItemModel.countDocuments({
          wallet: "alice",
          itemId: "equipment",
        }),
      ).toBe(1);
      expect(await getInventoryQuantity("alice", "equipment")).toBe(20);
      await grantInventoryItems("bob", "equipment", Number.MAX_SAFE_INTEGER);
      await expect(grantInventoryItems("bob", "equipment", 1)).rejects.toThrow(
        "safe range",
      );
      expect(await getInventoryQuantity("bob", "equipment")).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      await expect(
        grantInventoryItems("alice", "equipment", 0.5),
      ).rejects.toThrow();
      const consumed = await Promise.all(
        Array.from({ length: 25 }, () =>
          consumeInventoryItem("alice", "equipment"),
        ),
      );
      expect(consumed.filter((row) => row.ok)).toHaveLength(20);
      expect(await getInventoryQuantity("alice", "equipment")).toBe(0);
    });
    it("purchases stock then opens once with no second charge and rejects replay", async () => {
      await registerPlayer("alice", "registration");
      await creditHash("alice", 1000);
      const processor = createGameActionProcessor(createGameActionRegistry());
      const purchase = hiveGameActionEvent(
        buildGameAction("purchase_chest", {
          itemId: "equipment",
          quantity: 2,
          expectedUnitPrice: 100,
          nonce: "purchase-stock-001",
        }),
        { transactionId: "tx-stock", eventId: "stock" },
      );
      expect((await processor.process(purchase)).status).toBe("executed");
      expect(await getInventoryQuantity("alice", "equipment")).toBe(2);
      expect(await EquipmentModel.countDocuments()).toBe(0);
      const open = hiveGameActionEvent(
        buildGameAction("open_chest", {
          itemId: "equipment",
          nonce: "open-stock-001",
        }),
        { transactionId: "tx-open", eventId: "open" },
      );
      expect((await processor.process(open)).status).toBe("executed");
      expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
      expect(await EquipmentModel.countDocuments()).toBe(1);
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.hash,
      ).toBe(810);
      expect((await processor.process(open)).status).toBe("rejected");
      expect(await EquipmentModel.countDocuments()).toBe(1);
      expect(await getInventoryQuantity("alice", "equipment")).toBe(1);
      expect(await LogModel.countDocuments({ type: "chest", amount: 0 })).toBe(
        1,
      );
    });
    it("parks a consumed chest after an interrupted mint without restoring or replaying it", async () => {
      await registerPlayer("alice", "registration");
      await grantInventoryItems("alice", "equipment", 1);
      const event = hiveGameActionEvent(
        buildGameAction("open_chest", {
          itemId: "equipment",
          nonce: "open-interrupted-001",
        }),
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      const mint = vi
        .spyOn(EquipmentModel, "create")
        .mockRejectedValueOnce(new Error("mint interrupted"));
      try {
        await expect(processor.process(event)).rejects.toBeInstanceOf(
          DatabaseOperationUncertainError,
        );
      } finally {
        mint.mockRestore();
      }
      expect(await getInventoryQuantity("alice", "equipment")).toBe(0);
      expect(await EquipmentModel.countDocuments()).toBe(0);
      expect(
        await InboundTransactionModel.countDocuments({
          status: "reconciliation",
          databaseEffectsStarted: true,
        }),
      ).toBe(1);
      await expect(processor.process(event)).rejects.toThrow("operator review");
      expect(await EquipmentModel.countDocuments()).toBe(0);
      expect(
        await ProcessedTransactionModel.countDocuments({ type: "game_action" }),
      ).toBe(0);
    });
    it("guards competing sabotage writes while allowing independent stats and a fully countered replacement", async () => {
      await upsertPlayer({ wallet: "alice", username: "alice" });
      const results = await Promise.all([
        applyStatSabotage("alice", statEffect("security", "first")),
        applyStatSabotage("alice", statEffect("security", "second")),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const winner = (await PlayerModel.findOne({ wallet: "alice" }).lean())!
        .statEffects!.security!;
      expect(await applyStatSabotage("alice", statEffect("hashRate"))).toEqual({
        ok: true,
      });
      expect(
        await replaceStatEffect("alice", winner, { ...winner, active: false }),
      ).toEqual({ ok: true });
      expect(
        await applyStatSabotage("alice", statEffect("security", "replacement")),
      ).toEqual({ ok: true });
      const effects = (await PlayerModel.findOne({ wallet: "alice" }).lean())!
        .statEffects!;
      expect(effects.security?.appliedBy).toBe("replacement");
      expect(effects.hashRate?.active).toBe(true);
      expect(
        await applyStatSabotage("missing", statEffect("security")),
      ).toEqual({ ok: false });
    });
    it("lets one Help compare-and-set win and preserves unrelated stat effects", async () => {
      await upsertPlayer({ wallet: "alice", username: "alice" });
      const expected = statEffect("security"),
        other = statEffect("hashRate");
      await applyStatSabotage("alice", expected);
      await applyStatSabotage("alice", other);
      const helped = (appliedBy: string): StatEffect => ({
        ...expected,
        helps: [
          {
            itemId: "help-kit",
            appliedBy,
            appliedAt: 1500,
            strength: 0.1,
            critical: false,
          },
        ],
      });
      const results = await Promise.all([
        replaceStatEffect("alice", expected, helped("first")),
        replaceStatEffect("alice", expected, helped("second")),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const effects = (await PlayerModel.findOne({ wallet: "alice" }).lean())!
        .statEffects!;
      expect(effects.security?.helps).toHaveLength(1);
      expect(effects.hashRate?.appliedBy).toBe(other.appliedBy);
      expect(
        await replaceStatEffect("alice", expected, helped("stale")),
      ).toEqual({ ok: false });
      expect(
        await replaceStatEffect("alice", expected, statEffect("hashRate")),
      ).toEqual({ ok: false });
    });
    it("returns cleared stat effects to exactly one reset without touching balances", async () => {
      await PlayerModel.create({ wallet: "alice", username: "alice", hash: 7 });
      await applyStatSabotage("alice", statEffect("security"));
      await applyStatSabotage("alice", statEffect("hashRate"));
      const results = await Promise.all([
        clearStatEffects("alice"),
        clearStatEffects("alice"),
      ]);
      expect(
        results.map((result) => Object.keys(result).length).sort(),
      ).toEqual([0, 2]);
      const player = await PlayerModel.findOne({ wallet: "alice" }).lean();
      expect(player?.statEffects).toBeUndefined();
      expect(player?.hash).toBe(7);
      expect(await clearStatEffects("missing")).toEqual({});
    });
    it("reserves the last raid charge once under competing requests", async () => {
      const now = Date.now();
      await PlayerModel.create({
        wallet: "alice",
        username: "alice",
        raidCharges: 1,
        lastRaidRegenAt: now,
      });
      const results = await Promise.all([
        reserveRaidCharge("alice", now, CHARGE_REGEN_MS, MAX_RAID_CHARGES),
        reserveRaidCharge("alice", now, CHARGE_REGEN_MS, MAX_RAID_CHARGES),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.raidCharges,
      ).toBe(0);
    });
    it("debits a defender once and applies protection atomically", async () => {
      const now = Date.now(),
        protection = now + 60_000;
      await PlayerModel.create({
        wallet: "alice",
        username: "alice",
        vault: 100,
        protectionUntil: 0,
      });
      const results = await Promise.all([
        claimRaidDefender("alice", 40, now, protection),
        claimRaidDefender("alice", 40, now, protection),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const player = await PlayerModel.findOne({ wallet: "alice" }).lean();
      expect(player?.vault).toBe(60);
      expect(player?.protectionUntil).toBe(protection);
      expect(await claimRaidDefender("alice", 40, now + 1, protection)).toEqual(
        { ok: false },
      );
    });
    it("caps competing raid credits and awards Notoriety from the actual credit", async () => {
      await PlayerModel.create({
        wallet: "alice",
        username: "alice",
        vault: 3,
        notoriety: 0,
      });
      const results = await Promise.all([
        creditRaidProceeds("alice", { received: 7, capacity: 10, xp: 10 }),
        creditRaidProceeds("alice", { received: 7, capacity: 10, xp: 10 }),
      ]);
      expect(results.reduce((sum, result) => sum + result.credited, 0)).toBe(7);
      const player = await PlayerModel.findOne({ wallet: "alice" }).lean();
      expect(player?.vault).toBe(10);
      expect(player?.notoriety).toBe(7);
      expect(player?.milestones.totalStolen).toBe(7);
    });
    it("caps competing fractional raid credits using the write-time capacity", async () => {
      await PlayerModel.create({
        wallet: "alice",
        username: "alice",
        vault: 0.75,
        notoriety: 0,
      });
      const results = await Promise.all([
        creditRaidProceeds("alice", { received: 0.2, capacity: 1, xp: 10 }),
        creditRaidProceeds("alice", { received: 0.2, capacity: 1, xp: 10 }),
      ]);
      expect(results.map((result) => result.credited).sort()).toEqual([
        0.05, 0.2,
      ]);
      const player = await PlayerModel.findOne({ wallet: "alice" }).lean();
      expect(player?.vault).toBeCloseTo(1, 12);
      expect(player?.notoriety).toBe(0.25);
      expect(player?.milestones.totalStolen).toBe(0.25);
    });
    it("preserves fractional defender debits and failed-raid deductions", async () => {
      await PlayerModel.create({
        wallet: "alice",
        username: "alice",
        vault: 0.9,
        protectionUntil: 0,
      });
      const now = Date.now();
      expect(await claimRaidDefender("alice", 0.45, now, now + 60000)).toEqual({
        ok: true,
      });
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.vault,
      ).toBe(0.45);
      expect(await debitRaidRisk("alice", 0.123456)).toEqual({
        ok: true,
        deducted: 0.123456,
      });
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.vault,
      ).toBeCloseTo(0.326544, 12);
      expect(await debitRaidRisk("alice", 1)).toEqual({
        ok: true,
        deducted: 0.326544,
      });
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.vault,
      ).toBeCloseTo(0, 12);
    });
    it("limits failed-raid destruction to the actual vault and treats zero risk as a no-op", async () => {
      await PlayerModel.create({
        wallet: "alice",
        username: "alice",
        vault: 120,
      });
      expect(await debitRaidRisk("alice", 300)).toEqual({
        ok: true,
        deducted: 120,
      });
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())?.vault,
      ).toBe(0);
      expect(await debitRaidRisk("alice", 0)).toEqual({
        ok: true,
        deducted: 0,
      });
      expect(await debitRaidRisk("missing", 1)).toEqual({
        ok: false,
        deducted: 0,
      });
    });
    it("counts first registration once and accumulates concurrent single and bulk upgrades", async () => {
      await registerPlayer("alice", "registration-a");
      await registerPlayer("alice", "registration-a");
      await registerPlayer("bob", "registration-b");
      expect(await gameStatsRepository.get("globalMinerate")).toBe(2);
      await creditHash("alice", 10000);
      await creditHash("bob", 10000);
      const results = await Promise.all([
        upgradeStat("alice", "hashRate", 2),
        upgradeStat("bob", "hashRate", 1),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
      expect(await gameStatsRepository.get("globalMinerate")).toBe(5);
      await upgradeStat("alice", "security", 1);
      expect(await gameStatsRepository.get("globalMinerate")).toBe(5);
    });
    it("settles a claim through the real registry once and records its actual amount", async () => {
      await registerPlayer("alice", "registration");
      await PlayerModel.updateOne(
        { wallet: "alice" },
        {
          $set: {
            vault: 0.5,
            lastTickAt: Date.parse("2026-10-10T00:00:00Z"),
            claimCharges: 5,
            lastClaimRegenAt: Date.parse("2026-10-10T00:00:00Z"),
          },
        },
      );
      const event = hiveGameActionEvent(
        buildClaimAction({ nonce: "standalone-claim-0001" }),
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      expect((await processor.process(event)).status).toBe("executed");
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 10.5, vault: 0, claimCharges: 4 });
      expect(await LogModel.findOne({ type: "claim" }).lean()).toMatchObject({
        amount: 0.5,
      });
      expect(await ProcessedTransactionModel.countDocuments()).toBe(1);
      await processor.process(event);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 10.5 });
    });
    it("ignores legacy progress on startup and deduplicates inclusive in-process replay", async () => {
      await GameStatModel.collection.insertOne({
        _id: HIVE_WORKER_LEASE_ID,
        checkpoint: {
          blockNumber: 1,
          transactionIndex: -1,
          operationIndex: -1,
          updatedAt: 1,
        },
        value: 0,
      } as never);
      await registerPlayer("alice", "registration");
      await PlayerModel.updateOne(
        { wallet: "alice" },
        {
          $set: {
            vault: 0.5,
            lastTickAt: Date.parse("2026-10-10T00:00:00Z"),
            claimCharges: 5,
            lastClaimRegenAt: Date.parse("2026-10-10T00:00:00Z"),
          },
        },
      );
      const event = hiveGameActionEvent(
        buildClaimAction({ nonce: "worker-replay-0001" }),
      );
      const position: GameActionStreamPosition = {};
      const resolver = vi.fn(async () => 100);
      async function* interrupted() {
        yield event;
        throw new Error("stream interrupted");
      }
      await expect(
        runGameActionStreamWorker({
          position,
          resolveStartBlock: resolver,
          stream: interrupted(),
        }),
      ).rejects.toThrow("stream interrupted");
      expect(position.blockNumber).toBe(100);
      resolver.mockResolvedValue(200);
      const create = vi.fn(async function* () {
        yield event;
      });
      await runGameActionStreamWorker({
        position,
        resolveStartBlock: resolver,
        createStream: create,
      });
      expect(resolver).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith(expect.any(AbortSignal), 100);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 10.5, vault: 0, claimCharges: 4 });
      expect(await LogModel.countDocuments({ type: "claim" })).toBe(1);
      expect(await ProcessedTransactionModel.countDocuments()).toBe(1);
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      expect(
        (
          await GameStatModel.collection.findOne({
            _id: HIVE_WORKER_LEASE_ID,
          } as never)
        )?.checkpoint,
      ).toMatchObject({ blockNumber: 1 });
    });
    it.each([
      [0, 1],
      [0.3, 2],
    ])(
      "rejects equipment upgrade with %s SPARKS for %s levels without reconciliation",
      async (sparks, levels) => {
        await registerPlayer("alice", "registration");
        await PlayerModel.updateOne({ wallet: "alice" }, { $set: { sparks } });
        const item = await EquipmentModel.create({
          templateId: 1000,
          owner: "alice",
          name: "Test Miner",
          slot: "asicMiner",
          rarity: "common",
          stats: { hashRate: 1 },
        });
        const processor = createGameActionProcessor(createGameActionRegistry());
        const result = await processor.process(
          hiveGameActionEvent(
            buildGameAction("upgrade_equipment", {
              equipmentId: String(item._id),
              levels,
              nonce: "sparks-rejection-12345",
            }),
          ),
        );
        expect(result).toMatchObject({
          status: "rejected",
          reason: "Not enough SPARKS",
        });
        expect(await InboundTransactionModel.countDocuments()).toBe(0);
        expect(
          await ProcessedTransactionModel.countDocuments({
            status: "failed",
            "metadata.event.status": "rejected",
          }),
        ).toBe(1);
        expect(await EquipmentModel.findById(item._id).lean()).toMatchObject({
          level: 1,
          stats: { hashRate: 1 },
        });
        expect(
          await PlayerModel.findOne({ wallet: "alice" }).lean(),
        ).toMatchObject({ sparks, xp: 0 });
        expect(await LogModel.countDocuments({ type: "upgrade" })).toBe(0);
      },
    );

    it("rejects a stale SPARKS affordability read when the atomic debit matches nothing", async () => {
      await registerPlayer("alice", "registration");
      const item = await EquipmentModel.create({
        templateId: 1000,
        owner: "alice",
        name: "Test Miner",
        slot: "asicMiner",
        rarity: "common",
        stats: { hashRate: 1 },
      });
      const restore = staleSparksBalance("alice");
      try {
        const event = hiveGameActionEvent(
          buildGameAction("upgrade_equipment", {
            equipmentId: String(item._id),
            levels: 1,
            nonce: "sparks-stale-read-12345",
          }),
        );
        expect(
          await createGameActionProcessor(createGameActionRegistry()).process(
            event,
          ),
        ).toMatchObject({ status: "rejected", reason: "Not enough SPARKS" });
      } finally {
        restore();
      }
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      expect(
        await ProcessedTransactionModel.findOne({ type: "game_action" }).lean(),
      ).toMatchObject({
        status: "failed",
        metadata: { event: { status: "rejected" } },
      });
      expect(await EquipmentModel.findById(item._id).lean()).toMatchObject({
        level: 1,
      });
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ sparks: 0 });
    });

    it("executes a fully affordable bulk upgrade using the existing per-level costs and rounding", async () => {
      await registerPlayer("alice", "registration");
      const stats = { hashRate: 1 };
      const nextStats = upgradedStats(stats);
      const cost1 = itemUpgradeCost({ stats, level: 1 });
      const cost2 = itemUpgradeCost({ stats: nextStats, level: 2 });
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { sparks: 10 } },
      );
      const item = await EquipmentModel.create({
        templateId: 1000,
        owner: "alice",
        name: "Test Miner",
        slot: "asicMiner",
        rarity: "common",
        stats,
      });
      const event = hiveGameActionEvent(
        buildGameAction("upgrade_equipment", {
          equipmentId: String(item._id),
          levels: 2,
          nonce: "sparks-bulk-success-12345",
        }),
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      expect(await processor.process(event)).toMatchObject({
        status: "executed",
      });
      expect(await processor.process(event)).toMatchObject({
        status: "rejected",
      });
      expect(await EquipmentModel.findById(item._id).lean()).toMatchObject({
        level: 3,
        stats: upgradedStats(nextStats),
      });
      expect(
        (await PlayerModel.findOne({ wallet: "alice" }).lean())!.sparks,
      ).toBeCloseTo(10 - cost1 - cost2, 12);
      expect(await LogModel.countDocuments({ type: "upgrade" })).toBe(2);
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
    });

    it("distinguishes acknowledged unmatched SPARKS writes from applied or uncertain debits", async () => {
      await registerPlayer("alice", "registration");
      const rejected = new Error("Known rejection");
      await expect(
        withDatabaseOperation(async () => {
          expect(await debitSparks("alice", 1)).toEqual({ ok: false });
          throw rejected;
        }),
      ).rejects.toBe(rejected);
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { sparks: 10 } },
      );
      await expect(
        withDatabaseOperation(async () => {
          expect(await debitSparks("alice", 1)).toEqual({ ok: true });
          expect(await debitSparks("alice", 100)).toEqual({ ok: false });
          throw rejected;
        }),
      ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
      const restore = loseSparksDebitAcknowledgment();
      try {
        await expect(
          withDatabaseOperation(() => debitSparks("alice", 1)),
        ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
      } finally {
        restore();
      }
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ sparks: 8 });
    });

    it("keeps a lost upgrade debit acknowledgment in reconciliation without upgrading equipment", async () => {
      await registerPlayer("alice", "registration");
      await PlayerModel.updateOne(
        { wallet: "alice" },
        { $set: { sparks: 10 } },
      );
      const item = await EquipmentModel.create({
        templateId: 1000,
        owner: "alice",
        name: "Test Miner",
        slot: "asicMiner",
        rarity: "common",
        stats: { hashRate: 1 },
      });
      const restore = loseSparksDebitAcknowledgment();
      try {
        await expect(
          createGameActionProcessor(createGameActionRegistry()).process(
            hiveGameActionEvent(
              buildGameAction("upgrade_equipment", {
                equipmentId: String(item._id),
                levels: 1,
                nonce: "sparks-uncertain-12345",
              }),
            ),
          ),
        ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
      } finally {
        restore();
      }
      expect(
        await InboundTransactionModel.findOne({ type: "game_action" }).lean(),
      ).toMatchObject({
        status: "reconciliation",
        databaseEffectsStarted: true,
      });
      expect(await EquipmentModel.findById(item._id).lean()).toMatchObject({
        level: 1,
      });
    });

    it("rejects insufficient upgrade funds after a safe tick without blocking the stream", async () => {
      await registerPlayer("alice", "registration");
      // This scenario starts after the player's starting HASH has been spent.
      await PlayerModel.updateOne({ wallet: "alice" }, { $set: { hash: 0 } });
      const event = hiveGameActionEvent(
        buildUpgradeStatAction({
          stat: "hashRate",
          levels: 1,
          nonce: "standalone-no-funds-0001",
        }),
      );
      const processor = createGameActionProcessor(createGameActionRegistry());
      expect(await processor.process(event)).toMatchObject({
        status: "rejected",
        reason: "Not enough HASH",
      });
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 0, statLevels: { hashRate: 1 } });
    });
    it("credits a verified deposit before publishing success and ignores duplicate settlement", async () => {
      await registerPlayer("alice", "registration");
      const job = await InboundTransactionModel.create({
        type: "deposit",
        signature: "deposit",
        depositTxId: "deposit",
        depositAmount: 5,
        walletAddress: "alice",
      });
      const context = { checkLease: async () => {}, maxRetries: 3 };
      await processJob(context, job);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 15 });
      expect(
        await ProcessedTransactionModel.findOne({ txHash: "deposit" }).lean(),
      ).toMatchObject({ metadata: { creditedAmount: 5 } });
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      await processJob(context, job);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 15 });
    });
    it("parks a partially credited deposit, hides its internal marker and refuses automatic replay", async () => {
      await registerPlayer("alice", "registration");
      const job = await InboundTransactionModel.create({
        type: "deposit",
        signature: "interrupted",
        depositTxId: "interrupted",
        depositAmount: 5,
        walletAddress: "alice",
      });
      const failure = vi
        .spyOn(LogModel, "create")
        .mockRejectedValueOnce(new Error("audit unavailable"));
      const context = { checkLease: async () => {}, maxRetries: 3 };
      try {
        await processJob(context, job);
      } finally {
        failure.mockRestore();
      }
      const pending = (await InboundTransactionModel.findById(job._id))!;
      expect(pending).toMatchObject({
        status: "reconciliation",
        databaseEffectsStarted: true,
      });
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 15 });
      expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
      await processJob(context, pending);
      await resumeReconciledPayment("interrupted");
      expect(await InboundTransactionModel.findById(job._id)).toMatchObject({
        status: "reconciliation",
      });
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 15 });
      const history = await readTransactions("alice", { limit: 10 });
      expect(history.pending[0]).not.toHaveProperty("databaseEffectsStarted");
      expect(history.pending[0]).toMatchObject({ status: "reconciliation" });
    });
    it("detects a process crash marker before reclaiming expired gameplay effects", async () => {
      const event = hiveGameActionEvent(
        buildClaimAction({ nonce: "standalone-crash-0001" }),
      );
      await gameActionPersistence.claim(event, "old-owner");
      await beginQueuedDatabaseEffects(
        event.transactionId + ":" + event.operationIndex,
        "old-owner",
      );
      await InboundTransactionModel.updateOne(
        {},
        { $set: { "gameEvent.claimUntil": 0 } },
      );
      expect(await gameActionPersistence.claim(event, "new-owner")).toBe(
        "reconciliation",
      );
      expect(await listRecoverableGameActions()).toHaveLength(0);
    });
    it("unique durable claims let only one claimant acquire an operation", async () => {
      const event = hiveGameActionEvent(
        buildClaimAction({ nonce: "unique-claim-0001" }),
      );
      const claims = await Promise.all([
        gameActionPersistence.claim(event, "one"),
        gameActionPersistence.claim(event, "two"),
      ]);
      expect(claims.filter((r) => r === "claimed")).toHaveLength(1);
      expect(await InboundTransactionModel.countDocuments()).toBe(1);
    });
    it("writes effects, logs, aggregate and receipt in order and ignores replay", async () => {
      await registerPlayer("alice", "registration");
      await creditHash("alice", 1000);
      const event = hiveGameActionEvent(
        buildUpgradeStatAction({
          stat: "hashRate",
          levels: 2,
          nonce: "atomic-upgrade-01",
        }),
      );
      const processor = createGameActionProcessor({
        upgrade_stat: async () => upgradeStat("alice", "hashRate", 2),
      });
      expect((await processor.process(event)).status).toBe("executed");
      expect(await gameStatsRepository.get("globalMinerate")).toBe(3);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 1005, xp: 50, statLevels: { hashRate: 3 } });
      expect(await LogModel.countDocuments()).toBe(1);
      expect(await ProcessedTransactionModel.countDocuments()).toBe(1);
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      expect((await processor.process(event)).status).toBe("rejected");
      expect(await gameStatsRepository.get("globalMinerate")).toBe(3);
    });
    it("parks interrupted effects without issuing a receipt or replaying the action", async () => {
      await registerPlayer("alice", "registration");
      await creditHash("alice", 1000);
      const event = hiveGameActionEvent(
        buildUpgradeStatAction({
          stat: "hashRate",
          levels: 2,
          nonce: "atomic-rollback-1",
        }),
      );
      const processor = createGameActionProcessor({
        upgrade_stat: async () => {
          await upgradeStat("alice", "hashRate", 2);
          throw new Error("receipt write interrupted");
        },
      });
      await expect(processor.process(event)).rejects.toBeInstanceOf(
        DatabaseOperationUncertainError,
      );
      expect(await gameStatsRepository.get("globalMinerate")).toBe(3);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({ hash: 1005, xp: 50, statLevels: { hashRate: 3 } });
      expect(await LogModel.countDocuments()).toBe(1);
      expect(await ProcessedTransactionModel.countDocuments()).toBe(0);
      expect(
        await InboundTransactionModel.countDocuments({
          status: "reconciliation",
          databaseEffectsStarted: true,
        }),
      ).toBe(1);
      await expect(processor.process(event)).rejects.toThrow("operator review");
      expect(await gameStatsRepository.get("globalMinerate")).toBe(3);
    });
    it("reuses confirmed transfers and parks uncertain intents without another broadcast", async () => {
      const send = vi.fn(async () => ({
        success: true,
        transactionId: "payout",
      }));
      const intent = {
        accountAlias: "treasury" as const,
        from: "treasury",
        to: "alice",
        quantity: "1.000",
        symbol: "HASH",
        memo: "test",
      };
      await InboundTransactionModel.create({
        type: "withdrawal",
        signature: "job",
        walletAddress: "alice",
        withdrawAmount: 1,
        financialWorkflowVersion: 1,
        financialPhase: "reserved",
      });
      await dispatchTreasuryOnce("job", "confirmed", intent, send);
      await dispatchTreasuryOnce("job", "confirmed", intent, send);
      expect(send).toHaveBeenCalledOnce();
      await InboundTransactionModel.updateOne(
        { signature: "job" },
        {
          $push: {
            treasuryTransfers: {
              key: "uncertain",
              intent,
              state: "broadcasting",
            },
          },
        },
      );
      await expect(
        dispatchTreasuryOnce("job", "uncertain", intent, send),
      ).rejects.toBeInstanceOf(SettlementUncertainError);
      expect(send).toHaveBeenCalledOnce();
    });
    it("preserves legacy checkpoint data without reading it and retains one exclusive worker lease", async () => {
      // Raw insertion models an existing document from an older worker version.
      await GameStatModel.collection.insertOne({
        _id: HIVE_WORKER_LEASE_ID,
        checkpoint: {
          blockNumber: 1,
          transactionIndex: -1,
          operationIndex: -1,
          updatedAt: 1,
        },
        value: 0,
      } as never);
      const leases = await Promise.all([
        contractStreamRepository.acquireLease("one", 10000),
        contractStreamRepository.acquireLease("two", 10000),
      ]);
      expect(leases.filter(Boolean)).toHaveLength(1);
      const owner = leases[0] ? "one" : "two";
      await expect(getStat(HIVE_WORKER_LEASE_ID)).rejects.toThrow(
        "Reserved Hive worker lease",
      );
      expect(await contractStreamRepository.renewLease("intruder", 10000)).toBe(
        false,
      );
      await contractStreamRepository.releaseLease("intruder");
      expect(await contractStreamRepository.acquireLease("new", 10000)).toBe(
        false,
      );
      expect(await contractStreamRepository.renewLease(owner, 10000)).toBe(
        true,
      );
      expect(
        (
          await GameStatModel.collection.findOne({
            _id: HIVE_WORKER_LEASE_ID,
          } as never)
        )?.checkpoint,
      ).toMatchObject({ blockNumber: 1 });
      expect(
        await GameStatModel.countDocuments({ _id: HIVE_WORKER_LEASE_ID }),
      ).toBe(1);
      await contractStreamRepository.releaseLease(owner);
      expect(await contractStreamRepository.acquireLease("new", 10000)).toBe(
        true,
      );
    });
    it("consumes a player's login nonce once and initializes an auth shell's profile once", async () => {
      const expiresAt = Date.now() + 60000;
      await issueLoginNonce("alice", "hash", expiresAt);
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).toMatchObject({
        profileInitialized: false,
        isRegistered: false,
        hash: 0,
      });
      expect(
        await PlayerModel.findOne({ wallet: "alice" }).lean(),
      ).not.toHaveProperty("loginNonce");
      const outcomes = await Promise.all([
        consumeLoginNonce("alice", "hash", expiresAt, Date.now()),
        consumeLoginNonce("alice", "hash", expiresAt, Date.now()),
      ]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      await upsertPlayer({ wallet: "bob", username: "bob" });
      await Promise.all([
        readPlayerProfile("alice", "bob"),
        readPlayerProfile("alice", "bob"),
      ]);
      expect(await gameStatsRepository.get("registeredPlayers")).toBe(1);
      expect(await PlayerModel.findOne({ wallet: "bob" }).lean()).toMatchObject(
        {
          referralCount: 1,
        },
      );
      expect(await gameStatsRepository.get("globalMinerate")).toBeNull();
    });
    it("attaches an invitation once to an initialized unregistered account under competing reads", async () => {
      await issueLoginNonce("alice", "hash", Date.now() + 60000);
      await readPlayerProfile("alice", null);
      await upsertPlayer({ wallet: "corven", username: "corven" });
      await upsertPlayer({ wallet: "other", username: "other" });
      const profiles = await Promise.all([
        readPlayerProfile("alice", " CORVEN "),
        readPlayerProfile("alice", "other"),
        readPlayerProfile("alice", "corven"),
      ]);
      const assigned = await PlayerModel.findOne({ wallet: "alice" }).lean();
      expect(["corven", "other"]).toContain(assigned?.referredBy);
      expect(
        profiles.every(
          (profile) => profile.referredBy === assigned?.referredBy,
        ),
      ).toBe(true);
      expect(assigned).toMatchObject({
        isRegistered: false,
        hash: 0,
        profileInitialized: true,
      });
      for (const wallet of ["corven", "other"]) {
        expect(await PlayerModel.findOne({ wallet }).lean()).toMatchObject({
          referralCount: assigned?.referredBy === wallet ? 1 : 0,
        });
      }
      expect(await gameStatsRepository.get("registeredPlayers")).toBe(1);
      expect(
        (
          await readPlayerProfile(
            "alice",
            assigned?.referredBy === "corven" ? "other" : "corven",
          )
        ).referredBy,
      ).toBe(assigned?.referredBy);
      expect(await LogModel.countDocuments({ type: "referral" })).toBe(0);
    });
    it.each(["pending", "reconciliation", "failed", "processed"] as const)(
      "does not attach a referral after a %s registration payment record",
      async (status) => {
        await upsertPlayer({ wallet: "alice", username: "alice" });
        await upsertPlayer({ wallet: "corven", username: "corven" });
        if (status === "processed")
          await ProcessedTransactionModel.create({
            txHash: "registration",
            wallet: "alice",
            type: "registration",
            amount: 150,
            status: "failed",
            processedAt: Date.now(),
          });
        else
          await InboundTransactionModel.create({
            signature: "registration",
            walletAddress: "alice",
            type: "registration",
            status,
            referralPolicyVersion: 1,
            referralObligation: { referrer: null, source: "registration" },
          });
        expect(
          (await readPlayerProfile("alice", "corven")).referredBy,
        ).toBeNull();
        expect(
          await PlayerModel.findOne({ wallet: "corven" }).lean(),
        ).toMatchObject({ referralCount: 0 });
        if (status !== "processed")
          expect(
            await InboundTransactionModel.findOne({
              signature: "registration",
            }).lean(),
          ).toMatchObject({ referralObligation: { referrer: null } });
      },
    );
    it("rejects self, missing and already-paid referral attribution without creating recipient profiles", async () => {
      await upsertPlayer({ wallet: "alice", username: "alice" });
      await upsertPlayer({ wallet: "corven", username: "corven" });
      expect((await readPlayerProfile("alice", "alice")).referredBy).toBeNull();
      expect(
        (await readPlayerProfile("alice", "missing")).referredBy,
      ).toBeNull();
      expect(await PlayerModel.countDocuments()).toBe(2);
      await registerPlayer("alice", "paid-registration");
      expect(
        (await readPlayerProfile("alice", "corven")).referredBy,
      ).toBeNull();
      expect(
        await PlayerModel.findOne({ wallet: "corven" }).lean(),
      ).toMatchObject({ referralCount: 0 });
    });
    it("archives confirmed payouts before deleting the pending job and reuses archived transfers", async () => {
      const job = await InboundTransactionModel.create({
        type: "withdrawal",
        signature: "job",
        walletAddress: "alice",
        treasuryTransfers: [
          {
            key: "key",
            intent: {
              accountAlias: "treasury",
              from: "treasury",
              to: "alice",
              symbol: "HASH",
              quantity: "1.000",
              memo: "test",
            },
            state: "confirmed",
            verifiedAt: Date.now(),
            blockNumber: 100,
            operationIndex: 0,
            transactionId: "tx",
          },
        ],
      });
      await withDatabaseOperation(async () => {
        await ProcessedTransactionModel.create({
          txHash: "job",
          wallet: "alice",
          type: "withdrawal",
          amount: -1,
          processedAt: Date.now(),
        });
        await completePaymentJob(job as IInboundTransaction);
      });
      expect(await InboundTransactionModel.countDocuments()).toBe(0);
      expect(
        (await ProcessedTransactionModel.findOne({ txHash: "job" }).lean())
          ?.metadata?.treasuryTransfers?.[0].transactionId,
      ).toBe("tx");
      const send = vi.fn();
      await expect(
        dispatchTreasuryOnce(
          "job",
          "key",
          {
            accountAlias: "treasury",
            from: "treasury",
            to: "alice",
            symbol: "HASH",
            quantity: "1.000",
            memo: "test",
          },
          send,
        ),
      ).resolves.toMatchObject({ transactionId: "tx" });
      expect(send).not.toHaveBeenCalled();
    });
  },
);

import { getStat } from "@/lib/modules/game-stats/server.repository";
