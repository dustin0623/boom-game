import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  type PlayerRecord,
  getFixtureRepositories,
} from "@/tests/fixtures/persistence";

import { claimVault } from "./action";
import {
  tickPlayer,
  tickPatch,
} from "@/features/events/backend/tick-player/action";

vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: vi.fn(),
}));
vi.mock("@/features/events/backend/tick-player/action", () => ({
  tickPlayer: vi.fn(),
  tickPatch: vi.fn(),
}));

const mockedFindPlayerByWallet = vi.fn();
const mockedApplyTick = vi.fn();
const mockedRecordClaim = vi.fn();
const mockedCreateLog = vi.fn();
const mockedClearStatEffects = vi.fn();
const mockedIncrementStat = vi.fn();
const mockedTickPlayer = vi.mocked(tickPlayer);
const mockedTickPatch = vi.mocked(tickPatch);

vi.mocked(getFixtureRepositories).mockReturnValue({
  players: {
    recordClaimChargeRegen: vi.fn(),
    findByWallet: mockedFindPlayerByWallet,
    applyTick: mockedApplyTick,
    recordClaim: mockedRecordClaim,
    clearStatEffects: mockedClearStatEffects,
  },
  logs: { create: mockedCreateLog },
  gameStats: { increment: mockedIncrementStat },
} as never);

function makePlayer(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  const base = {
    wallet: "0xWALLET",
    vault: 0,
    claimCharges: 3,
    lastSinkAt: Date.now(),
    lastClaimRegenAt: Date.now(),
  };
  return { ...base, ...overrides } as unknown as PlayerRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApplyTick.mockResolvedValue(undefined as never);
  mockedRecordClaim.mockResolvedValue(undefined as never);
  mockedCreateLog.mockResolvedValue(undefined as never);
  mockedClearStatEffects.mockResolvedValue({} as never);
  mockedIncrementStat.mockResolvedValue(undefined as never);
});

describe("claimVault", () => {
  it("errors when the player is not found", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(null as never);

    const result = await claimVault("0xWALLET");

    expect(result).toEqual({ ok: false, error: "Player not found" });
    expect(mockedTickPlayer).not.toHaveBeenCalled();
  });

  it("errors when the player has no claim charges", async () => {
    mockedFindPlayerByWallet.mockResolvedValue(
      makePlayer({ claimCharges: 0 }) as never,
    );

    const result = await claimVault("0xWALLET");

    expect(result).toEqual({ ok: false, error: "No claim charges" });
    expect(mockedTickPlayer).not.toHaveBeenCalled();
  });

  it("ticks the player before reading the vault, and errors if it's still empty", async () => {
    const stalePlayer = makePlayer({ vault: 0 });
    const tickedPlayer = makePlayer({ vault: 0 });
    mockedFindPlayerByWallet.mockResolvedValue(stalePlayer as never);
    mockedTickPlayer.mockReturnValue({ player: tickedPlayer, mined: 0 });

    const result = await claimVault("0xWALLET");

    expect(mockedTickPlayer).toHaveBeenCalledWith(stalePlayer, []);
    expect(result).toEqual({ ok: false, error: "Vault is empty" });
    expect(mockedApplyTick).not.toHaveBeenCalled();
  });

  it("persists the tick patch before applying the claim, then claims the full ticked vault", async () => {
    const stalePlayer = makePlayer({ vault: 2, claimCharges: 3 });
    const tickedPlayer = makePlayer({ vault: 12.5, claimCharges: 3 });
    mockedFindPlayerByWallet.mockResolvedValue(stalePlayer as never);
    mockedTickPlayer.mockReturnValue({ player: tickedPlayer, mined: 10.5 });
    const tickPatchValue = {
      vault: 12.5,
      stats: tickedPlayer.stats,
      lastTickAt: tickedPlayer.lastTickAt,
      milestones: { totalMined: 0, bestHashRate: 0 },
      version: 1,
    };
    mockedTickPatch.mockReturnValue(tickPatchValue);

    const result = await claimVault("0xWALLET");

    expect(result).toEqual({ ok: true, claimed: 12.5 });

    // First write: the scoped tick patch, never a full-document $set.
    expect(mockedApplyTick).toHaveBeenCalledWith("0xWALLET", tickPatchValue);

    // Second write: the claim itself — increments hash/totalClaimed,
    // decrements claimCharges, zeroes the vault, and stamps lastSinkAt.
    expect(mockedRecordClaim).toHaveBeenCalledWith("0xWALLET", 12.5);

    expect(mockedCreateLog).toHaveBeenCalledWith({
      type: "claim",
      wallet: "0xWALLET",
      amount: 12.5,
      data: { chargesRemaining: 2 },
    });

    expect(mockedIncrementStat).toHaveBeenCalledWith("totalHashClaimed", 12.5);
  });
});
vi.mock("@/lib/modules/players/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/players/server.repository")
  >()),
  get playerRepository() {
    return getFixtureRepositories().players;
  },
}));
vi.mock("@/lib/modules/logs/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/logs/server.repository")>()),
  get logRepository() {
    return getFixtureRepositories().logs;
  },
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/game-stats/server.repository")
  >()),
  get gameStatsRepository() {
    return getFixtureRepositories().gameStats;
  },
}));
vi.mock("@/lib/utils/database/operation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/utils/database/operation.server")
  >()),
  withDatabasePreparation: (execute: () => Promise<unknown>) => execute(),
  withDatabaseOperation: (execute: () => Promise<unknown>) => {
    const fixtures = getFixtureRepositories();
    return fixtures.transaction ? fixtures.transaction(execute) : execute();
  },
}));
