import { resetWalletState } from "@/features/events/frontend/reset-wallet-state/client";
import {
  waitForTransaction,
  TransactionRejected,
} from "@/features/events/frontend/confirm-transaction/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  authenticateWallet,
  resolveMeStatus,
  restoreWalletSession,
} from "@/features/events/frontend/authenticate-wallet/client";
import { payRegistration } from "@/features/events/frontend/registration-payment/client";
import { setAuthToken } from "@/lib/api/client";

export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 3) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export type AuthMode = "wallet";

interface AuthState {
  address: string | null;
  username: string | null;
  mode: AuthMode | null;
  connectedAt: number | null;
  apiConnected: boolean | null;
  /**
   * One-time on-chain HIVE registration gate — see
   * docs/GAME_ARCHITECTURE.md. `null` means "not yet known"
   * (still loading, or never checked) and must be treated the same as
   * "not registered" by any gate — never treated as "registered".
   */
  isRegistered: boolean | null;
  /**
   * Referral wallet that credited this player, if any — server-authoritative,
   * mirrors `Player.referredBy` (see docs/GAME_ARCHITECTURE.md).
   * `null` covers both "no referrer" and "not yet looked up"; the modal
   * treats both the same (shown as "no referrer on file").
   */
  referredBy: string | null;
  /**
   * Loader state machine for the registration-payment step (§5.3):
   * idle → awaiting-keychain-approval → confirming-onchain → idle (on
   * success/failure — success is reflected by `isRegistered` flipping true).
   */
  registrationPhase:
    "idle" | "awaiting-keychain-approval" | "confirming-onchain";
  connectWallet: (username: string) => Promise<string | null>;
  registerPlayer: (options?: { onSubmitted?: () => void }) => Promise<void>;
  disconnect: () => void;
}

let lastSessionIdentity = 0;
let loginAttempt = 0;
function nextSessionIdentity(previous = 0): number {
  lastSessionIdentity = Math.max(
    Date.now(),
    lastSessionIdentity + 1,
    previous + 1,
  );
  return lastSessionIdentity;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      address: null,
      username: null,
      mode: null,
      connectedAt: null,
      apiConnected: null,
      isRegistered: null,
      referredBy: null,
      registrationPhase: "idle",

      connectWallet: async (username) => {
        const attempt = ++loginAttempt;
        const origin = get();
        const current = () =>
          attempt === loginAttempt &&
          get().address === origin.address &&
          get().mode === origin.mode &&
          get().connectedAt === origin.connectedAt;
        const result = await authenticateWallet(username);
        if (!current()) throw new Error("Wallet session changed");
        if (!result) {
          setAuthToken(null);
          set({ apiConnected: false });
          throw new Error("Could not verify your wallet with the server");
        }
        setAuthToken(result.token);
        const wallet = { address: result.address };

        // The registration gate (§4.3/§5.2) is resolved from the server — a
        // returning registered player must not be re-prompted, and a
        // returning unregistered player must still be gated.
        const { isRegistered, referredBy } = await resolveMeStatus(result.refUsername);
        if (!current()) throw new Error("Wallet session changed");

        resetWalletState();
        set({
          address: wallet.address,
          // The Hive account name is the player's display name.
          username: wallet.address,
          mode: "wallet",
          connectedAt: nextSessionIdentity(get().connectedAt ?? 0),
          apiConnected: true,
          isRegistered,
          referredBy,
        });
        return wallet.address;
      },

      /**
       * Pays the one-time on-chain HIVE registration fee via Hive
       * Keychain, then waits for the independently observed payment to settle and
       * subscribes to shared receipt observations until settlement confirms it (see
       * docs/GAME_ARCHITECTURE.md §5.2). Throws on any failure
       * so the modal can surface a toast and let the player retry — never
       * silently marks `isRegistered: true` on the client without a
       * confirmed server response.
       */
      registerPlayer: async (options) => {
        const session = get();
        if (!session.address || session.mode !== "wallet")
          throw new Error("Connect your wallet first");
        if (session.registrationPhase !== "idle") return;
        const isCurrent = () =>
          get().address === session.address &&
          get().mode === session.mode &&
          get().connectedAt === session.connectedAt;
        await payRegistration({
          session,
          isCurrent,
          onSubmitted: options?.onSubmitted,
          onPhase: (phase) => {
            if (isCurrent()) set({ registrationPhase: phase });
          },
          confirm: (transactionId) =>
            waitForTransaction(transactionId, session, {
              type: "registration",
              registered: true,
            }),
          isRejected: (error) => error instanceof TransactionRejected,
        });
        if (isCurrent()) set({ isRegistered: true });
      },

      disconnect: () => {
        loginAttempt++;
        resetWalletState();
        setAuthToken(null);
        set({
          registrationPhase: "idle",
          address: null,
          username: null,
          mode: null,
          connectedAt: null,
          apiConnected: null,
          isRegistered: null,
          referredBy: null,
        });
      },
    }),
    {
      name: "chainframe-auth",
      version: 4,
      partialize: (state) => ({
        address: state.address,
        username: state.username,
        mode: state.mode,
        connectedAt: state.connectedAt,
      }),
      merge: (saved, current) => {
        const wallet = saved as Partial<AuthState> | undefined;
        if (wallet?.mode !== "wallet" || !wallet.address) return current;
        return {
          ...current,
          address: wallet.address,
          username: wallet.address,
          mode: "wallet",
          connectedAt: nextSessionIdentity(
            Math.max(current.connectedAt ?? 0, wallet.connectedAt ?? 0),
          ),
          apiConnected: null,
          isRegistered: null,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        resetWalletState();

        if (state.mode === "wallet" && state.address) {
          // Sessions persisted before usernames were removed may carry a
          // custom or null username — the Hive account name is the identity.
          state.username = state.address;
          // The server JWT is a long-lived token already persisted in
          // localStorage (see setAuthToken/loadAuthToken) — reuse it instead
          // of forcing a brand-new Hive Keychain approval popup on every
          // page refresh. Only fall back to the full challenge+sign
          // handshake (which requests Keychain approval) if that token is missing
          // or the server has since rejected it (expired/invalid).
          const origin = {
            address: state.address,
            mode: state.mode,
            connectedAt: state.connectedAt,
          };
          const isCurrent = () => {
            const current = useAuthStore.getState();
            return (
              current.address === origin.address &&
              current.mode === origin.mode &&
              current.connectedAt === origin.connectedAt
            );
          };
          void Promise.resolve()
            .then(() => restoreWalletSession(origin.address, isCurrent))
            .then((result) => {
              if (isCurrent()) useAuthStore.setState(result);
            })
            .catch(() => {
              if (isCurrent()) {
                useAuthStore.setState({ apiConnected: false });
                setAuthToken(null);
              }
            });
        } else {
          setAuthToken(null);
          state.apiConnected = false;
        }
      },
    },
  ),
);
