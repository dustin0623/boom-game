"use client";

/**
 * app/test-modals/page.tsx
 *
 * Developer-only dashboard — matches the reference luckyfrog.online/test-modals
 * design exactly: dark bg, phase rows, shell demo (toast/panel/fullscreen),
 * game modals, HUD overlays, and panel primitives.
 */

import { useEffect, useState } from "react";
import { activeChain }   from "@/lib/client/chain";
import { chainBranding } from "@/lib/config/branding";

const branding = chainBranding[activeChain];
import {
  ModalShell,
  ModalTitleBar,
  NavRail,
  ActionDock,
  SectionLabel,
  StatChip,
  type ModalTier,
} from "@/components/ui/modal";
import { OuterPanel, InnerPanel } from "@/components/ui/Panel";
import { useGameStore } from "@/features/store/gameStore";
import { createMockRoster } from "./roster";
import { ConnectionOverlay }      from "@/features/game-components/hud/components/ConnectionOverlay";
import { SessionErrorOverlay }    from "@/features/game-components/hud/components/SessionErrorOverlay";
import { StageValidationOverlay } from "@/features/game-components/hud/components/StageValidationOverlay";
import { HeroesModal }         from "@/features/game-components/heroes/HeroesModal";
import { ShopModal }           from "@/features/game-components/shop/ShopModal";
import { LeaderboardModal }    from "@/features/game-components/leaderboard/LeaderboardModal";
import { WithdrawModal }       from "@/features/game-components/settings/WithdrawModal";
import { FullPageLoader }      from "@/features/game-components/shell/FullPageLoader";
import { MarketplaceMockShell } from "@/app/test-modals/stubs/MarketplaceMockShell";

// ---------------------------------------------------------------------------
// Icons (all copied from reference /public/assets)
// ---------------------------------------------------------------------------
const ICONS = {
  basket: "/assets/icons/basket.png",
  hammer: "/assets/icons/hammer.png",
  plant:  "/assets/icons/plant.png",
  quest:  "/assets/icons/quest.png",
  token:  "/assets/icons/token.png",
  heart:  "/assets/icons/heart.png",
  close:  "/assets/icons/close.png",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ShellKey = "shell-toast" | "shell-panel" | "shell-fullscreen";
type GameKey  = "heroes" | "heroes-empty" | "shop" | "leaderboard" | "withdraw" | "marketplace";
type HudKey   = "hud-connection" | "hud-session-error" | "hud-stage-validating" | "hud-stage-validated";
type FlowKey  =
  | "flow-shop-minting"
  | "flow-shop-result"
  | "flow-shop-error"
  | "flow-withdraw-pending"
  | "flow-withdraw-done"
  | "flow-withdraw-error"
  | "flow-game-loader";
type ModalKey = ShellKey | GameKey | HudKey | FlowKey;

const FONT = "'Press Start 2P', 'Silkscreen', monospace";

// ---------------------------------------------------------------------------
// TestButton — matches reference pixel style
// ---------------------------------------------------------------------------
function TestButton({
  label,
  onClick,
  active = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded border-b-4 active:border-b-0 active:translate-y-0.5 transition-all duration-75 cursor-pointer"
      style={{
        fontFamily: FONT,
        fontSize: 10,
        color: "#fff",
        backgroundColor: active ? "#c8922a" : "#5c3d1e",
        borderColor: active ? "#7a5010" : "#3a2410",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "#7a5230";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "#5c3d1e";
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PhaseRow
// ---------------------------------------------------------------------------
function PhaseRow({
  phase,
  title,
  buttons,
  active,
  onOpen,
}: {
  phase: number;
  title: string;
  buttons: { label: string; key: ModalKey }[];
  active: ModalKey | null;
  onOpen: (key: ModalKey) => void;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="px-2 py-1 rounded border border-yellow-900 text-yellow-400"
          style={{ fontFamily: FONT, fontSize: 10, backgroundColor: "#3a2410" }}
        >
          Phase {phase}
        </span>
        <h2
          className="tracking-wide"
          style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.8)" }}
        >
          {title}
        </h2>
      </div>
      <div className="flex flex-wrap gap-3">
        {buttons.map((b) => (
          <TestButton
            key={b.key}
            label={b.label}
            active={active === b.key}
            onClick={() => onOpen(b.key)}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ShellDemoMock — mirrors reference robinhood-farm ShellDemoMock exactly
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  { id: "one",   label: "Section 1", icon: ICONS.basket },
  { id: "two",   label: "Section 2", icon: ICONS.hammer },
  { id: "three", label: "Section 3", icon: ICONS.plant  },
];

function DemoBody({ section }: { section: string }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap px-0.5 pt-0.5">
        <SectionLabel icon={ICONS.quest}>Demo · {section}</SectionLabel>
      </div>
      <div className="flex gap-1 flex-wrap">
        <StatChip icon={ICONS.token} value="1,234" caption={branding.tokenName} />
        <StatChip icon={ICONS.close} value="00:42" caption="Timer" />
        <StatChip icon={ICONS.heart} value="87 / 100" caption="Health" />
      </div>
      <InnerPanel className="flex-1 min-h-24 flex items-center justify-center p-4">
        <p className="text-[10px] text-center text-balance" style={{ color: "rgba(255,255,255,0.6)" }}>
          Body content area — scrolls independently.
          <br />
          Active section: {section}
        </p>
      </InnerPanel>
      <InnerPanel className="min-h-16 flex items-center justify-center p-4">
        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Second content section
        </p>
      </InnerPanel>
    </>
  );
}

function ShellDemoMock({ open, tier, onClose }: { open: boolean; tier: ModalTier; onClose: () => void }) {
  const [section, setSection] = useState("one");

  if (tier === "toast") {
    return (
      <ModalShell
        show={open}
        onClose={onClose}
        tier="toast"
        actionDock={
          <ActionDock>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-white cursor-pointer rounded border border-yellow-900 hover:brightness-110 transition-all duration-75"
              style={{ fontFamily: FONT, backgroundColor: "#5c3d1e" }}
            >
              Continue
            </button>
          </ActionDock>
        }
      >
        <InnerPanel className="flex flex-col items-center gap-2 p-4">
          <img src={ICONS.token} alt="Reward" className="w-12 h-12 object-contain pixelated" />
          <SectionLabel>Toast Tier</SectionLabel>
          <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.7)" }}>
            Reveal card content
          </p>
        </InnerPanel>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      show={open}
      onClose={onClose}
      tier={tier}
      titleBar={
        <ModalTitleBar
          icon={ICONS.basket}
          title={tier === "fullscreen" ? "Fullscreen Shell" : "Panel Shell"}
          subtitle="Phase A demo"
          onClose={onClose}
          extra={
            tier === "fullscreen" ? (
              <SectionLabel icon={ICONS.token}>1,234</SectionLabel>
            ) : undefined
          }
        />
      }
      navRail={<NavRail items={NAV_ITEMS} activeId={section} onSelect={setSection} />}
      actionDock={
        <ActionDock info={<span>Context info · stock 12</span>}>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-white cursor-pointer rounded border border-yellow-900 hover:brightness-110 transition-all duration-75"
            style={{ fontFamily: FONT, backgroundColor: "#5c3d1e" }}
          >
            Secondary
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-white cursor-pointer rounded border border-yellow-900 hover:brightness-110 transition-all duration-75"
            style={{ fontFamily: FONT, backgroundColor: "#c8922a" }}
          >
            Primary
          </button>
        </ActionDock>
      }
    >
      <DemoBody section={section} />
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// HUD overlay preview box (contained, not full-screen)
// ---------------------------------------------------------------------------
function HudPreviewBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="uppercase tracking-widest"
        style={{ fontFamily: FONT, fontSize: 8, color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </p>
      <div
        className="relative overflow-hidden rounded flex items-center justify-center"
        style={{ height: 200, background: "#1a1008" }}
      >
        <span
          className="absolute"
          style={{ fontFamily: FONT, fontSize: 8, color: "rgba(255,255,255,0.12)" }}
        >
          [ game canvas ]
        </span>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
// Deterministic mock data for flow-state previews.
const MOCK_TX_SIG = "5UfDuX8hLmN2qRt7vWxYzAbC3dEfGh1jKlMnOpQrStUv4wXyZ6a";
const MOCK_SETTLED_HEROES = createMockRoster().slice(0, 3);

export default function TestModalsPage() {
  const [active, setActive] = useState<ModalKey | null>(null);
  const [loaderProgress, setLoaderProgress] = useState(0);

  const open  = (key: ModalKey) => {
    // "Heroes (Empty)" previews the zero-roster state; restore mocks otherwise.
    if (key === "heroes-empty") {
      useGameStore.getState().hydrateRoster([]);
    } else if (useGameStore.getState().roster.length === 0) {
      useGameStore.getState().hydrateRoster(createMockRoster());
    }
    setActive(key);
  };
  const close = () => {
    if (useGameStore.getState().roster.length === 0) {
      useGameStore.getState().hydrateRoster(createMockRoster());
    }
    setActive(null);
  };

  // Animate the boot loader preview so the progress bar is reviewable.
  useEffect(() => {
    if (active !== "flow-game-loader") return;
    setLoaderProgress(0);
    const t = setInterval(
      () => setLoaderProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.02))),
      100,
    );
    return () => clearInterval(t);
  }, [active]);

  // Drive the real HUD overlay components (ConnectionOverlay, SessionErrorOverlay,
  // StageValidationOverlay) by syncing the gameStore flags they read from.
  const setConnectionLost  = useGameStore((s) => s.setConnectionLost);
  const setSessionError    = useGameStore((s) => s.setSessionError);
  const setStageValidating = useGameStore((s) => s.setStageValidating);
  const setStageValidated  = useGameStore((s) => s.setStageValidated);
  const hydrateRoster      = useGameStore((s) => s.hydrateRoster);

  // Seed a mock roster so the Heroes modal renders a populated list on this
  // dev page (no live server). Only seeds if the roster is currently empty.
  useEffect(() => {
    if (useGameStore.getState().roster.length === 0) {
      hydrateRoster(createMockRoster());
    }
    // Seed a balance so Withdraw / Shop render meaningful numbers.
    if (useGameStore.getState().coins === 0) {
      useGameStore.getState().reconcile({ coins: 12500 });
    }
  }, [hydrateRoster]);

  useEffect(() => {
    // Reset every HUD flag, then enable only the one matching the active button.
    setConnectionLost(active === "hud-connection");
    setSessionError(active === "hud-session-error" ? "You opened the game in another tab." : null);
    setStageValidating(active === "hud-stage-validating");
    setStageValidated(active === "hud-stage-validated");
  }, [active, setConnectionLost, setSessionError, setStageValidating, setStageValidated]);

  // Leave the store in a clean state when leaving the dev page.
  useEffect(() => {
    return () => {
      setConnectionLost(false);
      setSessionError(null);
      setStageValidating(false);
      setStageValidated(false);
    };
  }, [setConnectionLost, setSessionError, setStageValidating, setStageValidated]);

  return (
    <main className="min-h-screen" style={{ background: "#120d07" }}>

      {/* top bar */}
      <div
        className="w-full border-b px-8 py-4 flex items-center justify-between"
        style={{ background: "#1a1008", borderColor: "#3a2410" }}
      >
        <div>
          <h1
            className="text-sm mb-1"
            style={{ fontFamily: FONT, color: "#fde68a" }}
          >
            Modal Test Dashboard
          </h1>
          <p
            className="text-[9px]"
            style={{ fontFamily: FONT, color: "rgba(255,255,255,0.4)" }}
          >
            /test-modals — developer use only
          </p>
        </div>
      </div>

      {/* body */}
      <div className="px-8 py-8 max-w-3xl">

        {/* Phase 0 — Shell demos */}
        <div className="border-b mb-8" style={{ borderColor: "#2a1c0c" }} />
        <PhaseRow
          phase={0}
          title="Redesign Shell Demo (Phase A — temporary)"
          active={active}
          onOpen={open}
          buttons={[
            { label: "Shell (Toast)",      key: "shell-toast"      },
            { label: "Shell (Panel)",      key: "shell-panel"      },
            { label: "Shell (Fullscreen)", key: "shell-fullscreen" },
          ]}
        />

        {/* Phase 1 — Game modals */}
        <div className="border-b mb-8" style={{ borderColor: "#2a1c0c" }} />
        <PhaseRow
          phase={1}
          title="Game Modals"
          active={active}
          onOpen={open}
          buttons={[
            { label: "Heroes",         key: "heroes"       },
            { label: "Heroes (Empty)", key: "heroes-empty" },
            { label: "Shop",           key: "shop"         },
            { label: "Leaderboard",    key: "leaderboard"  },
            { label: "Marketplace",    key: "marketplace"  },
            { label: "Withdraw",       key: "withdraw"     },
          ]}
        />

        {/* Phase 1b — Transaction flow states */}
        <div className="border-b mb-8" style={{ borderColor: "#2a1c0c" }} />
        <PhaseRow
          phase={1}
          title="Flow States (Mint & Withdraw & Boot)"
          active={active}
          onOpen={open}
          buttons={[
            { label: "Mint: Waiting",     key: "flow-shop-minting"     },
            { label: "Mint: Result",      key: "flow-shop-result"      },
            { label: "Mint: Error",       key: "flow-shop-error"       },
            { label: "Withdraw: Pending", key: "flow-withdraw-pending" },
            { label: "Withdraw: Done",    key: "flow-withdraw-done"    },
            { label: "Withdraw: Error",   key: "flow-withdraw-error"   },
            { label: "Boot Loader",       key: "flow-game-loader"      },
          ]}
        />

        {/* Phase 2 — HUD overlays */}
        <div className="border-b mb-8" style={{ borderColor: "#2a1c0c" }} />
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="px-2 py-1 rounded border border-yellow-900 text-yellow-400"
              style={{ fontFamily: FONT, fontSize: 10, backgroundColor: "#3a2410" }}
            >
              Phase 2
            </span>
            <h2
              className="tracking-wide"
              style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.8)" }}
            >
              HUD Overlays
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 mb-6">
            <TestButton label="Connection Lost"  active={active === "hud-connection"}       onClick={() => open("hud-connection")} />
            <TestButton label="Session Error"    active={active === "hud-session-error"}    onClick={() => open("hud-session-error")} />
            <TestButton label="Stage Validating" active={active === "hud-stage-validating"} onClick={() => open("hud-stage-validating")} />
            <TestButton label="Stage Validated"  active={active === "hud-stage-validated"}  onClick={() => open("hud-stage-validated")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Connection Lost — real HUD overlay */}
            <HudPreviewBox label="Connection Lost">
              <ConnectionOverlay />
            </HudPreviewBox>
            {/* Session Error — real HUD overlay */}
            <HudPreviewBox label="Session Error">
              <SessionErrorOverlay />
            </HudPreviewBox>
            {/* Stage Validation — real HUD overlay */}
            <HudPreviewBox label="Stage Validation">
              <StageValidationOverlay />
            </HudPreviewBox>
          </div>
          <style>{`
            @keyframes bm-spin { to { transform: rotate(360deg); } }
            @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
          `}</style>
        </section>

        {/* Phase 3 — Panel primitives */}
        <div className="border-b mb-8" style={{ borderColor: "#2a1c0c" }} />
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="px-2 py-1 rounded border border-yellow-900 text-yellow-400"
              style={{ fontFamily: FONT, fontSize: 10, backgroundColor: "#3a2410" }}
            >
              Phase 3
            </span>
            <h2
              className="tracking-wide"
              style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.8)" }}
            >
              Panel Primitives
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <p className="uppercase tracking-widest" style={{ fontFamily: FONT, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>Outer Panel</p>
              <OuterPanel className="p-3">
                <p className="text-[10px] text-white text-shadow">Dark border, brown-600 bg.</p>
              </OuterPanel>
            </div>
            <div className="flex flex-col gap-2">
              <p className="uppercase tracking-widest" style={{ fontFamily: FONT, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>Inner Panel</p>
              <InnerPanel className="p-3">
                <p className="text-[10px] text-white text-shadow">Light border, brown-300 bg.</p>
              </InnerPanel>
            </div>
            <div className="flex flex-col gap-2">
              <p className="uppercase tracking-widest" style={{ fontFamily: FONT, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>Panel (Combined)</p>
              <OuterPanel className="p-1">
                <InnerPanel className="p-3">
                  <p className="text-[10px] text-white text-shadow">Outer wrapping Inner.</p>
                </InnerPanel>
              </OuterPanel>
            </div>
          </div>
        </section>

        {/* Phase 4 — Modal sub-component strip */}
        <div className="border-b mb-8" style={{ borderColor: "#2a1c0c" }} />
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="px-2 py-1 rounded border border-yellow-900 text-yellow-400"
              style={{ fontFamily: FONT, fontSize: 10, backgroundColor: "#3a2410" }}
            >
              Phase 4
            </span>
            <h2
              className="tracking-wide"
              style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.8)" }}
            >
              Modal Sub-Components
            </h2>
          </div>
          <div className="flex flex-col gap-4 max-w-lg">
            <ModalTitleBar
              icon={ICONS.basket}
              title="Example Title Bar"
              subtitle="This subtitle sits below the title"
              onClose={() => {}}
            />
            <InnerPanel className="p-3 flex items-center justify-center">
              <p className="text-[10px] text-shadow" style={{ color: "rgba(255,255,255,0.7)" }}>
                InnerPanel — used inside ModalShell body
              </p>
            </InnerPanel>
            <div className="flex gap-2 flex-wrap">
              <StatChip value="12" caption="coins" />
              <StatChip icon={ICONS.token} value="5,400" caption={branding.tokenName} />
              <StatChip value="Online" caption="status" />
            </div>
            <div>
              <SectionLabel icon={ICONS.quest}>Section Label</SectionLabel>
            </div>
            <ActionDock info={<span>Action dock footer</span>}>
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-white cursor-pointer rounded border border-yellow-900 hover:brightness-110"
                style={{ fontFamily: FONT, backgroundColor: "#c8922a" }}
              >
                Primary
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-white cursor-pointer rounded border border-yellow-900 hover:brightness-110"
                style={{ fontFamily: FONT, backgroundColor: "#5c3d1e" }}
              >
                Secondary
              </button>
            </ActionDock>
          </div>
        </section>

      </div>

      {/* ── Phase 0: Shell demos ── */}
      <ShellDemoMock open={active === "shell-toast"}      tier="toast"      onClose={close} />
      <ShellDemoMock open={active === "shell-panel"}      tier="panel"      onClose={close} />
      <ShellDemoMock open={active === "shell-fullscreen"} tier="fullscreen" onClose={close} />

      {/* ── Phase 1: Game modals ── */}
      {active === "heroes"       && <HeroesModal      show onClose={close} />}
      {active === "heroes-empty" && <HeroesModal      show onClose={close} />}
      {active === "shop"         && <ShopModal        show onClose={close} />}
      {active === "leaderboard"  && <LeaderboardModal show onClose={close} />}
      <MarketplaceMockShell       open={active === "marketplace"} onClose={close} />

      {active === "withdraw"     && <WithdrawModal    show onClose={close} />}

      {/* ── Phase 1b: Flow states (dev-seeded, no server round-trip) ── */}
      {active === "flow-shop-minting" && (
        <ShopModal show onClose={close} debugInitial={{ phase: "queued" }} />
      )}
      {active === "flow-shop-result" && (
        <ShopModal
          show
          onClose={close}
          debugInitial={{ phase: "done", settledHeroes: MOCK_SETTLED_HEROES }}
        />
      )}
      {active === "flow-shop-error" && (
        <ShopModal
          show
          onClose={close}
          debugInitial={{ phase: "error", error: "Payment cancelled" }}
        />
      )}
      {active === "flow-withdraw-pending" && (
        <WithdrawModal
          show
          onClose={close}
          debugInitial={{ phase: "pending", amount: "5000" }}
        />
      )}
      {active === "flow-withdraw-done" && (
        <WithdrawModal
          show
          onClose={close}
          debugInitial={{ phase: "done", amount: "5000", settledSig: MOCK_TX_SIG }}
        />
      )}
      {active === "flow-withdraw-error" && (
        <WithdrawModal
          show
          onClose={close}
          debugInitial={{ phase: "error", amount: "5000", error: "Daily withdrawal limit reached" }}
        />
      )}
      {active === "flow-game-loader" && (
        <div onClick={close} role="button" aria-label="Dismiss loader preview" tabIndex={0}>
          <FullPageLoader progress={loaderProgress} fileKey="assets/tiles/mine_cavern.png" />
        </div>
      )}

    </main>
  );
}
