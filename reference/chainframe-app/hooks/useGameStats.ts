import { projectVault } from "@/lib/utils/game/mining-projection";
import { useMemo } from "react";

import {
  claimCharges,
  raidCharges,
  type ChargeSnapshot,
} from "@/features/types/game/charges";
import {
  decayMultiplier,
  miningPerSecond,
  secondsUntilFull,
  vaultCapacity,
  vaultFillPercent,
} from "@/features/types/game/mining";
import { derivedBaseStats } from "@/features/types/game/stats";
import { usePlayerStore } from "@/features/stores/playerStore";
import {
  pickEquippedItems,
  useInventoryStore,
} from "@/features/stores/inventoryStore";
import { useNow } from "@/hooks/useNow";
import type { Equipment, StatBlock } from "@/features/types/game/types";

interface GameSnapshot {
  base: StatBlock;
  /** Raw upgrade levels (used for costs); `base` holds the scaled values. */
  levels: StatBlock;
  total: StatBlock;
  gear: StatBlock;
  equippedItems: Equipment[];
  wallet: number;
  vault: number;
  vaultStaked: number;
  capacity: number;
  vaultSpace: number;
  fillPercent: number;
  perSecond: number;
  secondsToFull: number | null;
  isFull: boolean;
  decay: number;
  claims: ChargeSnapshot;
  raids: ChargeSnapshot;
  notoriety: number;
}

/** Derived, read-only view of the whole game state. */
export const useGameStats = (): GameSnapshot => {
  const wallet = usePlayerStore((state) => state.wallet);
  const storedVault = usePlayerStore((state) => state.vault);
  const lastTickAt = usePlayerStore((state) => state.lastTickAt);
  const statEffects = usePlayerStore((state) => state.statEffects);
  const vaultStaked = usePlayerStore((state) => state.vaultStaked);
  const storedStats = usePlayerStore((state) => state.stats);
  const statLevels = usePlayerStore((state) => state.statLevels);
  const notoriety = usePlayerStore((state) => state.notoriety);
  const lastSinkAt = usePlayerStore((state) => state.lastSinkAt);
  const claimChargeCount = usePlayerStore((state) => state.claimCharges);
  const lastClaimRegenAt = usePlayerStore((state) => state.lastClaimRegenAt);
  const raidChargeCount = usePlayerStore((state) => state.raidCharges);
  const lastRaidRegenAt = usePlayerStore((state) => state.lastRaidRegenAt);
  const inventory = useInventoryStore((state) => state.inventory);
  const equipped = useInventoryStore((state) => state.equipped);
  // Keeps charge countdowns and decay live even when the vault stops changing.
  const now = useNow(1000);

  return useMemo(() => {
    const equippedItems = pickEquippedItems(inventory, equipped);
    const base = derivedBaseStats(statLevels, vaultStaked, notoriety);
    const total = { ...storedStats,
      hashRate: storedStats.hashRate * (1 - Math.min(1, Math.max(0, statEffects.hashRate?.strength ?? 0))),
      hackPower: storedStats.hackPower * (1 - Math.min(1, Math.max(0, statEffects.hackPower?.strength ?? 0))),
      security: storedStats.security * (1 - Math.min(1, Math.max(0, statEffects.security?.strength ?? 0))),
    };
    const gear = Object.fromEntries(Object.keys(base).map((key) => [key, Math.max(0, storedStats[key as keyof StatBlock] - base[key as keyof StatBlock])])) as StatBlock;
    const vault = projectVault(
      {
        vault: storedVault,
        vaultStaked,
        lastTickAt,
        lastSinkAt,
        statLevels,
        stats: storedStats,
        statEffects,
      },
      now,
    );
    const capacity = vaultCapacity(vaultStaked, total.hashRate);
    const decay = decayMultiplier(lastSinkAt, now);
    const miningRate = total.hashRate;
    return {
      base,
      levels: statLevels,
      total,
      gear,
      equippedItems,
      wallet,
      vault,
      vaultStaked,
      capacity,
      vaultSpace: Math.max(0, capacity - vault),
      fillPercent: vaultFillPercent(vault, capacity),
      perSecond: miningPerSecond(miningRate, decay),
      secondsToFull: secondsUntilFull(vault, miningRate, vaultStaked, decay),
      isFull: vault >= capacity,
      decay,
      notoriety,
      claims: claimCharges(
        { charges: claimChargeCount, lastRegenAt: lastClaimRegenAt },
        now,
      ),
      raids: raidCharges(
        { charges: raidChargeCount, lastRegenAt: lastRaidRegenAt },
        lastSinkAt,
        now,
      ),
    };
  }, [
    now,
    inventory,
    equipped,
    storedStats,
    statLevels,
    notoriety,
    wallet,
    storedVault,
    lastTickAt,
    statEffects,
    vaultStaked,
    lastSinkAt,
    claimChargeCount,
    lastClaimRegenAt,
    raidChargeCount,
    lastRaidRegenAt,
  ]);
};
