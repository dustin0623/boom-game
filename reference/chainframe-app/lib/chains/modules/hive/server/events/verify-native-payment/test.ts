import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  validate: vi.fn(),
  props: vi.fn(),
  parse: vi.fn(),
  block: vi.fn(),
}));
vi.mock("../../../client", () => ({
  hiveClient: {
    payments: { validate: sdk.validate, parse: sdk.parse },
    rpc: { getDynamicGlobalProperties: sdk.props, getBlock: sdk.block },
  },
}));
import { verifyNativePayment } from "./action";
const input = {
  transactionId: "tx",
  expected: { from: " ALICE ", account: "treasury", symbol: "HIVE" },
};
const payment = {
  network: "hive",
  success: true,
  status: "success",
  transactionId: "tx",
  blockNumber: 100,
  operationIndex: 2,
  transfer: {
    from: "alice",
    account: "treasury",
    symbol: "HIVE",
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
});
describe("native payment evidence", () => {
  it("requires an unambiguous matching payment operation for treasury evidence", async () => {
    expect(
      await verifyNativePayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ status: "confirmed" });
    sdk.parse.mockResolvedValue([payment, { ...payment, operationIndex: 3 }]);
    expect(
      await verifyNativePayment({ ...input, requireTransferEvidence: true }),
    ).toMatchObject({ invalid: true });
  });
  it("verifies explicit expectations and retains safe operation identity and raw intent", async () => {
    expect(await verifyNativePayment(input)).toMatchObject({
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
    expect(await verifyNativePayment(input)).toMatchObject({
      status: "pending",
      success: false,
    });
  });
  it("does not invent confirmation without a block number", async () => {
    sdk.validate.mockResolvedValue({ ...payment, blockNumber: undefined });
    expect(await verifyNativePayment(input)).toMatchObject({
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
    expect(await verifyNativePayment(input)).toMatchObject({
      status: "failed",
      success: false,
    });
    expect(sdk.props).not.toHaveBeenCalled();
  });
  it.each(["pending", "invalid", "not_found"])(
    "preserves existing %s normalization",
    async (status) => {
      sdk.validate.mockResolvedValue({ ...payment, status, success: false });
      expect(await verifyNativePayment(input)).toMatchObject({
        status: "pending",
        success: false,
      });
    },
  );
  it("rejects empty transaction IDs without RPC", async () => {
    await expect(
      verifyNativePayment({ ...input, transactionId: " " }),
    ).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
    expect(sdk.validate).not.toHaveBeenCalled();
  });
  it("does not confirm when finality lookup fails", async () => {
    sdk.props.mockRejectedValue(Error("RPC down"));
    await expect(verifyNativePayment(input)).rejects.toThrow(
      "Hive operation failed",
    );
  });
});

describe("canonical payment timestamp", () => {
  const canonical = () => ({ timestamp: "2026-10-19T00:00:00", transaction_ids: ["tx"], transactions: [{ operations: [["vote", {}], ["vote", {}], ["transfer", { from: "alice", to: "treasury", amount: "1.000 HIVE", memo: payment.transfer.memo }]] }] });
  it("returns only the exact canonical operation's block time after irreversibility", async () => {
    sdk.block.mockResolvedValue(canonical());
    expect(await verifyNativePayment({ ...input, includeBlockTimestamp: true })).toMatchObject({ blockTimestamp: "2026-10-19T00:00:00", blockNumber: 100 });
    expect(sdk.block).toHaveBeenCalledWith(100);
    expect(sdk.validate.mock.calls[0][0]).not.toHaveProperty("includeBlockTimestamp");
  });
  it.each(["transaction", "duplicate", "signer", "recipient", "amount", "memo", "operation", "time", "unavailable"])("does not supply eligibility evidence for mismatched %s", async (fault) => {
    const block = canonical();
    const body = block.transactions[0].operations[2][1] as Record<string, unknown>;
    if (fault === "transaction") block.transaction_ids = ["other"];
    if (fault === "duplicate") block.transaction_ids.push("tx");
    if (fault === "signer") body.from = "mallory";
    if (fault === "recipient") body.to = "mallory";
    if (fault === "amount") body.amount = "2.000 HIVE";
    if (fault === "memo") body.memo = "other";
    if (fault === "operation") block.transactions[0].operations[2] = ["vote", {}];
    if (fault === "time") block.timestamp = "not-a-date";
    sdk.block.mockResolvedValue(fault === "unavailable" ? null : block);
    expect(await verifyNativePayment({ ...input, includeBlockTimestamp: true })).not.toHaveProperty("blockTimestamp");
  });
  it("does not read canonical time before finality", async () => {
    sdk.props.mockResolvedValue({ last_irreversible_block_num: 99 });
    await verifyNativePayment({ ...input, includeBlockTimestamp: true });
    expect(sdk.block).not.toHaveBeenCalled();
  });
});
