import { beforeEach, describe, expect, it, vi } from "vitest";
import { hiveClient } from "@/lib/chains/modules/hive/client";
const calls = vi.hoisted(() => ({
  token: vi.fn(),
  native: vi.fn(),
  execution: vi.fn(),
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-token-execution/action",
  () => ({ verifyTokenExecution: calls.execution }),
);
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: { treasuryAccount: "treasury", marketAccount: "market" },
  },
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-token-payment/action",
  () => ({ verifyTokenPayment: calls.token }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/verify-native-payment/action",
  () => ({ verifyNativePayment: calls.native }),
);
import { verifyTreasuryTransfer } from "./verify.server";
it.each([
  { accountAlias: undefined },
  { from: undefined },
  { accountAlias: "unknown" },
])(
  "refuses missing or unsupported signing evidence before RPC lookup: %j",
  async (missing) => {
    await expect(
      verifyTreasuryTransfer(
        { ...intent, ...missing } as unknown as Parameters<
          typeof verifyTreasuryTransfer
        >[0],
        "tx",
      ),
    ).rejects.toThrow("Signing account");
    expect(calls.token).not.toHaveBeenCalled();
    expect(calls.native).not.toHaveBeenCalled();
  },
);
const intent = {
  accountAlias: "treasury" as const,
  from: "treasury",
  to: "alice",
  symbol: "HASH",
  quantity: "1.000",
  memo: "Chainframe withdrawal origin",
};
const payment = {
  transactionId: "tx",
  status: "confirmed",
  success: true,
  from: "treasury",
  to: "alice",
  symbol: "HASH",
  amount: "1.000",
  memo: JSON.stringify({
    action: "withdrawal",
    metadata: { memo: intent.memo },
  }),
  blockNumber: 100,
  operationIndex: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(hiveClient, "resolveAccount").mockImplementation(
    (alias) => ({ account: alias }) as never,
  );
  calls.token.mockResolvedValue(payment);
});
describe("treasury intent verification", () => {
  it.each([
    {},
    { to: "seller" },
    { amount: "0.095" },
    { from: "treasury" },
    { memo: "changed" },
  ])("requires exact market-to-treasury fee evidence: %j", async (change) => {
    const fee = {
      ...intent,
      accountAlias: "market" as const,
      from: "market",
      to: "treasury",
      symbol: "HIVE",
      quantity: "0.005",
      memo: "Chainframe marketplace fee source",
    };
    calls.native.mockResolvedValue({
      ...payment,
      from: "market",
      to: "treasury",
      symbol: "HIVE",
      amount: "0.005",
      memo: JSON.stringify({
        action: "withdrawal",
        metadata: { memo: fee.memo },
      }),
      ...change,
    });
    if (!Object.keys(change).length)
      expect(await verifyTreasuryTransfer(fee, "tx", 2)).toMatchObject({
        status: "confirmed",
      });
    else
      await expect(verifyTreasuryTransfer(fee, "tx", 2)).rejects.toThrow(
        "match",
      );
  });
  it.each(["issue", "transfer"] as const)(
    "verifies explicit %s using exact canonical token evidence",
    async (operation) => {
      calls.execution.mockResolvedValue(payment);
      expect(
        await verifyTreasuryTransfer({ ...intent, operation }, "tx", 2),
      ).toMatchObject({ status: "confirmed" });
      expect(calls.execution).toHaveBeenCalledExactlyOnceWith({
        transactionId: "tx",
        operation,
        operationIndex: 2,
        expected: {
          from: "treasury",
          account: "alice",
          symbol: "HASH",
          quantity: "1.000",
          memo: payment.memo,
        },
      });
      expect(calls.token).not.toHaveBeenCalled();
    },
  );
  it("parks a changed SDK alias before performing transfer lookup", async () => {
    vi.mocked(hiveClient.resolveAccount).mockReturnValue({
      account: "other",
    } as never);
    await expect(
      verifyTreasuryTransfer(
        { ...intent, from: "market", accountAlias: "market" },
        "tx",
      ),
    ).rejects.toThrow(/SDK signing account/);
    expect(calls.native).not.toHaveBeenCalled();
    expect(calls.token).not.toHaveBeenCalled();
  });
  it("verifies market sender evidence independently from treasury", async () => {
    const market = {
      ...intent,
      symbol: "HIVE",
      accountAlias: "market" as const,
      from: "market",
      quantity: "0.095",
    };
    calls.native.mockResolvedValue({
      ...payment,
      from: "market",
      symbol: "HIVE",
      amount: "0.095",
      memo: JSON.stringify({
        action: "withdrawal",
        metadata: { memo: intent.memo },
      }),
    });
    expect(await verifyTreasuryTransfer(market, "tx", 2)).toMatchObject({
      status: "confirmed",
    });
    expect(calls.native).toHaveBeenCalledWith({
      transactionId: "tx",
      expected: { from: "market", account: "alice", symbol: "HIVE" },
      requireTransferEvidence: true,
    });
    calls.native.mockResolvedValue({
      ...payment,
      symbol: "HIVE",
      amount: "0.095",
    });
    await expect(verifyTreasuryTransfer(market, "tx", 2)).rejects.toThrow(
      /match/,
    );
  });
  it.each([undefined, "former-market"])(
    "parks absent or changed market sender %s before lookup",
    async (from) => {
      await expect(
        verifyTreasuryTransfer(
          {
            ...intent,
            symbol: "HIVE",
            accountAlias: "market",
            from,
          } as unknown as Parameters<typeof verifyTreasuryTransfer>[0],
          "tx",
        ),
      ).rejects.toThrow(/Signing account/);
      expect(calls.native).not.toHaveBeenCalled();
    },
  );
  it("verifies exact token intent and requires Engine evidence", async () => {
    expect(await verifyTreasuryTransfer(intent, "tx", 2)).toMatchObject({
      status: "confirmed",
      evidence: { blockNumber: 100, operationIndex: 2 },
    });
    expect(calls.token).toHaveBeenCalledWith({
      transactionId: "tx",
      expected: { from: "treasury", account: "alice", symbol: "HASH" },
      requireTransferEvidence: true,
    });
  });
  it.each([
    { transactionId: "other" },
    { from: "bob" },
    { to: "bob" },
    { symbol: "OTHER" },
    { amount: "2.000" },
    { memo: "different" },
    { operationIndex: 1 },
    { blockNumber: undefined },
    { blockNumber: -1 },
    { operationIndex: -1 },
    { success: false },
  ])("parks mismatched or unproven evidence %j", async (change) => {
    calls.token.mockResolvedValue({ ...payment, ...change });
    await expect(verifyTreasuryTransfer(intent, "tx", 2)).rejects.toThrow(
      /match|proven/,
    );
  });
  it("waits without declaring success or failure", async () => {
    calls.token.mockResolvedValue({ status: "pending" });
    expect(await verifyTreasuryTransfer(intent, "tx")).toEqual({
      status: "pending",
    });
  });
  it("parks invalid or ambiguous submissions instead of waiting indefinitely", async () => {
    calls.token.mockResolvedValue({ status: "pending", invalid: true });
    await expect(verifyTreasuryTransfer(intent, "tx")).rejects.toThrow(
      "invalid or ambiguous",
    );
  });
  it("accepts only a proven definitive failure", async () => {
    calls.token.mockResolvedValue({
      ...payment,
      status: "failed",
      success: false,
    });
    await expect(verifyTreasuryTransfer(intent, "tx")).rejects.toThrow(
      "not proven",
    );
    calls.token.mockResolvedValue({
      ...payment,
      status: "failed",
      success: false,
      failureProven: true,
    });
    expect(await verifyTreasuryTransfer(intent, "tx")).toMatchObject({
      status: "failed",
    });
  });
  it("uses native verification with the existing refund envelope", async () => {
    const native = { ...intent, symbol: "HIVE" };
    calls.native.mockResolvedValue({
      ...payment,
      symbol: "HIVE",
      memo: JSON.stringify({
        action: "refund",
        metadata: { memo: intent.memo },
      }),
    });
    expect(await verifyTreasuryTransfer(native, "tx")).toMatchObject({
      status: "confirmed",
    });
    expect(calls.token).not.toHaveBeenCalled();
  });
});
