import { resolvedPlayerStats } from "@/features/types/game/stats";
import { vaultAtTime } from "@/features/types/game/mining";
import { effectiveStatValue } from "@/features/types/game/stat-effects";
import type { StatBlock } from "@/features/types/game/types";
import type { IPlayer } from "@/lib/modules/players/server.types";
import {
  DEFAULT_PLAYER_COSMETICS,
  type Rival,
} from "@/features/types/game/types";

import {
  hasActiveSabotageBy,
  publicStatEffects,
} from "@/features/types/game/stat-effects";
import { STAT_EFFECT_TARGETS } from "@/features/types/game/consumables";

export function toRaidTarget(
  p: IPlayer,
  viewer: string,
  at: number,
  stats: StatBlock = resolvedPlayerStats(p, []),
): Rival {
  const effects = publicStatEffects(p.statEffects);
  const activeEffects: NonNullable<Rival["activeEffects"]> = {};
  for (const stat of STAT_EFFECT_TARGETS) {
    const effect = effects[stat];
    if (effect) activeEffects[stat] = effect.strength;
  }
  return {
    id: p.wallet,
    username: p.username,
    avatarSeed: p.wallet,
    address: p.wallet,
    avatar: p.equippedAvatarId ?? DEFAULT_PLAYER_COSMETICS.avatar,
    banner: p.equippedBannerId ?? DEFAULT_PLAYER_COSMETICS.banner,
    background: p.equippedBackgroundId ?? DEFAULT_PLAYER_COSMETICS.background,
    level: p.level,
    claims: p.milestones?.totalClaimed ?? 0,
    attacks: p.milestones?.raids ?? 0,
    hashRate: effectiveStatValue(stats.hashRate, p.statEffects?.hashRate),
    vault: vaultAtTime({ ...p, stats }, at),
    security: effectiveStatValue(stats.security, p.statEffects?.security),
    firewall: stats.firewall,
    hackPower: effectiveStatValue(stats.hackPower, p.statEffects?.hackPower),
    equipped: [],
    raided: false,
    lastRaidedAt: null,
    sabotageActive: Object.keys(activeEffects).length > 0,
    helpBlockedByOwnSabotage: hasActiveSabotageBy(p.statEffects, viewer),
    activeEffects,
  };
}
