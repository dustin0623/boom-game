import mongoose from "mongoose";
import { connectDatabase } from "@/lib/config/database";
import { InboundTransactionModel } from "@/lib/modules/transactions-pending/server.model";
import { PlayerModel } from "@/lib/modules/players/server.model";
import { EquipmentModel } from "@/lib/modules/equipments/server.model";
import { InventoryItemModel } from "@/lib/modules/items/server.model";
import { LogModel } from "@/lib/modules/logs/server.model";
import { GameStatModel } from "@/lib/modules/game-stats/server.model";
import { ProcessedTransactionModel } from "@/lib/modules/transactions-processed/server.model";

/** Connect directly to MongoDB and initialize the queue's required indexes. */
export async function initializeContractDatabase(): Promise<void> {
  await connectDatabase();
  await Promise.all([
    InboundTransactionModel.init(),
    ProcessedTransactionModel.init(),
    PlayerModel.init(),
    EquipmentModel.init(),
    InventoryItemModel.init(),
    LogModel.init(),
    GameStatModel.init(),
  ]);
}
export async function disconnectContractDatabase() {
  try {
    await mongoose.disconnect();
  } finally {
    global._mongooseConnection = undefined;
  }
}
