"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useGameStore, MAX_ON_MAP } from "@/features/store/gameStore";
import { Hud } from "@/features/game-components/hud/Hud";
import { WithdrawModal } from "@/features/game-components/settings/WithdrawModal";
import { activeChain } from "@/lib/client/chain";
import { chainBranding } from "@/lib/config/branding";

const { tokenName } = chainBranding[activeChain];

/** Arcade-cabinet shell that wraps the Phaser canvas with a top HUD bar + menu. */
export function GameShell({ children }: { children: ReactNode }) {
  // Show the optimistic balance (server-confirmed + not-yet-acked chest coins)
  // so the counter ticks up the instant a chest is destroyed.
  const coins = useGameStore((s) => s.coins);
  const roster = useGameStore((s) => s.roster);
  const stage = useGameStore((s) => s.stage);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const handleLogout = () => {
    setMenuOpen(false);
    localStorage.removeItem("bm_token");
    router.replace("/");
  };
  const onMapCount = roster.filter((h) => h.onMap).length;

  const shellRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 1340, h: 920 });
  const [vp, setVp] = useState({ w: 1400, h: 900 });

  useLayoutEffect(() => {
    if (!shellRef.current) return;
    const el = shellRef.current;
    const measure = () => setNatural({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // available viewport minus outer page padding (16px each side)
  const availW = Math.max(240, vp.w - 32);
  const availH = Math.max(240, vp.h - 32);
  const baseW = rotated ? natural.h : natural.w;
  const baseH = rotated ? natural.w : natural.h;
  const scale = Math.min(availW / baseW, availH / baseH, 1);
  const boxW = baseW * scale;
  const boxH = baseH * scale;

  // Runtime-computed geometry is passed through CSS variables and consumed by
  // Tailwind arbitrary-value utilities, so no presentational value stays inline.
  const boxVars = { "--box-w": `${boxW}px`, "--box-h": `${boxH}px` } as CSSProperties;
  const shellVars = {
    "--shell-rot": rotated ? "90deg" : "0deg",
    "--shell-scale": String(scale),
  } as CSSProperties;

  return (
    <div className="relative mx-auto h-[var(--box-h)] w-[var(--box-w)]" style={boxVars}>
      <div
        ref={shellRef}
        style={shellVars}
        className="wood-frame-dark wood-panel-outer absolute left-1/2 top-1/2 origin-center font-body text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] [transform:translate(-50%,-50%)_rotate(var(--shell-rot))_scale(var(--shell-scale))]"
      >
        {/* Top HUD Bar — sits directly on the outer wood panel (--wood-600) */}
        <div className="relative flex items-center justify-between gap-6 px-6 pb-5 pt-4">
          <div className="flex gap-8">
            <StatBlock
              label={tokenName}
              value={formatCoins(coins)}
              accentClass="text-amber-400"
              icon
            />
          </div>

          {/* Center Stage Badge + Menu */}
          <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center gap-1.5">
            <div className="wood-frame-light wood-panel-inner text-shadow whitespace-nowrap px-6 py-2 font-head text-[10px] tracking-[1px] text-white">
              STAGE {stage}
            </div>
            <div className="relative">
              <MenuButton open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
              {menuOpen ? (
                <MenuDropdown
                  onHeroes={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(new CustomEvent("bm-modal-heroes-open"));
                  }}
                  onShop={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(new CustomEvent("bm-modal-shop-open"));
                  }}
                  onMarket={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(new CustomEvent("bm-modal-marketplace-open"));
                  }}
                  onRotate={() => {
                    setMenuOpen(false);
                    setRotated((v) => !v);
                  }}
                  rotated={rotated}
                  onWithdraw={() => {
                    setMenuOpen(false);
                    setWithdrawOpen(true);
                  }}
                  onLogout={handleLogout}
                />
              ) : null}
            </div>
          </div>

          <div className="flex gap-8">
            <StatBlock
              label="On Map"
              value={`${onMapCount} / ${MAX_ON_MAP}`}
              accentClass="text-green-400"
              align="right"
            />
          </div>
        </div>

        {/* Map Canvas Slot — light inner panel frame around the game canvas */}
        <div className="wood-frame-light wood-panel-inner mx-2 mb-2 flex justify-center p-2">
          <div className="bg-[#1a1a1a] shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">{children}</div>
        </div>

        {/* Overlay HUD components (connection/session/stage overlays) */}
        <Hud />
      </div>

      {withdrawOpen && <WithdrawModal show onClose={() => setWithdrawOpen(false)} />}
    </div>
  );
}

function MenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`wood-frame-light wood-panel-inner text-shadow cursor-pointer whitespace-nowrap px-[18px] py-1.5 font-head text-[9px] tracking-widest text-white ${open ? "brightness-110" : ""}`}
    >
      {open ? "▲" : "▼"} MENU
    </button>
  );
}

function MenuDropdown({
  onHeroes,
  onShop,
  onMarket,
  onRotate,
  rotated,
  onWithdraw,
  onLogout,
}: {
  onHeroes: () => void;
  onShop: () => void;
  onMarket: () => void;
  onRotate: () => void;
  rotated: boolean;
  onWithdraw: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="wood-frame-light wood-panel-inner absolute left-1/2 top-[calc(100%+6px)] z-20 flex min-w-40 -translate-x-1/2 flex-col p-1 shadow-[0_8px_20px_rgba(0,0,0,0.6)]">
      <MenuItem onClick={onHeroes}>HEROES</MenuItem>
      <MenuItem onClick={onShop}>SHOP</MenuItem>
      <MenuItem onClick={onMarket}>MARKET</MenuItem>
      <MenuItem onClick={onRotate}>{rotated ? "UNROTATE" : "ROTATE"}</MenuItem>
      <MenuItem onClick={onWithdraw}>WITHDRAW</MenuItem>
      <div className="mx-2 my-1 h-px bg-white/10" />
      <MenuItem onClick={onLogout}>LOGOUT</MenuItem>
    </div>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-shadow cursor-pointer rounded-sm px-5 py-3 text-left font-head text-[10px] tracking-widest text-white hover:bg-[var(--wood-700)]"
    >
      <span className="opacity-0 group-hover:opacity-100">▶ </span>
      {children}
    </button>
  );
}

function formatCoins(n: number): string {
  return n.toLocaleString();
}

function StatBlock({
  label,
  value,
  accentClass,
  icon,
  align = "left",
}: {
  label: string;
  value: number | string;
  accentClass: string;
  icon?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-col gap-1 ${align === "right" ? "items-end" : "items-start"}`}>
      <span className="text-shadow font-head text-[8px] uppercase tracking-[1px] text-[#f5e6c8]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {icon ? (
          <img src="/assets/token.png" alt={tokenName} className="h-8 w-8" />
        ) : null}
        <span className={`text-shadow font-body text-[22px] font-bold leading-none ${accentClass}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
