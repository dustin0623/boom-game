import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  transaction: vi.fn(),
  findOne: vi.fn(),
  collection: vi.fn(),
  init: Array.from({ length: 7 }, () => vi.fn()),
}));
vi.mock("@/lib/config/database", () => ({ connectDatabase: mocks.connect }));
vi.mock("mongoose", () => ({
  default: {
    connection: {
      transaction: mocks.transaction,
      db: { collection: mocks.collection },
    },
  },
}));
vi.mock("@/lib/modules/transactions-pending/server.model", () => ({
  InboundTransactionModel: { init: mocks.init[0] },
}));
vi.mock("@/lib/modules/transactions-processed/server.model", () => ({
  ProcessedTransactionModel: { init: mocks.init[1] },
}));
vi.mock("@/lib/modules/players/server.model", () => ({
  PlayerModel: { init: mocks.init[2] },
}));
vi.mock("@/lib/modules/equipments/server.model", () => ({
  EquipmentModel: { init: mocks.init[3] },
}));
vi.mock("@/lib/modules/items/server.model", () => ({
  InventoryItemModel: { init: mocks.init[6] },
}));
vi.mock("@/lib/modules/logs/server.model", () => ({
  LogModel: { init: mocks.init[4] },
}));
vi.mock("@/lib/modules/game-stats/server.model", () => ({
  GameStatModel: { init: mocks.init[5] },
}));

import { initializeContractDatabase } from "./database.server";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.collection.mockReturnValue({ findOne: mocks.findOne });
});

describe("contract database startup", () => {
  it("connects directly and initializes all seven collection indexes without transactions", async () => {
    await initializeContractDatabase();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
    for (const init of mocks.init) {
      expect(init).toHaveBeenCalledOnce();
      expect(init.mock.invocationCallOrder[0]).toBeGreaterThan(
        mocks.connect.mock.invocationCallOrder[0]!,
      );
    }
  });

  it.each(["Authentication failed", "Connection refused"])(
    "preserves connection errors: %s",
    async (message) => {
      const error = new Error(message);
      mocks.connect.mockRejectedValue(error);
      await expect(initializeContractDatabase()).rejects.toBe(error);
      expect(mocks.transaction).not.toHaveBeenCalled();
      for (const init of mocks.init) expect(init).not.toHaveBeenCalled();
    },
  );

  it("preserves index initialization errors", async () => {
    const error = new Error("Index initialization failed");
    mocks.init[0].mockRejectedValue(error);
    await expect(initializeContractDatabase()).rejects.toBe(error);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
