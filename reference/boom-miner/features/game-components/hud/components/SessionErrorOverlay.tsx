"use client";

import { useRouter } from "next/navigation";
import { useGameStore } from "@/features/store/gameStore";
import { destroySocket } from "@/context/SocketContext";

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

/**
 * Permanent blocking overlay shown when the WS engine forcibly ended this
 * session (e.g. REPLACED_BY_NEW_TAB). Only a full page reload clears it.
 */
const AUTH_ERRORS = ["Your session has expired. Please log in again."];

export function SessionErrorOverlay() {
  const sessionError = useGameStore((s) => s.sessionError);
  const router = useRouter();
  if (!sessionError) return null;

  const isAuthError = AUTH_ERRORS.includes(sessionError);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          fontFamily: PIXEL_HEAD,
          fontSize: 11,
          color: "#ef4444",
          letterSpacing: 2,
          textAlign: "center",
          textShadow: "0 0 20px rgba(239,68,68,0.6)",
        }}
      >
        SESSION ENDED
      </div>
      <div
        style={{
          fontFamily: PIXEL_BODY,
          fontSize: 17,
          color: "#fca5a5",
          textAlign: "center",
          maxWidth: 340,
          lineHeight: 1.5,
        }}
      >
        {sessionError}
      </div>
      {isAuthError ? (
        <button
          type="button"
          onClick={() => {
            destroySocket();
            router.push("/login");
          }}
          style={{
            marginTop: 8,
            fontFamily: PIXEL_HEAD,
            fontSize: 10,
            letterSpacing: 2,
            color: "#fff",
            background: "#dc2626",
            border: "3px solid #000",
            borderBottom: "5px solid #000",
            padding: "10px 28px",
            cursor: "pointer",
          }}
        >
          GO TO LOGIN
        </button>
      ) : (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            fontFamily: PIXEL_HEAD,
            fontSize: 10,
            letterSpacing: 2,
            color: "#fff",
            background: "#dc2626",
            border: "3px solid #000",
            borderBottom: "5px solid #000",
            padding: "10px 28px",
            cursor: "pointer",
          }}
        >
          RELOAD
        </button>
      )}
    </div>
  );
}
