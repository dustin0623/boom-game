"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ModalShell, ModalTitleBar, ActionDock, StatChip } from "@/components/ui/modal";
import {
  useGameStore,
  MAX_ON_MAP,
  RECOVERY_INTERVAL_SECONDS,
  MIN_DEPLOY_ENERGY_FRACTION,
  canDeployEnergy,
  type RosterHero,
} from "@/features/store/gameStore";
import { chainBranding } from "@/lib/config/branding";
import { activeChain } from "@/lib/client/chain";

const MARKETPLACE_ENABLED = process.env.NEXT_PUBLIC_MARKETPLACE_ENABLED === "true";
import { sendHeroDeploy } from "@/context/SocketContext";
import { HeroSprite } from "./HeroSprite";
import { HeroType } from "@/features/types/HeroRarity";
import { RARITY_RECOVERY_FRACTION } from "@/lib/constants/game";
import { energyAfterRest } from "@/features/game/rules";

type RarityKey = "common" | "uncommon" | "rare" | "epic" | "legendary";

const RARITY_ORDER: RarityKey[] = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_COLOR: Record<RarityKey, string> = {
  common: "#9ca3af",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#facc15",
};

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

function heroStatus(h: RosterHero): { label: string; color: string } {
  if (h.onMap) return { label: "WORKING", color: "#4ade80" };
  if (h.currentEnergy < 1) return { label: "SLEEPING", color: "#dc2626" };
  // Below the 50% deploy threshold the hero is still charging and can't be
  // sent out yet; at or above it, it's deployable.
  if (!canDeployEnergy(h.currentEnergy, h.maxEnergy)) return { label: "RESTING", color: "#38bdf8" };
  return { label: "READY", color: "#fbbf24" };
}

/**
 * Returns the replenish rate as a human-readable string.
 * Formula: maxEnergy * RECOVERY_FRACTION_PER_INTERVAL per RECOVERY_INTERVAL_SECONDS.
 * Displayed as "+N / 5 min" (or the actual interval).
 */
function replenishLabel(maxEnergy: number, rarity: string = "common"): string {
  const gainPerTick = Math.round(
    maxEnergy * (RARITY_RECOVERY_FRACTION[rarity] ?? RARITY_RECOVERY_FRACTION.common),
  );
  const intervalMin = Math.round(RECOVERY_INTERVAL_SECONDS / 60);
  return `+${gainPerTick} / ${intervalMin} min`;
}

function EnergyBar({
  current,
  max,
  rarity = "common",
}: {
  current: number;
  max: number;
  rarity?: string;
}) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const color = pct <= 20 ? "#ef4444" : pct <= 50 ? "#facc15" : "#4ade80";
  const isFull = current >= max;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between mb-0.5" style={{ fontFamily: PIXEL_HEAD, fontSize: 7 }}>
        <span className="text-white/60 uppercase tracking-wide">Energy</span>
        <span className="text-white">
          {Math.floor(current)}/{max}
        </span>
      </div>
      <div className="h-2 bg-black/50 rounded overflow-hidden border border-black/40">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {/* Replenish rate — shown only when not full */}
      <div className="flex justify-end mt-0.5">
        <span
          style={{ fontFamily: PIXEL_HEAD, fontSize: 6, letterSpacing: 1 }}
          className={isFull ? "text-white/30" : "text-[#38bdf8]"}
        >
          {isFull ? "FULL" : `REPLENISH ${replenishLabel(max, rarity)}`}
        </span>
      </div>
    </div>
  );
}

// Issue 4 — max stat values per rarity tier.
const RARITY_STAT_MAX: Record<RarityKey, number> = {
  common: 6,
  uncommon: 8,
  rare: 12,
  epic: 16,
  legendary: 20,
};

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between" style={{ fontFamily: PIXEL_HEAD, fontSize: 7 }}>
        <span className="text-white/50 uppercase tracking-wide">{label}</span>
        <span className="text-white" style={{ fontFamily: PIXEL_BODY, fontSize: 14 }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 bg-black/50 rounded overflow-hidden border border-black/40">
        <div className="h-full bg-yellow-400/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface Props {
  show: boolean;
  onClose: () => void;
  /** Issue 6 — called when the empty-roster CTA is pressed to open the shop. */
  onOpenShop?: () => void;
}

export function HeroesModal({ show, onClose, onOpenShop }: Props) {
  const { tokenName } = chainBranding[activeChain];

  const confirmedRoster = useGameStore((s) => s.roster);
  const [displayTime, setDisplayTime] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setDisplayTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const roster = useMemo(
    () =>
      confirmedRoster.map((hero) => {
        if (hero.onMap || !hero.recoveryAt) return hero;
        return {
          ...hero,
          currentEnergy: energyAfterRest(
            hero.currentEnergy,
            hero.maxEnergy,
            hero.rarity ?? "common",
            displayTime - hero.recoveryAt,
          ),
        };
      }),
    [confirmedRoster, displayTime],
  );
  const deployError = useGameStore((s) => s.deployError);
  const pendingHeroes = useGameStore((s) => s.pendingHeroes);
  const setDeployError = useGameStore((s) => s.setDeployError);
  const removeFromRoster = useGameStore((s) => s.removeFromRoster);
  const onMapCount = roster.filter((h) => h.onMap).length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sellMode, setSellMode] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [sellError, setSellError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);

  const displayed = useMemo(() => {
    return [...roster].sort((a, b) => {
      if (a.onMap !== b.onMap) return a.onMap ? -1 : 1;
      return (
        RARITY_ORDER.indexOf((b.rarity ?? "common") as RarityKey) -
        RARITY_ORDER.indexOf((a.rarity ?? "common") as RarityKey)
      );
    });
  }, [roster]);

  const selected = useMemo(
    () => displayed.find((h) => h.id === selectedId) ?? displayed[0] ?? null,
    [displayed, selectedId],
  );

  // Clear deploy error + sell mode on open/close
  useEffect(() => {
    setDeployError(null);
    setSellMode(false);
    setSellPrice("");
    setSellError(null);
    return () => {
      setDeployError(null);
      setSellMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const handleSell = async () => {
    if (!selected || selling) return;
    setSellError(null);
    const price = parseFloat(sellPrice);
    if (isNaN(price) || price <= 0) {
      setSellError("Enter a valid price");
      return;
    }
    setSelling(true);
    try {
      const res = await fetch("/api/marketplace/list", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroId: selected.id, price }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSellError(data.error ?? "Could not list hero");
        return;
      }
      // Remove the hero from the local roster so it disappears immediately
      removeFromRoster(selected.id);
      setSellMode(false);
      setSellPrice("");
      setSelectedId(null);
    } catch {
      setSellError("Network error — please try again");
    } finally {
      setSelling(false);
    }
  };

  const handleToggle = (heroId: string, onMap: boolean) => {
    setDeployError(null);
    const sent = sendHeroDeploy(heroId, onMap);
    if (!sent) {
      setDeployError("Reconnecting — please try again in a moment");
    }
  };

  const canDeploy = (h: RosterHero) =>
    !h.onMap &&
    !pendingHeroes.includes(h.id) &&
    canDeployEnergy(h.currentEnergy, h.maxEnergy) &&
    onMapCount < MAX_ON_MAP;

  return (
    <ModalShell
      show={show}
      onClose={onClose}
      tier="panel"
      titleBar={
        <ModalTitleBar
          title="Heroes"
          subtitle={`${onMapCount} / ${MAX_ON_MAP} on map`}
          onClose={onClose}
          extra={<StatChip value={`${onMapCount}/${MAX_ON_MAP}`} caption="On Map" />}
        />
      }
      actionDock={
        selected ? (
          <ActionDock
            info={
              sellMode ? (
                <span
                  className="text-white/60 truncate"
                  style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 1 }}
                >
                  {sellError ? (
                    <span style={{ color: "#f87171" }}>{sellError}</span>
                  ) : (
                    `LIST ${selected.name.toUpperCase()} FOR SALE`
                  )}
                </span>
              ) : deployError ? (
                <span className="text-red-400" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
                  {deployError}
                </span>
              ) : (
                <span
                  className="text-white/60 truncate"
                  style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 1 }}
                >
                  {selected.type.toUpperCase()} #{selected.minted_number}
                </span>
              )
            }
          >
            {sellMode ? (
              <>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={`Price in ${tokenName}`}
                  value={sellPrice}
                  onChange={(e) => {
                    setSellPrice(e.target.value);
                    setSellError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSell();
                  }}
                  className="rounded border px-2 py-1.5 outline-none w-36"
                  style={{
                    fontFamily: PIXEL_HEAD,
                    fontSize: 8,
                    background: "rgba(92,61,30,0.6)",
                    borderColor: "#5c3d1e",
                    color: "#f5e9c4",
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  disabled={selling}
                  onClick={handleSell}
                  className="wood-frame-light wood-panel-inner px-5 py-2.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
                >
                  {selling ? "LISTING..." : "CONFIRM"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSellMode(false);
                    setSellPrice("");
                    setSellError(null);
                  }}
                  className="wood-frame-light wood-panel-inner px-4 py-2.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
                  style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
                >
                  CANCEL
                </button>
              </>
            ) : (
              <>
                {selected.onMap ? (
                  <button
                    type="button"
                    onClick={() => handleToggle(selected.id, false)}
                    disabled={pendingHeroes.includes(selected.id)}
                    className="wood-frame-light wood-panel-inner px-6 py-2.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
                    style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
                  >
                    RECALL
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canDeploy(selected)}
                    onClick={() => handleToggle(selected.id, true)}
                    className="wood-frame-light wood-panel-inner px-6 py-2.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
                  >
                    {selected.currentEnergy < 1
                      ? "SLEEPING"
                      : onMapCount >= MAX_ON_MAP && !selected.onMap
                        ? "MAP FULL"
                        : !canDeployEnergy(selected.currentEnergy, selected.maxEnergy)
                          ? `NEEDS ${Math.round(MIN_DEPLOY_ENERGY_FRACTION * 100)}%`
                          : "DEPLOY"}
                  </button>
                )}
                {MARKETPLACE_ENABLED && !selected.onMap && (
                  <button
                    type="button"
                    onClick={() => {
                      setSellMode(true);
                      setSellPrice("");
                      setSellError(null);
                    }}
                    className="wood-frame-light wood-panel-inner px-5 py-2.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
                    style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
                  >
                    SELL
                  </button>
                )}
              </>
            )}
          </ActionDock>
        ) : undefined
      }
    >
      {/* Issue 6 — full centered empty state when no heroes yet. */}
      {roster.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-12 px-6">
          <HeroSprite type={HeroType.Ricky} size={64} static />
          <p
            className="text-center"
            style={{ fontFamily: PIXEL_HEAD, fontSize: 9, color: "#fff", letterSpacing: 1 }}
          >
            YOUR ROSTER IS EMPTY
          </p>
          <p
            className="text-center"
            style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#777" }}
          >
            Visit the Shop to mint your first hero.
          </p>
          {onOpenShop && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenShop();
              }}
              className="wood-frame-light wood-panel-inner px-6 py-2.5 text-white hover:brightness-110 transition-all"
              style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
            >
              VISIT SHOP
            </button>
          )}
        </div>
      )}

      {/* Hero list + detail side-by-side — hidden when roster is empty. */}
      <div
        className="flex min-h-0 gap-1"
        style={{ minHeight: 420, display: roster.length === 0 ? "none" : undefined }}
      >
        {/* List */}
        <div className="flex flex-col gap-1 w-2/5 overflow-y-auto scrollable">
          {displayed.length === 0 ? (
            <p
              className="text-white/50 text-center p-4"
              style={{ fontFamily: PIXEL_BODY, fontSize: 16 }}
            >
              No heroes yet — visit SHOP.
            </p>
          ) : null}
          {displayed.map((h) => {
            const isActive = selected?.id === h.id;
            const { label: statusLabel, color: statusColor } = heroStatus(h);
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelectedId(h.id)}
                className={clsx(
                  "wood-frame-light wood-panel-inner text-left p-2 flex items-center gap-2 cursor-pointer transition-all duration-75",
                  isActive ? "brightness-110" : "opacity-80 hover:opacity-100",
                )}
                style={{
                  fontFamily: PIXEL_BODY,
                  boxShadow: isActive ? "0 0 0 3px #dc2626" : undefined,
                }}
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <HeroSprite type={h.type} size={32} static />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate text-white"
                    style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 1 }}
                  >
                    {h.name.toUpperCase()}
                  </div>
                  <div className="text-white/60 text-sm">#{h.minted_number}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span style={{ fontFamily: PIXEL_HEAD, fontSize: 7, color: statusColor }}>
                      {statusLabel}
                    </span>
                    <span
                      className="px-1 text-black shrink-0"
                      style={{
                        background: RARITY_COLOR[(h.rarity ?? "common") as RarityKey],
                        fontFamily: PIXEL_HEAD,
                        fontSize: 6,
                      }}
                    >
                      {h.rarityLabel.toUpperCase()}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 p-2">
          {selected ? (
            <>
              {/* Portrait + identity */}
              <div className="flex gap-3 items-start">
                <div className="w-24 h-24 flex items-center justify-center shrink-0 bg-black/30 rounded">
                  <HeroSprite type={selected.type} size={72} intervalMs={450} />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <span
                    className="text-xs text-white/60"
                    style={{ fontFamily: PIXEL_BODY, fontSize: 15 }}
                  >
                    #{selected.minted_number}
                  </span>
                  <span
                    className="text-white"
                    style={{ fontFamily: PIXEL_HEAD, fontSize: 11, letterSpacing: 1 }}
                  >
                    {selected.name.toUpperCase()}
                  </span>
                  <span
                    className="px-2 py-0.5 text-black text-[8px] rounded self-start"
                    style={{
                      background: RARITY_COLOR[(selected.rarity ?? "common") as RarityKey],
                      fontFamily: PIXEL_HEAD,
                      letterSpacing: 1,
                    }}
                  >
                    {selected.rarityLabel.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Energy bar */}
              <EnergyBar
                current={selected.currentEnergy}
                max={selected.maxEnergy}
                rarity={selected.rarity ?? "common"}
              />

              {/* Issue 4 — stat bars with rarity-relative max. */}
              {(() => {
                const statMax = RARITY_STAT_MAX[(selected.rarity ?? "common") as RarityKey];
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["Power", selected.attributes.power],
                        ["Speed", selected.attributes.speed],
                        ["Stamina", selected.attributes.stamina],
                        ["Bombs", selected.attributes.bomb_number],
                        ["Range", selected.attributes.bomb_range],
                      ] as [string, number][]
                    ).map(([label, val]) => (
                      <StatBar key={label} label={label} value={val} max={statMax} />
                    ))}
                  </div>
                );
              })()}
            </>
          ) : (
            <p
              className="text-white/40 text-center p-6"
              style={{ fontFamily: PIXEL_BODY, fontSize: 16 }}
            >
              Select a hero.
            </p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
