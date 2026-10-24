"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Info, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CHEST_ODDS,
  CHESTS,
  RARITY_KEYS,
  RARITY_META,
} from "@/lib/config/constants/game";
import { MAX_CHEST_PURCHASE_QUANTITY } from "@/features/types/game/inventory";
import { formatShopPrice, formatHash, formatInt } from "@/lib/format";
import {
  getShopPurchaseTotal,
  getHivePurchaseTotal,
  getShopPriceShortfall,
} from "@/lib/utils/game/pricing";
import { iconByName } from "@/lib/icons";
import type { ChestKey } from "@/features/types/game/types";
interface ChestCardProps {
  chest: ChestKey;
  wallet: number;
  price: number | null;
  owned: number | null;
  busy?: boolean;
  unavailable?: boolean;
  onBuy: (chest: ChestKey, quantity: number) => void;
  hivePrice?: number | null;
  hiveBusy?: boolean;
  onBuyWithHive?: (chest: ChestKey, quantity: number) => void;
}
export function ChestCard({
  chest,
  wallet,
  price,
  owned,
  busy,
  unavailable,
  onBuy,
  hivePrice,
  hiveBusy,
  onBuyWithHive,
}: ChestCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const infoRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const previous = useRef(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (previous.current !== flipped)
      (flipped ? backRef : infoRef).current?.focus();
    previous.current = flipped;
  }, [flipped]);
  const config = CHESTS[chest],
    odds = CHEST_ODDS[chest];
  const Icon = iconByName(config.icon);
  let total: number | null = null,
    hiveTotal: number | null = null;
  try {
    if (price !== null) total = getShopPurchaseTotal(price, quantity);
  } catch {
    /* Unsafe totals cannot be purchased. */
  }
  try {
    if (hivePrice != null)
      hiveTotal = getHivePurchaseTotal(hivePrice, quantity);
  } catch {
    /* Keep invalid quotes disabled. */
  }
  const affordable = total !== null && wallet >= total;
  const pending = !!busy || !!hiveBusy;
  return (
    <div className="h-full min-w-0 [perspective:1000px]">
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="grid h-full [transform-style:preserve-3d]"
      >
        <div
          className="card-soft col-start-1 row-start-1 flex min-w-0 flex-col gap-4 p-5 [backface-visibility:hidden]"
          aria-hidden={flipped}
          inert={flipped}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-sm font-semibold">
                {config.label}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {config.blurb}
              </p>
            </div>
            <Button
              ref={infoRef}
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Show Equipment Chest drop rates"
              aria-expanded={flipped}
              onClick={() => setFlipped(true)}
            >
              <Info className="size-4" />
            </Button>
          </div>
          <dl className="space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="uppercase text-muted-foreground">Current price</dt>
              <dd className="font-mono text-sm font-semibold text-primary">
                {price === null
                  ? "Unavailable"
                  : formatShopPrice(price) + " HASH"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="uppercase text-muted-foreground">Owned</dt>
              <dd className="font-mono text-sm font-semibold">
                {owned === null ? "Unavailable" : formatInt(owned)}
              </dd>
            </div>
          </dl>
          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase text-muted-foreground">
                Quantity
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-11"
                  aria-label="Decrease Equipment Chest quantity"
                  disabled={pending || quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span
                  className="w-8 text-center font-mono text-sm"
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-11"
                  aria-label="Increase Equipment Chest quantity"
                  disabled={pending || quantity >= MAX_CHEST_PURCHASE_QUANTITY}
                  onClick={() =>
                    setQuantity((q) =>
                      Math.min(MAX_CHEST_PURCHASE_QUANTITY, q + 1),
                    )
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <Button
              className="min-h-11 w-full whitespace-normal break-words"
              disabled={!affordable || pending || unavailable}
              onClick={() => onBuy(chest, quantity)}
            >
              {busy
                ? "Awaiting confirmation..."
                : total === null
                  ? "Price unavailable"
                  : affordable
                    ? "Buy " +
                      quantity +
                      " — " +
                      formatShopPrice(total) +
                      " HASH"
                    : "Need " +
                      formatHash(getShopPriceShortfall(total, wallet)) +
                      " more HASH"}
            </Button>
            {onBuyWithHive && (
              <Button
                variant="outline"
                className="min-h-11 w-full whitespace-normal break-words"
                disabled={pending || unavailable || hiveTotal === null}
                onClick={() => onBuyWithHive(chest, quantity)}
              >
                {hiveBusy
                  ? "Awaiting confirmation..."
                  : hiveTotal === null
                    ? "HIVE price unavailable"
                    : "Buy with HIVE — " + formatShopPrice(hiveTotal) + " HIVE"}
              </Button>
            )}
          </div>
        </div>
        <div
          className="card-soft col-start-1 row-start-1 flex flex-col gap-4 p-5 [transform:rotateY(180deg)] [backface-visibility:hidden]"
          aria-hidden={!flipped}
          inert={!flipped}
        >
          <div>
            <h3 className="text-sm font-semibold">
              Equipment Chest drop rates
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Base odds before Luck. Your Luck is evaluated when you open the
              chest.
            </p>
          </div>
          <ul className="space-y-3 text-sm">
            {RARITY_KEYS.map((rarity) => (
              <li key={rarity} className="flex justify-between gap-2">
                <span className={RARITY_META[rarity].textClass}>
                  {RARITY_META[rarity].label}
                </span>
                <span className="font-mono">{odds[rarity]}%</span>
              </li>
            ))}
          </ul>
          <Button
            ref={backRef}
            type="button"
            variant="outline"
            className="mt-auto min-h-11 w-full"
            onClick={() => setFlipped(false)}
          >
            <ArrowLeft className="size-4" /> Back to purchase
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
