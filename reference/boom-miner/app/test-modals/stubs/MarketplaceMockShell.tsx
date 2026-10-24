"use client";

/**
 * app/test-modals/stubs/MarketplaceMockShell.tsx
 *
 * Test harness for the fullscreen Marketplace modal.
 * Feeds MarketplaceModal with mock hero listings, top sales, and stats so the
 * UI is fully exercisable without a live server or blockchain.
 */

import { useState } from "react";
import {
  ModalShell,
  ModalTitleBar,
  ActionDock,
  SectionLabel,
  StatChip,
} from "@/components/ui/modal";
import { InnerPanel, OuterPanel } from "@/components/ui/Panel";
import { HeroRarity } from "@/features/types/HeroRarity";
import { HeroSprite } from "@/features/game-components/heroes/HeroSprite";
import {
  MOCK_HERO_LISTINGS,
  MOCK_TOP_SALES,
  MOCK_MARKETPLACE_STATS,
  MOCK_TOKEN_BALANCE,
  type MockHeroListing,
} from "@/app/test-modals/mockup-data";

const PIXEL = "'Press Start 2P', 'Silkscreen', monospace";
const BODY  = "'VT323', 'Silkscreen', monospace";

const tokenIcon = "/assets/token.png";

// ---------------------------------------------------------------------------
// Rarity color map
// ---------------------------------------------------------------------------
const RARITY_COLOR: Record<HeroRarity, string> = {
  [HeroRarity.Common]:    "#9ca3af",
  [HeroRarity.Uncommon]:  "#4ade80",
  [HeroRarity.Rare]:      "#60a5fa",
  [HeroRarity.Epic]:      "#c084fc",
  [HeroRarity.Legendary]: "#facc15",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RarityBadge({ rarity }: { rarity: HeroRarity }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-sm uppercase tracking-wide border"
      style={{
        fontFamily: PIXEL,
        fontSize: 7,
        color: RARITY_COLOR[rarity],
        borderColor: `${RARITY_COLOR[rarity]}44`,
        background: `${RARITY_COLOR[rarity]}18`,
      }}
    >
      {rarity}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ fontFamily: PIXEL, fontSize: 7, color: "rgba(255,255,255,0.45)" }}>
        {label}
      </span>
      <span style={{ fontFamily: PIXEL, fontSize: 8, color: "#f5e9c4" }}>
        {value}
      </span>
    </div>
  );
}

function HeroCard({
  listing,
  selected,
  onClick,
}: {
  listing: MockHeroListing;
  selected: boolean;
  onClick: () => void;
}) {
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
        {/* Hero sprite */}
        <div
          className="flex items-center justify-center py-2 rounded"
          style={{ background: `${RARITY_COLOR[listing.rarity]}18` }}
        >
          <HeroSprite type={listing.type} size={48} intervalMs={600} />
        </div>
        <p
          className="truncate"
          style={{ fontFamily: PIXEL, fontSize: 8, color: "#f5e9c4" }}
        >
          {listing.name}
        </p>
        <RarityBadge rarity={listing.rarity} />
        <div className="flex items-center gap-1 mt-auto">
          <img src={tokenIcon} alt="" className="w-3.5 h-3.5 pixelated" />
          <span style={{ fontFamily: PIXEL, fontSize: 8, color: "#facc15" }}>
            {listing.price.toLocaleString()}
          </span>
        </div>
      </InnerPanel>
    </button>
  );
}

function TopSaleRow({ heroName, rarity, type, buyerWallet, price }: {
  heroName: string;
  rarity: HeroRarity;
  type: import("@/features/types/HeroRarity").HeroType;
  buyerWallet: string;
  price: number;
}) {
  return (
    <InnerPanel className="flex items-center gap-2 px-2.5 py-2 shrink-0 w-52">
      <div
        className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: `${RARITY_COLOR[rarity]}22` }}
      >
        <HeroSprite type={type} size={24} intervalMs={700} static />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontFamily: PIXEL, fontSize: 7, color: "#f5e9c4" }} className="truncate">
          {heroName}
        </p>
        <p style={{ fontFamily: BODY, fontSize: 14, color: "rgba(255,255,255,0.4)" }} className="truncate">
          {buyerWallet}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1">
          <img src={tokenIcon} alt="" className="w-3 h-3 pixelated" />
          <span style={{ fontFamily: PIXEL, fontSize: 7, color: "#facc15" }}>
            {price.toLocaleString()}
          </span>
        </div>
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
// Filters
// ---------------------------------------------------------------------------
type FilterRarity = "all" | HeroRarity;
type SortKey      = "recent" | "price-asc" | "price-desc";

const RARITY_FILTERS: { id: FilterRarity; label: string }[] = [
  { id: "all",                   label: "All"       },
  { id: HeroRarity.Legendary,    label: "Legendary" },
  { id: HeroRarity.Epic,         label: "Epic"      },
  { id: HeroRarity.Rare,         label: "Rare"      },
  { id: HeroRarity.Uncommon,     label: "Uncommon"  },
  { id: HeroRarity.Common,       label: "Common"    },
];

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------
export function MarketplaceMockShell({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [filterRarity, setFilterRarity] = useState<FilterRarity>("all");
  const [sort,         setSort]         = useState<SortKey>("recent");
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<MockHeroListing | null>(null);
  const [bought,       setBought]       = useState<string[]>([]);

  const visible = MOCK_HERO_LISTINGS
    .filter((l) => !bought.includes(l.id))
    .filter((l) => filterRarity === "all" || l.rarity === filterRarity)
    .filter((l) => !search.trim() || l.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sort === "price-asc")  return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      return b.listedAt - a.listedAt; // recent
    });

  const mockBalance = MOCK_TOKEN_BALANCE;

  return (
    <ModalShell
      show={open}
      onClose={onClose}
      tier="fullscreen"
      titleBar={
        <ModalTitleBar
          title="Marketplace"
          subtitle="Trade heroes with other players"
          onClose={onClose}
          extra={
            <>
              <span
                className="px-2 py-0.5 border rounded"
                style={{
                  fontFamily: PIXEL,
                  fontSize: 7,
                  color: "#facc15",
                  borderColor: "#facc1544",
                  background: "#facc1510",
                  letterSpacing: 2,
                }}
              >
                MOCK DATA
              </span>
              <StatChip
                icon={tokenIcon}
                value={mockBalance.toLocaleString()}
                caption="Balance"
              />
            </>
          }
        />
      }
      actionDock={
        <InnerPanel className="flex items-center gap-4 px-3 py-2 overflow-x-auto shrink-0">
          <TickerItem label="Volume"   value={MOCK_MARKETPLACE_STATS.totalVolume}   />
          <TickerItem label="Trades"   value={MOCK_MARKETPLACE_STATS.totalTrades}   />
          <TickerItem label="Listings" value={MOCK_MARKETPLACE_STATS.activeListings} />
          <TickerItem label="My listings" value="2" />
        </InnerPanel>
      }
    >
      {/* CommandBar */}
      <InnerPanel className="flex flex-wrap items-center gap-2 px-2 py-1.5 shrink-0">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search heroes..."
          aria-label="Search heroes"
          className="flex-1 min-w-32 rounded border px-2 py-1 outline-none focus:border-yellow-700"
          style={{
            fontFamily: PIXEL,
            fontSize: 8,
            background: "rgba(92,61,30,0.4)",
            borderColor: "#3a2410",
            color: "#f5e9c4",
          }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort listings"
          className="rounded border px-2 py-1 outline-none cursor-pointer"
          style={{
            fontFamily: PIXEL,
            fontSize: 8,
            background: "#3a2410",
            borderColor: "#5c3d1e",
            color: "#f5e9c4",
          }}
        >
          <option value="recent">Recent</option>
          <option value="price-asc">Price ↑</option>
          <option value="price-desc">Price ↓</option>
        </select>
      </InnerPanel>

      {/* Rarity rail */}
      <div
        className="flex gap-1.5 overflow-x-auto shrink-0 px-0.5 py-0.5"
        role="tablist"
        aria-label="Filter by rarity"
      >
        {RARITY_FILTERS.map((f) => {
          const isActive = f.id === filterRarity;
          const color = f.id === "all" ? "#facc15" : RARITY_COLOR[f.id as HeroRarity];
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { setFilterRarity(f.id); setSelected(null); }}
              className="shrink-0 px-2.5 py-1.5 rounded uppercase tracking-wide transition-all duration-75 cursor-pointer border"
              style={{
                fontFamily: PIXEL,
                fontSize: 7,
                color: isActive ? color : "rgba(255,255,255,0.5)",
                borderColor: isActive ? `${color}55` : "transparent",
                background: isActive ? `${color}18` : "transparent",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto flex flex-col gap-3 pb-2">

          {/* Top Sales strip */}
          {filterRarity === "all" && (
            <section aria-label="Top sales">
              <SectionLabel className="mb-1.5">Top Sales · 7 days</SectionLabel>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {MOCK_TOP_SALES.map((s, i) => (
                  <TopSaleRow key={i} {...s} />
                ))}
              </div>
            </section>
          )}

          <SectionLabel>
            {filterRarity === "all" ? "All listings" : `${filterRarity} listings`}
            {" "}
            <span style={{ color: "rgba(255,255,255,0.3)" }}>({visible.length})</span>
          </SectionLabel>

          {visible.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <p style={{ fontFamily: BODY, fontSize: 20, color: "rgba(255,255,255,0.35)" }}>
                No listings match your filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {visible.map((listing) => (
                <HeroCard
                  key={listing.id}
                  listing={listing}
                  selected={selected?.id === listing.id}
                  onClick={() => setSelected(listing)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail drawer */}
        {selected && (
          <div className="absolute z-10 inset-x-0 bottom-0 h-[72%] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-full sm:w-72 flex flex-col">
            <OuterPanel className="flex flex-col gap-1 h-full overflow-hidden">
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
                  style={{ background: "#3a2410", borderColor: "#5c3d1e" }}
                >
                  <img src="/assets/icons/close.png" alt="" className="w-3 h-3 pixelated" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  <span style={{ fontFamily: PIXEL, fontSize: 8, color: "#f5e9c4", display: "none" }}>✕</span>
                </button>
              </InnerPanel>

              {/* Drawer body */}
              <InnerPanel className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-3 p-3">
                {/* Sprite */}
                <div
                  className="w-24 h-24 flex items-center justify-center rounded"
                  style={{ background: `${RARITY_COLOR[selected.rarity]}18` }}
                >
                  <HeroSprite type={selected.type} size={64} intervalMs={500} />
                </div>

                <p style={{ fontFamily: PIXEL, fontSize: 9, color: "#f5e9c4" }}>
                  {selected.name}
                </p>
                <RarityBadge rarity={selected.rarity} />

                {/* Stats */}
                <div className="w-full flex flex-col gap-1.5">
                  <StatRow label="PWR"       value={selected.power}     />
                  <StatRow label="SPD"       value={selected.speed}     />
                  <StatRow label="STA"       value={selected.stamina}   />
                  <StatRow label="BOMBS"     value={selected.bombNum}   />
                  <StatRow label="RANGE"     value={selected.bombRange} />
                </div>

                <div className="w-full border-t" style={{ borderColor: "#3a2410" }} />

                <div className="flex items-center gap-1.5">
                  <img src={tokenIcon} alt="" className="w-4 h-4 pixelated" />
                  <span style={{ fontFamily: PIXEL, fontSize: 12, color: "#facc15" }}>
                    {selected.price.toLocaleString()}
                  </span>
                </div>
                <p style={{ fontFamily: BODY, fontSize: 16, color: "rgba(255,255,255,0.4)" }}>
                  Seller: {selected.sellerWallet}
                </p>
              </InnerPanel>

              {/* Buy action */}
              <ActionDock
                info={
                  <span style={{ fontFamily: PIXEL, fontSize: 7, color: "rgba(255,255,255,0.4)" }}>
                    Balance: {mockBalance.toLocaleString()}
                  </span>
                }
              >
                <button
                  type="button"
                  disabled={mockBalance < selected.price}
                  onClick={() => {
                    setBought((prev) => [...prev, selected.id]);
                    setSelected(null);
                  }}
                  className="wood-frame-light wood-panel-inner px-4 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: 1 }}
                >
                  {mockBalance < selected.price ? "INSUFFICIENT" : "BUY NOW"}
                </button>
              </ActionDock>
            </OuterPanel>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
