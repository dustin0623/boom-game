import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PrivateKey } from "@hiveio/dhive";
const lookup = vi.hoisted(() => vi.fn());
vi.mock(
  "@/lib/chains/modules/hive/server/events/get-account-authority/action",
  () => ({ getAccountAuthority: lookup }),
);
import { verifyHiveLogin } from "./verify.server";
const key = PrivateKey.fromSeed("provider-login-proof");
const message = "exact challenge\nAccount: @alice";
const signature = (signer = key) =>
  signer.sign(createHash("sha256").update(message).digest()).toString();
const posting = () => ({
  weight_threshold: 1,
  key_auths: [[key.createPublic().toString(), 1]],
  account_auths: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  lookup.mockResolvedValue(posting());
});
describe("Hive provider ownership verification", () => {
  it("verifies an actual signature against the requested account", async () => {
    expect(
      await verifyHiveLogin({
        username: "alice",
        message,
        signature: signature(),
      }),
    ).toEqual({ ok: true });
    expect(lookup).toHaveBeenCalledExactlyOnceWith("alice");
  });
  it("rejects malformed signatures before an account lookup", async () => {
    expect(
      await verifyHiveLogin({
        username: "alice",
        message,
        signature: "forged",
      }),
    ).toEqual({ ok: false, error: "Invalid Hive login signature" });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("rejects altered messages", async () => {
    expect(
      (
        await verifyHiveLogin({
          username: "alice",
          message: message + "tampered",
          signature: signature(),
        })
      ).ok,
    ).toBe(false);
  });
  it("rejects a different account's signing key", async () => {
    expect(
      (
        await verifyHiveLogin({
          username: "alice",
          message,
          signature: signature(PrivateKey.fromSeed("another-account")),
        })
      ).ok,
    ).toBe(false);
  });
  it("checks the requested account rather than the signing account", async () => {
    lookup.mockResolvedValue({
      ...posting(),
      key_auths: [[PrivateKey.fromSeed("bob").createPublic().toString(), 1]],
    });
    expect(
      (
        await verifyHiveLogin({
          username: "bob",
          message,
          signature: signature(),
        })
      ).ok,
    ).toBe(false);
    expect(lookup).toHaveBeenCalledWith("bob");
  });
  it("rejects insufficient Posting key weight", async () => {
    lookup.mockResolvedValue({ ...posting(), weight_threshold: 2 });
    expect(
      await verifyHiveLogin({
        username: "alice",
        message,
        signature: signature(),
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("multi-signature"),
    });
  });
  it("does not accept Active keys or delegated authority as sufficient Posting proof", async () => {
    lookup.mockResolvedValue({
      weight_threshold: 1,
      key_auths: [],
      account_auths: [["delegate", 1]],
      active: posting(),
    });
    expect(
      await verifyHiveLogin({
        username: "alice",
        message,
        signature: signature(),
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("Delegated") });
  });
  it("preserves unavailable authority feedback", async () => {
    lookup.mockRejectedValue(Error("RPC timeout"));
    expect(
      await verifyHiveLogin({
        username: "alice",
        message,
        signature: signature(),
      }),
    ).toEqual({
      ok: false,
      error: "Hive account authority is unavailable; try again",
    });
  });
});
