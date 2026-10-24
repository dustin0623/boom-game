"use client";

import { useEffect, useState } from "react";
import { HeroesModal }      from "./heroes/HeroesModal";
import { ShopModal }        from "./shop/ShopModal";
import { LeaderboardModal } from "./leaderboard/LeaderboardModal";
import { MarketplaceModal } from "./marketplace/MarketplaceModal";
import { useSettlementNotifier } from "@/hooks/useSettlementNotifier";

export type ModalKey = "heroes" | "shop" | "leaderboard" | "marketplace";
const MODAL_KEYS: ModalKey[] = ["heroes", "shop", "leaderboard", "marketplace"];

/**
 * Mounts alongside <DynamicGameShell> in app/game/page.tsx.
 * Listens for `bm-modal-{key}-open` / `bm-modal-{key}-close` DOM events
 * dispatched by Phaser scenes or HUD buttons.
 *
 * Phaser usage:
 *   window.dispatchEvent(new CustomEvent("bm-modal-heroes-open"));
 */
export function GameModals() {
  const [active, setActive] = useState<ModalKey | null>(null);

  // Global settlement watcher: detects settled mints/withdrawals and triggers
  // an authoritative WS balance + roster refresh.
  useSettlementNotifier();

  useEffect(() => {
    const handlers: [string, EventListener][] = [];
    for (const key of MODAL_KEYS) {
      const open:  EventListener = () => setActive(key);
      const close: EventListener = () =>
        setActive((c) => (c === key ? null : c));
      window.addEventListener(`bm-modal-${key}-open`,  open);
      window.addEventListener(`bm-modal-${key}-close`, close);
      handlers.push(
        [`bm-modal-${key}-open`,  open],
        [`bm-modal-${key}-close`, close],
      );
    }
    return () => handlers.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
  }, []);

  const close = () => setActive(null);

  return (
    <>
      <HeroesModal      show={active === "heroes"}      onClose={close} onOpenShop={() => setActive("shop")} />
      <ShopModal        show={active === "shop"}        onClose={close} />
      <LeaderboardModal show={active === "leaderboard"} onClose={close} />
      <MarketplaceModal show={active === "marketplace"} onClose={close} />
    </>
  );
}
