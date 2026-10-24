"use client";

import { useGameStore } from "@/features/store/gameStore";

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

/**
 * Blocking overlay shown when the WebSocket is disconnected but there is
 * no permanent session error. Disappears automatically once the socket
 * reconnects (connectionLost goes false).
 */
export function ConnectionOverlay() {
  const connectionLost = useGameStore((s) => s.connectionLost);
  const sessionError   = useGameStore((s) => s.sessionError);

  if (!connectionLost || sessionError) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          fontFamily: PIXEL_HEAD,
          fontSize: 12,
          color: "#fbbf24",
          letterSpacing: 2,
          textAlign: "center",
          textShadow: "0 0 20px rgba(251,191,36,0.5)",
        }}
      >
        RECONNECTING
      </div>
      <div
        style={{
          width: 26,
          height: 26,
          border: "3px solid rgba(251,191,36,0.35)",
          borderTopColor: "#fbbf24",
          borderRadius: "50%",
          animation: "bm-spin 0.8s linear infinite",
        }}
      />
      <div
        style={{
          fontFamily: PIXEL_BODY,
          fontSize: 15,
          color: "#fcd34d",
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        Lost connection to the game server. Waiting to reconnect&hellip;
      </div>
      <style>{"@keyframes bm-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
