import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  list: vi.fn(),
  process: vi.fn(),
  errors: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  listPendingOldestFirst: m.list,
}));
vi.mock(
  "@/server/game-smart-contract/features/events/payment-processing/dispatch",
  () => ({
    processJob: m.process,
  }),
);
vi.mock("@/lib/modules/logs/server.repository", () => ({
  createErrorLog: m.errors,
}));
vi.mock(
  "@/server/game-smart-contract/features/events/payment-processing/support",
  () => ({
    message: (e: Error) => e.message,
  }),
);
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
import { drainPaymentJobs } from "./drain";
beforeEach(() => vi.resetAllMocks());
describe("payment drain feature", () => {
  it("processes oldest-first and stops before the next job on shutdown", async () => {
    const jobs = [
      { signature: "first", createdAt: new Date(), eventTime: 1 },
      { signature: "second", createdAt: new Date() },
    ];
    m.list.mockResolvedValue(jobs);
    let stopped = false;
    m.process.mockImplementation(async () => {
      stopped = true;
    });
    const context = { checkLease: m.check, maxRetries: 3 };
    await drainPaymentJobs(context, () => stopped);
    expect(m.process).toHaveBeenCalledExactlyOnceWith(context, jobs[0]);
  });
  it("does not process jobs after lease loss", async () => {
    m.list.mockResolvedValue([{ signature: "payment", createdAt: new Date() }]);
    m.check.mockRejectedValue(new Error("lease lost"));
    await drainPaymentJobs({ checkLease: m.check, maxRetries: 3 }, () => false);
    expect(m.process).not.toHaveBeenCalled();
    expect(m.errors).toHaveBeenCalledWith(
      expect.objectContaining({ error: "lease lost" }),
    );
  });
});
