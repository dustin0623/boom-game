"use client";

/**
 * components/login/LoginRobinhood.tsx
 *
 * Robinhood Chain (EVM) login — powered by Reown AppKit (WalletConnect v2).
 *
 * Flow:
 *   1. "Connect Wallet" → appKit.open({ namespace: "eip155" })
 *      → WalletConnect modal (MetaMask, Coinbase Wallet, Rabby, etc.)
 *      → works in ANY mobile browser via WC relay — no extension needed
 *   2. useAppKitAccount gives us the connected EVM address
 *   3. Sign a personal_sign challenge via useAppKitProvider("eip155")
 *   4. POST /api/auth/login (or /api/auth/register if first-time)
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
import type { Eip1193Provider } from "ethers";
import { BrowserProvider } from "ethers";
import { useGameStore, type BootstrapPayload } from "@/features/store/gameStore";
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
    "Sign in to Robin Boom",
    `Challenge: ${challenge}`,
    `Issued: ${new Date().toISOString()}`,
  ].join("\n");
}

export function LoginRobinhood() {
  const router            = useRouter();
  const hydrateFromServer = useGameStore((s) => s.hydrateFromServer);

  const { open }                 = useAppKit();
  const { disconnect }           = useDisconnect();
  const { address, isConnected } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider }       = useAppKitProvider<Eip1193Provider>("eip155");

  const [step,  setStep]  = useState<"idle" | "signing" | "authenticating" | "done">("idle");
  const [error, setError] = useState("");

  // userInitiated is only set to true when the player clicks "Connect Wallet".
  // Without this guard, wallets that are already connected from a prior session
  // would trigger the sign flow automatically on page load.
  const userInitiated = useRef(false);
  const authStarted   = useRef(false);

  const authenticate = useCallback(async (addr: string, provider: Eip1193Provider) => {
    setError("");
    try {
      // 1. Sign challenge via ethers BrowserProvider (wraps the EIP-1193 provider)
      setStep("signing");
      const message   = buildMessage(addr);
      const ethers    = new BrowserProvider(provider);
      const signer    = await ethers.getSigner();
      const signature = await signer.signMessage(message);

      // 2. Try login
      setStep("authenticating");
      const res  = await fetch("/api/auth/login", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ wallet: addr, signature, message }),
      });
      const data = await res.json() as AuthResponse;

      // 3. Auto-register on first visit
      if (!res.ok && data.code === "NOT_REGISTERED") {
        const regRes  = await fetch("/api/auth/register", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({ wallet: addr, signature, message }),
        });
        const regData = await regRes.json() as AuthResponse;
        if (!regRes.ok) {
          throw new Error(regData.error ?? "Registration failed. Try again.");
        }
        if (regData.token)  localStorage.setItem("bm_token", regData.token);
        // Do NOT call hydrate() here — that would set bootstrapped:true with an
        // empty roster before /api/bootstrap returns real heroes. Only patch
        // coins/stage so the store has the correct values when bootstrap arrives.
        if (regData.player) hydrateFromServer(regData.player.coins, regData.player.stage);
        setStep("done");
        router.push("/game");
        return;
      }

      if (!res.ok) throw new Error(data.error ?? "Authentication failed. Try again.");

      if (data.token)  localStorage.setItem("bm_token", data.token);
      // Do NOT call hydrate() here — that would set bootstrapped:true with an
      // empty roster before /api/bootstrap returns real heroes. Only patch
      // coins/stage so the store has the correct values when bootstrap arrives.
      if (data.player) hydrateFromServer(data.player.coins, data.player.stage);
      setStep("done");
      router.push("/game");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error. Try again.");
      setStep("idle");
      authStarted.current = false;
      disconnect();
    }
  }, [hydrateFromServer, router, disconnect]);

  // Trigger auth once wallet connects and provider is ready — but ONLY if
  // the player explicitly clicked "Connect Wallet" first (userInitiated).
  // This prevents wallets that are already connected from auto-firing the
  // signature request when the page loads.
  useEffect(() => {
    if (
      userInitiated.current &&
      isConnected &&
      address &&
      walletProvider &&
      step === "idle" &&
      !authStarted.current
    ) {
      authStarted.current = true;
      void authenticate(address, walletProvider as Eip1193Provider);
    }
  }, [isConnected, address, walletProvider, step, authenticate]);

  // Reset both guards when user disconnects
  useEffect(() => {
    if (!isConnected) {
      authStarted.current   = false;
      userInitiated.current = false;
    }
  }, [isConnected]);

  const handleConnect = () => {
    setError("");
    userInitiated.current = true;
    open({ namespace: "eip155" });
  };

  const label =
    step === "signing"        ? "Check your wallet..."  :
    step === "authenticating" ? "Authenticating..."      :
    step === "done"           ? "Redirecting..."         :
    isConnected               ? "Connected — signing..." :
    "Connect Wallet";

  return (
    <LoginCard chainLabel="Robinhood Chain" error={error}>
      <p style={{
        fontFamily:   bodyFont,
        fontSize:     18,
        color:        cream,
        opacity:      0.7,
        textAlign:    "center",
        marginBottom: 24,
        lineHeight:   1.4,
      }}>
        Connect your EVM wallet to play. Works in any browser — no extension needed on mobile.
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
            background:    step !== "idle" ? "rgba(250,204,21,0.3)" : gold,
            color:         step !== "idle" ? cream : "#000",
            border:        "4px solid #000",
            boxShadow:     step === "idle" ? "6px 6px 0 #000" : "none",
            cursor:        step !== "idle" ? "not-allowed" : "pointer",
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
        Supports MetaMask · Coinbase Wallet · Rabby · and 300+ wallets via WalletConnect
      </p>
    </LoginCard>
  );
}
