import { describe, it, expect, vi, beforeEach } from "vitest";
import { stakeVault, stakeVaultInput } from "./action";
import { getFixtureRepositories } from "@/tests/fixtures/persistence";

vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: vi.fn(),
}));

const mockedDebitHash = vi.fn();
const mockedRecordStake = vi.fn();
const mockedCreateLog = vi.fn();

vi.mocked(getFixtureRepositories).mockReturnValue({
  players: { debitHash: mockedDebitHash, recordStake: mockedRecordStake },
  logs: { create: mockedCreateLog },
} as never);

describe("stakeVaultInput", () => {
  it("accepts a positive amount", () => {
    expect(() => stakeVaultInput.parse({ amount: 50 })).not.toThrow();
  });

  it("rejects a zero or negative amount", () => {
    expect(() => stakeVaultInput.parse({ amount: 0 })).toThrow();
    expect(() => stakeVaultInput.parse({ amount: -10 })).toThrow();
  });
});

describe("stakeVault", () => {
  const wallet = "0xWALLET";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error without touching the player or log when amount is not positive", async () => {
    const result = await stakeVault(wallet, { amount: 0 });

    expect(result).toEqual({ ok: false, error: "Amount must be positive" });
    expect(mockedDebitHash).not.toHaveBeenCalled();
    expect(mockedRecordStake).not.toHaveBeenCalled();
    expect(mockedCreateLog).not.toHaveBeenCalled();
  });

  it("returns an error when the player does not have enough HASH", async () => {
    mockedDebitHash.mockResolvedValue({ ok: false });

    const result = await stakeVault(wallet, { amount: 100 });

    expect(result).toEqual({ ok: false, error: "Not enough HASH" });
    expect(mockedDebitHash).toHaveBeenCalledWith(wallet, 100);
    expect(mockedRecordStake).not.toHaveBeenCalled();
    expect(mockedCreateLog).not.toHaveBeenCalled();
  });

  it("debits HASH, increments vaultStaked, and logs the stake on success", async () => {
    mockedDebitHash.mockResolvedValue({ ok: true });
    mockedRecordStake.mockResolvedValue(undefined as never);
    mockedCreateLog.mockResolvedValue(undefined as never);

    const result = await stakeVault(wallet, { amount: 250 });

    expect(result).toEqual({ ok: true, vaultStaked: 250 });

    expect(mockedDebitHash).toHaveBeenCalledWith(wallet, 250);

    expect(mockedRecordStake).toHaveBeenCalledWith(wallet, 250);

    expect(mockedCreateLog).toHaveBeenCalledWith({
      type: "vault",
      wallet,
      amount: -250,
      data: { event: "stake", vaultStakedGain: 250 },
    });
  });

  it("calls debitHash before recordStake and createLog", async () => {
    const callOrder: string[] = [];
    mockedDebitHash.mockImplementation(async () => {
      callOrder.push("debitHash");
      return { ok: true };
    });
    mockedRecordStake.mockImplementation(async () => {
      callOrder.push("recordStake");
      return undefined as never;
    });
    mockedCreateLog.mockImplementation(async () => {
      callOrder.push("createLog");
      return undefined as never;
    });

    await stakeVault(wallet, { amount: 10 });

    expect(callOrder).toEqual(["debitHash", "recordStake", "createLog"]);
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
