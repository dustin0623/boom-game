// template/lib/database/mock/player-repository.ts
import { gameActionNow } from "@/lib/utils/game/execution-context.server";
import { raidAmount } from "@/features/types/game/exposure";
import { isStatEffectTarget } from "@/features/types/game/stat-effects";
import type { PlayerRepository, TickPatch } from "./types";
import { getFixtureState, seedFixturePlayer } from "./store";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createFixturePlayerRepository(): PlayerRepository {
  return {
    async issueLoginNonce(wallet, hash, expiresAt) {
      let player = getFixtureState().players.get(wallet);
      if (!player) {
        seedFixturePlayer({
          wallet,
          isRegistered: false,
          profileInitialized: false,
        });
        player = getFixtureState().players.get(wallet)!;
      }
      player.loginNonce = hash;
      player.loginNonceExpiresAt = expiresAt;
    },
    async consumeLoginNonce(wallet, hash, expiresAt, now) {
      const player = getFixtureState().players.get(wallet);
      if (
        !player ||
        player.loginNonce !== hash ||
        player.loginNonceExpiresAt !== expiresAt ||
        expiresAt <= now
      )
        return false;
      delete player.loginNonce;
      delete player.loginNonceExpiresAt;
      return true;
    },
    async listReferred(wallet) {
      return [...getFixtureState().players.values()]
        .filter((p) => p.referredBy === wallet)
        .map((p) => ({
          username: p.username,
          wallet: p.wallet,
          registrationTime: p.registrationTime,
        }));
    },
    async setCosmetic(wallet, kind, templateId) {
      const player = getFixtureState().players.get(wallet);
      if (!player) throw new Error("Player not found");
      const field = {
        avatar: "equippedAvatarId",
        banner: "equippedBannerId",
        background: "equippedBackgroundId",
      } as const;
      player[field[kind]] = templateId;
    },
    async reserveRaidCharge(wallet, now, regenMs, maxCharges) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return { ok: false };
      const count = Math.max(
        0,
        Math.floor((now - player.lastRaidRegenAt) / regenMs),
      );
      player.raidCharges = Math.min(maxCharges, player.raidCharges + count);
      if (count > 0) player.lastRaidRegenAt = now;
      if (player.raidCharges < 1) return { ok: false };
      player.raidCharges--;
      return { ok: true, raidCharges: player.raidCharges };
    },
    async claimRaidDefender(wallet, amount, now, protectionUntil) {
      const player = getFixtureState().players.get(wallet);
      if (!player || player.vault < amount || player.protectionUntil > now)
        return { ok: false };
      player.vault -= amount;
      player.protectionUntil = protectionUntil;
      return { ok: true };
    },
    async creditRaidProceeds(wallet, input) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return { ok: false, credited: 0 };
      const credited = raidAmount(
        Math.min(
          raidAmount(input.received),
          Math.max(0, input.capacity - player.vault),
        ),
      );
      player.vault += credited;
      player.notoriety += credited;
      player.xp += input.xp;
      player.milestones.raids++;
      player.milestones.raidWins++;
      player.milestones.totalStolen += credited;
      return { ok: true, credited };
    },
    async debitRaidRisk(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return { ok: false, deducted: 0 };
      const deducted = raidAmount(Math.min(raidAmount(amount), player.vault));
      player.vault = Math.max(0, player.vault - deducted);
      return { ok: true, deducted };
    },
    async recordClaimChargeRegen(wallet, charges, at) {
      const player = getFixtureState().players.get(wallet);
      if (player) {
        player.claimCharges = charges;
        player.lastClaimRegenAt = at;
      }
    },
    async incrementRaidFields(wallet, fields) {
      const player = getFixtureState().players.get(wallet);
      if (player) {
        player.vault += fields.vault ?? 0;
        player.notoriety += fields.notoriety ?? 0;
      }
    },
    async creditSparks(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player) throw new Error("Player not found");
      player.sparks += amount;
    },
    async setEquipment(wallet, slot, itemId) {
      const player = getFixtureState().players.get(wallet);
      if (!player) throw new Error("Player not found");
      player.equipment[slot] = itemId;
    },
    async findByWallet(wallet) {
      const player = getFixtureState().players.get(wallet);
      return player ? clone(player) : null;
    },

    async findOrCreate(wallet) {
      const existing = getFixtureState().players.get(wallet);
      if (existing) return clone(existing);
      return clone(seedFixturePlayer({ wallet }));
    },

    async debitHash(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player || player.hash < amount) return { ok: false };
      player.hash -= amount;
      return { ok: true };
    },

    async creditHash(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.hash += amount;
    },

    async debitSparks(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player || player.sparks < amount) return { ok: false };
      player.sparks -= amount;
      return { ok: true };
    },

    async applyStatSabotage(wallet, effect) {
      const player = getFixtureState().players.get(wallet);
      if (!player || !isStatEffectTarget(effect.stat)) return { ok: false };
      if (player.statEffects?.[effect.stat]?.active === true)
        return { ok: false };
      player.statEffects = {
        ...(player.statEffects ?? {}),
        [effect.stat]: clone(effect),
      };
      return { ok: true };
    },

    async replaceStatEffect(wallet, expected, next) {
      const player = getFixtureState().players.get(wallet);
      if (
        !player ||
        !isStatEffectTarget(expected.stat) ||
        next.stat !== expected.stat
      )
        return { ok: false };
      const stored = player.statEffects?.[expected.stat];
      const unchanged =
        stored?.active === true &&
        stored.appliedAt === expected.appliedAt &&
        stored.appliedBy === expected.appliedBy &&
        stored.helps.length === expected.helps.length;
      if (!unchanged) return { ok: false };
      player.statEffects = {
        ...player.statEffects,
        [expected.stat]: clone(next),
      };
      return { ok: true };
    },

    async clearStatEffects(wallet) {
      const player = getFixtureState().players.get(wallet);
      const before = player?.statEffects ? clone(player.statEffects) : {};
      if (player) delete player.statEffects;
      return before;
    },

    async creditReferralHash(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player) throw new Error("Referrer not found");
      player.hash += amount;
      player.referralEarned += amount;
    },

    async touchSink(wallet) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.lastSinkAt = gameActionNow();
    },

    async markRegistered(wallet, txId, startingHash) {
      if (!Number.isSafeInteger(startingHash) || startingHash <= 0)
        throw new Error("Invalid registration HASH grant");
      const player =
        getFixtureState().players.get(wallet) ?? seedFixturePlayer({ wallet });
      if (player.isRegistered) return { changed: false, minerate: 0 };
      player.hash += startingHash;
      player.isRegistered = true;
      player.registrationTxId = txId;
      player.registeredAt = gameActionNow();
      player.lastTickAt =
        player.lastSinkAt =
        player.lastClaimRegenAt =
        player.lastRaidRegenAt =
          gameActionNow();
      return { changed: true, minerate: player.statLevels.hashRate };
    },

    async applyTick(wallet, patch: TickPatch) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.vault = patch.vault;
      player.stats = patch.stats;
      player.lastTickAt = patch.lastTickAt;
      player.milestones.totalMined = patch.milestones.totalMined;
      player.milestones.bestHashRate = patch.milestones.bestHashRate;
      player.version = patch.version;
    },

    async recordClaim(wallet, claimed) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.hash += claimed;
      player.milestones.totalClaimed += claimed;
      player.claimCharges -= 1;
      player.vault = 0;
      player.lastSinkAt = gameActionNow();
    },

    async recordStake(wallet, amount) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.vaultStaked += amount;
      player.version += 1;
      player.lastSinkAt = gameActionNow();
    },

    async addXp(wallet, xp) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.xp += xp;
    },

    async recordStatUpgrade(wallet, stat, nextLevel, xpGain) {
      const player = getFixtureState().players.get(wallet);
      if (!player) return;
      player.statLevels[stat] = nextLevel;
      player.stats[stat] = nextLevel;
      player.lastSinkAt = gameActionNow();
      player.lastUpgradeTime = gameActionNow();
      player.version += 1;
      player.xp += xpGain;
    },
  };
}
