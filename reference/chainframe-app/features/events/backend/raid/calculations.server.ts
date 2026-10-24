import type { PlayerRecord } from "@/lib/modules/players/server.types";

type IPlayer = Pick<
  PlayerRecord,
  | "wallet"
  | "statLevels"
  | "stats"
  | "vault"
  | "vaultStaked"
  | "notoriety"
  | "claimCharges"
  | "raidCharges"
  | "lastClaimRegenAt"
  | "lastRaidRegenAt"
  | "lastSinkAt"
  | "protectionUntil"
> & { statEffects?: PlayerRecord["statEffects"] };
import {
  MAX_CLAIM_CHARGES,
  MAX_RAID_CHARGES,
  CHARGE_REGEN_MS,
  RIVAL_RAID_COOLDOWN_MS,
} from "@/lib/config/constants/game";
import { vaultCapacity } from "@/features/types/game/mining";
import {
  createSeededRng,
  generateServerSeed,
} from "@/lib/utils/game/rng.server";
import {
  gameActionNow,
  gameActionSeed,
} from "@/lib/utils/game/execution-context.server";
import { raidSuccessChance } from "@/features/types/game/raid";
import {
  resolveExposure,
  resolveTransfer,
  rollBaseExposure,
} from "@/features/types/game/exposure";

import {
  effectiveStatValue,
  netEffectStrength,
  type StatEffects,
} from "@/features/types/game/stat-effects";
import {
  STAT_EFFECT_TARGETS,
  type StatEffectTarget,
} from "@/features/types/game/consumables";

export const RAID_WIN_XP = 10;

/** Net remaining strength per stat, for audit records. Inactive effects are omitted. */
export function summarizeStatEffects(
  effects: StatEffects | null | undefined,
): Partial<Record<StatEffectTarget, number>> {
  const summary: Partial<Record<StatEffectTarget, number>> = {};
  for (const stat of STAT_EFFECT_TARGETS) {
    const net = netEffectStrength(effects?.[stat]);
    if (net > 0) summary[stat] = net;
  }
  return summary;
}

export function regenCharges(player: IPlayer): IPlayer {
  const now = gameActionNow();
  const addClaims = Math.floor(
    (now - player.lastClaimRegenAt) / CHARGE_REGEN_MS,
  );
  const addRaids = Math.floor((now - player.lastRaidRegenAt) / CHARGE_REGEN_MS);

  if (addClaims > 0) {
    player.claimCharges = Math.min(
      MAX_CLAIM_CHARGES,
      player.claimCharges + addClaims,
    );
    player.lastClaimRegenAt = now;
  }
  if (addRaids > 0) {
    player.raidCharges = Math.min(
      MAX_RAID_CHARGES,
      player.raidCharges + addRaids,
    );
    player.lastRaidRegenAt = now;
  }
  return player;
}

export interface RaidResult {
  success: boolean;
  reason: "success" | "blocked" | "failed" | "outmatched";
  chance: number;
  /** Same value as `exposure`; kept so existing log/UI consumers keep working. */
  stealPercent: number;
  /** Final share of the defender's vault taken (after any critical, clamped at the cap). */
  exposure: number;
  critical: boolean;
  /** Leaves the defender's vault. */
  takenFromVault: number;
  /** Actually credited to the attacker (capped by free vault space). */
  stolen: number;
  /** Excess above the attacker's free space; leaves the defender and is credited to nobody. */
  destroyed: number;
  /** Attacker Notoriety awarded: always equal to `stolen`, never `takenFromVault`. */
  notorietyGained: number;
  /** Failed raid only (D2): burned from the attacker's vault and paid to nobody as HASH. */
  riskAmount: number;
  /** Failed raid only: defender Notoriety, equal to the risk amount actually deducted. */
  defenderNotorietyGained: number;
  xp: number;
}

/** Audit record of the Sabotage/Help effect and supporter payouts for one raid. */
export interface RaidSocialAudit {
  /** Net effect strength per stat that this raid consumed from the defender. */
  defenderEffects?: Partial<Record<StatEffectTarget, number>>;
  /** Net effect strength per stat that applied to the attacker (not cleared by their raid). */
  attackerEffects?: Partial<Record<StatEffectTarget, number>>;
}

const emptyOutcome = {
  riskAmount: 0,
  defenderNotorietyGained: 0,
  stealPercent: 0,
  exposure: 0,
  critical: false,
  takenFromVault: 0,
  stolen: 0,
  destroyed: 0,
  notorietyGained: 0,
  xp: 0,
};

/** Stat effects in force for a raid. Omitted sides fall back to the player's stored effects. */
export interface RaidStatEffects {
  attacker?: StatEffects | null;
  defender?: StatEffects | null;
}

/**
 * Only Hack Power (attacker) and Security (defender) are scaled by a stat effect;
 * Exploit, Firewall and the stored base levels are never touched. This is the single
 * eligibility formula: a Sabotage on Hack Power/Security lowers that side, and Help
 * restores it through the same effective value.
 */
export function calculateRaidChance(
  attacker: IPlayer,
  defender: IPlayer,
  effects: RaidStatEffects = {},
): number {
  const attackerEffects = effects.attacker ?? attacker.statEffects ?? {};
  const defenderEffects = effects.defender ?? defender.statEffects ?? {};
  const hackPower = effectiveStatValue(
    attacker.stats.hackPower,
    attackerEffects.hackPower,
  );
  const security = effectiveStatValue(
    defender.stats.security,
    defenderEffects.security,
  );
  return raidSuccessChance(hackPower, security, defender.stats.firewall) / 100;
}

/** Pure raid calculation. It never mutates either player; the route applies the outcome atomically. */
export function simulateRaid(
  attacker: IPlayer,
  defender: IPlayer,
  clientSeed: string,
  options: { statEffects?: RaidStatEffects } = {},
): RaidResult & { serverSeed: string } {
  if (defender.protectionUntil > gameActionNow()) {
    return {
      success: false,
      reason: "blocked",
      chance: 0,
      ...emptyOutcome,
      serverSeed: "",
    };
  }

  const chance = calculateRaidChance(attacker, defender, options.statEffects);
  // The response echoes `chance` back to the client, and this rng is a
  // public/reproducible hash+LCG (see rng.ts) — so if the seed were purely
  // client-supplied, an attacker who knows both wallets (always true; they
  // choose the target) could brute-force seeds offline until one rolls
  // <= chance, guaranteeing a win, and maximize the second roll below for
  // stealPercent too. Mixing in a server seed generated after the request
  // is accepted (never returned to the client) removes that predictability
  // while keeping the client seed as an auditable input (logged below).
  const serverSeed = gameActionSeed() ?? generateServerSeed();
  const rng = createSeededRng(
    `${attacker.wallet}:${defender.wallet}:${clientSeed}:${serverSeed}`,
  );
  const roll = rng();
  const success = roll < chance;

  // Order matters for determinism: base exposure consumes the first rng value
  // after the success roll for BOTH outcomes (a win steals with it, a loss
  // risks with it, D2); resolveExposure consumes exactly one more (crit).
  const baseExposure = rollBaseExposure(rng);

  if (!success) {
    // D2: risk uses the same six-decimal transfer precision as successful loot.
    const { takenFromVault: riskAmount } = resolveTransfer({
      defenderVault: Math.max(0, attacker.vault ?? 0),
      exposure: baseExposure,
      attackerFreeSpace: 0,
    });
    return {
      success: false,
      reason: "failed",
      chance,
      ...emptyOutcome,
      riskAmount,
      defenderNotorietyGained: riskAmount,
      serverSeed,
    };
  }

  const exploit = attacker.stats.exploit;
  const { exposure, critical } = resolveExposure({
    baseExposure,
    exploit,
    rng,
  });

  // Credited amount is capped by the attacker's own free vault space. Any
  // excess above that cap is destroyed — it leaves the defender and is NOT
  // credited to anyone. The defender's stats are never touched by a raid.
  const freeSpace = Math.max(
    0,
    vaultCapacity(attacker.vaultStaked) - attacker.vault,
  );
  const { takenFromVault, received, destroyed } = resolveTransfer({
    defenderVault: defender.vault,
    exposure,
    attackerFreeSpace: freeSpace,
  });

  return {
    success: true,
    reason: "success",
    chance,
    stealPercent: exposure,
    exposure,
    critical,
    takenFromVault,
    stolen: received,
    destroyed,
    notorietyGained: received,
    riskAmount: 0,
    defenderNotorietyGained: 0,
    xp: RAID_WIN_XP,
    serverSeed,
  };
}

/** Defender protection window applied atomically when a raid lands. */
export const raidProtectionUntil = (now: number): number =>
  now + RIVAL_RAID_COOLDOWN_MS;
