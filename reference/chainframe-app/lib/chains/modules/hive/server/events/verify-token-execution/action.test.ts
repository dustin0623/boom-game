import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  read: vi.fn(),
  block: vi.fn(),
  props: vi.fn(),
  info: vi.fn(),
}));
vi.mock("../../../client", () => ({
  hiveClient: {
    reader: { transaction: sdk.read },
    rpc: { getBlock: sdk.block, getDynamicGlobalProperties: sdk.props },
    payments: { engineRpc: { getTransactionInfo: sdk.info } },
  },
}));
import { verifyTokenExecution } from "./action";
const memo =
  '{"action":"withdrawal","metadata":{"memo":"Chainframe withdrawal origin"}}';
const payload = { to: "alice", symbol: "HASH", quantity: "10.000", memo };
const input = {
  transactionId: "tx",
  operation: "issue" as const,
  expected: {
    from: "treasury",
    account: "alice",
    symbol: "HASH",
    quantity: "10.000",
    memo,
  },
};
function operation(action = "issue", changes: object = {}, body: object = {}) {
  return [
    "custom_json",
    {
      id: "ssc-mainnet-hive",
      required_auths: ["treasury"],
      required_posting_auths: [],
      json: JSON.stringify({
        contractName: "tokens",
        contractAction: action,
        contractPayload: { ...payload, ...changes },
      }),
      ...body,
    },
  ];
}
function evidence(raw = operation(), changes: object = {}) {
  sdk.read.mockResolvedValue({
    transactionId: "tx",
    blockNumber: 100,
    transactionIndex: 0,
    operations: [{ raw }],
    ...changes,
  });
  sdk.block.mockResolvedValue({
    transaction_ids: ["tx"],
    transactions: [{ operations: [raw] }],
  });
}
function info(action = "issue", changes: object = {}, logs?: unknown) {
  return {
    transactionId: "tx",
    sender: "treasury",
    contract: "tokens",
    action,
    payload: JSON.stringify({ ...payload, isSignedWithActiveKey: true }),
    logs: JSON.stringify(
      logs ?? {
        events: [
          {
            contract: "tokens",
            event: action === "issue" ? "transferFromContract" : "transfer",
            data: {
              from: action === "issue" ? "tokens" : "treasury",
              to: "alice",
              symbol: "HASH",
              quantity: "10.000",
            },
          },
        ],
      },
    ),
    ...changes,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  evidence();
  sdk.props.mockResolvedValue({ last_irreversible_block_num: 100 });
  sdk.info.mockResolvedValue(info());
});
describe("canonical token execution evidence", () => {
  it.each(["issue", "transfer"] as const)(
    "confirms exact irreversible %s execution",
    async (action) => {
      evidence(operation(action));
      sdk.info.mockResolvedValue(info(action));
      expect(
        await verifyTokenExecution({ ...input, operation: action }),
      ).toMatchObject({
        success: true,
        status: "confirmed",
        operationIndex: 0,
        blockNumber: 100,
        memo,
      });
      expect(sdk.block).toHaveBeenCalledExactlyOnceWith(100);
      expect(sdk.info).toHaveBeenCalledExactlyOnceWith("tx");
    },
  );
  it.each([
    { to: "other" },
    { symbol: "OTHER" },
    { quantity: "9.000" },
    { memo: "changed" },
  ])("rejects changed signed payload: %j", async (changes) => {
    evidence(operation("issue", changes));
    expect(await verifyTokenExecution(input)).toMatchObject({
      invalid: true,
      success: false,
    });
    expect(sdk.info).not.toHaveBeenCalled();
  });
  it.each([
    { required_auths: ["other"] },
    { required_auths: ["treasury", "other"] },
    { required_auths: [], required_posting_auths: ["treasury"] },
    { id: "chainframe-game" },
    { json: "malformed" },
  ])("rejects wrong authority or envelope: %j", async (body) => {
    evidence(operation("issue", {}, body));
    expect(await verifyTokenExecution(input)).toMatchObject({ invalid: true });
  });
  it("rejects a transfer when issuance was saved", async () => {
    evidence(operation("transfer"));
    expect(await verifyTokenExecution(input)).toMatchObject({ invalid: true });
  });
  it("rejects a changed operation index", async () => {
    expect(
      await verifyTokenExecution({ ...input, operationIndex: 1 }),
    ).toMatchObject({ invalid: true });
  });
  it("rejects multiple Engine operations instead of guessing which logs belong to the payout", async () => {
    sdk.read.mockResolvedValue({
      transactionId: "tx",
      blockNumber: 100,
      transactionIndex: 0,
      operations: [{ raw: operation() }, { raw: operation() }],
    });
    expect(await verifyTokenExecution(input)).toMatchObject({ invalid: true });
  });
  it.each([null, 0, -1, 1.5])(
    "waits for valid block evidence: %s",
    async (blockNumber) => {
      evidence(operation(), { blockNumber });
      expect(await verifyTokenExecution(input)).toMatchObject({
        status: "pending",
        success: false,
      });
      expect(sdk.info).not.toHaveBeenCalled();
    },
  );
  it("waits for irreversibility before canonical and Engine reads", async () => {
    sdk.props.mockResolvedValue({ last_irreversible_block_num: 99 });
    expect(await verifyTokenExecution(input)).toMatchObject({
      status: "pending",
    });
    expect(sdk.block).not.toHaveBeenCalled();
    expect(sdk.info).not.toHaveBeenCalled();
  });
  it("waits for missing canonical transaction identities", async () => {
    sdk.block.mockResolvedValue({ transactions: [] });
    expect(await verifyTokenExecution(input)).toMatchObject({
      status: "pending",
    });
  });
  it.each([
    {
      transaction_ids: ["other"],
      transactions: [{ operations: [operation()] }],
    },
    {
      transaction_ids: ["tx"],
      transactions: [
        { operations: [operation("issue", { quantity: "9.000" })] },
      ],
    },
    { transaction_ids: ["tx", "tx"], transactions: [] },
  ])("rejects conflicting canonical evidence: %j", async (canonical) => {
    sdk.block.mockResolvedValue(canonical);
    expect(await verifyTokenExecution(input)).toMatchObject({ invalid: true });
    expect(sdk.info).not.toHaveBeenCalled();
  });
  it.each([
    { transactionId: "other" },
    { sender: "other" },
    { contract: "other" },
    { action: "transfer" },
    { payload: JSON.stringify({ ...payload, to: "other" }) },
  ])("rejects mismatched Engine execution identity: %j", async (changes) => {
    sdk.info.mockResolvedValue(info("issue", changes));
    expect(await verifyTokenExecution(input)).toMatchObject({ invalid: true });
  });
  it.each([
    null,
    {},
    info("issue", { logs: "" }),
    info("issue", { logs: "{}" }),
    info("issue", {}, { events: [] }),
  ])("keeps absent execution evidence pending: %j", async (execution) => {
    sdk.info.mockResolvedValue(execution);
    expect(await verifyTokenExecution(input)).toMatchObject({
      status: "pending",
      success: false,
    });
  });
  it.each([
    { contract: "other" },
    { event: "transfer" },
    {
      data: { from: "tokens", to: "other", symbol: "HASH", quantity: "10.000" },
    },
    {
      data: {
        from: "treasury",
        to: "alice",
        symbol: "HASH",
        quantity: "10.000",
      },
    },
    {
      data: {
        from: "tokens",
        to: "alice",
        symbol: "OTHER",
        quantity: "10.000",
      },
    },
    {
      data: { from: "tokens", to: "alice", symbol: "HASH", quantity: "9.000" },
    },
  ])("rejects incorrect issuance events: %j", async (changes) => {
    const event = JSON.parse(info().logs).events[0];
    sdk.info.mockResolvedValue(
      info("issue", {}, { events: [{ ...event, ...changes }] }),
    );
    expect(await verifyTokenExecution(input)).toMatchObject({ invalid: true });
  });
  it("proves a failure only with exact irreversible operation and errors without events", async () => {
    sdk.info.mockResolvedValue(
      info("issue", {}, { errors: ["quantity exceeds available supply"] }),
    );
    expect(await verifyTokenExecution(input)).toMatchObject({
      status: "failed",
      failureProven: true,
      success: false,
    });
  });
  it("does not compensate execution errors alongside any events", async () => {
    const event = JSON.parse(info().logs).events[0];
    sdk.info.mockResolvedValue(
      info("issue", {}, { errors: ["unknown effect"], events: [event] }),
    );
    const result = await verifyTokenExecution(input);
    expect(result).toMatchObject({ status: "pending", success: false });
    expect(result.failureProven).not.toBe(true);
  });
  it("does not confirm or expose raw errors on RPC failure", async () => {
    sdk.info.mockRejectedValue(Error("secret connection info"));
    await expect(verifyTokenExecution(input)).rejects.toThrow(
      "Hive operation failed",
    );
  });
});
