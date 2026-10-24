import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomJsonEvent } from "hivexph-sdk";
import { emptyGameQueue } from "@/tests/fixtures/gameplay-queue";
const state = vi.hoisted(() => ({ list: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  listRecoverableGameActions: state.list,
  readQueuedGameBatches: emptyGameQueue,
}));
vi.mock("@/lib/logger.server", () => ({ logger: { info: state.info } }));
import { recoverPendingGameActions } from "./recovery";
beforeEach(() => vi.resetAllMocks());
describe("pending gameplay recovery", () => {
  it("passes original submissions sequentially through the guarded processing callback", async () => {
    const events = [
      {
        transactionId: "a",
        blockNumber: 3,
        executionTime: 100,
        randomSeed: "seed",
      },
      { transactionId: "b", blockNumber: 4 },
    ] as unknown as CustomJsonEvent[];
    state.list.mockResolvedValue(events);
    const seen: CustomJsonEvent[] = [];
    await recoverPendingGameActions(async (event) => {
      seen.push(event);
    });
    expect(seen).toEqual(events);
    expect(seen[0]).toBe(events[0]);
    expect(state.info).toHaveBeenCalledWith("Recovering pending game actions", {
      count: 2,
    });
  });
  it("stops on processing failure without skipping to later submissions", async () => {
    state.list.mockResolvedValue([{}, {}]);
    const process = vi.fn(async () => {
      throw Error("lease lost");
    });
    await expect(recoverPendingGameActions(process)).rejects.toThrow(
      "lease lost",
    );
    expect(process).toHaveBeenCalledOnce();
  });
  it("does nothing when there is no saved work", async () => {
    state.list.mockResolvedValue([]);
    const process = vi.fn();
    await recoverPendingGameActions(process);
    expect(process).not.toHaveBeenCalled();
    expect(state.info).not.toHaveBeenCalled();
  });
});
