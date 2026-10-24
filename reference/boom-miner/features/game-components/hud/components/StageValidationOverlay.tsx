"use client";

import { useGameStore } from "@/features/store/gameStore";

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

/**
 * Overlay shown while the sync-log flush is in flight (stageValidating) and
 * briefly while the server confirmation banner is displayed (stageValidated).
 */
export function StageValidationOverlay() {
  const stageValidating = useGameStore((s) => s.stageValidating);
  const stageValidated  = useGameStore((s) => s.stageValidated);

  if (!stageValidating && !stageValidated) return null;

  const cleared = stageValidated;
  const color   = cleared ? "#4ade80" : "#fbbf24";
  const shadow  = cleared
    ? "0 0 20px rgba(74,222,128,0.6)"
    : "0 0 20px rgba(251,191,36,0.5)";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        zIndex: 999,
      }}
    >
      <div
        style={{
          fontFamily: PIXEL_HEAD,
          fontSize: 13,
          color,
          letterSpacing: 2,
          textAlign: "center",
          lineHeight: 1.6,
          textShadow: shadow,
          animation: "pulse 1s ease-in-out infinite",
        }}
      >
        {cleared ? "STAGE CLEAR!" : "VALIDATING RUN..."}
      </div>
      <div
        style={{
          fontFamily: PIXEL_BODY,
          fontSize: 16,
          color: cleared ? "#86efac" : "#d4a017",
          letterSpacing: 1,
        }}
      >
        {cleared ? "Proceeding to next stage" : "Please wait"}
      </div>
      {stageValidating && (
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                background: "#fbbf24",
                animation: `bounce 0.8s ${i * 0.2}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
