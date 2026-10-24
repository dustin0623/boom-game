vi.mock("@/features/events/backend/tick-player/action", () => ({ settleTick: vi.fn(async () => {}) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import { gameStatsRepository } from "@/lib/modules/game-stats/server.repository";
import {
  upgradeStatInput,
  upgradeStat,
  MAX_BULK_UPGRADE_LEVELS,
} from "./action";
vi.mock("@/lib/modules/players/server.repository", () => ({
  playerRepository: {
    findByWallet: vi.fn(),
    debitHash: vi.fn(),
    recordStatUpgrade: vi.fn(),
  },
}));
vi.mock("@/lib/modules/logs/server.repository", () => ({
  logRepository: { create: vi.fn() },
}));
vi.mock("@/lib/modules/game-stats/server.repository", () => ({
  gameStatsRepository: { increment: vi.fn() },
}));
vi.mock("@/lib/utils/database/operation.server", () => ({
  withDatabaseOperation: (execute: () => Promise<unknown>) => execute(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(playerRepository.findByWallet).mockResolvedValue({
    hash: 100,
    isRegistered: true,
    statLevels: { hashRate: 1, security: 1, hackPower: 1 },
  } as never);
  vi.mocked(playerRepository.debitHash).mockResolvedValue({ ok: true });
});
describe("stat upgrade contract", () => {
  it("defaults one upgrade and rejects invalid signed quantities or stat names", () => {
    expect(upgradeStatInput.parse({ stat: "hashRate" }).levels).toBe(1);
    for (const levels of [0, 1.5, MAX_BULK_UPGRADE_LEVELS + 1])
      expect(
        upgradeStatInput.safeParse({ stat: "hashRate", levels }).success,
      ).toBe(false);
    expect(upgradeStatInput.safeParse({ stat: "unknown" }).success).toBe(false);
  });
});
describe("authoritative stat upgrades", () => {
  it("rejects zero or excessive workflow counts before reading a player", async () => {
    expect((await upgradeStat("alice", "hashRate", 0)).ok).toBe(false);
    expect(
      (await upgradeStat("alice", "hashRate", MAX_BULK_UPGRADE_LEVELS + 1)).ok,
    ).toBe(false);
    expect(playerRepository.findByWallet).not.toHaveBeenCalled();
  });
  it("keeps trusted workflow count flooring distinct from signed input validation", async () => {
    expect(await upgradeStat("alice", "hashRate", 1.5)).toMatchObject({
      ok: true,
      levels: 1,
      cost: 1,
    });
  });
  it("rejects a missing player without spending", async () => {
    vi.mocked(playerRepository.findByWallet).mockResolvedValue(null);
    expect(await upgradeStat("alice", "hashRate")).toEqual({
      ok: false,
      error: "Player not found",
    });
    expect(playerRepository.debitHash).not.toHaveBeenCalled();
  });
  it("rejects a fractional shortfall and a lost debit race without upgrading", async () => {
    vi.mocked(playerRepository.findByWallet).mockResolvedValueOnce({
      hash: 0.9999,
      statLevels: { hashRate: 1 },
    } as never);
    expect((await upgradeStat("alice", "hashRate")).ok).toBe(false);
    expect(playerRepository.debitHash).not.toHaveBeenCalled();
    vi.mocked(playerRepository.debitHash).mockResolvedValueOnce({ ok: false });
    expect((await upgradeStat("alice", "hashRate")).ok).toBe(false);
    expect(playerRepository.recordStatUpgrade).not.toHaveBeenCalled();
    expect(logRepository.create).not.toHaveBeenCalled();
    expect(gameStatsRepository.increment).not.toHaveBeenCalled();
  });
  it("spends an exact one-HASH balance once, awards ten XP and records the charge", async () => {
    vi.mocked(playerRepository.findByWallet).mockResolvedValueOnce({
      hash: 1,
      isRegistered: true,
      statLevels: { hashRate: 1 },
    } as never);
    expect(await upgradeStat("alice", "hashRate")).toEqual({
      ok: true,
      cost: 1,
      levels: 1,
    });
    expect(playerRepository.debitHash).toHaveBeenCalledExactlyOnceWith(
      "alice",
      1,
    );
    expect(playerRepository.recordStatUpgrade).toHaveBeenCalledExactlyOnceWith(
      "alice",
      "hashRate",
      2,
      10,
    );
    expect(logRepository.create).toHaveBeenCalledWith({
      type: "stat_upgrade",
      wallet: "alice",
      amount: -1,
      data: { stat: "hashRate", from: 1, to: 2, levels: 1 },
    });
    expect(gameStatsRepository.increment).toHaveBeenCalledExactlyOnceWith(
      "globalMinerate",
      1,
    );
  });
  it("debits a bulk purchase once and adds only its actual minerate delta", async () => {
    vi.mocked(playerRepository.findByWallet).mockResolvedValueOnce({
      hash: 61,
      isRegistered: true,
      statLevels: { hashRate: 5 },
    } as never);
    expect(await upgradeStat("alice", "hashRate", 2)).toEqual({
      ok: true,
      cost: 61,
      levels: 2,
    });
    expect(playerRepository.debitHash).toHaveBeenCalledExactlyOnceWith(
      "alice",
      61,
    );
    expect(playerRepository.recordStatUpgrade).toHaveBeenCalledExactlyOnceWith(
      "alice",
      "hashRate",
      7,
      610,
    );
    expect(logRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -61,
        data: { stat: "hashRate", from: 5, to: 7, levels: 2 },
      }),
    );
    expect(gameStatsRepository.increment).toHaveBeenCalledExactlyOnceWith(
      "globalMinerate",
      2,
    );
  });
  it("does not count unregistered or non-mining upgrades toward global minerate", async () => {
    await upgradeStat("alice", "security");
    vi.mocked(playerRepository.findByWallet).mockResolvedValueOnce({
      hash: 1,
      isRegistered: false,
      statLevels: { hashRate: 1 },
    } as never);
    await upgradeStat("alice", "hashRate");
    expect(gameStatsRepository.increment).not.toHaveBeenCalled();
  });
});
