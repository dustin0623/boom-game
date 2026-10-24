import { useEffect } from "react";
import { useAuthStore } from "@/features/stores/authStore";
import { useNotificationStore } from "@/features/stores/notificationStore";
import { usePlayerStore } from "@/features/stores/playerStore";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { getActivityLogs, getTransactions } from "@/lib/api/client";
import { createPersonalHistoryPoller } from "@/features/events/frontend/personal-history/client";
import {
  useTransactionStore,
  transactionSessionKey,
} from "@/features/stores/transactionStore";
import { toast } from "sonner";
import { reconcileSubmittedTransactions } from "@/features/events/frontend/confirm-transaction/client";
export function usePersonalHistory(enabled: boolean): void {
  const wallet = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  useEffect(() => {
    const session = transactionSessionKey(useAuthStore.getState());
    useTransactionStore.getState().begin(session);
    useNotificationStore.getState().clear();
    if (!enabled || !wallet) return;
    const isCurrent = () =>
      useAuthStore.getState().mode === "wallet" &&
      useAuthStore.getState().address === wallet &&
      useAuthStore.getState().connectedAt === connectedAt;
    const poller = createPersonalHistoryPoller({
      wallet,
      isCurrent,
      transport: {
        logs: (cursor, direction) => getActivityLogs(100, cursor, direction),
        transactions: (cursor, direction) =>
          getTransactions(100, cursor, direction),
      },
      publish: (entries, toasts) => {
        if (!isCurrent()) return;
        for (const entry of entries)
          useNotificationStore
            .getState()
            .push(entry.message, entry.kind, entry.parts, {
              id: entry.id,
              at: entry.at,
              pvp: entry.pvp,
            });
        for (const entry of toasts) {
          if (entry.kind === "danger") toast.error(entry.message);
          else if (entry.kind === "success" || entry.kind === "loot")
            toast.success(entry.message);
          else toast(entry.message);
        }
      },
      observe: (logs, receipts, pending) => {
        if (!isCurrent() || !session) return;
        useTransactionStore
          .getState()
          .observe(session, logs, receipts, pending);
        reconcileSubmittedTransactions(useAuthStore.getState());
      },
      state: {
        refreshPlayer: () => usePlayerStore.getState().syncFromApi(),
        refreshInventory: () => useInventoryStore.getState().syncFromApi(),
        isRefreshed: () => useTransactionStore.getState().refreshed,
        onReady: () => {
          if (isCurrent() && session)
            useTransactionStore
              .getState()
              .ready(session, useAuthStore.getState().isRegistered === true);
          if (isCurrent())
            reconcileSubmittedTransactions(useAuthStore.getState());
        },
      },
    });
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void poller.poll().catch(() => {});
    };
    const focus = () => {
      if (document.visibilityState !== "visible") return;
      poll();
      void poller.refresh();
    };
    poll();
    const interval = window.setInterval(poll, 5000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      poller.stop();
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [enabled, wallet, connectedAt]);
}
