import { describe, it, expect, vi } from "vitest";
import { getTokenBalance } from "./action";
import type { HiveClient } from "../../../client";

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    rpc: { call: vi.fn().mockResolvedValue([{ name: "alice", balance: "12.345 HIVE", hbd_balance: "6.000 HBD" }]) },
    payments: { engineRpc: { findOne: vi.fn().mockResolvedValue({ balance: "100.000", stake: "5.000" }) } },
    ...overrides,
  } as unknown as HiveClient;
}

describe("getTokenBalance", () => {
  it("reads a native HIVE balance", async () => {
    const res = await getTokenBalance({ account: "alice", symbol: "HIVE", client: mockClient() });
    expect(res).toEqual({ ok: true, data: { account: "alice", symbol: "HIVE", balance: "12.345", stake: null, layer: 1 } });
  });

  it("reads a native HBD balance", async () => {
    const res = await getTokenBalance({ account: "alice", symbol: "HBD", client: mockClient() });
    expect(res.ok && res.data.balance).toBe("6.000");
  });

  it("reads a Hive Engine token balance", async () => {
    const res = await getTokenBalance({ account: "alice", symbol: "SCRAP", client: mockClient() });
    expect(res.ok && res.data).toMatchObject({ balance: "100.000", stake: "5.000", layer: 2 });
  });

  it("defaults a missing Hive Engine balance to zero", async () => {
    const client = mockClient({ payments: { engineRpc: { findOne: vi.fn().mockResolvedValue(null) } } });
    const res = await getTokenBalance({ account: "alice", symbol: "SCRAP", client });
    expect(res.ok && res.data.balance).toBe("0");
  });

  it("rejects an invalid account name", async () => {
    const res = await getTokenBalance({ account: "A!", symbol: "HIVE", client: mockClient() });
    expect(res.ok).toBe(false);
  });

  it("reports a missing account", async () => {
    const client = mockClient({ rpc: { call: vi.fn().mockResolvedValue([]) } });
    const res = await getTokenBalance({ account: "ghost", symbol: "HIVE", client });
    expect(res.ok).toBe(false);
  });

  it("surfaces RPC failures as an error result", async () => {
    const client = mockClient({ rpc: { call: vi.fn().mockRejectedValue(new Error("node down")) } });
    const res = await getTokenBalance({ account: "alice", symbol: "HIVE", client });
    expect(res).toMatchObject({ ok: false, error: "node down" });
  });
});
