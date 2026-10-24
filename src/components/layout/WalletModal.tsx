import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Copy, History, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/features/stores/auth.store";
import {
  getDepositInfo,
  listWalletTransactions,
  requestWithdrawal,
  type WalletTransaction,
} from "@/lib/game/wallet/wallet.functions";

export const formatAmount = (value: number, decimals = 4) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });

function DepositTab() {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const [info, setInfo] = useState<{ address: string | null; tag: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!player || !token) return;
    getDepositInfo({ data: { playerId: player.id, token } })
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [player, token]);

  if (!info) return <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>;
  if (!info.address)
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        Deposits open soon. Mine coins in the meantime — they're already saved to your account.
      </p>
    );

  return (
    <div className="space-y-3 py-2">
      <p className="text-[13px] text-muted-foreground">
        Send XRP to the treasury address below. Include your destination tag so the deposit lands on your
        account.
      </p>
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Treasury address</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs">{info.address}</p>
          <button
            type="button"
            aria-label="Copy treasury address"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(info.address!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Your destination tag</p>
        <p className="font-mono text-lg font-bold tabular-nums text-primary">{info.tag}</p>
        {copied && <p className="mt-1 text-[11px] text-success">Copied</p>}
      </div>
    </div>
  );
}

function WithdrawTab({ coins, onWithdrawn }: { coins: number; onWithdrawn: (coins: number) => void }) {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!player || !token || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await requestWithdrawal({
        data: { playerId: player.id, token, amount: Number(amount) },
      });
      setMessage("Withdrawal queued — it will be sent to your wallet by the payout worker.");
      setAmount("");
      onWithdrawn(result.coins);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 py-2">
      <p className="text-[13px] text-muted-foreground">
        Withdraw mined coins to your connected wallet. The amount is reserved immediately and paid out by the
        worker.
      </p>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          max={coins}
          placeholder="Amount of coins"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button onClick={submit} disabled={busy || !amount || Number(amount) <= 0}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Withdraw"}
        </Button>
      </div>
      {message && <p className="text-[13px] text-muted-foreground">{message}</p>}
    </div>
  );
}

function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const [rows, setRows] = useState<WalletTransaction[] | null>(null);

  const load = useCallback(() => {
    if (!player || !token) return;
    listWalletTransactions({ data: { playerId: player.id, token } })
      .then(setRows)
      .catch(() => setRows([]));
  }, [player, token]);

  useEffect(load, [load, refreshKey]);

  if (!rows) return <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="py-8 text-center text-[13px] text-muted-foreground">No transactions yet.</p>;

  return (
    <div className="max-h-64 space-y-1.5 overflow-y-auto py-2">
      {rows.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[12px]"
        >
          <span className="capitalize">{t.action}</span>
          <span className="font-mono tabular-nums">{formatAmount(t.amount, 0)}</span>
          <span
            className={`ml-auto font-mono text-[10px] uppercase tracking-wider ${
              t.status === "completed" ? "text-success" : t.status === "failed" ? "text-destructive" : "text-warning"
            }`}
          >
            {t.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Wallet dialog: balance, deposit instructions, withdrawal queue and history. */
export function WalletModal({ coins, children }: { coins: number; children: ReactNode }) {
  const [balance, setBalance] = useState(coins);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => setBalance(coins), [coins]);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Wallet</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Coins balance</p>
          <p className="font-mono text-xl font-bold tabular-nums">{formatAmount(balance)}</p>
        </div>
        <Tabs defaultValue="deposit">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit" className="gap-1.5"><ArrowDownToLine className="size-3.5" />Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-1.5"><ArrowUpFromLine className="size-3.5" />Withdraw</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5"><History className="size-3.5" />History</TabsTrigger>
          </TabsList>
          <TabsContent value="deposit"><DepositTab /></TabsContent>
          <TabsContent value="withdraw">
            <WithdrawTab
              coins={balance}
              onWithdrawn={(c) => {
                setBalance(c);
                setHistoryKey((k) => k + 1);
              }}
            />
          </TabsContent>
          <TabsContent value="history"><HistoryTab refreshKey={historyKey} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
