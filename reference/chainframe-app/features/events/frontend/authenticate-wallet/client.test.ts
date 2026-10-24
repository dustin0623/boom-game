vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: vi.fn(async (current: () => boolean) => {
    if (!current()) throw new Error("Wallet session changed before signing");
  }),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: Object.assign(
    (selector: (state: { available: boolean }) => unknown) =>
      selector({ available: true }),
    { getState: () => ({ available: true, set: vi.fn() }) },
  ),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  connect: vi.fn(),
  sign: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  token: vi.fn(),
  load: vi.fn(),
  me: vi.fn(),
}));
vi.mock("@/lib/chains/providers/hive/connect", () => ({
  connectHive: m.connect,
}));
vi.mock("@/lib/chains/providers/hive/sign", () => ({
  signHiveLogin: m.sign,
}));
vi.mock("@/lib/api/client", () => ({
  generateChallenge: m.challenge,
  verifySignature: m.verify,
  setAuthToken: m.token,
  loadAuthToken: m.load,
  getMe: m.me,
}));
import {
  authenticateWallet,
  resolveMeStatus,
  restoreWalletSession,
} from "./client";
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  m.connect.mockResolvedValue({ address: "alice" });
  m.challenge.mockResolvedValue({ ok: true, nonce: "challenge" });
  m.sign.mockResolvedValue("signature");
  m.verify.mockResolvedValue({ ok: true, token: "token" });
  m.me.mockResolvedValue({
    ok: true,
    player: { address: "alice", isRegistered: true, referredBy: null },
  });
});
describe("client wallet authentication", () => {
  it("captures the join link before Keychain and forwards it to the authenticated profile read", async () => {
    const location = { search: "?join=%20CORVEN%20" };
    vi.stubGlobal("window", { location });
    m.sign.mockImplementation(async () => {
      location.search = "";
      return "signature";
    });
    const result = await authenticateWallet("alice");
    expect(result.refUsername).toBe("corven");
    m.me.mockResolvedValue({
      ok: true,
      player: { address: "alice", isRegistered: false, referredBy: "corven" },
    });
    expect(await resolveMeStatus(result.refUsername)).toEqual({
      isRegistered: false,
      referredBy: "corven",
    });
    expect(m.me).toHaveBeenCalledWith("corven");
  });
  it.each(["", "?join=", "?join=%3Cscript%3E", "?join=corven%26ref%3Dbob"])(
    "ignores malformed or absent referral input %s",
    async (search) => {
      vi.stubGlobal("window", { location: { search } });
      await resolveMeStatus();
      expect(m.me).toHaveBeenCalledWith(null);
    },
  );
  it("restores the intended wallet before attempting referral attribution", async () => {
    vi.stubGlobal("window", { location: { search: "?join=corven" } });
    m.load.mockReturnValue("token");
    m.me
      .mockResolvedValueOnce({
        ok: true,
        player: { address: "alice", isRegistered: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        player: { address: "alice", isRegistered: false, referredBy: "corven" },
      });
    expect(await restoreWalletSession("alice", () => true)).toMatchObject({
      apiConnected: true,
      referredBy: "corven",
    });
    expect(m.me.mock.calls).toEqual([[], ["corven"]]);
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("never attaches a link to a saved bearer belonging to a different wallet", async () => {
    vi.stubGlobal("window", { location: { search: "?join=corven" } });
    m.load.mockReturnValue("other-token");
    m.me
      .mockResolvedValueOnce({
        ok: true,
        player: { address: "bob", isRegistered: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        player: { address: "alice", isRegistered: false, referredBy: "corven" },
      });
    expect(await restoreWalletSession("alice", () => true)).toMatchObject({
      referredBy: "corven",
    });
    expect(m.me.mock.calls).toEqual([[], ["corven"]]);
    expect(m.token).toHaveBeenCalledWith(null);
    expect(m.connect).toHaveBeenCalledWith("alice");
  });
  it("rejects session replacement before the referral-attribution request", async () => {
    vi.stubGlobal("window", { location: { search: "?join=corven" } });
    m.load.mockReturnValue("token");
    let current = true;
    m.me.mockImplementation(async () => {
      current = false;
      return { ok: true, player: { address: "alice", isRegistered: false } };
    });
    await expect(restoreWalletSession("alice", () => current)).rejects.toThrow(
      "Wallet session changed",
    );
    expect(m.me.mock.calls).toEqual([[]]);
    expect(m.token).not.toHaveBeenCalled();
  });
  it("returns an authenticated result for guarded store application", async () => {
    expect(await authenticateWallet(" ALICE ")).toEqual({
      address: "alice",
      token: "token",
      refUsername: null,
    });
    expect(m.connect).toHaveBeenCalledWith("alice");
    expect(m.sign).toHaveBeenCalledExactlyOnceWith("alice", "challenge");
    expect(m.challenge.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.connect.mock.invocationCallOrder[0],
    );
    expect(m.sign.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.challenge.mock.invocationCallOrder[0],
    );
    expect(m.verify.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.sign.mock.invocationCallOrder[0],
    );
    expect(m.token).not.toHaveBeenCalled();
  });
  it("preserves Keychain cancellation errors", async () => {
    m.sign.mockRejectedValue(new Error("Cancelled"));
    await expect(authenticateWallet("alice")).rejects.toThrow("Cancelled");
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("shows challenge failures without opening Keychain", async () => {
    m.challenge.mockResolvedValue({ ok: false, error: "Database unavailable" });
    await expect(authenticateWallet("alice")).rejects.toThrow(
      "Database unavailable",
    );
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.token).not.toHaveBeenCalled();
  });
  it.each([
    "Signature does not match this account's Posting authority",
    "Invalid, expired, superseded or already used sign-in challenge",
    "Hive account authority is unavailable; try again",
  ])("preserves the server's verification failure: %s", async (error) => {
    m.verify.mockResolvedValue({ ok: false, error });
    await expect(authenticateWallet("alice")).rejects.toThrow(error);
    expect(m.sign).toHaveBeenCalledOnce();
    expect(m.verify).toHaveBeenCalledOnce();
    expect(m.token).not.toHaveBeenCalled();
  });
  it("rejects an incomplete challenge without signing", async () => {
    m.challenge.mockResolvedValue({ ok: true });
    await expect(authenticateWallet("alice")).rejects.toThrow(
      "Could not request a sign-in challenge",
    );
    expect(m.sign).not.toHaveBeenCalled();
  });
  it("rejects verification without a token", async () => {
    m.verify.mockResolvedValue({ ok: true });
    await expect(authenticateWallet("alice")).rejects.toThrow(
      "Could not verify your wallet with the server",
    );
    expect(m.token).not.toHaveBeenCalled();
  });
  it("reuses a valid token without signing again", async () => {
    m.load.mockReturnValue("token");
    expect(await restoreWalletSession("alice", () => true)).toMatchObject({
      apiConnected: true,
      isRegistered: true,
    });
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("withholds a restored session and token after an account change", async () => {
    await expect(restoreWalletSession("alice", () => false)).rejects.toThrow(
      "Wallet session changed",
    );
    expect(m.token).not.toHaveBeenCalled();
  });
});

it("does not apply a saved token belonging to another wallet", async () => {
  m.load.mockReturnValue("bob-token");
  m.me
    .mockResolvedValueOnce({
      ok: true,
      player: { address: "bob", isRegistered: true },
    })
    .mockResolvedValue({
      ok: true,
      player: { address: "alice", isRegistered: false },
    });
  const restored = await restoreWalletSession("alice", () => true);
  expect(m.connect).toHaveBeenCalledWith("alice");
  expect(restored).toMatchObject({ apiConnected: true, isRegistered: false });
  expect(m.token).toHaveBeenCalledWith(null);
});
