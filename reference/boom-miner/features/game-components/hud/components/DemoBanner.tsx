"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/features/store/gameStore";

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

/**
 * Non-blocking HUD strip shown while the local demo swarm is running (the
 * player owns zero heroes). It never covers the map — it sits pinned to the
 * top-center of the game canvas. "MINT A HERO" opens the Shop modal via the
 * same custom event the menu uses; the "X" hides the banner but leaves the
 * demo running. The banner disappears entirely once demoMode flips off (the
 * player minted their first hero and the demo tore down).
 */
export function DemoBanner() {
  const demoMode = useGameStore((s) => s.demoMode);
  const [dismissed, setDismissed] = useState(false);

  // If the demo restarts (e.g. after a stage restart with still-zero heroes),
  // bring the banner back so the player always knows they are in demo mode.
  useEffect(() => {
    if (demoMode) setDismissed(false);
  }, [demoMode]);

  if (!demoMode || dismissed) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "8px 14px",
        background: "#1a0a00",
        border: "1px dashed rgba(250,204,21,0.4)",
        borderRadius: 4,
        boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
        zIndex: 900,
        maxWidth: "92%",
      }}
    >
      <span
        style={{
          fontFamily: PIXEL_HEAD,
          fontSize: 8,
          color: "#fbbf24",
          letterSpacing: 1,
          lineHeight: 1.5,
          textShadow: "0 0 12px rgba(251,191,36,0.4)",
        }}
      >
        DEMO MODE
      </span>
      <span
        style={{
          fontFamily: PIXEL_BODY,
          fontSize: 15,
          color: "#fcd34d",
          lineHeight: 1.3,
        }}
      >
        Mint a hero to play for real
      </span>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("bm-modal-shop-open"))
        }
        style={{
          fontFamily: PIXEL_HEAD,
          fontSize: 8,
          letterSpacing: 1,
          color: "#1a0a00",
          background: "#fbbf24",
          border: "none",
          borderRadius: 3,
          padding: "7px 10px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        MINT A HERO
      </button>
      <button
        type="button"
        aria-label="Dismiss demo banner"
        onClick={() => setDismissed(true)}
        style={{
          fontFamily: PIXEL_HEAD,
          fontSize: 9,
          color: "#fcd34d",
          background: "transparent",
          border: "1px solid rgba(250,204,21,0.4)",
          borderRadius: 3,
          padding: "5px 8px",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  );
}
