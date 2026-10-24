"use client";

import { useState } from "react";
import { Bomb, Loader2, Minus, Plus, ShieldPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatShopPrice, formatHash, formatInt } from "@/lib/format";
import {
  getShopPurchaseTotal,
  getHivePurchaseTotal,
  getShopPriceShortfall,
} from "@/lib/utils/game/pricing";
import { cn } from "@/lib/utils";
import {
  MAX_PURCHASE_QUANTITY,
  type ConsumableDefinition,
} from "@/features/types/game/consumables";

const KIND_STYLE = {
  sabotage: { icon: Bomb, accent: "text-destructive bg-destructive/15" },
  help: { icon: ShieldPlus, accent: "text-success bg-success/15" },
} as const;

interface ConsumableCardProps {
  consumable: ConsumableDefinition;
  /** Shared server-calculated unit price, or null while loading. */
  unitPrice: number | null;
  owned: number | null;
  wallet: number;
  /** True while a purchase request is in flight. */
  busy: boolean;
  unavailable?: boolean;
  /** Purchases require an authenticated wallet session. */
  purchasable: boolean;
  /** Only the item id and quantity are sent; the server prices the order. */
  onBuy: (itemId: ConsumableDefinition["id"], quantity: number) => void;
  /** Fixed HIVE price of one unit; the HIVE button shows only when this and onBuyWithHive are set. */
  hiveUnitPrice?: number | null | undefined;
  hiveBusy?: boolean | undefined;
  onBuyWithHive?:
    | ((itemId: ConsumableDefinition["id"], quantity: number) => void)
    | undefined;
}

export function ConsumableCard({
  consumable,
  unitPrice,
  owned,
  wallet,
  busy,
  unavailable,
  purchasable,
  onBuy,
  hiveUnitPrice,
  hiveBusy,
  onBuyWithHive,
}: ConsumableCardProps) {
  const [quantity, setQuantity] = useState(1);
  const { icon: Icon, accent } = KIND_STYLE[consumable.kind];

  const priceReady = unitPrice !== null;
  const total = priceReady ? getShopPurchaseTotal(unitPrice, quantity) : null;
  const affordable = total !== null && wallet >= total;
  const pending = busy || !!hiveBusy;

  const label = !purchasable
    ? "Connect a wallet to buy"
    : total === null
      ? "Loading price…"
      : affordable
        ? `Buy ${quantity} — ${formatShopPrice(total)} HASH`
        : `Need ${formatHash(getShopPriceShortfall(total, wallet))} more HASH`;

  return (
    <div className="card-soft flex h-full min-w-0 flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            accent,
          )}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold">
            {consumable.name}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {consumable.description}
          </p>
        </div>
      </div>

      <dl className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <dt className="uppercase tracking-wider text-muted-foreground">
            Current Price
          </dt>
          <dd className="font-mono text-sm font-semibold text-primary tabular-nums">
            {priceReady ? `${formatShopPrice(unitPrice)} HASH` : "…"}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="uppercase tracking-wider text-muted-foreground">
            Owned
          </dt>
          <dd className="font-mono text-sm font-semibold tabular-nums">
            {owned === null ? "Unavailable" : formatInt(owned)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Quantity
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-11"
              aria-label={`Decrease ${consumable.name} quantity`}
              disabled={pending || quantity <= 1}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            >
              <Minus className="size-3.5" />
            </Button>
            <span
              className="w-8 text-center font-mono text-sm tabular-nums"
              aria-live="polite"
            >
              {quantity}
            </span>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-11"
              aria-label={`Increase ${consumable.name} quantity`}
              disabled={pending || quantity >= MAX_PURCHASE_QUANTITY}
              onClick={() =>
                setQuantity((current) =>
                  Math.min(MAX_PURCHASE_QUANTITY, current + 1),
                )
              }
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
        <Button
          className="min-h-11 w-full whitespace-normal break-words"
          variant={affordable ? "default" : "secondary"}
          disabled={
            !purchasable ||
            !priceReady ||
            !affordable ||
            pending ||
            !!unavailable
          }
          onClick={() => onBuy(consumable.id, quantity)}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Buying…
            </>
          ) : (
            label
          )}
        </Button>
        {onBuyWithHive && purchasable && hiveUnitPrice != null ? (
          <Button
            className="min-h-11 w-full whitespace-normal break-words"
            variant="outline"
            disabled={busy || hiveBusy || unavailable}
            onClick={() => onBuyWithHive(consumable.id, quantity)}
          >
            {hiveBusy
              ? "Waiting for HIVE payment…"
              : `Buy with HIVE — ${formatShopPrice(getHivePurchaseTotal(hiveUnitPrice, quantity))} HIVE`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
