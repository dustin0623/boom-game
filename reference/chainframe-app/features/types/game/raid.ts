import { RIVAL_RAID_COOLDOWN_MS } from "@/lib/config/constants/game";
import type { Rival } from "@/features/types/game/types";
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const canRaid = (hackPower: number, enemySecurity: number) =>
  hackPower > enemySecurity;
export const raidSuccessChance = (
  hackPower: number,
  enemySecurity: number,
  firewall = 0,
) => (canRaid(hackPower, enemySecurity) ? 100 - clamp(firewall, 0, 100) : 0);
export const rivalOnCooldown = (rival: Rival, now = Date.now()) =>
  Boolean(
    rival.lastRaidedAt && now - rival.lastRaidedAt < RIVAL_RAID_COOLDOWN_MS,
  );
