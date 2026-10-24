"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  ModalShell,
  ModalTitleBar,
  ActionDock,
  SectionLabel,
} from "@/components/ui/modal";
import {
  useGameStore,
  MINT_COST,
  iHeroToRosterHero,
  type RosterHero,
} from "@/features/store/gameStore";
import {
  subscribeToSolanaWallets,
  type DetectedWallet,
} from "@/lib/auth/wallet-adapters/solana";
import {
  subscribeToEIP6963Wallets,
  type EIP6963Provider,
} from "@/lib/auth/wallet-adapters/robinhood";
import type { DepositParams } from "@/lib/client/types";
import { activeChain }   from "@/lib/client/chain";
import { chainBranding } from "@/lib/config/branding";

const { tokenName } = chainBranding[activeChain];
import type { SettledMintMetadata } from "@/hooks/useSettlementNotifier";
import { HeroSprite } from "@/features/game-components/heroes/HeroSprite";
import { HERO_RARITY_DEFS, HeroRarity } from "@/features/types/HeroRarity";


const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

type RarityKey = "common" | "uncommon" | "rare" | "epic" | "legendary";

const RARITY_COLOR: Record<RarityKey, string> = {
  common:    "#9ca3af",
  uncommon:  "#22c55e",
  rare:      "#3b82f6",
  epic:      "#a855f7",
  legendary: "#facc15",
};

// Derived directly from HERO_RARITY_DEFS weights so the displayed odds always
// match the actual mint probabilities — no manual sync needed.
const _totalWeight = Object.values(HERO_RARITY_DEFS).reduce((s, v) => s + v.weight, 0);
const RARITY_ODDS: { rarity: RarityKey; pct: number }[] = (
  Object.keys(HERO_RARITY_DEFS) as HeroRarity[]
).map((rarity) => ({
  rarity: rarity as RarityKey,
  pct: parseFloat(((HERO_RARITY_DEFS[rarity].weight / _totalWeight) * 100).toFixed(3)),
}));

/** Public mint payment parameters from GET /api/mint/config. */
interface MintConfig {
  chain:           string;
  treasury:        string;
  /** Solana: SPL mint; Robinhood: ERC-20 address; Hive: token symbol */
  token:           string;
  decimals:        number;
  mintCost:        number;
  /** Hive only: Hive-Engine custom_json id */
  engineId?:       string;
  /** Hive only: token precision (decimal places) */
  tokenPrecision?: number;
}

interface HistoryTx {
  txHash: string;
  amount: number;
  processedAt: number;
  metadata?: SettledMintMetadata;
}

// idle → signing (wallet) → queued (payment sent, worker settling) → done | error
type Phase = "idle" | "signing" | "queued" | "done" | "error";

function formatCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toString();
}

function shortHash(s: string): string {
  return s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function timeAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/**
 * Dev-only initial state, used by /test-modals to preview flow phases
 * without a wallet or live server. Never pass this in production paths.
 */
export interface ShopDebugInitial {
  phase?: Phase;
  settledHeroes?: RosterHero[];
  error?: string;
}

interface Props {
  show: boolean;
  onClose: () => void;
  debugInitial?: ShopDebugInitial;
}

export function ShopModal({ show, onClose, debugInitial }: Props) {
  const walletAddr     = useGameStore((s) => s.wallet);
  const roster         = useGameStore((s) => s.roster);
  const hydrateRoster  = useGameStore((s) => s.hydrateRoster);
  const lastMintTxHash = useGameStore((s) => s.lastMintTxHash);
  const lastMintTx     = useGameStore((s) => s.lastMintTx);

  const [qty, setQty]             = useState<1 | 5 | 10>(1);
  const [phase, setPhase]         = useState<Phase>(debugInitial?.phase ?? "idle");
  const [mintedNumbers, setMintedNumbers] = useState<number[]>([]);
  const [mintError, setMintError] = useState<string | null>(debugInitial?.error ?? null);
  const [history, setHistory]     = useState<HistoryTx[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Settled heroes — populated from metadata when the poller fires "done".
  const [settledHeroes, setSettledHeroes] = useState<RosterHero[]>(debugInitial?.settledHeroes ?? []);
  const [selectedSettledId, setSelectedSettledId] = useState<string | null>(null);

  const wallets        = useRef<DetectedWallet[]>([]);
  const eip6963Wallets = useRef<EIP6963Provider[]>([]);
  const mintConfig     = useRef<MintConfig | null>(null);
  const baselineMintTx = useRef<string | null>(null);

  const busy     = phase === "signing" || phase === "queued";
  const unitCost = mintConfig.current?.mintCost ?? MINT_COST;
  const total    = qty * unitCost;

  // Issue 3 — clear stale error + reset error phase when qty changes.
  const handleSetQty = (q: 1 | 5 | 10) => {
    setQty(q);
    setMintError(null);
    setPhase((p) => (p === "error" ? "idle" : p));
  };

  // When our queued mint settles (marker advances), flip to done and fetch
  // the minted heroes directly from the API using metadata heroIds.
  // lastMintTx is included in deps so the effect re-runs once the store
  // has populated the full ProcessedTx (with heroIds) — not just the hash.
  useEffect(() => {
    if (phase !== "queued") return;
    if (!lastMintTxHash || lastMintTxHash === baselineMintTx.current) return;

    const meta = lastMintTx?.metadata as SettledMintMetadata | undefined;

    const fetchSettledHeroes = async () => {
      // Primary: fetch by heroIds stored in the settled tx metadata.
      if (meta?.type === "mint" && meta.heroIds?.length > 0) {
        try {
          const res = await fetch(
            `/api/heroes?ids=${meta.heroIds.join(",")}`,
            { headers: { ...authHeaders() } },
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = (await res.json()) as { success: boolean; heroes?: any[] };
          if (res.ok && data.success && data.heroes) {
            // Use iHeroToRosterHero to remap bombNumber→bomb_number etc.
            const normalized = data.heroes.map(iHeroToRosterHero);
            setSettledHeroes(normalized);
            // Push into the live roster so HeroesModal shows them immediately.
            const existingIds = new Set(roster.map((h) => h.id));
            const brandNew = normalized.filter((h) => !existingIds.has(h.id));
            if (brandNew.length > 0) hydrateRoster([...roster, ...brandNew]);
            setPhase("done");
            void fetchHistory();
            return;
          }
        } catch { /* fall through to fallback */ }
      }

      // Fallback: match from roster (may be stale, but better than nothing).
      const numbers = meta?.mintedNumbers ?? mintedNumbers;
      if (numbers.length > 0) {
        setSettledHeroes(roster.filter((h) => numbers.includes(h.minted_number)));
      }
      setPhase("done");
      void fetchHistory();
    };

    void fetchSettledHeroes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lastMintTxHash, lastMintTx]);

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("bm_token") : null;
  const authHeaders = (): Record<string, string> => {
    const t = token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  // Reset stale terminal state when the shop is reopened.
  // Skipped when dev-seeded so /test-modals can preview terminal phases.
  useEffect(() => {
    if (!show || debugInitial) return;
    setPhase((p) => (p === "done" || p === "error" ? "idle" : p));
    setMintError(null);
    setSettledHeroes([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Discover wallets while modal is open (chain-specific).
  useEffect(() => {
    if (!show) return;
    if (activeChain === "robinhood") {
      const unsub = subscribeToEIP6963Wallets((list) => {
        eip6963Wallets.current = list;
      });
      return unsub;
    }
    // Solana (default) — Hive uses Keychain, no discovery needed.
    const unsub = subscribeToSolanaWallets((list) => {
      wallets.current = list;
    });
    return unsub;
  }, [show]);

  // Fetch mint config once.
  useEffect(() => {
    if (!show || mintConfig.current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mint/config", { headers: { ...authHeaders() } });
        const data = (await res.json()) as { success: boolean } & MintConfig;
        if (!cancelled && res.ok && data.success) {
          mintConfig.current = {
            chain:           data.chain,
            treasury:        data.treasury,
            token:           data.token,
            decimals:        data.decimals,
            mintCost:        data.mintCost,
            engineId:        data.engineId,
            tokenPrecision:  data.tokenPrecision,
          };
        }
      } catch {
        /* fall back to the MINT_COST constant */
      }
    })();
    return () => { cancelled = true; };
  }, [show]);

  // Fetch mint history when the modal opens.
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/transactions?type=mint&limit=10", {
        headers: { ...authHeaders() },
      });
      const data = (await res.json()) as {
        success: boolean;
        transactions?: HistoryTx[];
      };
      if (res.ok && data.success && Array.isArray(data.transactions)) {
        setHistory(data.transactions);
      }
    } catch {
      /* swallow — history is non-critical */
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!show) return;
    void fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const pickWallet = (): DetectedWallet | null => {
    const list = wallets.current;
    if (list.length === 0) return null;
    if (walletAddr) {
      const matched = list.find((w) =>
        w.wallet.accounts.some((a) => a.address === walletAddr),
      );
      if (matched) return matched;
    }
    return list[0];
  };

  /**
   * Picks the EIP-6963 provider that the player used to log in.
   *
   * Both MetaMask and Phantom announce themselves via EIP-6963, so
   * eip6963Wallets.current[0] is whichever injected first — often Phantom.
   * We match on the logged-in EVM address to guarantee the right wallet is
   * selected, falling back to the first provider whose rdns is NOT Phantom
   * if we cannot match by address (e.g. first open before an account is
   * exposed without a prior requestAccounts call).
   */
  const pickEip6963Wallet = (): EIP6963Provider | null => {
    const list = eip6963Wallets.current;
    if (list.length === 0) return null;

    // 1. Match by the address stored in the session (most reliable).
    if (walletAddr) {
      for (const entry of list) {
        try {
          // eth_accounts returns already-granted accounts without a popup.
          // We check synchronously via the cached accounts if possible,
          // otherwise fall through to the rdns heuristic.
          const accounts = (entry.provider as unknown as {
            selectedAddress?: string;
            _state?: { accounts?: string[] };
          });
          const addr =
            accounts.selectedAddress?.toLowerCase() ??
            accounts._state?.accounts?.[0]?.toLowerCase();
          if (addr && addr === walletAddr.toLowerCase()) return entry;
        } catch {
          // provider may throw if not yet connected — skip
        }
      }
    }

    // 2. Prefer any provider that is NOT Phantom's EVM shim.
    //    Phantom's EIP-6963 rdns is "app.phantom" — skip it unless it is the
    //    only wallet present.
    const nonPhantom = list.filter(
      (e) => !e.info.rdns.toLowerCase().includes("phantom"),
    );
    if (nonPhantom.length > 0) return nonPhantom[0];

    // 3. Last resort: return the first provider.
    return list[0];
  };

  const handleMint = async () => {
    if (busy) return;
    setMintedNumbers([]);
    setMintError(null);
    setSettledHeroes([]);

    const cfg = mintConfig.current;
    if (!cfg) {
      setMintError("Mint config unavailable — reopen the shop");
      setPhase("error");
      return;
    }

    // Wallet guard — only Robinhood and Solana need pre-detected wallets.
    // Hive uses Keychain (discovered at signing time).
    const detected = activeChain === "robinhood" ? null : pickWallet();
    const detectedEip6963 =
      activeChain === "robinhood"
        ? pickEip6963Wallet()
        : null;

    if (activeChain === "solana" && !detected) {
      setMintError("No Solana wallet detected");
      setPhase("error");
      return;
    }
    if (activeChain === "robinhood" && !detectedEip6963) {
      setMintError("No EVM wallet detected (install MetaMask or a Robinhood-compatible wallet)");
      setPhase("error");
      return;
    }

    // Always fetch the authoritative next minted_number from the server to
    // avoid duplicate-key conflicts when the local roster is stale.
    let nextNumber: number;
    try {
      const res = await fetch("/api/heroes/next-number", { headers: { ...authHeaders() } });
      const data = (await res.json()) as { success: boolean; nextNumber?: number };
      if (!res.ok || !data.success || typeof data.nextNumber !== "number") {
        throw new Error("bad response");
      }
      nextNumber = data.nextNumber;
    } catch {
      setMintError("Could not fetch mint sequence — try again");
      setPhase("error");
      return;
    }

    const minted_numbers = Array.from({ length: qty }, (_, i) => nextNumber + i);

    setPhase("signing");
    let txId: string;
    try {
      const depositAmount = qty * cfg.mintCost;

      if (activeChain === "robinhood") {
        const { sendRobinhoodDeposit } = await import("@/lib/client/robinhood/deposit");
        const params: DepositParams = {
          chain:    "robinhood",
          treasury: cfg.treasury,
          token:    cfg.token,
          decimals: cfg.decimals,
          amount:   depositAmount,
          qty,
          mintCost: cfg.mintCost,
          memo:     "boom-miner:mint",
        };
        const res = await sendRobinhoodDeposit(detectedEip6963!, params);
        txId = res.txId;

      } else if (activeChain === "hive") {
        const { sendHiveDeposit } = await import("@/lib/client/hive/deposit");
        const hiveAccount = walletAddr ?? "";
        if (!hiveAccount) {
          setMintError("Hive account not found in session");
          setPhase("error");
          return;
        }
        const params: DepositParams = {
          chain:     "hive",
          treasury:  cfg.treasury,
          token:     cfg.token,
          decimals:  cfg.tokenPrecision ?? cfg.decimals,
          amount:    depositAmount,
          qty,
          mintCost:  cfg.mintCost,
          memo:      "boom-miner:mint",
          engineId:  cfg.engineId,
        };
        const res = await sendHiveDeposit(hiveAccount, params);
        txId = res.txId;

      } else {
        // Solana (default)
        const { sendSolanaDeposit } = await import("@/lib/client/solana/deposit");
        const params: DepositParams = {
          chain:    "solana",
          treasury: cfg.treasury,
          token:    cfg.token,
          decimals: cfg.decimals,
          amount:   depositAmount,
          qty,
          mintCost: cfg.mintCost,
          memo:     "boom-miner:mint",
        };
        const res = await sendSolanaDeposit(detected!.wallet, params, token());
        txId = res.txId;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let userMsg = "Wallet payment failed";
      if (/reject|declin|cancel/i.test(msg)) {
        userMsg = "Payment cancelled";
      } else if (/keychain.*not found|install.*keychain/i.test(msg)) {
        userMsg = "Hive Keychain not found — install the extension first";
      } else if (/not found|not detected|no.*wallet/i.test(msg)) {
        userMsg = "Wallet not detected";
      }
      setMintError(userMsg);
      setPhase("error");
      return;
    }

    try {
      baselineMintTx.current = useGameStore.getState().lastMintTxHash;
      setMintedNumbers(minted_numbers);

      const res = await fetch("/api/heroes/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ txId, count: qty, minted_numbers }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?:  string;
        code?:   string;
      };

      if (!res.ok || !data.success) {
        setMintError(data.error ?? "Could not queue mint");
        setPhase("error");
        return;
      }

      setPhase("queued");
    } catch {
      setMintError("Payment sent — minting will finish shortly. Reopen the shop to check.");
      setPhase("error");
    }
  };

  // ----- Render helpers -----

  // Issue 5 — cost is embedded in the button so it's visible even when the
  // footer is obscured on mobile.
  const buttonLabel =
    phase === "signing" ? "CONFIRM IN WALLET..." :
    phase === "queued"  ? "MINTING..." :
    null; // null → use the two-span price label below

  // While queued: replace body with a full-screen waiting loader.
  const renderWaiting = () => (
    <div className="flex flex-col items-center justify-center gap-5 py-6 px-4">
      <style>{`
        @keyframes incubatorFrames { from { background-position: 0px 0px } to { background-position: -720px 0px } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.3 } 50% { opacity: 1 } }
      `}</style>

      {/* Animated incubator */}
      <div
        style={{
          width: 180,
          height: 192,
          backgroundImage: "url(/assets/incubator.png)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "720px 192px",
          imageRendering: "pixelated",
          animation: "incubatorFrames 0.6s steps(4) infinite",
        }}
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <span
          className="text-amber-300"
          style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 1 }}
        >
          MINTING {qty} HERO{qty > 1 ? "ES" : ""}...
        </span>
        <span
          className="text-white/50"
          style={{ fontFamily: PIXEL_BODY, fontSize: 15 }}
        >
          Payment confirmed. Waiting for on-chain settlement.
        </span>

        {/* Animated dots */}
        <div className="flex gap-1.5 mt-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-amber-300"
              style={{ animation: `pulse-dot 1.2s ease-in-out ${i * 0.4}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  // After done: show minted heroes using the same nav-rail + detail layout as HeroesModal.
  const renderMintResult = () => {
    const selectedHero =
      settledHeroes.find((h) => h.id === selectedSettledId) ?? settledHeroes[0] ?? null;

    return (
      <div className="flex flex-col gap-0" style={{ minHeight: 380 }}>
        {/* Status banner */}
        <div className="flex items-center gap-2 px-3 py-2 bg-green-900/30 mx-2 mt-2 rounded">
          <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span
            className="text-green-400"
            style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 1 }}
          >
            MINT COMPLETE — {settledHeroes.length} HERO{settledHeroes.length !== 1 ? "ES" : ""} ADDED
          </span>
        </div>

        {settledHeroes.length > 0 ? (
          /* Hero nav-rail + detail — mirrors HeroesModal layout */
          <div className="flex min-h-0 gap-1 flex-1 mt-2 px-2" style={{ minHeight: 300 }}>
            {/* Nav rail */}
            <div className="flex flex-col gap-1 w-2/5 overflow-y-auto scrollable">
              {settledHeroes.map((h) => {
                const isActive = selectedHero?.id === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedSettledId(h.id)}
                    className={clsx(
                      "wood-frame-light wood-panel-inner text-left p-2 flex items-center gap-2 cursor-pointer transition-all duration-75",
                      isActive ? "brightness-110" : "opacity-80 hover:opacity-100",
                    )}
                    style={{
                      boxShadow: isActive ? "0 0 0 3px #c8922a" : undefined,
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
                      <div className="text-white/60" style={{ fontFamily: PIXEL_BODY, fontSize: 14 }}>
                        #{h.minted_number}
                      </div>
                      <div
                        className="px-1 inline-block text-black mt-0.5"
                        style={{
                          background: RARITY_COLOR[(h.rarity ?? "common") as RarityKey],
                          fontFamily: PIXEL_HEAD,
                          fontSize: 6,
                        }}
                      >
                        {h.rarityLabel.toUpperCase()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0 flex flex-col gap-3 p-2">
              {selectedHero ? (
                <>
                  {/* Portrait + identity */}
                  <div className="flex gap-3 items-start">
                    <div className="w-24 h-24 flex items-center justify-center shrink-0 bg-black/30 rounded">
                      <HeroSprite type={selectedHero.type} size={72} intervalMs={450} />
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <span
                        className="text-white/60"
                        style={{ fontFamily: PIXEL_BODY, fontSize: 15 }}
                      >
                        #{selectedHero.minted_number}
                      </span>
                      <span
                        className="text-white"
                        style={{ fontFamily: PIXEL_HEAD, fontSize: 11, letterSpacing: 1 }}
                      >
                        {selectedHero.name.toUpperCase()}
                      </span>
                      <span
                        className="px-2 py-0.5 text-black self-start"
                        style={{
                          background: RARITY_COLOR[(selectedHero.rarity ?? "common") as RarityKey],
                          fontFamily: PIXEL_HEAD,
                          fontSize: 7,
                          letterSpacing: 1,
                        }}
                      >
                        {selectedHero.rarityLabel.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Attributes grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ["Power",   selectedHero.attributes.power],
                        ["Speed",   selectedHero.attributes.speed],
                        ["Stamina", selectedHero.attributes.stamina],
                        ["Bombs",   selectedHero.attributes.bomb_number],
                        ["Range",   selectedHero.attributes.bomb_range],
                      ] as [string, number][]
                    ).map(([label, val]) => (
                      <div
                        key={label}
                        className="flex justify-between bg-black/30 px-2 py-1 rounded"
                      >
                        <span
                          className="text-white/50 uppercase"
                          style={{ fontFamily: PIXEL_HEAD, fontSize: 7, letterSpacing: 1 }}
                        >
                          {label}
                        </span>
                        <span className="text-white" style={{ fontFamily: PIXEL_BODY, fontSize: 16 }}>
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="px-3 py-4" style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#aaa" }}>
            Heroes added to your roster. Check the Heroes menu.
          </p>
        )}

        {/* Mint More */}
        <div className="px-2 pb-2 mt-auto pt-2">
          <button
            type="button"
            onClick={() => { setPhase("idle"); setSettledHeroes([]); setSelectedSettledId(null); }}
            className="wood-frame-light wood-panel-inner w-full py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75"
            style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 2 }}
          >
            MINT MORE
          </button>
        </div>
      </div>
    );
  };

  // Default shop body.
  const renderShop = () => (
    <div className="flex flex-col gap-3 p-2">
      {/* Incubator */}
      <div className="flex flex-col items-center gap-2">
        <style>{`@keyframes incubatorFrames{from{background-position:0px 0px}to{background-position:-720px 0px}}`}</style>
        <div
          style={{
            width: 180,
            height: 192,
            backgroundImage: "url(/assets/incubator.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "720px 192px",
            imageRendering: "pixelated",
            animation: busy ? "incubatorFrames 0.6s steps(4) infinite" : undefined,
          }}
        />
      </div>

      {/* Pack size selector */}
      <div>
        <SectionLabel className="mb-2">Pack Size</SectionLabel>
        <div className="flex gap-2">
          {([1, 5, 10] as const).map((n) => {
            const active = qty === n;
            return (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => handleSetQty(n)}
                className={clsx(
                  "wood-frame-light wood-panel-inner flex-1 py-2.5 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed",
                  active ? "brightness-110" : "opacity-70 hover:opacity-100",
                )}
                style={{ fontFamily: PIXEL_HEAD, fontSize: 11 }}
              >
                x{n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cost row */}
      <div className="flex justify-between items-center bg-black/40 px-3 py-2 rounded">
        <span style={{ fontFamily: PIXEL_HEAD, fontSize: 8, color: "#777", letterSpacing: 1 }}>
          COST
        </span>
        <span style={{ fontFamily: PIXEL_BODY, fontSize: 20, color: "#fbbf24" }}>
          {formatCoins(total)} {tokenName}
        </span>
      </div>

      {/* Rarity odds */}
      <div>
        <SectionLabel className="mb-2">Rarity Odds</SectionLabel>
        <div className="flex flex-col gap-1">
          {RARITY_ODDS.map(({ rarity, pct }) => (
            <div key={rarity} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: RARITY_COLOR[rarity] }}
              />
              <span
                className="flex-1 text-white/70 capitalize"
                style={{ fontFamily: PIXEL_BODY, fontSize: 14 }}
              >
                {rarity}
              </span>
              <span
                className="text-white"
                style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}
              >
                {pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Mint history */}
      <div>
        <SectionLabel className="mb-2">Recent Mints</SectionLabel>
        {loadingHistory ? (
          <p style={{ fontFamily: PIXEL_BODY, fontSize: 15, color: "#777" }}>
            Loading...
          </p>
        ) : history.length === 0 ? (
          <p style={{ fontFamily: PIXEL_BODY, fontSize: 15, color: "#555" }}>
            No mints yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {history.map((tx) => {
              const count = tx.metadata?.count ?? Math.abs(tx.amount / (mintConfig.current?.mintCost ?? MINT_COST));
              return (
                <div
                  key={tx.txHash}
                  className="flex items-center justify-between px-2 py-1.5 bg-black/30 rounded"
                  style={{ border: "1px solid #222" }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="text-white/80"
                      style={{ fontFamily: PIXEL_BODY, fontSize: 15 }}
                    >
                      Minted {count} hero{count !== 1 ? "es" : ""}
                    </span>
                    {tx.metadata?.heroIds && tx.metadata.heroIds.length > 0 && (
                      <span
                        className="text-white/40"
                        style={{ fontFamily: PIXEL_BODY, fontSize: 12 }}
                      >
                        {shortHash(tx.txHash)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className="text-red-400"
                      style={{ fontFamily: PIXEL_HEAD, fontSize: 7 }}
                    >
                      -{formatCoins(Math.abs(tx.amount))}
                    </span>
                    <span
                      className="text-white/40"
                      style={{ fontFamily: PIXEL_BODY, fontSize: 12 }}
                    >
                      {timeAgo(tx.processedAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ModalShell
      show={show}
      onClose={onClose}
      tier="panel"
      titleBar={
        <ModalTitleBar
          title="Shop"
          subtitle={phase === "queued" ? "Minting..." : phase === "done" ? "Mint result" : "Mint heroes"}
          onClose={onClose}
        />
      }
      actionDock={
        phase === "queued" || phase === "done" ? undefined : (
          <ActionDock
            info={
              mintError ? (
                <span className="text-red-400" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
                  {mintError}
                </span>
              ) : (
                <span className="text-white/50" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
                  Pay {formatCoins(total)} {tokenName} from your wallet
                </span>
              )
            }
          >
            <button
              type="button"
              disabled={busy}
              onClick={handleMint}
              className="wood-frame-light wood-panel-inner px-5 py-2 text-white text-shadow cursor-pointer hover:brightness-110 active:translate-y-0.5 transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{
                fontFamily: PIXEL_HEAD,
                fontSize: 9,
                letterSpacing: 2,
                boxShadow: !busy ? "0 0 0 3px #16a34a" : undefined,
              }}
            >
              {buttonLabel !== null ? (
                buttonLabel
              ) : (
                <>
                  <span style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}>
                    MINT x{qty}
                  </span>
                  <span style={{ fontFamily: PIXEL_BODY, fontSize: 14, opacity: 0.8, marginLeft: 4 }}>
                    · {total.toLocaleString()} {tokenName}
                  </span>
                </>
              )}
            </button>
          </ActionDock>
        )
      }
    >
      {phase === "queued"
        ? renderWaiting()
        : phase === "done"
          ? renderMintResult()
          : renderShop()}
    </ModalShell>
  );
}
