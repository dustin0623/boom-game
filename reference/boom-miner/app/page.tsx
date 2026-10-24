"use client";

import Link from "next/link";
import { lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { motion, type Variants } from "framer-motion";
import { LoginSolana }    from "@/components/login/LoginSolana";
import { LoginRobinhood } from "@/components/login/LoginRobinhood";
import { LoginHive }      from "@/components/login/LoginHive";
import { activeChain }    from "@/lib/client/chain";
import { chainBranding }  from "@/lib/config/branding";

const SimulatedGame = lazy(() => import("@/components/SimulatedGame"));

/* -------------------------------------------------------------------------
   Chain is read from the environment. When absent / "none" → coming-soon.
   Because this is now a client component we read the public env var directly.
   ------------------------------------------------------------------------- */
const rawChain = (process.env.NEXT_PUBLIC_CHAIN ?? "").toLowerCase().trim();
const chain    = rawChain === "" || rawChain === "none" ? "none" : rawChain;

const branding = chainBranding[activeChain];

/* -------------------------------------------------------------------------
   Design tokens
   ------------------------------------------------------------------------- */
const pixelFont = "'Press Start 2P', monospace";
const bodyFont  = "'VT323', monospace";
const gold      = "#facc15";
const cream     = "#f5e9c4";
const bg        = "#0a0a0a";
const hairline  = "rgba(245,233,196,0.15)";
const panel     = "#111111";
const border    = "#222222";

/* -------------------------------------------------------------------------
   Roster data
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

/* -------------------------------------------------------------------------
   Per-chain copy
   ------------------------------------------------------------------------- */
const CHAIN_COPY: Record<string, { label: string; tagline: string; bullets: string[] }> = {
  solana: {
    label:   "SOLANA",
    tagline: `Connect your Solana wallet to claim your pixel miners, stack ${chainBranding.solana.tokenName}, and climb the global leaderboards.`,
    bullets: [
      "Works with Phantom, Solflare, Backpack and more",
      "Gasless — you only sign a message, nothing is broadcast",
      `Server-authoritative ${chainBranding.solana.tokenName} balance`,
    ],
  },
  robinhood: {
    label:   "ROBINHOOD CHAIN",
    tagline: "Connect your Robinhood Chain wallet to enter the mines and earn $RBOOM.",
    bullets: [
      "Works with MetaMask, Rabby and any EIP-6963 wallet",
      "Sign-in is free — no gas, no transaction",
      "Persistent stage progression across devices",
    ],
  },
  hive: {
    label:   "HIVE BLOCKCHAIN",
    tagline: "Sign in with your Hive account via Hive Keychain to enter the mines.",
    bullets: [
      "Requires the Hive Keychain browser extension",
      "Signs with your Posting key — no tokens spent",
      "Cross-device progress via server persistence",
    ],
  },
};

const COMING_SOON_COPY = {
  label:   branding.gameName.toUpperCase(),
  tagline: "A pixel mining game powered by blockchain. Deploy your heroes, detonate bombs, and stack coins.",
  bullets: [
    "Ten unique heroes across multiple rarities",
    "Real on-chain coin withdrawals",
    "Compete on global leaderboards",
  ],
};

const copy = chain === "none" ? COMING_SOON_COPY : (CHAIN_COPY[chain] ?? CHAIN_COPY.solana);

/* -------------------------------------------------------------------------
   Animation variants
   ------------------------------------------------------------------------- */
const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.08, ease: "easeOut" },
  }),
};

const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { duration: 0.45, delay: i * 0.08, ease: "easeOut" },
  }),
};

/* -------------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------------- */
function Bullet({ label, index }: { label: string; index: number }) {
  return (
    <motion.div
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: bodyFont, fontSize: 20, color: cream }}
    >
      <span
        style={{
          width: 14, height: 14,
          background: gold,
          transform: "rotate(45deg)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </motion.div>
  );
}

function ComingSoonPanel() {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      custom={0}
      style={{
        border: `2px solid ${hairline}`,
        padding: "clamp(28px, 4vw, 48px) clamp(20px, 3vw, 36px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        textAlign: "center",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ fontFamily: pixelFont, fontSize: 11, color: gold, letterSpacing: 3 }}>
        COMING SOON
      </div>
      <p style={{ fontFamily: bodyFont, fontSize: 22, color: cream, opacity: 0.7, maxWidth: 300, lineHeight: 1.6, margin: 0 }}>
        The mines are not open yet. Stay tuned for the official launch announcement.
      </p>
      <div style={{ width: 48, height: 6, background: gold, boxShadow: "4px 4px 0 #000" }} />
      <p style={{ fontFamily: bodyFont, fontSize: 18, color: cream, opacity: 0.45, margin: 0 }}>
        Sign-in is disabled until launch.
      </p>
    </motion.div>
  );
}

function LoginPanel() {
  if (chain === "none")      return <ComingSoonPanel />;
  if (chain === "hive")      return <LoginHive />;
  if (chain === "robinhood") return <LoginRobinhood />;
  return <LoginSolana />;
}

/* -------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------- */
export default function Page() {
  return (
    <main style={{ minHeight: "100vh", background: bg, color: cream, fontFamily: pixelFont }}>
      <style>{`
        /* ---------- layout grid ---------- */
        .bm-login-grid {
          max-width: 1180px;
          margin: 0 auto;
          padding: 80px 28px 120px;
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 72px;
          align-items: center;
        }
        /* laptop */
        @media (max-width: 1100px) {
          .bm-login-grid {
            gap: 48px;
            padding: 60px 24px 100px;
          }
        }
        /* tablet / ipad */
        @media (max-width: 860px) {
          .bm-login-grid {
            grid-template-columns: 1fr;
            gap: 40px;
            padding: 40px 20px 72px;
          }
        }
        /* mobile */
        @media (max-width: 480px) {
          .bm-login-grid {
            padding: 28px 16px 56px;
            gap: 32px;
          }
        }

        /* ---------- nav logo ---------- */
        .bm-nav-logo { height: 44px; }
        @media (max-width: 480px) { .bm-nav-logo { height: 36px; } }

        /* ---------- roster ---------- */
        @keyframes bm-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .bm-marquee-track {
          display: flex; gap: 16px; width: max-content;
          padding: 0 8px;
          animation: bm-marquee 65s linear infinite;
        }
        .bm-marquee-viewport { overflow: hidden; }
        .bm-marquee-viewport:hover .bm-marquee-track { animation-play-state: paused; }
        .bm-hero-card {
          flex: 0 0 auto; width: 172px;
          background: #111111;
          border: 1px solid #1e1e1e;
          padding: 28px 16px 20px;
          text-align: center;
        }
        .bm-hero-sprite {
          width: 96px; height: 120px; margin: 0 auto;
          image-rendering: pixelated;
          background-image: var(--sprite-url);
          background-size: 288px 480px;
          background-position: -96px 0;
        }
      `}</style>

      {/* NAV */}
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          borderBottom: `1px dashed ${hairline}`,
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "18px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <img
            src={branding.logo}
            alt={branding.gameName}
            className="bm-nav-logo"
            style={{ width: "auto", imageRendering: "pixelated" }}
          />
          <Link
            href="/docs"
            style={{
              fontFamily: pixelFont,
              fontSize: 10,
              color: cream,
              textDecoration: "none",
              letterSpacing: 2,
              opacity: 0.75,
            }}
          >
            DOCS
          </Link>
        </div>
      </motion.nav>

      {/* HERO SECTION — simulated gameplay background */}
      <section style={{ position: "relative", overflow: "hidden", isolation: "isolate" }}>
        {/* canvas + vignette mask */}
        <Suspense fallback={null}>
          <SimulatedGame opacity={0.22} />
        </Suspense>
        {/* edge fade — only the outer rim fades to bg, centre stays transparent */}
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `
            linear-gradient(to bottom, ${bg} 0%, transparent 12%, transparent 88%, ${bg} 100%),
            linear-gradient(to right,  ${bg} 0%, transparent 10%, transparent 90%, ${bg} 100%)
          `,
        }} />

      {/* LOGIN GRID */}
      <div className="bm-login-grid" style={{ position: "relative", zIndex: 1 }}>
        {/* LORE SIDE */}
        <div>
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0}
            style={{
              fontFamily: pixelFont,
              fontSize: "clamp(28px, 4.5vw, 60px)",
              lineHeight: 1.18,
              margin: 0,
              color: cream,
              textShadow: "5px 5px 0 #000",
              letterSpacing: -1,
            }}
          >
            ENTER THE<br />MINES
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            style={{
              fontFamily: bodyFont,
              fontSize: "clamp(18px, 2.2vw, 22px)",
              marginTop: 26,
              maxWidth: 460,
              lineHeight: 1.55,
              color: cream,
              opacity: 0.75,
            }}
          >
            {copy.tagline}
          </motion.p>

          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 18 }}>
            {copy.bullets.map((b, i) => (
              <Bullet key={b} label={b} index={i + 2} />
            ))}
          </div>
        </div>

        {/* LOGIN CARD */}
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          custom={4}
        >
          <LoginPanel />
        </motion.div>
      </div>
      </section>

      {/* ROSTER */}
      <section style={{ borderTop: `1px solid ${border}`, paddingBottom: 80 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 28px 40px" }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            style={{ marginBottom: 36, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}
          >
            <div>
              <div style={{ fontFamily: pixelFont, fontSize: 8, color: gold, letterSpacing: 3, marginBottom: 12 }}>
                THE ROSTER
              </div>
              <h2 style={{ fontFamily: pixelFont, fontSize: "clamp(13px, 1.6vw, 18px)", color: cream, margin: 0, lineHeight: 1.5 }}>
                TEN PIXEL MINERS
              </h2>
            </div>

          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{
            borderTop: `1px solid ${border}`,
            borderBottom: `1px solid ${border}`,
            padding: "32px 0",
          }}
        >
          <div className="bm-marquee-viewport">
            <div className="bm-marquee-track">
              {[...CHARACTERS, ...CHARACTERS].map((c, i) => (
                <div className="bm-hero-card" key={`${c.sprite}-${i}`}>
                  <div
                    className="bm-hero-sprite"
                    style={{ ["--sprite-url" as never]: `url(/assets/characters/${c.sprite}.png)` }}
                    aria-label={c.name}
                    role="img"
                  />
                  <div style={{
                    marginTop: 12, fontFamily: pixelFont, fontSize: 7,
                    color: gold, letterSpacing: 1, lineHeight: 1.6,
                  }}>
                    {c.name.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
            style={{ fontFamily: bodyFont, fontSize: 20, color: cream, opacity: 0.45, margin: "28px 0 0", lineHeight: 1.6 }}
          >
            Ten unique heroes across five rarity tiers — Common to Legendary. Roll for rarity, deploy your crew, and let them bomb their way through the mines.
          </motion.p>
        </div>
      </section>
    </main>
  );
}
