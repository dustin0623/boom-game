"use client";
import { useWorkerStore } from "@/features/stores/workerStore";
import { usePlayerStore } from "@/features/stores/playerStore";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { useRaidStore } from "@/features/stores/raidStore";
import { useNotificationStore } from "@/features/stores/notificationStore";
import { useTransactionStore } from "@/features/stores/transactionStore";
export function resetWalletState() {
  useWorkerStore.getState().set(null, "checking");
  usePlayerStore.getState().reset();
  useInventoryStore.getState().reset();
  useRaidStore.getState().reset();
  useNotificationStore.getState().clear();
  useTransactionStore.getState().begin(null);
}
