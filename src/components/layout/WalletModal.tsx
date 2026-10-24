import type { ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const formatAmount = (value: number, decimals = 4) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });

function Soon({ text }: { text: string }) {
  return <p className="py-8 text-center text-[13px] text-muted-foreground">{text}</p>;
}

/** Wallet dialog matching the Chainframe reference; transfers arrive with the backend. */
export function WalletModal({ coins, children }: { coins: number; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Wallet</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Coins balance</p>
          <p className="font-mono text-xl font-bold tabular-nums">{formatAmount(coins)}</p>
        </div>
        <Tabs defaultValue="deposit">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit" className="gap-1.5"><ArrowDownToLine className="size-3.5" />Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-1.5"><ArrowUpFromLine className="size-3.5" />Withdraw</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5"><History className="size-3.5" />History</TabsTrigger>
          </TabsList>
          <TabsContent value="deposit"><Soon text="Deposits are coming soon." /></TabsContent>
          <TabsContent value="withdraw"><Soon text="Withdrawals are coming soon." /></TabsContent>
          <TabsContent value="history"><Soon text="No transactions yet." /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
