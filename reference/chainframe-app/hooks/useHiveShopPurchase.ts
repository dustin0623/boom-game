"use client";
import { useCallback, useRef, useState } from "react";
import { purchaseHiveShop } from "@/features/events/frontend/purchase-hive-shop/client";
import { useAuthStore } from "@/features/stores/authStore";
import type {
  HiveShopOrder,
  HiveShopOutcome,
  PaymentPhase,
} from "@/features/types/game/payments";
export function useHiveShopPurchase() {
  const username = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const sessionKey = JSON.stringify([username, connectedAt]);
  const inFlight = useRef<string | null>(null);
  const [display, setDisplay] = useState<{
    sessionKey: string;
    phase: PaymentPhase;
  }>({ sessionKey, phase: "idle" });
  const phase = display.sessionKey === sessionKey ? display.phase : "idle";
  const buy = useCallback(
    async (
      order: HiveShopOrder,
      onSubmitted?: () => void,
    ): Promise<HiveShopOutcome> => {
      if (!username) return { ok: false, error: "Connect your wallet first" };
      if (inFlight.current === sessionKey)
        return { ok: false, error: "A purchase is already in progress" };
      const session = useAuthStore.getState();
      const isCurrent = () => {
        const current = useAuthStore.getState();
        return (
          current.address === username &&
          current.mode === "wallet" &&
          current.connectedAt === session.connectedAt
        );
      };
      if (!isCurrent())
        return { ok: false, error: "Connect your wallet first" };
      inFlight.current = sessionKey;
      try {
        return await purchaseHiveShop(order, {
          session,
          isCurrent,
          onSubmitted,
          onPhase: (next) => {
            if (isCurrent()) setDisplay({ sessionKey, phase: next });
          },
        });
      } finally {
        if (inFlight.current === sessionKey) inFlight.current = null;
        if (isCurrent()) setDisplay({ sessionKey, phase: "idle" });
      }
    },
    [username, sessionKey],
  );
  return { buy, phase, busy: phase !== "idle" };
}
