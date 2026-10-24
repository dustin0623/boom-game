import { describe, it, expect, vi } from "vitest";
import { transferToken } from "./action";
import type { HiveClient } from "../../../client";

function mockClient(available = true) {
  const requestTransfer = vi.fn().mockResolvedValue({ success: true, transactionId: "tx-keychain", raw: {} });
  const client = {
    keychain: { isAvailable: () => available, requestTransfer },
    builder: { buildPayload: (p: unknown) => p, serialize: (p: unknown) => JSON.stringify(p) },
  } as unknown as HiveClient;
  return { client, requestTransfer };
}

describe("wallet transferToken (Keychain)", () => {
  it("sends a Layer 1 transfer through Keychain", async () => {
    const { client, requestTransfer } = mockClient();
    const res = await transferToken({ from: "alice", to: "bob", amount: "1.000", symbol: "HIVE", action: "buy", client });
    expect(res).toMatchObject({ ok: true, data: { transactionId: "tx-keychain", layer: 1 } });
    expect(requestTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice", to: "bob", currency: "HIVE", amount: "1.000" }),
    );
  });

  it("routes a Hive Engine symbol as Layer 2", async () => {
    const { client } = mockClient();
    const res = await transferToken({ from: "alice", to: "bob", amount: "5.000", symbol: "SCRAP", action: "buy", client });
    expect(res.ok && res.data.layer).toBe(2);
  });

  it("requires a username", async () => {
    const { client } = mockClient();
    const res = await transferToken({ to: "bob", amount: "1.000", symbol: "HIVE", action: "buy", client } as never);
    expect(res.ok).toBe(false);
  });

  it("fails clearly when Keychain is missing", async () => {
    const { client } = mockClient(false);
    const res = await transferToken({ from: "alice", to: "bob", amount: "1.000", symbol: "HIVE", action: "buy", client });
    expect(res).toMatchObject({ ok: false });
  });

  it("rejects a non-decimal amount", async () => {
    const { client } = mockClient();
    const res = await transferToken({ from: "alice", to: "bob", amount: "lots", symbol: "HIVE", action: "buy", client });
    expect(res.ok).toBe(false);
  });
});
