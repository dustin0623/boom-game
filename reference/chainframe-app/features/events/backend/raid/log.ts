import { logRepository } from "@/lib/modules/logs/server.repository";
import { gameActionCorrelationKey } from "@/lib/utils/game/execution-context.server";

import type {
  RaidResult,
  RaidSocialAudit,
} from "@/features/events/backend/raid/calculations.server";
export async function logRaid(
  attacker: string,
  defender: string,
  result: RaidResult,
  clientSeed: string,
  serverSeed: string,
  social?: RaidSocialAudit,
) {
  await logRepository.create({
    settlementKey: `raid:${gameActionCorrelationKey()}`,
    settlementPending: true,
    type: "raid",
    wallet: attacker,
    target: defender,
    amount: result.stolen,
    seed: clientSeed,
    data: {
      attacker,
      defender,
      success: result.success,
      riskAmount: result.riskAmount,
      defenderNotorietyGained: result.defenderNotorietyGained,
      defenderEffects: social?.defenderEffects ?? {},
      attackerEffects: social?.attackerEffects ?? {},
      reason: result.reason,
      chance: result.chance,
      stealPercent: result.stealPercent,
      exposure: result.exposure,
      critical: result.critical,
      takenFromVault: result.takenFromVault,
      destroyed: result.destroyed,
      notorietyGained: result.notorietyGained,
      xp: result.xp,
      serverSeed, // recorded post-hoc for provable-fairness audits
    },
  });
}
