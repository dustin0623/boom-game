import { describe, it, expect, vi } from "vitest";
import { transferToken } from "./action";
import type { HiveClient } from "../../../client";

function mockClient() {
  const hiveTransfer = vi.fn().mockResolvedValue({ success: true, transactionId: "tx-l1", raw: {} });
  const engineTransfer = vi.fn().mockResolvedValue({ success: true, transactionId: "tx-l2", raw: {} });
  const client = {
    account: (alias: string) => ({ alias }),
    payments: { hive: { transfer: hiveTransfer }, engine: { transfer: engineTransfer } },
  } as unknown as HiveClient;
  return { client, hiveTransfer, engineTransfer };
}

describe("server transferToken (treasury)", () => {
  it("signs Layer 1 with the treasury alias", async () => {
    const { client, hiveTransfer } = mockClient();
    const res = await transferToken({ to: "bob", amount: "2.000", symbol: "HBD", action: "reward", client });
    expect(res).toMatchObject({ ok: true, data: { transactionId: "tx-l1", layer: 1 } });
    expect(hiveTransfer).toHaveBeenCalledWith(expect.objectContaining({ from: { alias: "treasury" } }));
  });

  it("signs Layer 2 via Hive Engine", async () => {
    const { client, engineTransfer } = mockClient();
    const res = await transferToken({ to: "bob", amount: "9.000", symbol: "SCRAP", action: "payout", client });
    expect(res.ok && res.data.transactionId).toBe("tx-l2");
    expect(engineTransfer).toHaveBeenCalledWith(expect.objectContaining({ quantity: "9.000", symbol: "SCRAP" }));
  });

  it("surfaces broadcast failures", async () => {
    const { client, hiveTransfer } = mockClient();
    hiveTransfer.mockRejectedValue(new Error("no key"));
    const res = await transferToken({ to: "bob", amount: "1.000", symbol: "HIVE", action: "x", client });
    expect(res).toMatchObject({ ok: false, error: "no key" });
  });
});
