"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  ModalShell,
  ModalTitleBar,
  ActionDock,
  SectionLabel,
  StatChip,
} from "@/components/ui/modal";
import { InnerPanel } from "@/components/ui/Panel";
import { HeroSprite } from "@/features/game-components/heroes/HeroSprite";
import { useGameStore } from "@/features/store/gameStore";
import { chainBranding } from "@/lib/config/branding";
import { activeChain } from "@/lib/client/chain";
import { HeroRarity, HeroType } from "@/features/types/HeroRarity";

const MARKETPLACE_ENABLED = process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED === "true";

const PIXEL = "'Press Start 2P', 'Silkscreen', monospace";
const BODY  = "'VT323', 'Silkscreen', monospace";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RarityKey = "common" | "uncommon" | "rare" | "epic" | "legendary";

interface MarketHero {
  id:            string;
  minted_number: number;
  name:          string;
  type:          HeroType;
  rarity:        RarityKey;
  level:         number;
  attributes: {
    power:      number;
    speed:      number;
    stamina:    number;
    bombNumber: number;
    bombRange:  number;
  };
  currentEnergy: number;
  maxEnergy:     number;
  market: {
    listed:  boolean;
    price:   number;
    seller:  string | null;
    created: number;
    sold:    number;
  };
}

interface ListingsResponse {
  success:         boolean;
  listings:        MarketHero[];
  topSales:        MarketHero[];
  totalCount:      number;
  myListingsCount: number;
  hasMore:         boolean;
  nextCursor:      string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_ORDER: RarityKey[] = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_COLOR: Record<RarityKey, string> = {
  common:    "#9ca3af",
  uncommon:  "#22c55e",
  rare:      "#3b82f6",
  epic:      "#a855f7",
  legendary: "#facc15",
};

type FilterRarity = "all" | "mine" | RarityKey;
type SortKey = "recent" | "price-asc" | "price-desc";

const RARITY_FILTERS: { id: FilterRarity; label: string }[] = [
  { id: "all",                label: "All"         },
  { id: "mine",               label: "My Listings" },
  { id: HeroRarity.Legendary, label: "Legendary"   },
  { id: HeroRarity.Epic,      label: "Epic"        },
  { id: HeroRarity.Rare,      label: "Rare"        },
  { id: HeroRarity.Uncommon,  label: "Uncommon"    },
  { id: HeroRarity.Common,    label: "Common"      },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function timeAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function buildListingsUrl(rarity: FilterRarity, sort: SortKey, search: string): string {
  const params = new URLSearchParams({ sort, limit: "48" });
  if (rarity === "mine") {
    params.set("mine", "true");
  } else if (rarity !== "all") {
    params.set("rarity", rarity);
  }
  if (search.trim()) params.set("search", search.trim());
  return `/api/marketplace/listings?${params.toString()}`;
}

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json());

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RarityBadge({ rarity }: { rarity: RarityKey }) {
  const color = RARITY_COLOR[rarity];
  return (
    <span
      className="px-1.5 py-0.5 rounded-sm uppercase tracking-wide border"
      style={{
        fontFamily: PIXEL,
        fontSize:   7,
        color,
        borderColor: `${color}44`,
        background:  `${color}18`,
      }}
    >
      {rarity}
    </span>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.round((value / 10) * 100));
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between">
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: "rgba(255,255,255,0.45)" }}>
          {label}
        </span>
        <span style={{ fontFamily: BODY, fontSize: 14, color: "#f5e9c4" }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded overflow-hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div className="h-full" style={{ width: `${pct}%`, background: "#facc15cc" }} />
      </div>
    </div>
  );
}

function HeroCard({
  hero,
  selected,
  onClick,
}: {
  hero:     MarketHero;
  selected: boolean;
  onClick:  () => void;
}) {
  const rKey  = hero.rarity ?? "common";
  const color = RARITY_COLOR[rKey];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`text-left cursor-pointer transition-all duration-75 ${
        selected ? "brightness-125 -translate-y-0.5" : "hover:brightness-110"
      }`}
    >
      <InnerPanel className="flex flex-col gap-1.5 p-2 h-full">
        <div
          className="flex items-center justify-center py-2 rounded"
          style={{ background: `${color}18` }}
        >
          <HeroSprite type={hero.type} size={48} intervalMs={600} />
        </div>
        <p className="truncate" style={{ fontFamily: PIXEL, fontSize: 8, color: "#f5e9c4" }}>
          {hero.name.toUpperCase()}
        </p>
        <RarityBadge rarity={rKey} />
        <div className="flex items-center gap-1 mt-auto">
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: "#facc15" }}>
            {formatPrice(hero.market.price)}
          </span>
        </div>
      </InnerPanel>
    </button>
  );
}

function TopSaleRow({ hero }: { hero: MarketHero }) {
  const rKey  = hero.rarity ?? "common";
  const color = RARITY_COLOR[rKey];
  return (
    <InnerPanel className="flex items-center gap-2 px-2.5 py-2 shrink-0 w-52">
      <div
        className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: `${color}22` }}
      >
        <HeroSprite type={hero.type} size={24} intervalMs={700} static />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontFamily: PIXEL, fontSize: 7, color: "#f5e9c4" }} className="truncate">
          {hero.name.toUpperCase()}
        </p>
        <p
          style={{ fontFamily: BODY, fontSize: 14, color: "rgba(255,255,255,0.4)" }}
          className="truncate"
        >
          {hero.market.seller ?? "unknown"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: "#facc15" }}>
          {formatPrice(hero.market.price)}
        </span>
      </div>
    </InnerPanel>
  );
}

function TickerItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 shrink-0">
      <span style={{ fontFamily: PIXEL, fontSize: 7, color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: "#f5e9c4" }}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  show:    boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Coming Soon gate
// ---------------------------------------------------------------------------

export function MarketplaceModal({ show, onClose }: Props) {
  if (!MARKETPLACE_ENABLED) {
    return (
      <ModalShell
        show={show}
        onClose={onClose}
        tier="panel"
        titleBar={
          <ModalTitleBar
            title="Marketplace"
            subtitle="Trade heroes with other players"
            onClose={onClose}
          />
        }
        actionDock={
          <ActionDock>
            <button
              type="button"
              onClick={onClose}
              className="wood-frame-light wood-panel-inner px-5 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
              style={{ fontFamily: PIXEL, fontSize: 9, letterSpacing: 2 }}
            >
              CLOSE
            </button>
          </ActionDock>
        }
      >
        <div className="flex flex-col items-center gap-5 py-6 px-4 text-center">
          <div
            className="px-3 py-1 border border-amber-400/40 bg-amber-400/10"
            style={{ fontFamily: PIXEL, fontSize: 8, color: "#facc15", letterSpacing: 3 }}
          >
            COMING SOON
          </div>
          <p
            style={{
              fontFamily: BODY,
              fontSize:   20,
              color:      "#f5e9c4",
              opacity:    0.7,
              lineHeight: 1.6,
              maxWidth:   280,
              margin:     0,
            }}
          >
            The marketplace is not yet open. Check back for the official launch announcement.
          </p>
          <div style={{ width: 40, height: 4, background: "#facc15" }} />
        </div>
      </ModalShell>
    );
  }

  return <MarketplaceScreen show={show} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Full marketplace screen (MARKETPLACE_ENABLED=true)
// ---------------------------------------------------------------------------

function MarketplaceScreen({ show, onClose }: Props) {
  const { tokenName } = chainBranding[activeChain];
  const wallet        = useGameStore((s) => s.wallet);
  const coins         = useGameStore((s) => s.coins);

  const [filterRarity, setFilterRarity] = useState<FilterRarity>("all");
  const [sort,         setSort]         = useState<SortKey>("recent");
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<MarketHero | null>(null);
  const [buyError,     setBuyError]     = useState<string | null>(null);
  const [buying,       setBuying]       = useState(false);
  const [cancelError,  setCancelError]  = useState<string | null>(null);
  const [cancelling,   setCancelling]   = useState(false);

  // SWR key changes whenever filters change — auto-refetches
  const swrKey = show
    ? buildListingsUrl(filterRarity, sort, search)
    : null; // pause fetching when modal is closed

  const { data, error, isLoading, mutate } = useSWR<ListingsResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );

  const listings   = data?.listings        ?? [];
  const topSales   = data?.topSales        ?? [];
  const totalCount = data?.totalCount      ?? 0;
  const myCount    = data?.myListingsCount ?? 0;

  // ---------------------------------------------------------------------------
  // Buy: on-chain flow — build-tx → sign → confirm purchase
  // ---------------------------------------------------------------------------
  const handleBuy = async () => {
    if (!selected || buying) return;
    setBuyError(null);
    setBuying(true);

    try {
      // Step 1: ask server to build the unsigned transfer transaction
      const buildRes = await fetch("/api/marketplace/purchase/build-tx", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ heroId: selected.id, buyerWallet: wallet }),
      });
      const buildData = await buildRes.json();

      if (!buildRes.ok || !buildData.success) {
        setBuyError(buildData.error ?? "Failed to build transaction");
        setBuying(false);
        return;
      }

      // Step 2: sign & broadcast via the Solana wallet adapter (window.solana)
      const solana = (window as unknown as Record<string, unknown>).solana as
        | { signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }> }
        | undefined;

      if (!solana?.signAndSendTransaction) {
        setBuyError("No Solana wallet detected — connect a wallet first");
        setBuying(false);
        return;
      }

      const { Transaction } = await import("@solana/web3.js");
      const txBuffer = Buffer.from(buildData.transaction as string, "base64");
      const tx       = Transaction.from(txBuffer);
      const { signature: txId } = await solana.signAndSendTransaction(tx);

      // Step 3: confirm purchase with the server
      const confirmRes = await fetch("/api/marketplace/purchase", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ heroId: selected.id, txId }),
      });
      const confirmData = await confirmRes.json();

      if (!confirmRes.ok || !confirmData.success) {
        setBuyError(confirmData.error ?? "Purchase failed");
        setBuying(false);
        return;
      }

      // Refetch listings so the bought hero disappears from the grid
      mutate();
      setSelected(null);
    } catch (err: unknown) {
      setBuyError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Cancel (delist): only for own listings
  // ---------------------------------------------------------------------------
  const handleCancel = async () => {
    if (!selected || cancelling) return;
    setCancelError(null);
    setCancelling(true);
    try {
      const res  = await fetch("/api/marketplace/list", {
        method:      "DELETE",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ heroId: selected.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCancelError(data.error ?? "Failed to cancel listing");
        return;
      }
      mutate();
      setSelected(null);
    } catch {
      setCancelError("Network error — please try again");
    } finally {
      setCancelling(false);
    }
  };

  const canAfford = selected ? coins >= selected.market.price : false;
  const isOwn     = selected ? selected.market.seller === wallet : false;

  return (
    <ModalShell
      show={show}
      onClose={onClose}
      tier="fullscreen"
      titleBar={
        <ModalTitleBar
          title="Marketplace"
          subtitle="Trade heroes with other players"
          onClose={onClose}
          extra={
            <StatChip
              value={String(totalCount)}
              caption="Listed"
            />
          }
        />
      }
      actionDock={
        <InnerPanel className="flex items-center gap-4 px-3 py-2 overflow-x-auto shrink-0">
          <TickerItem label="Listings"    value={String(totalCount)} />
          <TickerItem label="My listings" value={String(myCount)}    />
          {(buyError || cancelError) && (
            <span className="ml-auto" style={{ fontFamily: PIXEL, fontSize: 7, color: "#f87171" }}>
              {buyError ?? cancelError}
            </span>
          )}
          {selected && isOwn && (
            <button
              type="button"
              disabled={cancelling}
              onClick={handleCancel}
              className="ml-auto wood-frame-light wood-panel-inner px-4 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1, color: "#f87171" }}
            >
              {cancelling ? "CANCELLING..." : "CANCEL LISTING"}
            </button>
          )}
          {selected && !isOwn && (
            <button
              type="button"
              disabled={!canAfford || buying}
              onClick={handleBuy}
              className={`${cancelError || buyError ? "" : "ml-auto"} wood-frame-light wood-panel-inner px-4 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-40 disabled:cursor-not-allowed shrink-0`}
              style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1 }}
            >
              {buying
                ? "BUYING..."
                : canAfford
                  ? `BUY · ${formatPrice(selected.market.price)} ${tokenName}`
                  : "INSUFFICIENT FUNDS"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${!selected ? "ml-auto" : ""} wood-frame-light wood-panel-inner px-4 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 shrink-0`}
            style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1 }}
          >
            CLOSE
          </button>
        </InnerPanel>
      }
    >
      {/* Command bar: search + sort */}
      <InnerPanel className="flex flex-wrap items-center gap-2 px-2 py-1.5 shrink-0">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
          placeholder="Search heroes..."
          aria-label="Search heroes"
          className="flex-1 min-w-32 rounded border px-2 py-1 outline-none focus:border-yellow-700"
          style={{
            fontFamily:  PIXEL,
            fontSize:    8,
            background:  "rgba(92,61,30,0.4)",
            borderColor: "#3a2410",
            color:       "#f5e9c4",
          }}
        />
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); setSelected(null); }}
          aria-label="Sort listings"
          className="rounded border px-2 py-1 outline-none cursor-pointer"
          style={{
            fontFamily:  PIXEL,
            fontSize:    8,
            background:  "#3a2410",
            borderColor: "#5c3d1e",
            color:       "#f5e9c4",
          }}
        >
          <option value="recent">Recent</option>
          <option value="price-asc">Price ↑</option>
          <option value="price-desc">Price ↓</option>
        </select>
      </InnerPanel>

      {/* Rarity filter rail */}
      <div
        className="flex gap-1.5 overflow-x-auto shrink-0 px-0.5 py-0.5"
        role="tablist"
        aria-label="Filter by rarity"
      >
        {RARITY_FILTERS.map((f) => {
          const isActive = f.id === filterRarity;
          const color    = f.id === "all" ? "#facc15" : RARITY_COLOR[f.id as RarityKey];
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { setFilterRarity(f.id); setSelected(null); }}
              className="shrink-0 px-2.5 py-1.5 rounded uppercase tracking-wide transition-all duration-75 cursor-pointer border"
              style={{
                fontFamily:  PIXEL,
                fontSize:    7,
                color:       isActive ? color : "rgba(255,255,255,0.5)",
                borderColor: isActive ? `${color}55` : "transparent",
                background:  isActive ? `${color}18` : "transparent",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable content area */}
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto flex flex-col gap-3 pb-2">

          {/* Loading / error states */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <p style={{ fontFamily: BODY, fontSize: 20, color: "rgba(255,255,255,0.35)" }}>
                Loading listings...
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex items-center justify-center py-16">
              <p style={{ fontFamily: BODY, fontSize: 20, color: "#f87171" }}>
                Failed to load listings. Check your connection.
              </p>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {/* Top Sales strip — only on "all" filter */}
              {filterRarity === "all" && topSales.length > 0 && (
                <section aria-label="Top sales">
                  <SectionLabel className="mb-1.5">Top Sales · 7 days</SectionLabel>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {topSales.map((h) => (
                      <TopSaleRow key={h.id} hero={h} />
                    ))}
                  </div>
                </section>
              )}

              {/* Listings grid */}
              <SectionLabel>
                {filterRarity === "all"
                  ? "All listings"
                  : filterRarity === "mine"
                    ? "My listings"
                    : `${filterRarity} listings`}
                {" "}
                <span style={{ color: "rgba(255,255,255,0.3)" }}>({listings.length})</span>
              </SectionLabel>

              {listings.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p style={{ fontFamily: BODY, fontSize: 20, color: "rgba(255,255,255,0.35)" }}>
                    No listings match your filters.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                  {listings.map((hero) => (
                    <HeroCard
                      key={hero.id}
                      hero={hero}
                      selected={selected?.id === hero.id}
                      onClick={() => { setSelected(hero); setBuyError(null); setCancelError(null); }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail drawer — slides in from the right when a card is selected */}
        {selected && (
          <div className="absolute z-10 inset-x-0 bottom-0 h-[72%] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-full sm:w-72 flex flex-col">
            <div className="wood-frame-dark wood-panel-outer flex flex-col gap-1 h-full overflow-hidden p-0.5">
              {/* Drawer header */}
              <InnerPanel className="flex items-center justify-between gap-2 px-2 py-1.5 shrink-0">
                <span style={{ fontFamily: PIXEL, fontSize: 8, color: "#f5e9c4" }}>
                  Listing Details
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close listing details"
                  className="w-6 h-6 flex items-center justify-center rounded border cursor-pointer hover:brightness-125"
                  style={{
                    background:  "#3a2410",
                    borderColor: "#5c3d1e",
                    fontFamily:  PIXEL,
                    fontSize:    8,
                    color:       "#f5e9c4",
                  }}
                >
                  ✕
                </button>
              </InnerPanel>

              {/* Drawer body */}
              <InnerPanel className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-3 p-3">
                <div
                  className="w-24 h-24 flex items-center justify-center rounded"
                  style={{ background: `${RARITY_COLOR[selected.rarity ?? "common"]}18` }}
                >
                  <HeroSprite type={selected.type} size={64} intervalMs={500} />
                </div>

                <p style={{ fontFamily: PIXEL, fontSize: 9, color: "#f5e9c4" }}>
                  {selected.name.toUpperCase()}
                </p>
                <RarityBadge rarity={selected.rarity ?? "common"} />

                {/* Seller + listed */}
                <div
                  className="w-full flex flex-col gap-1 px-2 py-1.5 rounded"
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex justify-between">
                    <span style={{ fontFamily: BODY, fontSize: 15, color: "rgba(255,255,255,0.5)" }}>
                      SELLER
                    </span>
                    <span
                      style={{ fontFamily: BODY, fontSize: 15, color: "#f5e9c4" }}
                      className="max-w-32 truncate text-right"
                      title={selected.market.seller ?? "unknown"}
                    >
                      {selected.market.seller
                        ? `${selected.market.seller.slice(0, 4)}...${selected.market.seller.slice(-4)}`
                        : "unknown"}
                    </span>
                  </div>
                  {selected.market.created > 0 && (
                    <div className="flex justify-between">
                      <span style={{ fontFamily: BODY, fontSize: 15, color: "rgba(255,255,255,0.5)" }}>
                        LISTED
                      </span>
                      <span style={{ fontFamily: BODY, fontSize: 15, color: "rgba(255,255,255,0.7)" }}>
                        {timeAgo(selected.market.created)}
                      </span>
                    </div>
                  )}
                  {isOwn && (
                    <div className="flex justify-center mt-1">
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{
                          fontFamily:  PIXEL,
                          fontSize:    7,
                          color:       "#facc15",
                          background:  "#facc1522",
                          border:      "1px solid #facc1544",
                        }}
                      >
                        YOUR LISTING
                      </span>
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-center gap-1.5">
                  <span style={{ fontFamily: PIXEL, fontSize: 12, color: "#facc15" }}>
                    {formatPrice(selected.market.price)}
                  </span>
                  <span style={{ fontFamily: BODY, fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
                    {tokenName}
                  </span>
                </div>

                {/* Stats */}
                <div className="w-full flex flex-col gap-2">
                  <StatBar label="POWER"   value={selected.attributes.power}      />
                  <StatBar label="SPEED"   value={selected.attributes.speed}      />
                  <StatBar label="STAMINA" value={selected.attributes.stamina}    />
                  <StatBar label="BOMBS"   value={selected.attributes.bombNumber} />
                  <StatBar label="RANGE"   value={selected.attributes.bombRange}  />
                </div>
              </InnerPanel>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
