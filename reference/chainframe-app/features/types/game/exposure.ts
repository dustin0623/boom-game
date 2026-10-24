import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import { exploitFromNotoriety } from "./stats";

export type Rng = () => number;

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** D4: uniform roll in `[raidExposureMin, raidExposureMax]` from the supplied seeded rng. */
export const rollBaseExposure = (rng: Rng): number => {
  const { raidExposureMin, raidExposureMax } = SOCIAL_ECONOMY;
  const roll = clampNumber(finiteOr(rng(), 0), 0, 1);
  return raidExposureMin + roll * (raidExposureMax - raidExposureMin);
};

/**
 * Total Exploit used for critical rolls: the Notoriety-derived Exploit
 * (`exploitFromNotoriety`, unchanged) plus the gear total. No new stat.
 */
export const totalExploit = (notoriety: number, gearExploit = 0): number =>
  exploitFromNotoriety(finiteOr(notoriety, 0)) +
  Math.max(0, finiteOr(gearExploit, 0));

/** D5: `clamp(totalExploit, 0, 100) / 100`. Exploit 0 never crits, Exploit 100 always crits. */
export const critChanceFromExploit = (exploit: number): number =>
  clampNumber(finiteOr(exploit, 0), 0, 100) / 100;

export interface ExposureInput {
  /** Base exposure from `rollBaseExposure`. Clamped to `[0, raidExposureCap]`. */
  baseExposure: number;
  /** Total Exploit (see `totalExploit`). */
  exploit: number;
  rng: Rng;
}

export interface ExposureResult {
  exposure: number;
  critical: boolean;
}

/** Normal: exposure equals base. Critical: `min(base x multiplier, cap)`. */
export const resolveExposure = ({
  baseExposure,
  exploit,
  rng,
}: ExposureInput): ExposureResult => {
  const { raidCriticalMultiplier, raidExposureCap } = SOCIAL_ECONOMY;
  const base = clampNumber(finiteOr(baseExposure, 0), 0, raidExposureCap);
  const critical = rng() < critChanceFromExploit(exploit);
  const exposure = critical
    ? Math.min(base * raidCriticalMultiplier, raidExposureCap)
    : base;
  return { exposure, critical };
};

export interface TransferInput {
  defenderVault: number;
  exposure: number;
  /** Free space left in the attacker's vault. */
  attackerFreeSpace: number;
}

export interface TransferResult {
  /** Leaves the defender's vault. */
  takenFromVault: number;
  /** Credited to the attacker, capped by free space. */
  received: number;
  /** Excess above the attacker's free space; leaves the defender and is not credited to anyone. */
  destroyed: number;
}

/** Round raid transfers down to vault precision, absorbing only boundary float noise. */
export const raidAmount = (value: number): number =>
  Math.floor(Math.max(0, finiteOr(value, 0)) * 1_000_000 + 1e-7) / 1_000_000;

export const resolveTransfer = ({
  defenderVault,
  exposure,
  attackerFreeSpace,
}: TransferInput): TransferResult => {
  const vault = raidAmount(defenderVault);
  const share = clampNumber(
    finiteOr(exposure, 0),
    0,
    SOCIAL_ECONOMY.raidExposureCap,
  );
  const freeSpace = raidAmount(attackerFreeSpace);

  const takenFromVault = Math.min(vault, raidAmount(vault * share));
  const received = Math.min(takenFromVault, freeSpace);
  return {
    takenFromVault,
    received,
    destroyed: raidAmount(takenFromVault - received),
  };
};
