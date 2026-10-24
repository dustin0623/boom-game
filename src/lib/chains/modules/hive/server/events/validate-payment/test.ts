import { describe, it, expect, vi } from "vitest";
import { validatePayment } from "./action";
import type { HiveClient } from "../../../client";

const TXID = "7b064a84a968caddd2496f3270f0cecafb954217";

function mockClient(result: unknown = { status: "success", success: true }) {
  const validate = vi.fn().mockResolvedValue(result);
  return { client: { payments: { validate } } as unknown as HiveClient, validate };
}

describe("validatePayment", () => {
  it("confirms a matching payment", async () => {
    const { client } = mockClient();
    const res = await validatePayment({
      transactionId: TXID,
      expected: { account: "bob", symbol: "HIVE", quantity: "10.000", action: "deposit" },
      client,
    });
    expect(res).toMatchObject({ ok: true, data: { status: "success" } });
  });

  it("reports a failed sidechain execution without throwing", async () => {
    const { client } = mockClient({ status: "failed", success: false, error: "insufficient balance" });
    const res = await validatePayment({ transactionId: TXID, client });
    expect(res.ok && res.data.status).toBe("failed");
  });

  it("reports a not-found transaction", async () => {
    const { client } = mockClient({ status: "not_found", success: false });
    const res = await validatePayment({ transactionId: TXID, client });
    expect(res.ok && res.data.status).toBe("not_found");
  });

  it("rejects a malformed transaction id", async () => {
    const { client } = mockClient();
    expect((await validatePayment({ transactionId: "abc", client })).ok).toBe(false);
  });

  it("rejects a non-decimal expected quantity", async () => {
    const { client } = mockClient();
    expect((await validatePayment({ transactionId: TXID, expected: { quantity: "ten" }, client })).ok).toBe(false);
  });

  it("surfaces validator failures", async () => {
    const { client, validate } = mockClient();
    validate.mockRejectedValue(new Error("sidechain unreachable"));
    expect(await validatePayment({ transactionId: TXID, client })).toMatchObject({ ok: false });
  });
});
