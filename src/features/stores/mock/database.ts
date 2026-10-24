import type { PlayerDocument } from "@/lib/modules/players/server.model";
import type { PendingTransactionDocument } from "@/lib/modules/transactions-pending/server.model";
import type { ProcessedTransactionDocument } from "@/lib/modules/transactions-processed/server.model";

/** In-memory dev database. Only repositories in src/lib/modules/* may touch it. */
export const mockDb = {
  players: new Map<string, PlayerDocument>(),
  pendingTransactions: new Map<string, PendingTransactionDocument>(),
  processedTransactions: new Map<string, ProcessedTransactionDocument>(),
};
