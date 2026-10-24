/** Private persistence contracts. Never select these fields into a public DTO. */
export class RaidEvidenceConflict extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "RaidEvidenceConflict";
  }
}
export const RAID_STAGES = [
  "preparation",
  "plan",
  "charge",
  "effects",
  "claim_regen",
  "defender_debit",
  "attacker_credit",
  "risk_debit",
  "defender_notoriety",
  "log",
  "counters",
  "receipt",
  "cleanup",
] as const;
export type RaidStage = (typeof RAID_STAGES)[number];
export type RaidField =
  | "raidCharges"
  | "lastRaidRegenAt"
  | "claimCharges"
  | "lastClaimRegenAt"
  | "statEffects"
  | "vault"
  | "protectionUntil"
  | "notoriety"
  | "xp"
  | "milestones.raids"
  | "milestones.raidWins"
  | "milestones.totalStolen";
export interface RaidStep {
  stage: RaidStage;
  wallet: string;
  before: Partial<Record<RaidField, unknown>>;
  after: Partial<Record<RaidField, unknown>>;
}
export interface RaidSettlement {
  version: 1;
  key: string;
  attacker: string;
  defender: string;
  time: number;
  seed: string;
  serverSeed: string;
  inputs: Record<string, unknown>;
  steps: RaidStep[];
  result: Record<string, unknown> & { success: boolean };
  social: {
    defenderEffects: Record<string, number>;
    attackerEffects: Record<string, number>;
  };
}
export interface ActiveRaid {
  version: 1;
  key: string;
  steps: RaidStep[];
}
