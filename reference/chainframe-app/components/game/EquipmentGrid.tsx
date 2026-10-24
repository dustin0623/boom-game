import { AnimatePresence } from "framer-motion";
import {
  PackageSearch,
  PackageX,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EquipmentCard } from "@/components/cards/EquipmentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Root as Select, Value as SelectValue } from "@radix-ui/react-select";
import {
  RARITY_KEYS,
  RARITY_META,
  SLOT_KEYS,
  SLOT_META,
} from "@/lib/config/constants/game";
import { equipmentScore } from "@/features/types/game/stats";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Equipment } from "@/features/types/game/types";

type SortKey = "score" | "newest" | "rarity" | "name";

interface EquipmentGridProps {
  items: Equipment[];
  onEquip?: ((item: Equipment) => void) | undefined;
  onUnequip?: ((item: Equipment) => void) | undefined;
  onUpgrade?: ((item: Equipment) => void) | undefined;
  onSalvage?: ((item: Equipment) => void) | undefined;
  onSell?: ((item: Equipment) => void) | undefined;
  loaded: boolean;
  unavailable: boolean;
  actionsDisabled: boolean;
  hasOwnedChests: boolean;
  onViewChests: () => void;
}

export function EquipmentGrid({
  items,
  onEquip,
  onUnequip,
  onUpgrade,
  onSalvage,
  onSell,
  loaded,
  unavailable,
  actionsDisabled,
  hasOwnedChests,
  onViewChests,
}: EquipmentGridProps) {
  const [search, setSearch] = useState("");
  const [slot, setSlot] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [status, setStatus] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const clear = () => {
    setSearch("");
    setSlot("all");
    setRarity("all");
    setStatus("all");
  };
  const chips = [
    ...(search.trim()
      ? [{ label: `Search: ${search.trim()}`, remove: () => setSearch("") }]
      : []),
    ...(slot !== "all"
      ? [
          {
            label: SLOT_META[slot as keyof typeof SLOT_META].label,
            remove: () => setSlot("all"),
          },
        ]
      : []),
    ...(rarity !== "all"
      ? [
          {
            label: RARITY_META[rarity as keyof typeof RARITY_META].label,
            remove: () => setRarity("all"),
          },
        ]
      : []),
    ...(status !== "all"
      ? [
          {
            label: status === "equipped" ? "Equipped" : "Unequipped",
            remove: () => setStatus("all"),
          },
        ]
      : []),
  ];
  const activeFilters =
    Number(slot !== "all") +
    Number(rarity !== "all") +
    Number(status !== "all");

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (slot !== "all" && item.slot !== slot) return false;
      if (rarity !== "all" && item.rarity !== rarity) return false;
      if (status === "equipped" && !item.equipped) return false;
      if (status === "unequipped" && item.equipped) return false;
      if (query && !item.name.toLowerCase().includes(query)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      // Equipped gear always leads the grid, no matter which sort mode is
      // active, so players see what they're using without scrolling.
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;

      if (sort === "newest") return b.createdAt - a.createdAt;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "rarity") {
        return RARITY_KEYS.indexOf(b.rarity) - RARITY_KEYS.indexOf(a.rarity);
      }
      return equipmentScore(b) - equipmentScore(a);
    });
  }, [items, search, slot, rarity, sort, status]);

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap gap-2">
        <div className="relative w-full min-w-0 sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search gear"
            className="h-11 pl-9"
            aria-label="Search equipment"
          />
        </div>

        <Select
          value={sort}
          onValueChange={(value) => setSort(value as SortKey)}
        >
          <SelectTrigger
            aria-label="Sort inventory"
            className="h-11 min-w-0 flex-1 sm:w-44 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="min-h-11" value="score">
              Power score
            </SelectItem>
            <SelectItem className="min-h-11" value="rarity">
              Rarity
            </SelectItem>
            <SelectItem className="min-h-11" value="newest">
              Newest
            </SelectItem>
            <SelectItem className="min-h-11" value="name">
              Name
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="min-h-11 lg:hidden"
          aria-expanded={filtersOpen}
          aria-controls="inventory-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
      </div>

      <section
        id="inventory-filters"
        aria-label="Equipment filters"
        className={cn("card-soft p-3 lg:block", !filtersOpen && "hidden")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <p
              id="inventory-slot-label"
              className="text-xs text-muted-foreground"
            >
              Equipment slot
            </p>
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger
                aria-labelledby="inventory-slot-label"
                className="h-11"
              >
                <SelectValue placeholder="All slots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="min-h-11" value="all">
                  All slots
                </SelectItem>
                {SLOT_KEYS.map((key) => (
                  <SelectItem className="min-h-11" key={key} value={key}>
                    {SLOT_META[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p
              id="inventory-rarity-label"
              className="text-xs text-muted-foreground"
            >
              Rarity
            </p>
            <Select value={rarity} onValueChange={setRarity}>
              <SelectTrigger
                aria-labelledby="inventory-rarity-label"
                className="h-11"
              >
                <SelectValue placeholder="All rarities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="min-h-11" value="all">
                  All rarities
                </SelectItem>
                {RARITY_KEYS.map((key) => (
                  <SelectItem className="min-h-11" key={key} value={key}>
                    {RARITY_META[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p
              id="inventory-status-label"
              className="text-xs text-muted-foreground"
            >
              Equipment status
            </p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                aria-labelledby="inventory-status-label"
                className="h-11"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="min-h-11" value="all">
                  All
                </SelectItem>
                <SelectItem className="min-h-11" value="equipped">
                  Equipped
                </SelectItem>
                <SelectItem className="min-h-11" value="unequipped">
                  Unequipped
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            className="min-h-11 self-end"
            disabled={!chips.length}
            onClick={clear}
          >
            Clear filters
          </Button>
        </div>
      </section>

      {loaded ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            {formatInt(visible.length)} of {formatInt(items.length)} equipment ·{" "}
            {formatInt(items.filter((item) => item.equipped).length)} equipped
            {unavailable ? " · Stale" : ""}
          </p>
          {chips.length ? (
            <Button variant="ghost" className="min-h-11" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
      {chips.length > 0 ? (
        <div
          aria-label="Active equipment filters"
          className="flex flex-wrap gap-2"
        >
          {chips.map((chip) => (
            <Button
              key={chip.label}
              variant="outline"
              className="min-h-11 max-w-full whitespace-normal break-words text-left text-xs"
              aria-label={`Remove filter: ${chip.label}`}
              onClick={chip.remove}
            >
              {chip.label}
              <X className="size-3 shrink-0" aria-hidden="true" />
            </Button>
          ))}
        </div>
      ) : null}

      {!loaded ? (
        !unavailable ? (
          <p
            role="status"
            aria-busy="true"
            className="card-soft p-6 text-sm text-muted-foreground"
          >
            Loading equipment…
          </p>
        ) : null
      ) : unavailable && items.length === 0 ? null : visible.length === 0 ? (
        <div className="card-soft flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          {items.length === 0 ? (
            <>
              <PackageX className="size-8" aria-hidden="true" />
              <p className="max-w-xs">
                No equipment yet. Open an owned chest to find your first rig
                part.
              </p>
              {hasOwnedChests ? (
                <Button className="min-h-11" onClick={onViewChests}>
                  View chests
                </Button>
              ) : (
                <Button asChild className="min-h-11">
                  <Link href="/shop">Buy chests</Link>
                </Button>
              )}
            </>
          ) : (
            <>
              <PackageSearch className="size-8" aria-hidden="true" />
              <p className="max-w-xs">No gear matches these filters.</p>
              <Button variant="secondary" className="min-h-11" onClick={clear}>
                Clear filters
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((item) => (
              <EquipmentCard
                key={item.id}
                item={item}
                actionsDisabled={actionsDisabled}
                onEquip={onEquip}
                onUnequip={onUnequip}
                onUpgrade={onUpgrade}
                onSalvage={onSalvage}
                onSell={onSell}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
