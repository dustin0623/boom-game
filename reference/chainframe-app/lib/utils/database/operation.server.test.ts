import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/config/database", () => ({ connectDatabase: mocks.connect }));
vi.mock("mongoose", () => {
  class Collection {
    async updateOne(...args: unknown[]) {
      return mocks.write(...args);
    }
  }
  return { default: { mongo: { Collection } } };
});
import mongoose from "mongoose";
import {
  DatabaseOperationUncertainError,
  withDatabaseOperation,
  withDatabasePreparation,
} from "./operation.server";

const write = () =>
  mongoose.mongo.Collection.prototype.updateOne.call(
    {} as never,
    { key: "test" },
    { $inc: { value: 1 } },
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue(undefined);
  mocks.write.mockResolvedValue({ modifiedCount: 1 });
});

describe("ordered standalone database operations", () => {
  it("imports infrastructure without connecting to MongoDB", async () => {
    const infrastructure = await import("./operation.server");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(infrastructure.DatabaseOperationUncertainError).toBe(
      DatabaseOperationUncertainError,
    );
    const cause = new Error("interrupted write");
    const error = new infrastructure.DatabaseOperationUncertainError(cause);
    expect(error).toBeInstanceOf(DatabaseOperationUncertainError);
    expect(error.name).toBe("DatabaseOperationUncertainError");
    expect(error.message).toBe(
      "Database writes did not finish; operator review is required before retrying",
    );
    expect(error.cause).toBe(cause);
  });
  it("allows rule rejection after an acknowledged preparation refresh and clears its guard", async () => {
    const error = new Error("No claim charges");
    const cleanup = vi.fn(async () => {});
    await expect(
      withDatabaseOperation(
        async () => {
          await withDatabasePreparation(write);
          throw error;
        },
        { afterSuccess: cleanup },
      ),
    ).rejects.toBe(error);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("parks ambiguous preparation writes instead of treating them as harmless validation", async () => {
    mocks.write.mockRejectedValueOnce(new Error("refresh response lost"));
    const cleanup = vi.fn();
    await expect(
      withDatabaseOperation(() => withDatabasePreparation(write), {
        afterSuccess: cleanup,
      }),
    ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("joins nested operations and connects once without a session", async () => {
    await expect(
      withDatabaseOperation(() => withDatabaseOperation(async () => 42)),
    ).resolves.toBe(42);
    expect(mocks.connect).toHaveBeenCalledOnce();
  });
  it("serializes outer operations and releases ordering after failure", async () => {
    const order: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withDatabaseOperation(async () => {
      order.push(1);
      await gate;
      order.push(2);
      throw new Error("read unavailable");
    });
    const second = withDatabaseOperation(async () => {
      order.push(3);
    });
    const rejected = expect(first).rejects.toThrow("read unavailable");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([1]);
    release();
    await rejected;
    await second;
    expect(order).toEqual([1, 2, 3]);
  });
  it("persists the marker before concurrent writes and joins nested hooks", async () => {
    const order: string[] = [];
    const before = vi.fn(async () => {
      order.push("marker");
      // Marker persistence must not recursively invoke the hook.
      await write();
    });
    const nested = vi.fn();
    const after = vi.fn(async () => {
      order.push("finished");
    });
    mocks.write.mockImplementation(async () => {
      order.push("write");
    });
    await withDatabaseOperation(
      async () => {
        await Promise.all([
          write(),
          withDatabaseOperation(write, { beforeWrite: nested }),
        ]);
      },
      { beforeWrite: before, afterSuccess: after },
    );
    expect(before).toHaveBeenCalledOnce();
    expect(nested).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledOnce();
    expect(order).toEqual(["marker", "write", "write", "write", "finished"]);
  });
  it("does not classify read or validation failures as partial writes", async () => {
    const error = new Error("validation failed");
    const beforeWrite = vi.fn();
    await expect(
      withDatabaseOperation(
        async () => {
          throw error;
        },
        { beforeWrite },
      ),
    ).rejects.toBe(error);
    expect(beforeWrite).not.toHaveBeenCalled();
  });
  it("retains a failed write's cause and does not invoke successful cleanup", async () => {
    const error = new Error("connection lost after write");
    mocks.write.mockRejectedValueOnce(error);
    const afterSuccess = vi.fn();
    const failed = await withDatabaseOperation(write, { afterSuccess }).catch(
      (error) => error,
    );
    expect(failed).toBeInstanceOf(DatabaseOperationUncertainError);
    expect(failed.cause).toBe(error);
    expect(afterSuccess).not.toHaveBeenCalled();
    await write();
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });
  it("never starts concurrent effects when marker persistence fails", async () => {
    const beforeWrite = vi.fn(async () => {
      throw new Error("marker unavailable");
    });
    await expect(
      withDatabaseOperation(() => Promise.all([write(), write()]), {
        beforeWrite,
      }),
    ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
    expect(beforeWrite).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("reports successful writes followed by cleanup failure as uncertain", async () => {
    await expect(
      withDatabaseOperation(write, {
        afterSuccess: async () => {
          throw new Error("clear marker failed");
        },
      }),
    ).rejects.toBeInstanceOf(DatabaseOperationUncertainError);
    expect(mocks.write).toHaveBeenCalledOnce();
  });
  it("propagates connection failure without running the callback", async () => {
    const error = new Error("MongoDB unavailable");
    mocks.connect.mockRejectedValueOnce(error);
    const execute = vi.fn();
    await expect(withDatabaseOperation(execute)).rejects.toBe(error);
    expect(execute).not.toHaveBeenCalled();
  });
});
