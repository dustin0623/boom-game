import { isDeepStrictEqual } from "node:util";
import { effectiveStatValue } from "@/features/types/game/stat-effects";
import { raidAmount } from "@/features/types/game/exposure";
import { logRaid } from "./log";
import {
  playerRepository,
  applyRaidStep,
  readActiveRaid,
} from "@/lib/modules/players/server.repository";
import { incrementSettlementStat } from "@/lib/modules/game-stats/server.repository";
import {
  getPendingGameEvent,
  saveRaidSettlement,
  setRaidStage,
} from "@/lib/modules/transactions-pending/server.repository";
import {
  regenCharges,
  simulateRaid,
  raidProtectionUntil,
  summarizeStatEffects,
} from "./calculations.server";
import { vaultCapacity } from "@/features/types/game/mining";
import {
  gameActionNow,
  gameActionSeed,
  gameActionCorrelationKey,
  checkGameExecution,
} from "@/lib/utils/game/execution-context.server";
import {
  resolvePlayerStats,
  settleTick,
} from "@/features/events/backend/tick-player/action";
import { CHARGE_REGEN_MS, MAX_RAID_CHARGES } from "@/lib/config/constants/game";
import { withDatabasePreparation } from "@/lib/utils/database/operation.server";
import type {
  RaidField,
  RaidSettlement,
  RaidStage,
  RaidStep,
} from "@/features/types/game/raid-settlement";
import { RaidEvidenceConflict } from "@/features/types/game/raid-settlement";
import type { PlayerRecord } from "@/lib/modules/players/server.types";

export type RaidActionResult = {
  status: number;
  body: Record<string, unknown> & { ok: boolean; error?: string };
};
function failure(status: number, error: string): RaidActionResult {
  return { status, body: { ok: false, error } };
}

/** Recovery uses a saved plan; every player effect carries atomic evidence. */
export async function raidTarget(
  wallet: string,
  target: string,
  seed: string,
): Promise<RaidActionResult> {
  const key = gameActionCorrelationKey();
  if (!key) throw new Error("Raid requires a durable operation identity");
  const record = await getPendingGameEvent(key);
  if (!record) throw new Error("Missing raid job");
  let journal = record.raidSettlement;
  if (!journal) {
    await setRaidStage(key, "preparation");
    let attacker = await playerRepository.findByWallet(wallet);
    let defender = await playerRepository.findByWallet(target);
    if (!attacker || !defender) return failure(404, "Player not found");
    if (wallet === target) return failure(400, "Cannot raid yourself");
    if (!defender.isRegistered)
      return failure(400, "Target registration is required");
    attacker.stats = await resolvePlayerStats(attacker);
    defender.stats = await resolvePlayerStats(defender);
    if (
      effectiveStatValue(
        attacker.stats.hackPower,
        attacker.statEffects?.hackPower,
      ) <=
      effectiveStatValue(
        defender.stats.security,
        defender.statEffects?.security,
      )
    )
      return failure(400, "Your Hack Power must exceed the target's Security");
    await settleTick(wallet);
    await settleTick(target);
    attacker = await playerRepository.findByWallet(wallet);
    defender = await playerRepository.findByWallet(target);
    if (!attacker || !defender) return failure(404, "Player not found");
    const now = gameActionNow();
    const charges = Math.min(
      MAX_RAID_CHARGES,
      attacker.raidCharges +
        Math.floor((now - attacker.lastRaidRegenAt) / CHARGE_REGEN_MS),
    );
    if (charges < 1) {
      const reservation = await withDatabasePreparation(() =>
        playerRepository.reserveRaidCharge(
          wallet,
          now,
          CHARGE_REGEN_MS,
          MAX_RAID_CHARGES,
        ),
      );
      if (reservation.ok) throw new Error("Raid charge precondition changed");
      return failure(400, "No raid charges");
    }
    journal = buildRaidSettlement(attacker, defender, seed, key);
    await setRaidStage(key, "plan");
    await saveRaidSettlement(key, journal);
  }
  validateRaidSettlement(journal, wallet, target, seed, key);
  for (const participant of [wallet, target]) {
    const marker = await readActiveRaid(participant);
    const expected = journal.steps.filter(
      (step) => step.wallet === participant,
    );
    if (
      marker &&
      (marker.version !== 1 ||
        marker.key !== key ||
        marker.steps.length > expected.length ||
        !marker.steps.every((step, index) =>
          isDeepStrictEqual(step, expected[index]),
        ))
    )
      throw new RaidEvidenceConflict("Invalid raid marker sequence");
  }
  for (const step of journal.steps) {
    if (![wallet, target].includes(step.wallet))
      throw new Error("Invalid raid participant");
    await setRaidStage(key, step.stage);
    await checkGameExecution();
    await applyRaidStep(key, step);
  }
  await checkGameExecution();
  await setRaidStage(key, "log");
  await logRaid(
    wallet,
    target,
    {
      ...journal.result,
      serverSeed: journal.serverSeed,
    } as unknown as Parameters<typeof logRaid>[2],
    seed,
    journal.serverSeed,
    journal.social,
  );
  await setRaidStage(key, "counters");
  await checkGameExecution();
  await incrementSettlementStat("totalRaids", `raid:${key}`);
  if (journal.result.success)
    await incrementSettlementStat("totalRaidWins", `raid:${key}`);
  return {
    status: 200,
    body: { ok: journal.result.success, ...journal.result },
  };
}

function buildRaidSettlement(
  attacker: PlayerRecord,
  defender: PlayerRecord,
  seed: string,
  key: string,
): RaidSettlement {
  attacker = structuredClone(attacker);
  defender = structuredClone(defender);
  const wallet = attacker.wallet,
    target = defender.wallet,
    now = gameActionNow();
  const charges = Math.min(
    MAX_RAID_CHARGES,
    attacker.raidCharges +
      Math.floor((now - attacker.lastRaidRegenAt) / CHARGE_REGEN_MS),
  );
  const originalAttacker = structuredClone(attacker),
    originalDefender = structuredClone(defender);
  const result = simulateRaid(attacker, defender, seed, {
    statEffects: {
      attacker: attacker.statEffects,
      defender: defender.statEffects,
    },
  });
  const steps: RaidStep[] = [];
  const step = (
    stage: RaidStage,
    player: PlayerRecord,
    changes: Partial<Record<RaidField, unknown>>,
  ) => {
    const before: Partial<Record<RaidField, unknown>> = {};
    for (const [field, value] of Object.entries(changes)) {
      const parts = field.split(".");
      const parent =
        parts.length === 2
          ? (player.milestones as unknown as Record<string, unknown>)
          : (player as unknown as Record<string, unknown>);
      const name = parts.at(-1)!;
      before[field as RaidField] = parent[name] ?? null;
      parent[name] = value;
    }
    steps.push({ stage, wallet: player.wallet, before, after: changes });
  };
  const regenerated = regenCharges(structuredClone(originalAttacker));
  step("charge", attacker, {
    raidCharges: charges - 1,
    lastRaidRegenAt:
      now - attacker.lastRaidRegenAt >= CHARGE_REGEN_MS
        ? now
        : attacker.lastRaidRegenAt,
  });
  step("effects", defender, { statEffects: { $raidAbsent: true } });
  step("claim_regen", attacker, {
    claimCharges: regenerated.claimCharges,
    lastClaimRegenAt: regenerated.lastClaimRegenAt,
  });
  if (result.success) {
    step("defender_debit", defender, {
      vault: defender.vault - result.takenFromVault,
      protectionUntil: raidProtectionUntil(now),
    });
    const credited = raidAmount(
      Math.min(
        result.stolen,
        Math.max(0, vaultCapacity(attacker.vaultStaked) - attacker.vault),
      ),
    );
    step("attacker_credit", attacker, {
      vault: attacker.vault + credited,
      notoriety: attacker.notoriety + credited,
      xp: attacker.xp + result.xp,
      "milestones.raids": attacker.milestones.raids + 1,
      "milestones.raidWins": attacker.milestones.raidWins + 1,
      "milestones.totalStolen": attacker.milestones.totalStolen + credited,
    });
    result.stolen = credited;
    result.notorietyGained = credited;
    result.destroyed = raidAmount(result.takenFromVault - credited);
  } else if (result.reason === "failed") {
    const deducted = raidAmount(
      Math.min(result.riskAmount, Math.max(0, attacker.vault)),
    );
    if (deducted > 0) {
      step("risk_debit", attacker, {
        vault: Math.max(0, attacker.vault - deducted),
      });
      step("defender_notoriety", defender, {
        notoriety: defender.notoriety + deducted,
      });
    }
    result.riskAmount = deducted;
    result.defenderNotorietyGained = deducted;
  }
  const { serverSeed, ...publicResult } = result;
  let journal: RaidSettlement = {
    version: 1,
    key,
    attacker: wallet,
    defender: target,
    time: now,
    seed,
    serverSeed,
    inputs: { attacker: originalAttacker, defender: originalDefender },
    steps,
    result: publicResult,
    social: {
      defenderEffects: summarizeStatEffects(originalDefender.statEffects),
      attackerEffects: summarizeStatEffects(originalAttacker.statEffects),
    },
  };
  journal = JSON.parse(JSON.stringify(journal)) as RaidSettlement;
  return journal;
}

/** Internal evidence verification, using original inputs and execution context only. */
export function validateRaidSettlement(
  journal: RaidSettlement,
  wallet: string,
  target: string,
  seed: string,
  key: string,
): void {
  if (
    journal.version !== 1 ||
    journal.key !== key ||
    journal.attacker !== wallet ||
    journal.defender !== target ||
    journal.seed !== seed ||
    journal.time !== gameActionNow() ||
    journal.serverSeed !==
      (journal.result.reason === "blocked" ? "" : gameActionSeed())
  )
    throw new RaidEvidenceConflict("Conflicting raid journal identity");
  try {
    const expected = buildRaidSettlement(
      journal.inputs.attacker as PlayerRecord,
      journal.inputs.defender as PlayerRecord,
      seed,
      key,
    );
    if (!isDeepStrictEqual(expected, journal))
      throw new Error("Raid plan changed");
  } catch (cause) {
    throw new RaidEvidenceConflict("Invalid raid journal evidence", cause);
  }
}
