"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { motion, type Variants, type Transition } from "framer-motion";
import { activeChain }   from "@/lib/client/chain";
import { chainBranding } from "@/lib/config/branding";

const branding = chainBranding[activeChain];

/* -------------------------------------------------------------------------
   Tokens
   ------------------------------------------------------------------------- */
const PX  = "'Press Start 2P', monospace";
const VT  = "'VT323', monospace";
const GOLD   = "#facc15";
const CREAM  = "#f0e6c8";
const DIM    = "rgba(240,230,200,0.45)";
const BG     = "#0a0a0a";
const PANEL  = "#111111";
const BORDER = "#222222";
const HAIR   = "rgba(240,230,200,0.12)";

const RARITY: Record<string, string> = {
  Common:    "#9ca3af",
  Uncommon:  "#22c55e",
  Rare:      "#3b82f6",
  Epic:      "#a855f7",
  Legendary: "#facc15",
  Mythic:    "#ff3b6b",
};

/* -------------------------------------------------------------------------
   Data
   ------------------------------------------------------------------------- */
const CHARACTERS = [
  { name: "Ricky",    sprite: "ricky"   },
  { name: "Rocky",    sprite: "rocky"   },
  { name: "Rascal",   sprite: "rascal"  },
  { name: "Red Horn", sprite: "redhorn" },
  { name: "Ducky",    sprite: "ducky"   },
  { name: "Bolt",     sprite: "bolt"    },
  { name: "Pinky",    sprite: "pinky"   },
  { name: "Mossy",    sprite: "mossy"   },
  { name: "Ghosty",   sprite: "ghosty"  },
  { name: "Timmy",    sprite: "timmy"   },
];

const HERO_ROWS = [
  { name: "Common",    drop: "80%",     power: "1–3",   speed: "1–3",   stamina: "1–3",   bombs: 1, range: "1–2",  energy: "100–300",     regen: "5% / 5 min",    cap: 12  },
  { name: "Uncommon",  drop: "14%",     power: "3–6",   speed: "3–6",   stamina: "3–6",   bombs: 2, range: "2–3",  energy: "300–600",     regen: "6.25% / 5 min", cap: 18  },
  { name: "Rare",      drop: "5%",      power: "6–8",   speed: "6–8",   stamina: "6–8",   bombs: 3, range: "3–5",  energy: "600–800",     regen: "8.33% / 5 min", cap: 25  },
  { name: "Epic",      drop: "0.995%",  power: "8–11",  speed: "8–11",  stamina: "8–11",  bombs: 4, range: "5–7",  energy: "800–1,100",   regen: "10% / 5 min",   cap: 35  },
  { name: "Legendary", drop: "0.005%",  power: "11–16", speed: "11–16", stamina: "11–16", bombs: 6, range: "7–11", energy: "1,100–1,600", regen: "12.5% / 5 min", cap: 50  },
];

const CHEST_ROWS = [
  { name: "Common",    drop: "80%",   hp: 20,   coins: 800     },
  { name: "Rare",      drop: "13%",   hp: 160,  coins: 2_400   },
  { name: "Epic",      drop: "5%",    hp: 320,  coins: 8_000   },
  { name: "Legendary", drop: "1.6%",  hp: 640,  coins: 32_000  },
  { name: "Mythic",    drop: "0.4%",  hp: 1280, coins: 160_000 },
];

const NAV_ITEMS = [
  { id: "overview",   label: "Overview"   },
  { id: "incubator",  label: "Incubator"  },
  { id: "roster",     label: "Roster"     },
  { id: "mechanics",  label: "Mechanics"  },
  { id: "hero-stats", label: "Hero Stats" },
  { id: "chests",     label: "Chests"     },
  { id: "energy",     label: "Energy"     },
  { id: "stages",     label: "Stages"     },
];

/* -------------------------------------------------------------------------
   Motion
   ------------------------------------------------------------------------- */
const EASE_OUT: Transition = { duration: 0.45, ease: "easeOut" };

const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: EASE_OUT },
};
const stagger: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
};

/* -------------------------------------------------------------------------
   Primitives
   ------------------------------------------------------------------------- */
function RarityTag({ name }: { name: string }) {
  const c = RARITY[name] ?? CREAM;
  return (
    <span style={{
      fontFamily: PX, fontSize: 8, letterSpacing: 1,
      background: c, color: "#000",
      padding: "3px 8px", display: "inline-block",
    }}>
      {name.toUpperCase()}
    </span>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: PANEL,
      border: `1px solid ${BORDER}`,
      padding: "24px 28px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, letterSpacing: 3, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} style={{
      fontFamily: PX,
      fontSize: "clamp(13px, 1.6vw, 16px)",
      color: CREAM,
      margin: 0,
      scrollMarginTop: 90,
      lineHeight: 1.5,
    }}>
      {children}
    </h2>
  );
}

function Divider() {
  return <div style={{ height: 1, background: BORDER, margin: "64px 0" }} />;
}

function BodyText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p style={{
      fontFamily: VT, fontSize: 20, color: CREAM, opacity: 0.8,
      lineHeight: 1.65, margin: 0,
      ...style,
    }}>
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------- */
export default function DocsPage() {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

        /* Nav */
        .docs-nav-inner {
          max-width: 1400px; margin: 0 auto;
          padding: 0 40px;
          display: flex; align-items: center; justify-content: space-between; height: 64px;
        }
        @media (max-width: 600px) { .docs-nav-inner { padding: 0 20px; } }

        /* Layout */
        .docs-layout {
          display: grid;
          grid-template-columns: 220px 1fr;
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 40px;
          gap: 0;
        }
        @media (max-width: 1024px) {
          .docs-layout { padding: 0 28px; }
        }
        @media (max-width: 900px) {
          .docs-layout { grid-template-columns: 1fr; padding: 0 24px; }
          .docs-sidebar { display: none !important; }
        }
        @media (max-width: 480px) {
          .docs-layout { padding: 0 16px; }
        }

        /* Sidebar */
        .docs-sidebar {
          border-right: 1px solid ${BORDER};
          padding-top: 56px;
          padding-right: 32px;
          position: sticky;
          top: 64px;
          align-self: start;
          max-height: calc(100vh - 64px);
          overflow-y: auto;
        }
        .docs-sidebar::-webkit-scrollbar { width: 0; }
        .sidebar-section {
          font-family: ${PX}; font-size: 7px; color: ${CREAM};
          opacity: 0.3; letter-spacing: 3px; margin-bottom: 14px;
        }
        .sidebar-link {
          display: block;
          font-family: ${VT}; font-size: 19px;
          color: ${CREAM}; opacity: 0.55;
          text-decoration: none;
          padding: 7px 0 7px 16px;
          border-left: 2px solid transparent;
          transition: opacity 0.15s, border-color 0.15s, color 0.15s;
          letter-spacing: 0.5px;
        }
        .sidebar-link:hover {
          opacity: 1;
          border-left-color: ${GOLD};
          color: ${GOLD};
        }

        /* Main */
        .docs-main {
          padding: 56px 0 120px 56px;
          min-width: 0;
          max-width: 860px;
        }
        @media (max-width: 1024px) {
          .docs-main { padding: 48px 0 100px 40px; }
        }
        @media (max-width: 900px) {
          .docs-main { padding: 48px 0 80px 0; max-width: 100%; }
        }
        @media (max-width: 480px) {
          .docs-main { padding: 32px 0 64px 0; }
        }

        /* Tables */
        .docs-table { width: 100%; border-collapse: collapse; min-width: 520px; }
        .docs-table thead th {
          font-family: ${PX}; font-size: 7px; color: ${GOLD};
          letter-spacing: 1.5px; text-align: left;
          padding: 0 14px 14px 14px;
          border-bottom: 1px solid ${BORDER};
          white-space: nowrap;
        }
        .docs-table tbody td {
          font-family: ${VT}; font-size: 19px; color: ${CREAM};
          padding: 13px 14px;
          border-bottom: 1px solid ${BORDER};
          vertical-align: middle;
          white-space: nowrap;
        }
        .docs-table tbody tr:last-child td { border-bottom: none; }
        .docs-table tbody tr:hover td { background: rgba(255,255,255,0.02); }
        .table-wrap { overflow-x: auto; border: 1px solid ${BORDER}; -webkit-overflow-scrolling: touch; }

        /* Overview stat cards */
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: ${BORDER};
          border: 1px solid ${BORDER};
          margin-bottom: 40px;
        }
        @media (max-width: 640px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .stat-cell {
          background: ${PANEL};
          padding: 24px 20px;
          display: flex; flex-direction: column; gap: 10px;
          min-width: 0;
        }

        /* How it works steps */
        .steps-list {
          display: flex; flex-direction: column; gap: 1px;
          background: ${BORDER};
          border: 1px solid ${BORDER};
          margin-bottom: 0;
        }
        .step-row {
          background: ${PANEL};
          display: grid; grid-template-columns: 48px 1fr;
          gap: 0; min-width: 0;
        }
        .step-num {
          display: flex; align-items: flex-start; justify-content: center;
          padding: 24px 0 0;
          font-family: ${PX}; font-size: 9px; color: ${GOLD}; opacity: 0.5;
          border-right: 1px solid ${BORDER};
          flex-shrink: 0;
        }
        .step-body { padding: 24px 28px; min-width: 0; }
        @media (max-width: 480px) {
          .step-body { padding: 20px 16px; }
        }

        /* Incubator split */
        .inc-split {
          display: grid;
          grid-template-columns: minmax(0, 320px) 1fr;
          gap: 0;
          background: ${BORDER};
          border: 1px solid ${BORDER};
        }
        @media (max-width: 860px) {
          .inc-split { grid-template-columns: 1fr; }
          .inc-sprite-col {
            border-right: none !important;
            border-bottom: 1px solid ${BORDER};
            min-height: 240px;
          }
        }
        .inc-sprite-col {
          background: #0d0d0d;
          display: flex; align-items: center; justify-content: center;
          padding: 40px;
          border-right: 1px solid ${BORDER};
          overflow: hidden;
        }
        .inc-detail-col { background: ${PANEL}; padding: 32px; min-width: 0; }
        .inc-row {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 16px;
          padding: 14px 0;
          border-bottom: 1px solid ${BORDER};
        }
        .inc-row:last-of-type { border-bottom: none; }

        /* Marquee */
        @keyframes bm-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .marquee-track { display: flex; gap: 16px; padding: 0 8px; width: max-content; animation: bm-marquee 65s linear infinite; }
        .marquee-viewport { overflow: hidden; }
        .marquee-viewport:hover .marquee-track { animation-play-state: paused; }
        .hero-card {
          flex: 0 0 auto; width: 172px;
          background: ${PANEL};
          border: 1px solid #1e1e1e;
          padding: 28px 16px 20px;
          text-align: center;
        }
        .hero-sprite {
          width: 96px; height: 120px; margin: 0 auto;
          image-rendering: pixelated;
          background-image: var(--sprite-url);
          background-size: 288px 480px;
          background-position: -96px 0;
        }

        /* Incubator animation */
        @keyframes bm-inc-frames { from { background-position: 0 0; } to { background-position: -1200px 0; } }
        @keyframes bm-inc-glow {
          0%, 100% { filter: drop-shadow(0 0 0px ${GOLD}00); }
          50%       { filter: drop-shadow(0 0 18px ${GOLD}88); }
        }
        .inc-stage {
          width: 300px; height: 320px;
          flex-shrink: 0;
          background: url(/assets/incubator.png) no-repeat 0 0 / 1200px 320px;
          image-rendering: pixelated;
          animation: bm-inc-frames 0.8s steps(4) infinite,
                     bm-inc-glow 2.4s ease-in-out infinite;
        }
        @media (max-width: 860px) {
          .inc-stage { transform: scale(0.85); transform-origin: center; }
        }
        @media (max-width: 480px) {
          .inc-stage { transform: scale(0.65); transform-origin: center; }
        }

        /* Attr cards */
        .attr-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px; background: ${BORDER};
          border: 1px solid ${BORDER};
          margin-top: 24px;
        }
        @media (max-width: 640px) { .attr-grid { grid-template-columns: 1fr; } }
        .attr-cell { background: ${PANEL}; padding: 22px 24px; min-width: 0; }

        /* Energy cards */
        .energy-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px; background: ${BORDER};
          border: 1px solid ${BORDER};
        }
        @media (max-width: 640px) { .energy-grid { grid-template-columns: 1fr; } }
        .energy-cell { background: ${PANEL}; padding: 24px 28px; min-width: 0; }
        @media (max-width: 480px) {
          .energy-cell { padding: 20px 16px; }
        }
        /* Full-span cell works in both 2-col and 1-col grid */
        .energy-cell-full { grid-column: 1 / -1; }

        /* Status pills */
        .status-pill {
          display: inline-block;
          font-family: ${PX}; font-size: 7px; letter-spacing: 1px;
          padding: 3px 8px; border: 1px solid currentColor;
          margin-bottom: 4px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Stage cards */
        .stage-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px; background: ${BORDER};
          border: 1px solid ${BORDER};
        }
        @media (max-width: 860px) { .stage-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .stage-grid { grid-template-columns: 1fr; } }
        .stage-cell { background: ${PANEL}; padding: 24px 28px; min-width: 0; }
        @media (max-width: 480px) {
          .stage-cell { padding: 20px 16px; }
        }

        /* CTA bar */
        .cta-bar {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 24px;
          padding: 40px;
          border: 1px solid ${BORDER};
          background: ${PANEL};
        }
        @media (max-width: 640px) { .cta-bar { flex-direction: column; align-items: flex-start; padding: 28px 24px; } }

        .play-btn {
          display: inline-block;
          font-family: ${PX}; font-size: 10px; letter-spacing: 1px;
          background: ${GOLD}; color: #000;
          padding: 14px 28px; text-decoration: none;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .play-btn:hover { opacity: 0.85; }
        @media (max-width: 480px) {
          .play-btn { font-size: 8px; padding: 12px 20px; }
        }

        .back-btn {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: ${PX}; font-size: 8px; letter-spacing: 1px;
          color: ${CREAM}; text-decoration: none; opacity: 0.45;
          transition: opacity 0.15s;
        }
        .back-btn:hover { opacity: 1; }

        /* Nav logo responsive */
        @media (max-width: 480px) {
          .docs-logo { height: 28px !important; }
          .docs-nav-label { display: none; }
        }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(10,10,10,0.95)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <div className="docs-nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center" }}>
              <img
                src={branding.logo}
                alt={branding.gameName}
                className="docs-logo"
                style={{ height: 36, width: "auto", imageRendering: "pixelated" }}
              />
            </Link>
            <span className="docs-nav-label" style={{
              fontFamily: PX, fontSize: 8, color: CREAM, opacity: 0.3,
              letterSpacing: 3, paddingLeft: 20,
              borderLeft: `1px solid ${BORDER}`,
            }}>
              DOCS
            </span>
          </div>
          <Link href="/" className="play-btn" style={{ fontSize: 8, padding: "10px 20px" }}>
            PLAY NOW
          </Link>
        </div>
      </motion.header>

      {/* ── LAYOUT ────────────���──────────────────────────────── */}
      <div className="docs-layout">

        {/* SIDEBAR */}
        <aside className="docs-sidebar">
          <div className="sidebar-section">ON THIS PAGE</div>
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="sidebar-link">
              {item.label}
            </a>
          ))}
        </aside>

        {/* MAIN */}
        <main className="docs-main">

          {/* PAGE HEADER */}
          <motion.div
            variants={stagger} initial="hidden" animate="visible"
            style={{ marginBottom: 72 }}
          >
            <motion.div variants={fadeUp}>
              <Eyebrow>GAME DOCUMENTATION</Eyebrow>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              style={{
                fontFamily: PX,
                fontSize: "clamp(18px, 2.4vw, 28px)",
                color: CREAM, margin: "0 0 24px",
                lineHeight: 1.45, textShadow: "3px 3px 0 #000",
              }}
            >
              {branding.gameName.toUpperCase()}{" "}
              <span style={{ color: GOLD }}>COMPLETE GUIDE</span>
            </motion.h1>
            <motion.div variants={fadeUp}>
              <BodyText style={{ fontSize: 22, maxWidth: 600, opacity: 0.65 }}>
                Everything you need to know about heroes, bombs, chests, energy, and stages.
              </BodyText>
            </motion.div>
          </motion.div>

          {/* ── OVERVIEW ───────────────────────────────────────── */}
          <motion.section
            id="overview"
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            style={{ scrollMarginTop: 90 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="overview">Overview</SectionTitle>
            </motion.div>

            <motion.div variants={fadeUp} className="stat-grid">
              {[
                { label: "World Map",     value: "41 × 25" },
                { label: "Unique Heroes", value: "10 UNITS" },
                { label: "Rarity Tiers",  value: "5 LEVELS" },
                { label: "Total Mint",    value: "500,000"  },
              ].map((s) => (
                <div key={s.label} className="stat-cell">
                  <div style={{ fontFamily: PX, fontSize: 7, color: CREAM, opacity: 0.4, letterSpacing: 2 }}>
                    {s.label.toUpperCase()}
                  </div>
                  <div style={{ fontFamily: PX, fontSize: 14, color: GOLD, textShadow: "2px 2px 0 #000" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </motion.div>

            <motion.div variants={fadeUp}>
              <Card>
                <BodyText>
                  Boom Miner is a pixel-art auto-battler where you mint gacha heroes on-chain,
                  deploy them to a procedurally generated map, and collect {branding.tokenName} as they
                  bomb their way through chests. Heroes act autonomously — no input required
                  once deployed. Rarity governs every stat, from blast power to daily earnings cap.
                </BodyText>
              </Card>
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── INCUBATOR ──────────────────────────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="incubator">The Incubator</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                Pay 500,000 {branding.tokenName} per hero. Rarity and stats are decided the moment the egg cracks.
              </BodyText>
            </motion.div>

            <motion.div variants={fadeUp}>
              <div className="inc-split">
                <div className="inc-sprite-col">
                  <div className="inc-stage" aria-label="Incubator animation" role="img" />
                </div>
                <div className="inc-detail-col">
                  <Eyebrow>MINT DETAILS</Eyebrow>
                  {[
                    { l: "Pack Size",    v: "×1 – ×10"            },
                    { l: "Cost",         v: `500,000 ${branding.tokenName} ea.`  },
                    { l: "Rarity Tiers", v: "5 Tiers"              },
                    { l: "Settlement",   v: "After TX confirms"    },
                  ].map((row) => (
                    <div key={row.l} className="inc-row">
                      <span style={{ fontFamily: PX, fontSize: 8, color: CREAM, opacity: 0.4, letterSpacing: 1 }}>
                        {row.l.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: VT, fontSize: 20, color: GOLD }}>
                        {row.v}
                      </span>
                    </div>
                  ))}
                  <BodyText style={{ marginTop: 24, fontSize: 18 }}>
                    Drop coin, crack the shell. Each mint rolls a fresh hero on the drop table.
                    Rarity is random — Legendary is 1 in 20,000.
                  </BodyText>
                </div>
              </div>
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── ROSTER ──────��──────────────────────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="roster">The Roster</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                Ten pixel miners tunnel out of the incubator. Roll for rarity, deploy your crew.
              </BodyText>
            </motion.div>

            <motion.div
              variants={fadeUp}
              style={{
                overflow: "hidden",
                borderTop: `1px solid ${BORDER}`,
                borderBottom: `1px solid ${BORDER}`,
                padding: "32px 0",
              }}
            >
              <div className="marquee-viewport">
                <div className="marquee-track">
                  {[...CHARACTERS, ...CHARACTERS].map((c, i) => (
                    <div className="hero-card" key={`${c.sprite}-${i}`}>
                      <div
                        className="hero-sprite"
                        style={{ ["--sprite-url" as never]: `url(/assets/characters/${c.sprite}.png)` }}
                        aria-label={c.name}
                        role="img"
                      />
                      <div style={{
                        marginTop: 12, fontFamily: PX, fontSize: 7,
                        color: GOLD, letterSpacing: 1, lineHeight: 1.6,
                      }}>
                        {c.name.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── MECHANICS ──────────────────────────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="mechanics">How It Works</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                Deploy heroes to the map. They path, bomb, and loot autonomously.
              </BodyText>
            </motion.div>

            <motion.div variants={fadeUp} className="steps-list">
              {[
                {
                  n: "01",
                  title: "Mint a Crew",
                  body: `Pay 500,000 ${branding.tokenName} on-chain per hero. Your request is queued and verified by the chain worker, then heroes appear in your roster. Rarity rolls on the drop table — Legendary is 1 in 20,000.`,
                },
                {
                  n: "02",
                  title: "Deploy to the Map",
                  body: "Send up to 10 heroes to WORK from your roster. Each deployed hero auto-pathfinds toward chests, plants bombs, and dodges its own blasts. No player input required once deployed.",
                },
                {
                  n: "03",
                  title: "Crack Chests, Earn Coin",
                  body: `Each detonation costs 1 energy and deals Power HP to every tile in the blast. Chests destroyed pay out ${branding.tokenName} by rarity. Clear all chests on a stage to auto-advance.`,
                },
                {
                  n: "04",
                  title: "Rest & Repeat",
                  body: "At 0 energy a hero is auto-recalled. While RESTING it regenerates energy at its rarity rate (5%–12.5% per 5 min). Each hero has a daily chest cap — higher rarities unlock more per day.",
                },
              ].map((step) => (
                <div key={step.n} className="step-row">
                  <div className="step-num">{step.n}</div>
                  <div className="step-body">
                    <div style={{ fontFamily: PX, fontSize: 10, color: GOLD, marginBottom: 12 }}>
                      {step.title.toUpperCase()}
                    </div>
                    <BodyText>{step.body}</BodyText>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── HERO STATS ─────────────────────────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="hero-stats">Hero Rarities & Stats</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                All stat values roll within these ranges at mint time.
              </BodyText>
            </motion.div>

            <motion.div variants={fadeUp}>
              <div className="table-wrap" style={{ marginBottom: 24 }}>
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Rarity</th>
                      <th>Drop %</th>
                      <th>Power</th>
                      <th>Speed</th>
                      <th>Stamina</th>
                      <th>Bombs</th>
                      <th>Range</th>
                      <th>Max Energy</th>
                      <th>Regen</th>
                      <th>Daily Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HERO_ROWS.map((r) => (
                      <tr key={r.name}>
                        <td><RarityTag name={r.name} /></td>
                        <td style={{ color: DIM }}>{r.drop}</td>
                        <td>{r.power}</td>
                        <td>{r.speed}</td>
                        <td>{r.stamina}</td>
                        <td>{r.bombs}</td>
                        <td>{r.range}</td>
                        <td>{r.energy}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.regen}</td>
                        <td style={{ color: GOLD }}>{r.cap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className="attr-grid">
              {[
                { k: "Power",        v: "HP damage dealt to every tile in the blast per detonation. A Power 3 hero removes 3 HP per hit." },
                { k: "Speed",        v: "Movement speed on the map. Higher speed means faster pathfinding to chests." },
                { k: "Stamina",      v: "Sets max energy (Stamina × 100). Determines how long the hero works before resting." },
                { k: "Bomb / Range", v: "Bomb Num = bombs active simultaneously. Range = blast radius in tiles from detonation center." },
              ].map((item) => (
                <div key={item.k} className="attr-cell">
                  <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, marginBottom: 10 }}>
                    {item.k.toUpperCase()}
                  </div>
                  <BodyText style={{ fontSize: 18 }}>{item.v}</BodyText>
                </div>
              ))}
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── CHESTS ────────────────────────���────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="chests">Chest Rarities & Payouts</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                Rarer chests take more bomb hits but pay out exponentially more {branding.tokenName}.
              </BodyText>
            </motion.div>

            <motion.div variants={fadeUp}>
              <div className="table-wrap">
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Rarity</th>
                      <th>Spawn %</th>
                      <th>HP</th>
                      <th>{branding.tokenName} Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHEST_ROWS.map((r) => (
                      <tr key={r.name}>
                        <td><RarityTag name={r.name} /></td>
                        <td style={{ color: DIM }}>{r.drop}</td>
                        <td>{r.hp.toLocaleString()}</td>
                        <td style={{ color: GOLD, fontFamily: PX, fontSize: 11 }}>
                          {r.coins.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── ENERGY ─────────────────────────────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="energy">Energy & Regeneration</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                Every bomb costs energy. Rest at Home to recover it.
              </BodyText>
            </motion.div>

            <motion.div variants={fadeUp} className="energy-grid">
              <div className="energy-cell">
                <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, marginBottom: 12 }}>MAX ENERGY</div>
                <BodyText>
                  <span style={{ color: GOLD }}>Stamina × 100</span> = max energy.
                  A Legendary with 16 Stamina caps at 1,600 energy.
                </BodyText>
              </div>
              <div className="energy-cell">
                <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, marginBottom: 12 }}>CONSUMPTION</div>
                <BodyText>
                  Every bomb detonation drains{" "}
                  <span style={{ color: GOLD }}>1 energy</span>.
                  At 0 energy the hero falls asleep and returns Home.
                </BodyText>
              </div>
              <div className="energy-cell energy-cell-full">
                <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, marginBottom: 12 }}>REGENERATION RATES</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px" }}>
                  {[
                    { r: "Common",    v: "5% per 5 min  (~100 min full)" },
                    { r: "Uncommon",  v: "6.25% per 5 min (~80 min full)" },
                    { r: "Rare",      v: "8.33% per 5 min (~60 min full)" },
                    { r: "Epic",      v: "10% per 5 min  (~50 min full)" },
                    { r: "Legendary", v: "12.5% per 5 min (~40 min full)" },
                  ].map((item) => (
                    <div key={item.r} style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 280 }}>
                      <RarityTag name={item.r} />
                      <span style={{ fontFamily: VT, fontSize: 19, color: CREAM, opacity: 0.75 }}>{item.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="energy-cell">
                <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, marginBottom: 14 }}>STATUS STATES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "WORKING",  c: "#22c55e", desc: "Deployed on map, mining" },
                    { label: "RESTING",  c: "#3b82f6", desc: "Off map, energy regenerating" },
                    { label: "READY",    c: GOLD,      desc: "Off map, energy full" },
                    { label: "SLEEPING", c: "#ef4444", desc: "0 energy, auto-recalled" },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="status-pill" style={{ color: s.c, borderColor: s.c }}>
                        {s.label}
                      </span>
                      <span style={{ fontFamily: VT, fontSize: 19, color: CREAM, opacity: 0.65 }}>
                        {s.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="energy-cell">
                <div style={{ fontFamily: PX, fontSize: 8, color: GOLD, marginBottom: 12 }}>DAILY CHEST CAP</div>
                <BodyText style={{ marginBottom: 16 }}>
                  Each hero contributes to your account daily cap:
                </BodyText>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { r: "Common",    v: "12 chests / day" },
                    { r: "Uncommon",  v: "18 chests / day" },
                    { r: "Rare",      v: "25 chests / day" },
                    { r: "Epic",      v: "35 chests / day" },
                    { r: "Legendary", v: "50 chests / day" },
                  ].map((item) => (
                    <div key={item.r} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                      <RarityTag name={item.r} />
                      <span style={{ fontFamily: VT, fontSize: 19, color: GOLD }}>{item.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.section>

          <Divider />

          {/* ── STAGES ─────────────────────────────────────────── */}
          <motion.section
            variants={stagger} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            style={{ marginBottom: 80 }}
          >
            <motion.div variants={fadeUp} style={{ marginBottom: 32 }}>
              <SectionTitle id="stages">Stages & The Map</SectionTitle>
              <BodyText style={{ marginTop: 12, opacity: 0.55 }}>
                Every stage is procedurally generated. Clear it to advance.
              </BodyText>
            </motion.div>

            <motion.div variants={fadeUp} className="stage-grid">
              {[
                {
                  k: "Map Generation",
                  p: "Each stage is a seeded 41 × 25 grid. 55–65 chests are placed first, then remaining tiles fill at ~60% bush density. Perimeter and even-column walls form the fixed maze skeleton.",
                },
                {
                  k: "Stage Completion",
                  p: "Destroy every chest on the map to complete the stage. The server detects completion when the destroyed node count reaches the total. A fresh seeded map generates automatically for the next stage.",
                },
                {
                  k: "Spawn Protection",
                  p: "Tiles (1,1), (2,1) and (1,2) are always kept clear — the hero spawn corner is guaranteed walkable so heroes are never trapped at stage start.",
                },
              ].map((item) => (
                <div key={item.k} className="stage-cell">
                  <div style={{ fontFamily: PX, fontSize: 9, color: GOLD, marginBottom: 14 }}>
                    {item.k.toUpperCase()}
                  </div>
                  <BodyText style={{ fontSize: 18 }}>{item.p}</BodyText>
                </div>
              ))}
            </motion.div>
          </motion.section>

          {/* ── CTA ────────────────────────────────────────────── */}
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
          >
            <div className="cta-bar">
              <div>
                <div style={{ fontFamily: PX, fontSize: 10, color: GOLD, marginBottom: 10 }}>
                  READY TO MINE?
                </div>
                <BodyText style={{ opacity: 0.6 }}>
                  Grab your incubator and start hatching heroes.
                </BodyText>
              </div>
              <Link href="/" className="play-btn">ENTER THE MINES →</Link>
            </div>
          </motion.div>

        </main>
      </div>
    </div>
  );
}
