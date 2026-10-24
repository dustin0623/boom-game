import { describe, expect, it } from "vitest";
import { createProcessor, mockSuccess } from "./index";
import type { PendingTransactionDocument } from "@/lib/modules/transactions-pending/server.model";

const tx = { transactionId: "abcdef123456", type: "withdraw" } as PendingTransactionDocument;

describe("processor", () => {
  it("routes by type, then fallback", async () => {
    const p = createProcessor({ withdraw: async () => ({ ok: true, onChainTxId: "x" }) });
    expect(await p(tx)).toEqual({ ok: true, onChainTxId: "x" });
    expect(await createProcessor({}, mockSuccess)(tx)).toMatchObject({ ok: true, onChainTxId: "mock-abcdef12" });
  });
  it("fails without retry when no handler matches", async () => {
    expect(await createProcessor({})(tx)).toEqual({
      ok: false,
      error: "No handler for transaction type: withdraw",
      retryable: false,
    });
  });
});
