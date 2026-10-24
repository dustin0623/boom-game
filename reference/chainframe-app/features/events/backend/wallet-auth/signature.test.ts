vi.mock("@/lib/config/config", async (original) => ({
  config: {
    ...(await original<typeof import("@/lib/config/config")>()).config,
    jwtSecret: "configured-test-only-secret-with-32-bytes-minimum",
  },
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PrivateKey } from "@hiveio/dhive";
const m = vi.hoisted(() => ({
  authority: vi.fn(),
  consume: vi.fn(),
  token: vi.fn(),
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/get-account-authority/action",
  () => ({ getAccountAuthority: m.authority }),
);
vi.mock("@/lib/modules/players/server.repository", () => ({
  playerRepository: { consumeLoginNonce: m.consume },
}));
vi.mock("@/lib/auth/jwt", () => ({ createSession: m.token }));
import { buildLoginChallenge } from "@/lib/auth/login.server";
import { verifyLoginSignature } from "./verify";
const key = PrivateKey.fromSeed("actual-login-proof");
function response(signingKey = key, username = "alice") {
  const challenge = buildLoginChallenge(username);
  const signature = signingKey
    .sign(createHash("sha256").update(challenge.message).digest())
    .toString();
  return JSON.stringify({
    success: true,
    username,
    message: challenge.message,
    signature,
    authority: "posting",
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.authority.mockResolvedValue({
    weight_threshold: 1,
    key_auths: [[key.createPublic().toString(), 1]],
    account_auths: [],
  });
  m.consume.mockResolvedValue(true);
  m.token.mockResolvedValue("token");
});
describe("login feature with actual cryptographic proof", () => {
  it.each(["player123", "player-one", "player.one", "abc.def-123"])(
    "verifies ownership and creates the matching session for %s",
    async (username) => {
      const result = await verifyLoginSignature(
        username,
        response(key, username),
      );
      expect(result).toMatchObject({
        ok: true,
        token: "token",
        payload: { wallet: username, username },
      });
      expect(m.authority).toHaveBeenCalledWith(username);
      expect(m.consume).toHaveBeenCalledWith(
        username,
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
      );
      expect(m.token).toHaveBeenCalledWith({ wallet: username, username });
    },
  );
  it("verifies before consuming and creating a bearer session", async () => {
    expect(await verifyLoginSignature("alice", response())).toMatchObject({
      ok: true,
      token: "token",
    });
    expect(m.consume.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.authority.mock.invocationCallOrder[0],
    );
    expect(m.token.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.consume.mock.invocationCallOrder[0],
    );
  });
  it("rejects another account's signature without consuming the nonce", async () => {
    expect(
      (
        await verifyLoginSignature(
          "alice",
          response(PrivateKey.fromSeed("wrong-wallet")),
        )
      ).ok,
    ).toBe(false);
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.token).not.toHaveBeenCalled();
  });
  it("rejects insufficient authority without consuming", async () => {
    m.authority.mockResolvedValue({
      weight_threshold: 2,
      key_auths: [[key.createPublic().toString(), 1]],
      account_auths: [],
    });
    expect((await verifyLoginSignature("alice", response())).ok).toBe(false);
    expect(m.consume).not.toHaveBeenCalled();
  });
});
