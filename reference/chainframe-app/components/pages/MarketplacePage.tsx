"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  PackageSearch,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Root as Tabs } from "@radix-ui/react-tabs";
import { Root as Select, Value as SelectValue } from "@radix-ui/react-select";

import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { EquipmentCard } from "@/components/cards/EquipmentCard";
import { MarketFilters } from "@/components/marketplace/MarketFilters";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useWorkerStore } from "@/features/stores/workerStore";
import { RARITY_META, SLOT_META, STAT_KEYS } from "@/lib/config/constants/game";
import { MARKET_FEE } from "@/lib/config/constants/economy";
import { useAuthStore } from "@/features/stores/authStore";
import {
  getWalletBalance,
  cancelMarketListing,
  getMarketListings,
} from "@/lib/api/client";
import { useHydrated } from "@/hooks/useHydrated";

import type { MarketListingDto } from "@/lib/api/types";
import { formatHash, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { equipmentScore } from "@/features/types/game/stats";
import type {
  Equipment,
  Rarity,
  SlotKey,
  StatRoll,
} from "@/features/types/game/types";
import { isMarketPaymentConfigured } from "@/lib/utils/hive/wallet";
import { getMarketAmounts } from "@/lib/utils/game/pricing";

import { purchaseMarketItem } from "@/features/events/frontend/purchase-market-item/client";

type SortKey = "price" | "score" | "level" | "listed";
const SORT_OPTIONS = [
  ["listed-desc", "Newest first"],
  ["listed-asc", "Oldest first"],
  ["price-asc", "Price: low to high"],
  ["price-desc", "Price: high to low"],
  ["score-desc", "Power: high to low"],
  ["score-asc", "Power: low to high"],
  ["level-desc", "Level: high to low"],
  ["level-asc", "Level: low to high"],
] as const;

/** A filter limit, not a payment amount. Invalid drafts retain the last valid limit. */
function parsePriceLimit(value: string): number | undefined | null {
  const text = value.trim();
  if (!text) return undefined;
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(text)) return null;
  const number = Number(text);
  const milli = Math.round(number * 1000);
  return Number.isSafeInteger(milli) && number === milli / 1000 ? number : null;
}

interface ServerListing {
  id: string;
  refId: string;
  item: Equipment;
  price: number;
  seller: string;
  listedAt: number;
}
const EMPTY_LISTINGS: ServerListing[] = [];

/** Maps a MarketListingDto into the shape the equipment card renders. */
function toServerListing(listing: MarketListingDto): ServerListing | null {
  if (listing.currency !== "HIVE" || !listing.slot || !listing.rarity)
    return null;

  // Server rolls store all six stat keys with 0 for unset ones; the
  // Equipment.stats shape is sparse (only rolled keys present) — same
  // conversion as equipmentDtoToEquipment for inventory gear.
  const rawStats = listing.stats ?? {};
  const stats: StatRoll = {};
  for (const key of STAT_KEYS) {
    const value = rawStats[key];
    if (value) stats[key] = value;
  }

  return {
    id: `listing-item-${listing.refId}`,
    refId: listing.refId,
    price: listing.price,
    seller: listing.owner,
    listedAt: listing.listedAt,
    item: {
      id: String(listing.refId),
      name: listing.name,
      slot: listing.slot as SlotKey,
      rarity: listing.rarity as Rarity,
      stats,
      level: listing.level ?? 1,
      equipped: false,
      createdAt: listing.listedAt,
    },
  };
}

export function MarketplacePage() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hydrated = useHydrated();
  const mode = useAuthStore((state) => state.mode);
  const walletConnected =
    useAuthStore(
      (state) =>
        state.mode === "wallet" &&
        state.apiConnected === true &&
        state.address !== null,
    ) && hydrated;
  const registered = useAuthStore((state) => state.isRegistered === true);

  const [connectOpen, setConnectOpen] = useState(false);

  const [listingSnapshot, setListingSnapshot] = useState<{
    session: string;
    listings: ServerListing[];
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  useEffect(() => {
    let session = useAuthStore.getState();
    return useAuthStore.subscribe((current) => {
      if (
        current.address === session.address &&
        current.mode === session.mode &&
        current.connectedAt === session.connectedAt &&
        current.apiConnected === session.apiConnected
      )
        return;
      session = current;
      setBuyingId(null);
      setCancellingId(null);
      setRefreshing(false);
    });
  }, []);
  const [balanceSnapshot, setBalanceSnapshot] = useState<{
    session: string | null;
    value: number | null;
    loading: boolean;
  }>({ session: null, value: null, loading: false });
  const chainReady = isMarketPaymentConfigured();

  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [priceCap, setPriceCap] = useState<number | undefined>(undefined);
  const [slot, setSlot] = useState<SlotKey | "all">("all");
  const [rarities, setRarities] = useState<Rarity[]>([]);
  const [sort, setSort] = useState<SortKey>("listed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const connectedAt = useAuthStore((state) => state.connectedAt);
  const balanceSession = JSON.stringify([
    mode,
    useAuthStore.getState().address,
    connectedAt,
  ]);
  const chainBalance =
    walletConnected && balanceSnapshot.session === balanceSession
      ? balanceSnapshot.value
      : null;
  const balanceLoading =
    walletConnected &&
    balanceSnapshot.session === balanceSession &&
    balanceSnapshot.loading;
  const address = useAuthStore((state) => state.address);
  const listingSession = JSON.stringify([mode, address, connectedAt]);
  const listings =
    walletConnected && listingSnapshot?.session === listingSession
      ? listingSnapshot.listings
      : EMPTY_LISTINGS;

  const load = useCallback(async () => {
    if (!walletConnected) return;
    const origin = useAuthStore.getState();
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        mounted.current &&
        current.apiConnected === true &&
        current.address === origin.address &&
        current.connectedAt === origin.connectedAt &&
        current.mode === origin.mode
      );
    };
    setLoading(true);
    const result = await getMarketListings().catch(() => ({
      ok: false as const,
      error: "Marketplace unavailable",
      listings: undefined,
    }));
    if (!isCurrent()) return;
    if (result.ok && result.listings) {
      setListingSnapshot({
        session: listingSession,
        listings: result.listings
          .map(toServerListing)
          .filter((l): l is ServerListing => l !== null),
      });
    } else
      setListingSnapshot((previous) => ({
        session: listingSession,
        listings: previous?.session === listingSession ? previous.listings : [],
        error: result.error ?? "Marketplace unavailable",
      }));
    setLoading(false);
  }, [walletConnected, listingSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshChainBalance = useCallback(async () => {
    if (!mounted.current) return;
    if (!walletConnected || !address || !chainReady) {
      setBalanceSnapshot({
        session: balanceSession,
        value: null,
        loading: false,
      });
      return;
    }
    const session = useAuthStore.getState();
    if (
      session.apiConnected !== true ||
      session.connectedAt !== connectedAt ||
      session.address !== address
    )
      return;
    const sessionKey = JSON.stringify([
      session.mode,
      session.address,
      session.connectedAt,
    ]);
    setBalanceSnapshot({ session: sessionKey, value: null, loading: true });
    const result = await getWalletBalance("HIVE").catch(() => ({
      ok: false as const,
      balance: undefined,
    }));
    const current = useAuthStore.getState();
    if (
      !mounted.current ||
      current.apiConnected !== true ||
      current.address !== session.address ||
      current.mode !== session.mode ||
      current.connectedAt !== session.connectedAt
    )
      return;
    setBalanceSnapshot({
      session: sessionKey,
      value:
        result.ok && typeof result.balance === "number" ? result.balance : null,
      loading: false,
    });
  }, [walletConnected, address, chainReady, connectedAt, balanceSession]);

  useEffect(() => {
    void refreshChainBalance();
  }, [refreshChainBalance]);

  const handleRefresh = async () => {
    const session = useAuthStore.getState();
    setRefreshing(true);
    await Promise.all([load(), refreshChainBalance()]);
    const current = useAuthStore.getState();
    if (
      mounted.current &&
      current.address === session.address &&
      current.connectedAt === session.connectedAt &&
      current.mode === session.mode
    )
      setRefreshing(false);
  };

  const toggleRarity = (rarity: Rarity) =>
    setRarities((prev) =>
      prev.includes(rarity)
        ? prev.filter((r) => r !== rarity)
        : [...prev, rarity],
    );

  const resetFilters = () => {
    setSearch("");
    setMaxPrice("");
    setPriceCap(undefined);
    setSlot("all");
    setRarities([]);
  };

  const handleBuy = async (listing: ServerListing) => {
    if (!walletConnected) {
      setConnectOpen(true);
      return;
    }
    const session = useAuthStore.getState();
    if (
      session.apiConnected !== true ||
      session.address !== address ||
      session.connectedAt !== connectedAt ||
      session.mode !== mode
    )
      return;
    if (!registered) {
      setConnectOpen(true);
      return;
    }
    if (!chainReady) {
      notify(
        "On-chain purchases aren't configured yet. Try again later.",
        "danger",
      );
      return;
    }
    if (chainBalance === null) {
      notify("Wallet balance is unavailable. Refresh before buying.", "danger");
      return;
    }
    if (chainBalance < listing.price) {
      notify("Not enough HIVE in your wallet to buy this item", "danger");
      return;
    }

    setBuyingId(listing.id);
    let submitted = false;
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        current.apiConnected === true &&
        current.address === session.address &&
        current.mode === session.mode &&
        current.connectedAt === session.connectedAt
      );
    };
    try {
      // Purchases are paid directly on Hive with HIVE — never deducted from
      // the in-game-only balance.
      const result = await purchaseMarketItem(listing.refId, listing.price, {
        session,
        isCurrent,
        onSubmitted: () => {
          submitted = true;
        },
      });
      if (!result || !isCurrent() || !mounted.current) return;
      await refreshChainBalance();
    } catch (err) {
      if (!submitted && isCurrent() && mounted.current)
        notify(
          err instanceof Error ? err.message : "Purchase failed",
          "danger",
        );
    } finally {
      if (isCurrent() && mounted.current) setBuyingId(null);
    }
  };

  const handleCancel = async (listing: ServerListing) => {
    if (!walletConnected || !registered) return;
    const session = useAuthStore.getState();
    if (
      session.apiConnected !== true ||
      session.address !== address ||
      session.connectedAt !== connectedAt ||
      session.mode !== mode
    )
      return;
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        mounted.current &&
        current.apiConnected === true &&
        current.address === session.address &&
        current.mode === session.mode &&
        current.connectedAt === session.connectedAt
      );
    };
    let submitted = false;
    setCancellingId(listing.id);
    const result = await cancelMarketListing(listing.refId, () => {
      submitted = true;
    });
    if (!isCurrent()) return;
    if (result.ok) {
      setListingSnapshot((previous) =>
        previous?.session === listingSession
          ? {
              ...previous,
              listings: previous.listings.filter(
                (row) => row.id !== listing.id,
              ),
            }
          : previous,
      );
    } else if (!submitted) {
      notify(result.error ?? "Failed to cancel listing.", "danger");
    }
    setCancellingId(null);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return listings
      .filter((listing) => {
        if (query && !listing.item.name.toLowerCase().includes(query))
          return false;
        if (slot !== "all" && listing.item.slot !== slot) return false;
        if (rarities.length && !rarities.includes(listing.item.rarity))
          return false;
        if (priceCap !== undefined && listing.price > priceCap) return false;
        if (tab === "mine" && listing.seller !== address) return false;
        return true;
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sort === "price") return (a.price - b.price) * dir;
        if (sort === "level") return (a.item.level - b.item.level) * dir;
        if (sort === "score")
          return (equipmentScore(a.item) - equipmentScore(b.item)) * dir;
        return (a.listedAt - b.listedAt) * dir;
      });
  }, [listings, search, priceCap, slot, rarities, sort, sortDir, tab, address]);

  const filterCount =
    (slot !== "all" ? 1 : 0) +
    rarities.length +
    (priceCap !== undefined ? 1 : 0);
  const hasFilters = !!search.trim() || filterCount > 0 || !!maxPrice.trim();
  const priceError =
    parsePriceLimit(maxPrice) === null
      ? "Use a non-negative HIVE amount with up to 3 decimals. The previous valid limit remains applied."
      : undefined;
  const currentSnapshot =
    walletConnected && listingSnapshot?.session === listingSession
      ? listingSnapshot
      : null;
  const initialLoading = walletConnected && loading && !currentSnapshot;
  const tabCount =
    tab === "mine"
      ? listings.filter((listing) => listing.seller === address).length
      : listings.length;
  const clearPrice = () => {
    setMaxPrice("");
    setPriceCap(undefined);
  };
  const chips = [
    ...(search.trim()
      ? [{ label: "Search: " + search.trim(), remove: () => setSearch("") }]
      : []),
    ...(slot !== "all"
      ? [{ label: SLOT_META[slot].label, remove: () => setSlot("all") }]
      : []),
    ...rarities.map((rarity) => ({
      label: RARITY_META[rarity].label,
      remove: () => toggleRarity(rarity),
    })),
    ...(priceCap !== undefined
      ? [
          {
            label: "Max " + formatHash(priceCap, 3) + " HIVE",
            remove: clearPrice,
          },
        ]
      : []),
  ];
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "browse" | "mine")}
      className="min-w-0 space-y-5"
    >
      <PageHeader
        title="Marketplace"
        description="Find equipment for your rig. Trade with other miners in HIVE."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm" aria-live="polite">
            <p className="text-[11px] text-muted-foreground">HIVE wallet</p>
            <p className="font-mono font-semibold tabular-nums">
              {balanceLoading
                ? "Loading..."
                : chainBalance === null
                  ? "Unavailable"
                  : formatHash(chainBalance, 3) + " HIVE"}
            </p>
          </div>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => void handleRefresh()}
            disabled={
              !walletConnected || refreshing || loading || balanceLoading
            }
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </PageHeader>

      {walletConnected && !chainReady && (
        <p
          role="status"
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-400"
        >
          On-chain purchases aren&apos;t configured yet. Browsing remains
          available.
        </p>
      )}

      <TabsList className="grid h-auto min-h-11 w-full grid-cols-2">
        <TabsTrigger value="browse" className="min-h-11">
          Browse
        </TabsTrigger>
        <TabsTrigger value="mine" className="min-h-11">
          My listings
        </TabsTrigger>
      </TabsList>
      <TabsContent value={tab} className="space-y-4">
        <div className="flex min-w-0 flex-wrap gap-2">
          <div className="relative w-full min-w-0 sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search equipment"
              aria-label="Search equipment name"
              className="h-11 pl-9"
            />
          </div>
          <Select
            value={sort + "-" + sortDir}
            onValueChange={(value) => {
              const [key, direction] = value.split("-") as [
                SortKey,
                "asc" | "desc",
              ];
              setSort(key);
              setSortDir(direction);
            }}
          >
            <SelectTrigger
              aria-label="Sort listings"
              className="h-11 min-w-0 flex-1 sm:w-52 sm:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value} className="min-h-11">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="min-h-11 gap-2 lg:hidden"
            aria-expanded={filtersOpen}
            aria-controls="market-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" />
            Filters{filterCount > 0 ? " (" + filterCount + ")" : ""}
          </Button>
        </div>
        <MarketFilters
          open={filtersOpen}
          slot={slot}
          rarities={rarities}
          maxPrice={maxPrice}
          priceError={priceError}
          hasFilters={hasFilters}
          onSlot={setSlot}
          onRarity={toggleRarity}
          onClear={resetFilters}
          onMaxPrice={(value) => {
            setMaxPrice(value);
            const parsed = parsePriceLimit(value);
            if (parsed !== null) setPriceCap(parsed);
          }}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <p aria-live="polite">
            {currentSnapshot
              ? "Showing " +
                formatInt(filtered.length) +
                " of " +
                formatInt(tabCount) +
                " listings"
              : "Listings"}
            {refreshing ? " · Refreshing..." : ""}
          </p>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={resetFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
        {chips.length > 0 && (
          <ul
            aria-label="Active listing filters"
            className="flex min-w-0 flex-wrap gap-2"
          >
            {chips.map((chip) => (
              <li key={chip.label} className="min-w-0 max-w-full">
                <Button
                  variant="outline"
                  className="min-h-11 max-w-full gap-2 rounded-full px-3 text-xs"
                  onClick={chip.remove}
                  aria-label={"Remove filter: " + chip.label}
                  title={chip.label}
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="size-3.5 shrink-0" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {currentSnapshot?.error && listings.length > 0 && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"
          >
            <p className="text-destructive">
              Marketplace refresh failed; showing stale listings.
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              Retry
            </Button>
          </div>
        )}
        {!walletConnected ? (
          <p
            role="status"
            className="card-soft p-6 text-sm text-muted-foreground"
          >
            Sign in to browse Marketplace.
          </p>
        ) : initialLoading ? (
          <div
            role="status"
            aria-busy="true"
            className="card-soft flex min-h-32 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
          >
            <RefreshCw className="size-4 animate-spin" />
            Loading listings...
          </div>
        ) : currentSnapshot?.error && !listings.length ? (
          <div
            role="status"
            className="card-soft space-y-3 p-6 text-center text-sm text-muted-foreground"
          >
            <p>Marketplace is unavailable. Retry to load listings.</p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              Retry
            </Button>
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((listing) => {
              const isOwn = listing.seller === address;
              const canAfford =
                chainBalance !== null && chainBalance >= listing.price;
              return (
                <EquipmentCard
                  key={listing.id}
                  variant="marketplace"
                  item={listing.item}
                  footer={
                    <ListingActions
                      listing={listing}
                      isOwn={isOwn}
                      canAfford={canAfford}
                      walletConnected={walletConnected}
                      registered={registered}
                      chainBalance={chainBalance}
                      isBuying={buyingId === listing.id}
                      isCancelling={cancellingId === listing.id}
                      onBuy={() => void handleBuy(listing)}
                      onCancel={() => void handleCancel(listing)}
                    />
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="card-soft flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <PackageSearch className="size-8" aria-hidden="true" />
            <h2 className="font-semibold text-foreground">
              {tabCount === 0
                ? tab === "mine"
                  ? "You have no listings yet"
                  : "No equipment listed yet"
                : "No listings match your filters"}
            </h2>
            <p className="max-w-sm">
              {tabCount === 0
                ? "List available gear from Inventory to put it on the marketplace."
                : "Try another search or clear your filters."}
            </p>
            {tabCount === 0 ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/inventory">Open Inventory</Link>
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={resetFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </TabsContent>
      {!walletConnected && (
        <ConnectWalletModal open={connectOpen} onOpenChange={setConnectOpen} />
      )}
    </Tabs>
  );
}

function ListingActions({
  listing,
  isOwn,
  canAfford,
  walletConnected,
  registered,
  chainBalance,
  isBuying,
  isCancelling,
  onBuy,
  onCancel,
}: {
  listing: ServerListing;
  isOwn: boolean;
  canAfford: boolean;
  walletConnected: boolean;
  registered: boolean;
  chainBalance: number | null;
  isBuying: boolean;
  isCancelling: boolean;
  onBuy: () => void;
  onCancel: () => void;
}) {
  const workerAvailable = useWorkerStore((state) => state.available);
  return (
    <div className="mt-auto space-y-3 border-t border-border/60 pt-3">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <span className="min-w-0 break-all text-xs text-muted-foreground">
          {isOwn ? "Your listing" : `@${listing.seller}`}
        </span>
        <span
          className={cn(
            "min-w-0 max-w-full break-words text-right text-xl font-semibold tabular-nums",
            !walletConnected || canAfford || isOwn
              ? "text-primary"
              : "text-destructive",
          )}
        >
          {formatHash(listing.price, 3)} HIVE
        </span>
      </div>
      {isOwn ? (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">
            You receive{" "}
            {formatHash(getMarketAmounts(listing.price).proceeds, 3)} HIVE after{" "}
            {Math.round(MARKET_FEE * 100)}% fee when this sells
          </p>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full"
            disabled={!registered || isCancelling || workerAvailable !== true}
            onClick={onCancel}
          >
            {isCancelling ? "Cancelling…" : "Cancel listing"}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          className="min-h-11 w-full"
          disabled={
            !registered ||
            !walletConnected ||
            !canAfford ||
            workerAvailable !== true ||
            isBuying
          }
          onClick={onBuy}
        >
          {isBuying ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="size-3.5 animate-spin" /> Processing…
            </span>
          ) : !registered ? (
            "Register to buy"
          ) : !walletConnected ? (
            "Connect to buy"
          ) : workerAvailable !== true ? (
            "Backend unavailable"
          ) : canAfford ? (
            "Buy"
          ) : chainBalance === null ? (
            "Balance unavailable"
          ) : (
            `Need ${formatHash(listing.price - chainBalance, 3)} HIVE`
          )}
        </Button>
      )}
    </div>
  );
}
