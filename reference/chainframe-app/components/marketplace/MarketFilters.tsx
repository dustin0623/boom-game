"use client";

import { Root as Select, Value as SelectValue } from "@radix-ui/react-select";
import {
  Root as DropdownMenu,
  Trigger as DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RARITY_KEYS,
  RARITY_META,
  SLOT_KEYS,
  SLOT_META,
} from "@/lib/config/constants/game";
import type { Rarity, SlotKey } from "@/features/types/game/types";
import { cn } from "@/lib/utils";

export function MarketFilters({
  open,
  slot,
  rarities,
  maxPrice,
  priceError,
  hasFilters,
  onSlot,
  onRarity,
  onMaxPrice,
  onClear,
}: {
  open: boolean;
  slot: SlotKey | "all";
  rarities: Rarity[];
  maxPrice: string;
  priceError?: string;
  hasFilters: boolean;
  onSlot: (slot: SlotKey | "all") => void;
  onRarity: (rarity: Rarity) => void;
  onMaxPrice: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <section
      id="market-filters"
      aria-label="Listing filters"
      className={cn(
        "rounded-xl border border-border bg-card/50 p-3 lg:block",
        !open && "hidden",
      )}
    >
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-1.5">
          <p
            id="market-slot-label"
            className="text-xs font-medium text-muted-foreground"
          >
            Equipment slot
          </p>
          <Select
            value={slot}
            onValueChange={(value) => onSlot(value as SlotKey | "all")}
          >
            <SelectTrigger aria-labelledby="market-slot-label" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-11">
                All slots
              </SelectItem>
              {SLOT_KEYS.map((key) => (
                <SelectItem key={key} value={key} className="min-h-11">
                  {SLOT_META[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p
            id="market-rarity-label"
            className="text-xs font-medium text-muted-foreground"
          >
            Rarity
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-11 w-full justify-between"
                aria-labelledby="market-rarity-label"
              >
                {rarities.length
                  ? `${rarities.length} selected`
                  : "All rarities"}
                <span aria-hidden="true">⌄</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {RARITY_KEYS.map((rarity) => (
                <DropdownMenuCheckboxItem
                  key={rarity}
                  className={cn("min-h-11", RARITY_META[rarity].textClass)}
                  checked={rarities.includes(rarity)}
                  onCheckedChange={() => onRarity(rarity)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {RARITY_META[rarity].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="market-max-price"
            className="block text-xs font-medium text-muted-foreground"
          >
            Max price (HIVE)
          </label>
          <Input
            id="market-max-price"
            value={maxPrice}
            onChange={(event) => onMaxPrice(event.target.value)}
            inputMode="decimal"
            placeholder="Any price"
            className="h-11"
            aria-invalid={!!priceError}
            aria-describedby={priceError ? "market-price-error" : undefined}
          />
          {priceError && (
            <p
              id="market-price-error"
              role="status"
              className="text-xs text-destructive"
            >
              {priceError}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          className="min-h-11 self-end lg:mt-[22px]"
          onClick={onClear}
          disabled={!hasFilters}
        >
          Clear filters
        </Button>
      </div>
    </section>
  );
}
