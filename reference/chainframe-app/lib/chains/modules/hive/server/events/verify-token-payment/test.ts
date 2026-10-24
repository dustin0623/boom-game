import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  validate: vi.fn(),
  props: vi.fn(),
  info: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("../../../client", () => ({
  hiveClient: {
    payments: {
      validate: sdk.validate,
      parse: sdk.parse,
      engineRpc: { getTransactionInfo: sdk.info },
    },
    rpc: { getDynamicGlobalProperties: sdk.props },
  },
}));
import { verifyTokenPayment } from "./action";
const input = {
  transactionId: "tx",
  expected: { from: " ALICE ", account: "treasury", symbol: "HASH" },
};
const payment = {
  network: "engine",
  success: true,
  status: "success",
  transactionId: "tx",
  blockNumber: 100,
  operationIndex: 2,
  transfer: {
    from: "alice",
    account: "treasury",
    symbol: "HASH",
    quantity: "1.000",
    memo: '{"action":"anything","metadata":{}}',
  },
  trigger: { action: "anything", metadata: {} },
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.validate.mockResolvedValue(payment);
  sdk.parse.mockResolvedValue([payment]);
  sdk.props.mockResolvedValue({ last_irreversible_block_num: 100 });
  sdk.info.mockResolvedValue({
    logs: JSON.stringify({
      events: [
        {
          event: "transfer",
          data: {
            from: "alice",
            to: "treasury",
            symbol: "HASH",
            quantity: "1.000",
          },
        },
      ],
    }),
  });
});
describe("token payment evidence", () => {
  it("requires matching irreversible Engine transfer execution for treasury payouts", async () => {
    expect(
      await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ success: true, status: "confirmed" });
    expect(sdk.info).toHaveBeenCalledExactlyOnceWith("tx");
  });
  it.each(["", "{}", '{"events":[]}'])(
    "keeps missing or mismatched Engine execution uncertain: %s",
    async (logs) => {
      sdk.info.mockResolvedValue({ logs });
      expect(
        await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
      ).toMatchObject({ success: false, status: "pending" });
    },
  );
  it("rejects ambiguous payment operations and conflicting execution", async () => {
    sdk.parse.mockResolvedValueOnce([
      payment,
      { ...payment, operationIndex: 3 },
    ]);
    expect(
      await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ invalid: true });
    sdk.info.mockResolvedValue({
      logs: '{"events":[{"event":"transfer","data":{"from":"bob"}}]}',
    });
    expect(
      await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ invalid: true });
  });
  it("proves failure only after irreversible inclusion and explicit Engine errors", async () => {
    sdk.validate.mockResolvedValue({
      ...payment,
      status: "failed",
      success: false,
    });
    sdk.info.mockResolvedValue({
      logs: '{"errors":["insufficient balance"],"events":[]}',
    });
    sdk.props.mockResolvedValueOnce({ last_irreversible_block_num: 99 });
    expect(
      await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ status: "pending" });
    expect(sdk.info).not.toHaveBeenCalled();
    expect(
      await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ status: "failed", failureProven: true });
  });
  it("does not treat an error alongside transfer execution as a proven failure", async () => {
    sdk.validate.mockResolvedValue({
      ...payment,
      status: "failed",
      success: false,
    });
    sdk.info.mockResolvedValue({
      logs: JSON.stringify({
        errors: ["another operation failed"],
        events: [
          {
            event: "transfer",
            data: {
              from: "alice",
              to: "treasury",
              symbol: "HASH",
              quantity: "1.000",
            },
          },
        ],
      }),
    });
    expect(
      await verifyTokenPayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ status: "pending" });
  });
  it("verifies explicit expectations and retains safe operation identity and raw intent", async () => {
    expect(await verifyTokenPayment(input)).toMatchObject({
      status: "confirmed",
      success: true,
      operationIndex: 2,
      memo: payment.transfer.memo,
      trigger: payment.trigger,
    });
    expect(sdk.validate).toHaveBeenCalledExactlyOnceWith({
      ...input,
      expected: { ...input.expected, from: "alice" },
    });
  });
  it("waits for irreversible inclusion", async () => {
    sdk.props.mockResolvedValue({ last_irreversible_block_num: 99 });
    expect(await verifyTokenPayment(input)).toMatchObject({
      status: "pending",
      success: false,
    });
  });
  it("does not invent confirmation without a block number", async () => {
    sdk.validate.mockResolvedValue({ ...payment, blockNumber: undefined });
    expect(await verifyTokenPayment(input)).toMatchObject({
      status: "pending",
      success: false,
    });
  });
  it("retains execution failure without treating inclusion as success", async () => {
    sdk.validate.mockResolvedValue({
      ...payment,
      status: "failed",
      success: false,
      error: "insufficient balance",
    });
    expect(await verifyTokenPayment(input)).toMatchObject({
      status: "failed",
      success: false,
    });
    expect(sdk.props).not.toHaveBeenCalled();
  });
  it.each(["pending", "invalid", "not_found"])(
    "preserves existing %s normalization",
    async (status) => {
      sdk.validate.mockResolvedValue({ ...payment, status, success: false });
      expect(await verifyTokenPayment(input)).toMatchObject({
        status: "pending",
        success: false,
      });
    },
  );
  it("rejects empty transaction IDs without RPC", async () => {
    await expect(
      verifyTokenPayment({ ...input, transactionId: " " }),
    ).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
    expect(sdk.validate).not.toHaveBeenCalled();
  });
  it("does not confirm when finality lookup fails", async () => {
    sdk.props.mockRejectedValue(Error("RPC down"));
    await expect(verifyTokenPayment(input)).rejects.toThrow(
      "Hive operation failed",
    );
  });
});
