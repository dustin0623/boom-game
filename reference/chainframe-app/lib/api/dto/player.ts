import { resolvedPlayerStats } from "@/features/types/game/stats";
import type { StatBlock } from "@/features/types/game/types";
import type { PlayerRecord, IPlayer } from "@/lib/modules/players/server.types";
import {
  DEFAULT_AVATAR_TEMPLATE_ID,
  DEFAULT_BANNER_TEMPLATE_ID,
  DEFAULT_BACKGROUND_TEMPLATE_ID,
} from "@/features/types/game/templates";
import {
  decayMultiplier,
  miningPerSecond,
} from "@/features/types/game/mining";
import {
  effectiveStatValue,
  publicStatEffects,
} from "@/features/types/game/stat-effects";

type DtoPlayer = PlayerRecord | IPlayer;

function resolveProfile(player: DtoPlayer) {
  return {
    avatar: player.equippedAvatarId ?? DEFAULT_AVATAR_TEMPLATE_ID,
    banner: player.equippedBannerId ?? DEFAULT_BANNER_TEMPLATE_ID,
    background: player.equippedBackgroundId ?? DEFAULT_BACKGROUND_TEMPLATE_ID,
  };
}

export function toPlayerDto(player: DtoPlayer, stats: StatBlock = resolvedPlayerStats(player, [])) {
  const profile = resolveProfile(player);
  return {
    profile,
    address: player.wallet,
    username: player.username,
    registrationTime: player.registrationTime,
    xp: player.xp,
    level: player.level,
    hash: player.hash,
    sparks: player.sparks,
    vault: player.vault,
    vaultStaked: player.vaultStaked,
    notoriety: player.notoriety,
    statLevels: player.statLevels,
    stats,
    // Derived, not stored: HASH/sec is always a pure function of the current
    // effective hash rate (stats.hashRate) + idle decay, so it's computed
    // fresh here rather than persisted as a separate DB field that could
    // drift out of sync with the stats it's derived from.
    minerate: miningPerSecond(
      effectiveStatValue(stats.hashRate, player.statEffects?.hashRate),
      decayMultiplier(player.lastSinkAt),
    ),
    statEffects: publicStatEffects(player.statEffects),
    lastTickAt: player.lastTickAt,
    lastSinkAt: player.lastSinkAt,
    claimCharges: player.claimCharges,
    lastClaimRegenAt: player.lastClaimRegenAt,
    raidCharges: player.raidCharges,
    lastRaidRegenAt: player.lastRaidRegenAt,
    lastUpgradeTime: player.lastUpgradeTime,
    raidCooldown: player.raidCooldown,
    milestones: {
      totalClaimed: player.milestones?.totalClaimed ?? 0,
      totalMined: player.milestones?.totalMined ?? 0,
      raids: player.milestones?.raids ?? 0,
      raidWins: player.milestones?.raidWins ?? 0,
      totalStolen: player.milestones?.totalStolen ?? 0,
      bestHashRate: player.milestones?.bestHashRate ?? 1,
    },
    protectionUntil: player.protectionUntil,
    version: player.version,
    referredBy: player.referredBy ?? null,
    referralCount: player.referralCount ?? 0,
    referralEarned: player.referralEarned ?? 0,
    withdrawnToday: player.withdrawnToday ?? 0,
    withdrawResetAt: player.withdrawResetAt ?? 0,
    isRegistered: player.isRegistered ?? false,
    registeredAt: player.registeredAt ?? null,
  };
}
