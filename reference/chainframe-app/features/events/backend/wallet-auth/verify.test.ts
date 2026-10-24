vi.mock("@/lib/config/config", async (original) => ({
  config: {
    ...(await original<typeof import("@/lib/config/config")>()).config,
    jwtSecret: "configured-test-only-secret-with-32-bytes-minimum",
  },
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
const state = vi.hoisted(() => ({
  nonces: new Map<string, { hash: string; expiresAt: number }>(),
  issue: vi.fn(),
  consume: vi.fn(),
  ownership: vi.fn(),
  recover: vi.fn(),
  authority: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@/lib/modules/players/server.repository", () => ({
  playerRepository: {
    issueLoginNonce: state.issue,
    consumeLoginNonce: state.consume,
  },
}));

vi.mock("@/lib/utils/hive/signature.server", () => ({
  recoverHiveSigningKey: state.recover,
  verifyPostingAuthority: state.ownership,
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/get-account-authority/action",
  () => ({ getAccountAuthority: state.authority }),
);
vi.mock("@/lib/auth/jwt", () => ({ createSession: state.token }));
import { generateLoginChallenge } from "@/features/events/backend/wallet-auth/challenge";
import { verifyLoginSignature } from "./verify";
import { validateLoginResponse } from "@/lib/auth/login.server";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  state.nonces.clear();
  state.ownership.mockReturnValue({ ok: true });
  state.recover.mockReturnValue({ ok: true, publicKey: "public-key" });
  state.authority.mockResolvedValue({
    weight_threshold: 1,
    key_auths: [["public-key", 1]],
    account_auths: [],
  });
  state.token.mockResolvedValue("token");
  state.issue.mockImplementation(async (wallet, hash, expiresAt) => {
    state.nonces.set(wallet, { hash, expiresAt });
  });
  state.consume.mockImplementation(async (wallet, hash, expiresAt, now) => {
    const record = state.nonces.get(wallet);
    if (
      !record ||
      record.hash !== hash ||
      record.expiresAt !== expiresAt ||
      expiresAt <= now
    )
      return false;
    state.nonces.delete(wallet);
    return true;
  });
});
function response(message: string, username = "alice", overrides = {}) {
  return JSON.stringify({
    success: true,
    username,
    message,
    authority: "posting",
    signature: "signature",
    ...overrides,
  });
}
describe("player login nonce workflow", () => {
  it("stores a normalized strong nonce hash without issuing a token", async () => {
    const message = await generateLoginChallenge(" ALICE ");
    expect(message).not.toMatch(/[\r\n]/);
    const match =
      /^Chainframe login v1\|alice\|([a-f0-9]{64})\|\d+\|[A-Za-z0-9_-]{43}$/.exec(
        message,
      );
    expect(match).not.toBeNull();
    const raw = match![1];
    expect(raw).toHaveLength(64);
    expect(state.nonces.get("alice")?.hash).toHaveLength(64);
    expect(state.nonces.get("alice")?.hash).not.toBe(raw);
    expect(state.nonces.get("alice")?.expiresAt).toBeGreaterThan(Date.now());
    expect(state.token).not.toHaveBeenCalled();
  });
  it("accepts a valid unexpired legacy challenge during the rollout window", async () => {
    const jti = "a".repeat(64);
    const expiresAt = Math.floor((Date.now() + 5 * 60 * 1000) / 1000) * 1000;
    const body = [
      "Sign in to Chainframe",
      "Account: @alice",
      `Code: ${jti}`,
      `Expires: ${Math.floor(expiresAt / 1000)}`,
    ].join("\n");
    const secret = "configured-test-only-secret-with-32-bytes-minimum";
    const message = `${body}\nSig: ${createHmac("sha256", secret)
      .update(body)
      .digest("base64url")}`;
    state.nonces.set("alice", {
      hash: createHash("sha256").update(jti).digest("hex"),
      expiresAt,
    });

    expect(await verifyLoginSignature("alice", response(message))).toMatchObject(
      { ok: true, token: "token" },
    );
  });
  it("verifies ownership before consuming and creating a session", async () => {
    const message = await generateLoginChallenge("alice");
    expect(await verifyLoginSignature("alice", response(message))).toEqual({
      ok: true,
      token: "token",
      payload: { wallet: "alice", username: "alice" },
    });
    expect(state.recover).toHaveBeenCalledWith(message, "signature");
    expect(state.authority).toHaveBeenCalledWith("alice");
    expect(state.ownership).toHaveBeenCalledWith(
      "public-key",
      expect.objectContaining({ weight_threshold: 1 }),
    );
    expect(state.consume.mock.invocationCallOrder[0]).toBeGreaterThan(
      state.ownership.mock.invocationCallOrder[0],
    );
    expect(state.token.mock.invocationCallOrder[0]).toBeGreaterThan(
      state.consume.mock.invocationCallOrder[0],
    );
  });
  it("consumes a challenge once under concurrent requests", async () => {
    const signed = response(await generateLoginChallenge("alice"));
    const outcomes = await Promise.all([
      verifyLoginSignature("alice", signed),
      verifyLoginSignature("alice", signed),
    ]);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(state.token).toHaveBeenCalledOnce();
  });
  it("rejects a replaced challenge and accepts its replacement", async () => {
    const first = response(await generateLoginChallenge("alice")),
      second = response(await generateLoginChallenge("alice"));
    expect((await verifyLoginSignature("alice", first)).ok).toBe(false);
    expect((await verifyLoginSignature("alice", second)).ok).toBe(true);
  });
  it("rejects expiry, wrong wallet, malformed response and tampering without consuming", async () => {
    const message = await generateLoginChallenge("alice");
    expect((await verifyLoginSignature("bob", response(message))).ok).toBe(
      false,
    );
    expect((await verifyLoginSignature("alice", "{}")).ok).toBe(false);
    expect(
      (
        await verifyLoginSignature(
          "alice",
          response(message.replace("|alice|", "|bob|")),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyLoginSignature(
          "alice",
          response(message, "alice", { authority: "active" }),
        )
      ).ok,
    ).toBe(false);
    const parsed = validateLoginResponse("alice", response(message));
    if (!parsed.ok) throw Error("invalid fixture");
    vi.useFakeTimers();
    vi.setSystemTime(parsed.expiresAt);
    expect((await verifyLoginSignature("alice", response(message))).ok).toBe(
      false,
    );
    vi.useRealTimers();
    expect(state.consume).not.toHaveBeenCalled();
    expect(state.token).not.toHaveBeenCalled();
  });
  it("does not consume a nonce when cryptographic verification or RPC lookup fails", async () => {
    const signed = response(await generateLoginChallenge("alice"));
    state.ownership.mockReturnValue({
      ok: false,
      error: "Invalid Hive signature",
    });
    expect((await verifyLoginSignature("alice", signed)).ok).toBe(false);
    expect(state.consume).not.toHaveBeenCalled();
    expect(state.nonces.has("alice")).toBe(true);
  });
  it("does not consume a challenge when account lookup is unavailable", async () => {
    const signed = response(await generateLoginChallenge("alice"));
    state.authority.mockRejectedValue(Error("RPC timeout"));
    expect(await verifyLoginSignature("alice", signed)).toMatchObject({
      ok: false,
      error: expect.stringContaining("unavailable"),
    });
    expect(state.consume).not.toHaveBeenCalled();
    expect(state.ownership).not.toHaveBeenCalled();
  });
  it("rejects malformed proof before looking up an account", async () => {
    const signed = response(await generateLoginChallenge("alice"));
    state.recover.mockReturnValue({
      ok: false,
      error: "Invalid Hive login signature",
    });
    expect((await verifyLoginSignature("alice", signed)).ok).toBe(false);
    expect(state.authority).not.toHaveBeenCalled();
    expect(state.consume).not.toHaveBeenCalled();
  });
  it("does not restore a consumed nonce if JWT creation fails", async () => {
    const signed = response(await generateLoginChallenge("alice"));
    state.token.mockRejectedValueOnce(Error("JWT unavailable"));
    await expect(verifyLoginSignature("alice", signed)).rejects.toThrow(
      "JWT unavailable",
    );
    expect((await verifyLoginSignature("alice", signed)).ok).toBe(false);
  });
});
