import { useWorkerStore } from "@/features/stores/workerStore";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  History,
  Loader2,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Root as Dialog,
  Trigger as DialogTrigger,
} from "@radix-ui/react-dialog";
import { Input } from "@/components/ui/input";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Root as Tabs } from "@radix-ui/react-tabs";
import { formatHash } from "@/lib/format";
import { useAuthStore } from "@/features/stores/authStore";

import { withdrawalCapacity } from "@/features/types/game/economy";
import {
  getTransactions,
  getTreasuryBalance,
  withdraw,
} from "@/lib/api/client";
import type { PendingTxDto, SettledTxDto } from "@/lib/api/types";
import { getHiveTreasuryAccount } from "@/lib/utils/hive/wallet";
import { hiveClient } from "@/lib/chains/modules/hive/client";

import { depositHash } from "@/features/events/frontend/deposit-hash/client";

const TX_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400",
  failed: "bg-amber-500/10 text-amber-400",
  dead: "bg-rose-500/10 text-rose-400",
  settled: "bg-emerald-500/10 text-emerald-400",
};

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
        STATUS_STYLES[status] ?? "bg-muted/40 text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function fmtWhen(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TxRow({
  label,
  when,
  amount,
  status,
  statusLabel,
  note,
}: {
  label: string;
  when: number;
  amount: number | null;
  status: string;
  statusLabel: string;
  note?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{label}</span>
          <StatusPill status={status} label={statusLabel} />
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {fmtWhen(when)}
        </p>
        {note ? (
          <p
            className="mt-0.5 truncate text-[10px] text-rose-400/80"
            title={note}
          >
            {note}
          </p>
        ) : null}
      </div>
      {amount !== null ? (
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {amount > 0 ? "+" : amount < 0 ? "-" : ""}
          {formatHash(Math.abs(amount))}
        </span>
      ) : null}
    </div>
  );
}

function HistoryPanel({ open }: { open: boolean }) {
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingTxDto[]>([]);
  const [history, setHistory] = useState<SettledTxDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getTransactions(25);
    if (result.ok) {
      // The wallet's History tab is for on-chain HASH movement only.
      // Marketplace purchases have their own feed in Notifications > Market,
      // so exclude them here to avoid showing the same activity twice.
      setPending(
        (result.pending ?? []).filter((tx) => tx.type !== "market_purchase"),
      );
      setHistory(
        (result.history ?? []).filter((tx) => tx.type !== "market_purchase"),
      );
      setError(null);
    } else {
      setError(result.error ?? "Could not load transactions");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const empty = !loading && pending.length === 0 && history.length === 0;

  return (
    <div className="mt-3 max-h-72 overflow-y-auto pr-1">
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading transactions…
        </div>
      ) : error ? (
        <p className="py-6 text-xs text-muted-foreground">{error}</p>
      ) : empty ? (
        <p className="py-6 text-xs text-muted-foreground">
          No transactions yet. Deposits and withdrawals will show up here.
        </p>
      ) : (
        <>
          {pending.length > 0 ? (
            <>
              <p className="flex items-center gap-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock className="size-3" /> Awaiting settlement
              </p>
              {pending.map((tx) => (
                <TxRow
                  key={tx.id}
                  label={TX_LABELS[tx.type] ?? tx.type}
                  when={tx.createdAt}
                  amount={
                    tx.type === "game_action"
                      ? null
                      : tx.type === "deposit"
                        ? tx.amount
                        : -tx.amount
                  }
                  status={tx.status}
                  statusLabel={
                    tx.refunded
                      ? "refunded"
                      : tx.status === "dead"
                        ? "failed"
                        : tx.status === "failed"
                          ? `retrying ${tx.retryCount}`
                          : tx.status === "reconciliation"
                            ? "review required"
                            : "pending"
                  }
                  note={tx.error}
                />
              ))}
            </>
          ) : null}

          {history.length > 0 ? (
            <>
              <p className="pb-1 pt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Settled
              </p>
              {history.map((tx) => (
                <TxRow
                  key={tx.id}
                  label={TX_LABELS[tx.type] ?? tx.type}
                  when={tx.processedAt}
                  amount={tx.type === "game_action" ? null : tx.amount}
                  status={tx.status === "failed" ? "dead" : "settled"}
                  statusLabel={tx.status === "failed" ? "failed" : "confirmed"}
                  note={tx.error}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Shows the treasury's real on-chain HASH balance so players can see the
 * size of the vault backing every deposit. Public information — loads
 * for all visitors, and fails silently (renders nothing)
 * rather than showing an error, since it's a nice-to-have, not core wallet
 * functionality.
 */
function TreasuryBalance({ open }: { open: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void getTreasuryBalance().then((result) => {
      if (cancelled) return;
      setBalance(result.ok ? (result.balance ?? 0) : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!loading && balance === null) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Treasury balance
      </p>
      {loading && balance === null ? (
        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span className="text-xs">Loading…</span>
        </div>
      ) : (
        <p className="font-mono text-xl font-bold tabular-nums">
          {formatHash(balance ?? 0)} HASH
        </p>
      )}
    </div>
  );
}

/** Formats ms remaining as "Xh Ym" or "Xm" */
function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMins = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Withdraw tab content — separated to keep the parent component readable. */
function WithdrawPanel({
  wallet,
  notoriety,
  withdrawnToday: withdrawnTodayRaw,
  withdrawResetAt,
  chainReady,
  onSuccess,
}: {
  wallet: number;
  notoriety: number;
  withdrawnToday: number;
  withdrawResetAt: number;
  chainReady: boolean;
  onSuccess: () => void;
}) {
  const workerAvailable = useWorkerStore((state) => state.available);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [now, setNow] = useState(() => Date.now());

  // Tick every minute to keep countdown live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Lazy-reset: if the window has expired treat withdrawnToday as 0 client-side.
  const effectiveWithdrawnToday = now > withdrawResetAt ? 0 : withdrawnTodayRaw;
  const dailyCap = Math.floor(withdrawalCapacity(notoriety));
  const remaining = Math.max(0, dailyCap - effectiveWithdrawnToday);
  const limitExhausted = remaining <= 0;
  const msUntilReset = withdrawResetAt > now ? withdrawResetAt - now : 0;

  const qty = Number(amount);
  const valid =
    chainReady &&
    !limitExhausted &&
    Number.isInteger(qty) &&
    qty > 0 &&
    qty <= wallet &&
    qty <= remaining;

  const handleMaxClick = () => {
    const max = Math.floor(Math.min(wallet, remaining));
    setAmount(String(max));
  };

  // Whole HASH only — strip decimal points/commas as the user types so the
  // amount is always an integer, keeping withdrawals predictable on-chain.
  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(event.target.value.replace(/[^\d]/g, ""));
  };

  const handleConfirm = async () => {
    if (!valid || submitting || !chainReady) return;
    const session = useAuthStore.getState();
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        mounted.current &&
        current.address === session.address &&
        current.mode === session.mode &&
        current.connectedAt === session.connectedAt
      );
    };
    setSubmitting(true);
    setError(null);
    let submitted = false;
    try {
      const result = await withdraw(qty, () => {
        submitted = true;
        if (isCurrent()) onSuccess();
      });
      if (result.ok) {
        // Personal history owns the authoritative balance refresh.
        if (!submitted && isCurrent()) onSuccess();
      } else {
        if (!submitted && isCurrent())
          setError(result.error ?? "Withdrawal failed");
      }
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
  };

  // --- Chain not configured yet ---
  if (!chainReady) {
    return (
      <div className="mt-3 rounded-lg border border-border/50 bg-muted/10 p-4 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border border-border/50 bg-muted/30">
          <Lock className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Withdrawals unavailable
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          On-chain payouts aren&apos;t configured yet. Try again later.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Daily cap summary */}
      <div className="mt-3 space-y-1.5 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>Daily limit</span>
          <span>Used / Cap</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="size-3 text-primary/70" />
            <span className="font-mono text-xs font-semibold tabular-nums">
              {formatHash(effectiveWithdrawnToday)}
              <span className="text-muted-foreground">
                {" "}
                / {formatHash(dailyCap)}
              </span>
            </span>
          </div>
          {limitExhausted ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-amber-400">
              <Clock className="size-3" />
              Resets in {fmtCountdown(msUntilReset)}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-emerald-400">
              {formatHash(remaining)} remaining
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
          <div
            className="h-full rounded-full bg-primary/60 transition-all duration-500"
            style={{
              width: `${Math.min(100, (effectiveWithdrawnToday / dailyCap) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Limit exhausted notice */}
      {limitExhausted ? (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-400">
          Daily withdrawal limit reached. Resets in{" "}
          <span className="font-semibold">{fmtCountdown(msUntilReset)}</span>.
          Your daily capacity is 10 HASH plus 0.10 per notoriety.
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Pull HASH out of the rig and back to your connected wallet.
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="Amount"
                value={amount}
                onChange={handleAmountChange}
                disabled={submitting}
              />
              <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                HASH
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Whole HASH only — no decimals.
            </p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Available:</span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={handleMaxClick}
              >
                {formatHash(Math.min(wallet, remaining))} HASH
              </button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            className="mt-4 w-full"
            disabled={!valid || submitting || workerAvailable !== true}
            onClick={handleConfirm}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Awaiting Keychain
                approval…
              </span>
            ) : (
              "Withdraw"
            )}
          </Button>
        </>
      )}
    </>
  );
}

/** Deposit / withdraw HASH between the on-chain wallet and the in-game balance. */
export function WalletModal({
  children,
  wallet,
  notoriety,
  withdrawnToday,
  withdrawResetAt,
}: {
  children: ReactNode;
  wallet: number;
  notoriety: number;
  withdrawnToday: number;
  withdrawResetAt: number;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const workerAvailable = useWorkerStore((state) => state.available);
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  useEffect(() => {
    let session = useAuthStore.getState();
    return useAuthStore.subscribe((current) => {
      if (
        current.address === session.address &&
        current.mode === session.mode &&
        current.connectedAt === session.connectedAt
      )
        return;
      session = current;
      setOpen(false);
      setDepositing(false);
      setDepositAmount("");
      setDepositError(null);
    });
  }, []);

  const depositQty = Number(depositAmount);
  const depositValid = Number.isInteger(depositQty) && depositQty > 0;

  // Whole HASH only — strip decimal points/commas as the user types so the
  // amount is always an integer, keeping on-chain deposits predictable.
  const handleDepositAmountChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setDepositAmount(event.target.value.replace(/[^\d]/g, ""));
  };
  const chainReady =
    hiveClient.keychain.isAvailable() && getHiveTreasuryAccount().length > 0;

  const confirmDeposit = async () => {
    if (!depositValid || depositing) return;

    if (!chainReady) {
      setDepositError(
        "On-chain deposits aren't configured yet. Try again later.",
      );
      return;
    }

    setDepositing(true);
    setDepositError(null);
    let submitted = false;
    const session = useAuthStore.getState();
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        current.address === session.address &&
        current.mode === session.mode &&
        current.connectedAt === session.connectedAt
      );
    };
    try {
      const result = await depositHash(depositQty, {
        session,
        isCurrent,
        onSubmitted: () => {
          submitted = true;
          if (isCurrent() && mounted.current) {
            setDepositAmount("");
            setOpen(false);
          }
        },
      });
      if (!result || !isCurrent() || !mounted.current) return;
      setDepositAmount("");
    } catch (err) {
      if (!submitted && isCurrent() && mounted.current)
        setDepositError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      if (isCurrent() && mounted.current) setDepositing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>HASH Wallet</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              In-game balance
            </p>
            <p className="font-mono text-xl font-bold tabular-nums">
              {formatHash(wallet)} HASH
            </p>
          </div>
          <TreasuryBalance open={open} />
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as "deposit" | "withdraw" | "history");
            setDepositAmount("");
          }}
          className="mt-3"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit" className="gap-1.5">
              <ArrowDownToLine className="size-3.5" /> Deposit
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-1.5">
              <ArrowUpFromLine className="size-3.5" />
              Withdraw
              {!chainReady && <Lock className="size-3 text-muted-foreground" />}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="size-3.5" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="deposit"
            className="mt-3 text-xs text-muted-foreground"
          >
            {
              "Send HASH tokens from your connected wallet to the treasury. You'll sign the transfer, and your in-game balance updates once it's confirmed on-chain."
            }
          </TabsContent>

          <TabsContent value="withdraw">
            <WithdrawPanel
              wallet={wallet}
              notoriety={notoriety}
              withdrawnToday={withdrawnToday}
              withdrawResetAt={withdrawResetAt}
              chainReady={chainReady}
              onSuccess={() => setOpen(false)}
            />
          </TabsContent>

          <TabsContent value="history">
            <HistoryPanel open={open && tab === "history"} />
          </TabsContent>
        </Tabs>

        {tab === "deposit" && (
          <div className="mt-3 space-y-2">
            {!chainReady ? (
              <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                On-chain deposits aren&apos;t configured yet. Try again later.
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="Amount"
                value={depositAmount}
                onChange={handleDepositAmountChange}
                disabled={depositing}
              />
              <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                HASH
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Whole HASH only — no decimals.
            </p>
            {depositError ? (
              <p role="alert" className="text-xs text-destructive">
                {depositError}
              </p>
            ) : null}
            <Button
              className="mt-2 w-full"
              disabled={
                !depositValid ||
                depositing ||
                !chainReady ||
                workerAvailable !== true
              }
              onClick={() => void confirmDeposit()}
            >
              {depositing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" /> Awaiting
                  Keychain approval…
                </span>
              ) : (
                "Sign & deposit"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
