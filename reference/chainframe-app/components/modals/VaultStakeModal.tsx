import { useState } from "react";

import { StatActionButton } from "@/components/cards/StatUpgradeCard";
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
import { vaultCapacity } from "@/features/types/game/mining";
import { useGameActionFlow } from "@/hooks/useGameActionFlow";
import { buildIncreaseVaultAction } from "@/lib/utils/game/action-protocol";
import { firewallFromVault, luckFromVault } from "@/features/types/game/stats";
import { formatHash } from "@/lib/format";

export function VaultStakeModal({
  wallet,
  vaultStaked,
  hashRate,
}: {
  wallet: number;
  vaultStaked: number;
  hashRate: number;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const { lifecycle, errorMessage, busy, unavailable, run, reset } =
    useGameActionFlow({
      onSubmitted: () => {
        setAmount("");

        setOpen(false);
      },
    });
  const awaitingOrProcessed =
    lifecycle === "broadcast" || lifecycle === "processed";

  const qty = Number(amount);
  const valid = Number.isFinite(qty) && qty > 0 && qty <= wallet;
  const nextStaked = vaultStaked + (valid ? qty : 0);

  const luck = luckFromVault(vaultStaked);
  const nextLuck = luckFromVault(nextStaked);
  const firewall = firewallFromVault(vaultStaked);
  const nextFirewall = firewallFromVault(nextStaked);

  const confirm = () => {
    if (!valid || busy) return;
    reset();
    void executeStake();
  };

  const executeStake = async () => {
    if (!valid || busy) return;
    const amountToStake = qty;
    await run({
      build: (nonce) =>
        buildIncreaseVaultAction({ amount: amountToStake, nonce }),
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogTrigger asChild>
          <StatActionButton>Increase Vault</StatActionButton>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Increase Vault</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Send HASH to your vault to increase its capacity and raise your Luck
            and Firewall skills. HASH in the vault stays in the rig.
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="Amount"
                disabled={busy || awaitingOrProcessed}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                HASH
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Wallet balance:</span>
              <button
                type="button"
                className="text-primary hover:underline"
                disabled={busy || awaitingOrProcessed}
                onClick={() => setAmount(String(Math.floor(wallet)))}
              >
                {formatHash(wallet)} HASH
              </button>
            </div>
            <div className="space-y-1 border-t border-border/40 pt-2 text-xs text-muted-foreground">
              <div>
                <span className="text-primary">▲</span> Vault capacity:{" "}
                <span className="text-foreground tabular-nums">
                  {formatHash(vaultCapacity(nextStaked, hashRate), 4, false)}{" "}
                  HASH
                </span>
              </div>
              <div>
                <span className="text-primary">▲</span> Luck:{" "}
                <span className="font-semibold text-primary">
                  +{formatHash(Math.max(0, nextLuck - luck), 4, false)}%
                </span>
                , Total:{" "}
                <span className="text-foreground">
                  {formatHash(nextLuck, 4, false)}%
                </span>
              </div>
              <div>
                <span className="text-primary">▲</span> Firewall:{" "}
                <span className="font-semibold text-primary">
                  +{formatHash(Math.max(0, nextFirewall - firewall), 4, false)}%
                </span>
                , Total:{" "}
                <span className="text-foreground">
                  {formatHash(nextFirewall, 4, false)}%
                </span>
              </div>
            </div>
          </div>
          {errorMessage ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {lifecycle === "broadcasting" ? (
            <p role="status" className="text-xs text-muted-foreground">
              Waiting for Hive Keychain approval…
            </p>
          ) : null}
          <Button
            className="mt-4 w-full"
            variant="outline"
            disabled={!valid || busy || unavailable || awaitingOrProcessed}
            loading={busy}
            onClick={confirm}
          >
            {busy
              ? "Sending…"
              : lifecycle === "broadcast"
                ? "Awaiting processing"
                : lifecycle === "processed"
                  ? "Processed"
                  : "Confirm"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
