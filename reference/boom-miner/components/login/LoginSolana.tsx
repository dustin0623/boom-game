"use client";

/**
 * components/login/LoginSolana.tsx
 *
 * Solana login — powered by Reown AppKit (WalletConnect v2).
 *
 * Flow:
 *   1. "Connect Wallet" → appKit.open({ namespace: "solana" })
 *      → WalletConnect modal (Phantom, Solflare, Backpack, etc.)
 *      → works in ANY mobile browser via WC relay — no extension needed
 *   2. useAppKitAccount gives us the connected address once approved
 *   3. Sign a challenge message via walletProvider.signMessage()
 *   4. POST /api/auth/login  (or /api/auth/register if first-time)
 *   5. Hydrate game store → redirect to /game
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import type { Provider as SolanaProvider } from "@reown/appkit-adapter-solana/react";
import type { BootstrapPayload } from "@/features/store/gameStore";
import { useGameStore } from "@/features/store/gameStore";
import { LoginCard } from "./LoginCard";

const gold      = "#facc15";
const cream     = "#f5e9c4";
const pixelFont = "'Press Start 2P', monospace";
const bodyFont  = "'VT323', monospace";

interface AuthResponse {
  success?: boolean;
  error?:   string;
  code?:    string;
  player?:  BootstrapPayload["player"];
  token?:   string;
}

function buildMessage(wallet: string): string {
  const challenge = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    "Sign in to Boom Miner",
    `Wallet: ${wallet}`,
    `Challenge: ${challenge}`,
    `Issued: ${new Date().toISOString()}`,
  ].join("\n");
}

export function LoginSolana() {
  const router   = useRouter();
  const hydrate  = useGameStore((s) => s.hydrate);

  const { open }                 = useAppKit();
  const { disconnect }           = useDisconnect();
  const { address, isConnected } = useAppKitAccount({ namespace: "solana" });
  const { walletProvider }       = useAppKitProvider<SolanaProvider>("solana");

  const [step,  setStep]  = useState<"idle" | "signing" | "authenticating" | "done">("idle");
  const [error, setError] = useState("");

  // Prevent the effect from firing more than once per connection
  const authStarted = useRef(false);

  const authenticate = useCallback(async (addr: string, provider: SolanaProvider) => {
    setError("");
    try {
      // 1. Sign challenge
      setStep("signing");
      const message = buildMessage(addr);
      const encoded = new TextEncoder().encode(message);
      const rawSig = await provider.signMessage(encoded);
      const { default: bs58 } = await import("bs58");
      const signature = bs58.encode(rawSig);

      // 2. Register is idempotent and also returns an authenticated session
      // for existing wallets, so a separate login request is unnecessary.
      setStep("authenticating");
      const res = await fetch("/api/auth/register", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ wallet: addr, signature, message }),
      });
      const data = await res.json() as AuthResponse;
      if (!res.ok) throw new Error(data.error ?? "Authentication failed. Try again.");

      if (data.token)  localStorage.setItem("bm_token", data.token);
      if (data.player) hydrate({ player: data.player, heroes: [] });
      setStep("done");
      router.push("/game");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error. Try again.");
      setStep("idle");
      authStarted.current = false;
      disconnect();
    }
  }, [hydrate, router, disconnect]);

  // Trigger auth once wallet connects and walletProvider is ready
  useEffect(() => {
    if (isConnected && address && walletProvider && step === "idle" && !authStarted.current) {
      authStarted.current = true;
      void authenticate(address, walletProvider as SolanaProvider);
    }
  }, [isConnected, address, walletProvider, step, authenticate]);

  // Reset guard when user disconnects
  useEffect(() => {
    if (!isConnected) authStarted.current = false;
  }, [isConnected]);

  const handleConnect = () => {
    setError("");
    open({ namespace: "solana" });
  };

  const label =
    step === "signing"        ? "Check your wallet..."  :
    step === "authenticating" ? "Authenticating..."      :
    step === "done"           ? "Redirecting..."         :
    isConnected               ? "Connected — signing..." :
    "Connect Wallet";

  return (
    <LoginCard chainLabel="Solana" error={error}>
      <p style={{
        fontFamily:   bodyFont,
        fontSize:     18,
        color:        cream,
        opacity:      0.7,
        textAlign:    "center",
        marginBottom: 24,
        lineHeight:   1.4,
      }}>
        Connect your Solana wallet to play. Works in any browser — no extension needed on mobile.
      </p>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          disabled={step !== "idle"}
          onClick={handleConnect}
          style={{
            fontFamily:    pixelFont,
            fontSize:      11,
            letterSpacing: 2,
            padding:       "14px 32px",
            background:    step !== "idle" ? "rgba(217,133,74,0.4)" : "#d9854a",
            color:         "#fff",
            border:        "none",
            cursor:        step !== "idle" ? "not-allowed" : "pointer",
            boxShadow:     step === "idle" ? "4px 4px 0 #000" : "none",
            transition:    "all 0.1s",
          }}
        >
          {label}
        </button>
      </div>

      {isConnected && address && step !== "idle" && (
        <p style={{
          fontFamily: bodyFont,
          fontSize:   14,
          color:      cream,
          opacity:    0.5,
          textAlign:  "center",
          marginTop:  16,
        }}>
          {address.slice(0, 6)}&hellip;{address.slice(-4)}
        </p>
      )}

      <p style={{
        fontFamily: bodyFont,
        fontSize:   13,
        color:      cream,
        opacity:    0.35,
        textAlign:  "center",
        marginTop:  20,
      }}>
        Supports Phantom · Solflare · Backpack · and 300+ wallets via WalletConnect
      </p>
    </LoginCard>
  );
}

// ── WalletButton is kept as a named export so ShopModal / other components
//    that still reference it do not break.
export function WalletButton({
  name, icon, subtitle, onClick, busy, disabled,
}: {
  name: string; icon: string; subtitle: string;
  onClick: () => void; busy: boolean; disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "12px 16px",
        cursor:     disabled ? "not-allowed" : "pointer",
        background: "rgba(255,255,255,0.04)",
        border:     "1px solid rgba(245,233,196,0.2)",
        opacity:    disabled && !busy ? 0.5 : 1,
        textAlign:  "left", transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = gold; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(245,233,196,0.2)"; }}
    >
      {icon
        ? <img src={icon} alt="" style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 }} />
        : <span style={{ width: 36, height: 36, background: "rgba(255,255,255,0.1)", borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: pixelFont, fontSize: 12, color: gold }}>{name[0]}</span>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: pixelFont, fontSize: 10, color: cream, letterSpacing: 1 }}>{name}</div>
        <div style={{ fontFamily: bodyFont,  fontSize: 14, color: cream, opacity: 0.5, marginTop: 2 }}>{subtitle}</div>
      </div>
      <span style={{ fontFamily: pixelFont, fontSize: 8, color: gold, letterSpacing: 1, flexShrink: 0 }}>
        {busy ? "..." : "CONNECT →"}
      </span>
    </button>
  );
}
