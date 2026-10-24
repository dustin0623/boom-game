import { useNow } from "@/hooks/useNow";
import { registrationStarterItems, describeShopItems } from "@/features/types/game/inventory";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useWorkerStore } from "@/features/stores/workerStore";
import { useRouter, usePathname } from "next/navigation";
import {
  AUTHENTICATED_BROWSING_PATHS,
  NAV_ITEMS,
} from "@/lib/config/constants/nav";
import {
  Wallet,
  Loader2,
  UserRound,
  CheckCircle2,
  Coins,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Root as Dialog,
  Trigger as DialogTrigger,
} from "@radix-ui/react-dialog";
import { useAuthStore, shortAddress } from "@/features/stores/authStore";
import {
  useTransactionStore,
  transactionSessionKey,
} from "@/features/stores/transactionStore";
import { usePlayerStore } from "@/features/stores/playerStore";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import {
  REGISTRATION_FEE_HIVE,
  REGISTRATION_STARTING_HASH,
} from "@/lib/config/constants/game";
import { refreshWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { isValidHiveUsername } from "@/lib/utils/hive/validation";

export function ConnectWalletModal({
  children,
  open,
  onOpenChange,
}: {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
}) {
  const starterItems = registrationStarterItems(useNow());
  const [internalOpen, setInternalOpen] = useState(false);
  const workerAvailable = useWorkerStore((state) => state.available);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };

  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const submittedRegistration = useTransactionStore(
    (state) =>
      state.registrationSubmitted &&
      state.session ===
        transactionSessionKey({ address, mode: "wallet", connectedAt }),
  );
  const connectWallet = useAuthStore((state) => state.connectWallet);

  const authenticated = useAuthStore((state) => state.apiConnected === true);
  const mode = useAuthStore((state) => state.mode);
  const isRegistered = useAuthStore((state) => state.isRegistered);
  const referredBy = useAuthStore((state) => state.referredBy);
  const registrationPhase = useAuthStore((state) => state.registrationPhase);
  const registerPlayer = useAuthStore((state) => state.registerPlayer);
  const keychainInstalled =
    typeof window !== "undefined" && hiveClient.keychain.isAvailable();
  // Hive Keychain (like most extension wallets) only injects its content
  // script into top-level frames, never into iframes — so this is truthy
  // whenever the app is rendered inside an embedded preview, regardless of
  // whether Keychain is actually installed in the surrounding browser.
  const isEmbeddedFrame =
    typeof window !== "undefined" && window.self !== window.top;
  const syncPlayerFromApi = usePlayerStore((state) => state.syncFromApi);
  const router = useRouter();
  const pathname = usePathname();
  const browsing = AUTHENTICATED_BROWSING_PATHS.some(
    (path) => path === pathname,
  );
  // Only application-controlled destinations; never accept an arbitrary redirect URL.
  const destination =
    NAV_ITEMS.some((item) => item.to === pathname) || pathname === "/profile"
      ? pathname
      : "/dashboard";

  const [pending, setPending] = useState(false);
  // The Hive account name typed into the wallet step; it becomes the player's identity.
  const [username, setUsername] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [checkingWorker, setCheckingWorker] = useState(false);
  async function retryWorker() {
    const origin = useAuthStore.getState();
    const current = () => {
      const session = useAuthStore.getState();
      return (
        session.address === origin.address &&
        session.connectedAt === origin.connectedAt &&
        session.mode === origin.mode
      );
    };
    setCheckingWorker(true);
    try {
      await refreshWorkerReadiness(current);
    } catch {
      /* The changed session discards this result. */
    } finally {
      setCheckingWorker(false);
    }
  }

  // The registration gate (docs/GAME_ARCHITECTURE.md §5.3) only
  // applies to authenticated wallet sessions, and
  // `null` ("unknown"/still loading) must be treated the same as "not
  // registered" so a transient lookup failure can never skip the gate.
  const needsRegistration =
    authenticated &&
    mode === "wallet" &&
    address !== null &&
    isRegistered === false;

  // The registration step begins once the wallet handshake succeeded but the
  // one-time HIVE registration fee hasn't been confirmed on-chain yet.
  const step: "wallet" | "registration" = needsRegistration
    ? "registration"
    : "wallet";
  const forcedRegistration =
    step === "registration" && !browsing && !submittedRegistration;
  const trimmedUsername = username.trim().toLowerCase();
  const usernameValid = isValidHiveUsername(trimmedUsername);

  async function handleRegister() {
    const origin = useAuthStore.getState();
    let submitted = false;
    const current = () => {
      const state = useAuthStore.getState();
      return (
        state.address === origin.address &&
        state.connectedAt === origin.connectedAt &&
        state.mode === origin.mode
      );
    };
    setRegistering(true);
    setRegistrationError(null);
    try {
      await registerPlayer({
        onSubmitted: () => {
          submitted = true;
          if (mounted.current && current()) setOpen(false);
        },
      });
      if (current() && mounted.current) await enterGame();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      if (!submitted && mounted.current && current())
        setRegistrationError(message);
    } finally {
      if (mounted.current && current()) setRegistering(false);
    }
  }

  async function handleConnect() {
    if (!keychainInstalled) {
      if (isEmbeddedFrame) {
        toast.error(
          "Hive Keychain can't open inside this embedded preview — open the app in a new tab to sign in.",
        );
      } else {
        toast.error("Install Hive Keychain to continue");
      }
      return;
    }
    if (!usernameValid) return;
    setPending(true);
    try {
      await connectWallet(trimmedUsername);
      // Authenticated browsing does not require payment or gameplay hydration.
      if (
        mounted.current &&
        (browsing || useAuthStore.getState().isRegistered === true)
      ) {
        setOpen(false);
        if (!browsing) router.push(destination);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect wallet";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function enterGame() {
    const origin = useAuthStore.getState();
    // Sync authoritative player data from the server before entering the game
    // so the store reflects real DB values (hash=0, vault=0) not initialState defaults.
    await syncPlayerFromApi();
    const current = useAuthStore.getState();
    if (
      !mounted.current ||
      current.apiConnected !== true ||
      current.address !== origin.address ||
      current.connectedAt !== origin.connectedAt ||
      current.mode !== origin.mode
    )
      return;
    setUsername("");
    setOpen(false);
    router.push(destination);
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(value) => {
        // Registration is required before entering the game.
        if (!value && forcedRegistration) return;
        setOpen(value);
      }}
    >
      {children && !isControlled && (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={!forcedRegistration}
        onEscapeKeyDown={(event) => {
          if (forcedRegistration) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (forcedRegistration) event.preventDefault();
        }}
      >
        {step === "wallet" ? (
          <>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Wallet className="size-4" />
                </span>
                <span className="font-semibold">Connect wallet</span>
              </div>
              <DialogTitle className="sr-only">
                Sign in with Hive Keychain
              </DialogTitle>
              <DialogDescription>
                Enter your Hive username and approve a Keychain message
                signature. No payment is made.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <div className="space-y-2">
                <Label htmlFor="hive-username" className="text-[12px]">
                  Hive username
                </Label>
                <Input
                  id="hive-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="e.g. satoshi"
                  autoComplete="username"
                  maxLength={16}
                  disabled={pending}
                />
              </div>
              <Button
                className="h-11 w-full justify-between"
                disabled={pending || !usernameValid}
                onClick={handleConnect}
              >
                <span className="flex items-center gap-2">
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wallet className="size-4" />
                  )}
                  Sign in with Hive Keychain
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider opacity-70">
                  {keychainInstalled ? "Recommended" : "Install"}
                </span>
              </Button>
              {isEmbeddedFrame && !keychainInstalled && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Hive Keychain can&apos;t open inside this embedded preview.{" "}
                    <button
                      type="button"
                      className="font-medium text-foreground underline underline-offset-2"
                      onClick={() =>
                        window.open(
                          window.location.href,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      Open in a new tab
                    </button>{" "}
                    to sign in.
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Coins className="size-4" />
                </span>
                <span className="font-semibold">One-time registration</span>
              </div>
              <DialogTitle className="sr-only">
                Pay the one-time HIVE registration fee
              </DialogTitle>
              <DialogDescription>
                A one-time on-chain HIVE payment activates your account and
                secures the network against spam accounts. Once registration is
                confirmed, you receive {REGISTRATION_STARTING_HASH} HASH as your
                starting balance.
              </DialogDescription>
            </DialogHeader>

            {starterItems.length > 0 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                <p className="font-semibold">Limited-time registration starter pack</p>
                <p>{starterItems.map(({ itemId, quantity }) => describeShopItems(itemId, quantity)).join(" · ")}</p>
                <p>For qualifying new paid registrations. Ends 2 November 2026, 8:00 AM Singapore time (00:00 UTC). Your verified payment time determines eligibility.</p>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                Wallet connected
              </span>
              <span className="shrink-0 font-mono text-[11px]">
                {address ? shortAddress(address) : ""}
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                Referrer
              </span>
              <span className="shrink-0 font-mono text-[11px]">
                {referredBy ? shortAddress(referredBy) : "None on file"}
              </span>
            </div>
            {!referredBy && (
              <p className="text-[11px] text-muted-foreground">
                No referrer is linked to your account. Open your inviter&apos;s
                referral link and reconnect before your first registration
                payment.
              </p>
            )}

            {
              <div className="space-y-1 rounded-md border border-border bg-muted/20 px-3 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-muted-foreground">
                    Registration fee
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {REGISTRATION_FEE_HIVE} HIVE
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  One-time fixed fee. It does not change with the HIVE market
                  price.
                </p>
              </div>
            }

            {workerAvailable !== true ? (
              <div
                role="status"
                className="space-y-2 text-xs text-muted-foreground"
              >
                <p>
                  Game processing is unavailable. Registration payments are
                  paused.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checkingWorker}
                  onClick={() => void retryWorker()}
                >
                  {checkingWorker ? "Checking…" : "Retry availability"}
                </Button>
              </div>
            ) : null}
            {registrationError ? (
              <p role="alert" className="text-xs text-destructive">
                {registrationError}
              </p>
            ) : null}
            <Button
              className="h-11 w-full gap-2"
              disabled={registering || workerAvailable !== true}
              onClick={() => void handleRegister()}
            >
              {registering && <Loader2 className="size-4 animate-spin" />}
              {registrationPhase === "awaiting-keychain-approval"
                ? "Approve in Hive Keychain…"
                : registrationPhase === "confirming-onchain"
                  ? "Confirming on-chain…"
                  : "Pay & register with Hive Keychain"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              This is a one-time fee, paid once per Hive account. Confirmation
              can take a few moments after you approve the transfer in Keychain.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
