import { useTransactionStore } from "@/features/stores/transactionStore";
vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: vi.fn(async () => {}),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  storageName: "",
  migrate: undefined as unknown,
  merge: null as null | ((saved: unknown, current: unknown) => unknown),
  login: vi.fn(),
  meStatus: vi.fn(),
  transfer: vi.fn(),
  me: vi.fn(),
  confirmation: vi.fn(),
}));
vi.mock("zustand/middleware", async (original) => {
  const actual = await original<typeof import("zustand/middleware")>();
  return {
    ...actual,
    persist: (
      creator: Parameters<typeof actual.persist>[0],
      options: Parameters<typeof actual.persist>[1],
    ) => {
      mocks.storageName = options.name;
      mocks.migrate = options.migrate;
      mocks.merge = options.merge as (
        saved: unknown,
        current: unknown,
      ) => unknown;
      return actual.persist(creator, options);
    },
  };
});
vi.mock("@/features/events/frontend/authenticate-wallet/client", () => ({
  authenticateWallet: mocks.login,
  resolveMeStatus: mocks.meStatus,
  restoreWalletSession: vi.fn(),
}));
vi.mock("@/features/events/frontend/reset-wallet-state/client", () => ({
  resetWalletState: vi.fn(),
}));
vi.mock("@/lib/utils/hive/wallet", () => ({
  getHiveTreasuryAccount: () => "treasury",
}));
vi.mock(
  "@/lib/chains/modules/hive/wallet/events/transfer-native/action",
  () => ({ transferNative: mocks.transfer }),
);
vi.mock("@/lib/api/client", () => ({
  generateChallenge: vi.fn(),
  verifySignature: vi.fn(),
  setAuthToken: vi.fn(),
  getMe: mocks.me,
  loadAuthToken: vi.fn(),
}));
vi.mock(
  "@/features/events/frontend/confirm-transaction/client",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/events/frontend/confirm-transaction/client")
    >()),
    waitForTransaction: mocks.confirmation,
    TransactionRejected: class extends Error {},
  }),
);
import { PaymentBroadcastUncertain } from "@/lib/utils/hive/payment";
import { REGISTRATION_FEE_HIVE } from "@/lib/config/constants/game";
import { useAuthStore } from "@/features/stores/authStore";
let sequence = 0;
beforeEach(() => {
  useTransactionStore.getState().begin(null);
  vi.useFakeTimers();
  vi.clearAllMocks();
  useAuthStore.setState({
    address: "registration" + sequence++,
    mode: "wallet",
    connectedAt: sequence,
    isRegistered: false,
    registrationPhase: "idle",
  });
  mocks.transfer.mockResolvedValue({ transactionId: "transaction1" });
  mocks.confirmation.mockResolvedValue({ receipt: { status: "success" } });
});
afterEach(() => vi.useRealTimers());
describe("registration observed independently", () => {
  it("confirms only after authoritative player data", async () => {
    mocks.me
      .mockResolvedValueOnce({ ok: true, player: { isRegistered: false } })
      .mockResolvedValue({ ok: true, player: { isRegistered: true } });
    await useAuthStore.getState().registerPlayer();
    expect(mocks.transfer).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isRegistered).toBe(true);
    expect(mocks.transfer).toHaveBeenCalledWith({
      username: expect.any(String),
      account: "treasury",
      amount: REGISTRATION_FEE_HIVE.toFixed(3),
      symbol: "HIVE",
      action: "registration",
      metadata: {},
    });
  });
  it("does not pay if already registered", async () => {
    mocks.me.mockResolvedValue({ ok: true, player: { isRegistered: true } });
    await useAuthStore.getState().registerPlayer();
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it("resumes confirmation after timeout without another transfer", async () => {
    mocks.me.mockResolvedValue({ ok: true, player: { isRegistered: false } });
    mocks.confirmation.mockRejectedValueOnce(
      new Error("Still awaiting processing"),
    );
    const first = expect(
      useAuthStore.getState().registerPlayer(),
    ).rejects.toThrow("Still awaiting processing");
    await vi.runAllTimersAsync();
    await first;
    expect(useAuthStore.getState().isRegistered).toBe(false);
    mocks.me
      .mockResolvedValueOnce({ ok: true, player: { isRegistered: false } })
      .mockResolvedValue({ ok: true, player: { isRegistered: true } });
    await useAuthStore.getState().registerPlayer();
    expect(mocks.transfer).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isRegistered).toBe(true);
  });
  it("ignores a confirmation for the previous account", async () => {
    mocks.me
      .mockResolvedValueOnce({ ok: true, player: { isRegistered: false } })
      .mockResolvedValue({ ok: true, player: { isRegistered: false } });
    mocks.transfer.mockImplementation(async () => {
      useAuthStore.setState({
        address: "other",
        connectedAt: 999,
        isRegistered: false,
      });
      return { transactionId: "transaction1" };
    });
    await expect(useAuthStore.getState().registerPlayer()).rejects.toThrow(
      "Wallet session changed",
    );
    expect(useAuthStore.getState().isRegistered).toBe(false);
  });
  it("does not confirm a cancelled payment", async () => {
    mocks.me.mockResolvedValue({ ok: true, player: { isRegistered: false } });
    mocks.transfer.mockRejectedValue(new Error("Cancelled"));
    await expect(useAuthStore.getState().registerPlayer()).rejects.toThrow(
      "Cancelled",
    );
    expect(useAuthStore.getState().registrationPhase).toBe("idle");
    expect(useAuthStore.getState().isRegistered).toBe(false);
  });
});

describe("wallet-only persisted authentication", () => {
  it("uses the Chainframe storage namespace without migrating earlier sessions", () => {
    expect(mocks.storageName).toBe("chainframe-auth");
    expect(mocks.migrate).toBeUndefined();
  });
  it("rejects a previously saved demo session", () => {
    const current = {
      ...useAuthStore.getState(),
      address: null,
      username: null,
      mode: null,
      apiConnected: null,
    };
    const merged = mocks.merge!(
      { mode: "demo", address: "demo-player", isRegistered: true },
      current,
    );
    expect(merged).toMatchObject({ address: null, mode: null });
  });
  it("restores only wallet identity and requires new authoritative checks", () => {
    const current = useAuthStore.getState();
    const merged = mocks.merge!(
      {
        mode: "wallet",
        address: "alice",
        isRegistered: true,
        apiConnected: true,
      },
      current,
    );
    expect(merged).toMatchObject({
      address: "alice",
      isRegistered: null,
      apiConnected: null,
    });
    expect((merged as { connectedAt: number }).connectedAt).toBeGreaterThan(
      current.connectedAt!,
    );
  });
});

it("assigns a new identity to same-wallet reconnects even within the same millisecond", async () => {
  vi.setSystemTime(2000);
  mocks.login.mockResolvedValue({ address: "alice", token: "token" });
  mocks.meStatus.mockResolvedValue({ isRegistered: true, referredBy: null });
  await useAuthStore.getState().connectWallet("alice");
  const first = useAuthStore.getState().connectedAt!;
  useAuthStore.getState().disconnect();
  await useAuthStore.getState().connectWallet("alice");
  expect(useAuthStore.getState().connectedAt).toBeGreaterThan(first);
});

it("applies the server-confirmed referrer captured by the login workflow", async () => {
  mocks.login.mockResolvedValue({ address: "dmarx", token: "token", refUsername: "corven" });
  mocks.meStatus.mockResolvedValue({ isRegistered: false, referredBy: "corven" });
  await useAuthStore.getState().connectWallet("dmarx");
  expect(mocks.meStatus).toHaveBeenCalledWith("corven");
  expect(useAuthStore.getState()).toMatchObject({ address: "dmarx", referredBy: "corven", isRegistered: false });
});

it("discards an earlier login attempt even before either session has finished connecting", async () => {
  let first!: (value: unknown) => void;
  mocks.login
    .mockReturnValueOnce(
      new Promise((r) => {
        first = r;
      }),
    )
    .mockResolvedValueOnce({ address: "bob", token: "bob-token" });
  mocks.meStatus.mockResolvedValue({ isRegistered: true, referredBy: null });
  const stale = expect(
    useAuthStore.getState().connectWallet("alice"),
  ).rejects.toThrow("Wallet session changed");
  await useAuthStore.getState().connectWallet("bob");
  first({ address: "alice", token: "alice-token" });
  await stale;
  expect(useAuthStore.getState().address).toBe("bob");
});

it("does not sign a second registration after successful submission without an ID", async () => {
  mocks.me.mockResolvedValue({ ok: true, player: { isRegistered: false } });
  mocks.transfer.mockRejectedValue(new PaymentBroadcastUncertain());
  await expect(useAuthStore.getState().registerPlayer()).rejects.toThrow(
    "without a transaction id",
  );
  await expect(useAuthStore.getState().registerPlayer()).rejects.toThrow(
    "without a transaction id",
  );
  expect(mocks.transfer).toHaveBeenCalledOnce();
  expect(mocks.confirmation).not.toHaveBeenCalled();
});
