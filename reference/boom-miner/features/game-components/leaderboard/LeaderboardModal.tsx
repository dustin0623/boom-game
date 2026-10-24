"use client";

import { useGameStore } from "@/features/store/gameStore";
import { activeChain }   from "@/lib/client/chain";
import { chainBranding } from "@/lib/config/branding";

const { tokenName } = chainBranding[activeChain];
import { ModalShell, ModalTitleBar, ActionDock } from "@/components/ui/modal";

const PIXEL_HEAD = "'Press Start 2P', 'Silkscreen', monospace";
const PIXEL_BODY = "'VT323', 'Silkscreen', monospace";

const MOCK_ENTRIES = [
  { rank: 1,  name: "dustx",       stage: 12, coins: 48_200 },
  { rank: 2,  name: "boomlord",    stage: 11, coins: 42_750 },
  { rank: 3,  name: "miner42",     stage: 10, coins: 37_100 },
  { rank: 4,  name: "pixelknight", stage: 9,  coins: 31_400 },
  { rank: 5,  name: "cryptik",     stage: 8,  coins: 27_800 },
  { rank: 6,  name: "bombking",    stage: 7,  coins: 22_600 },
  { rank: 7,  name: "zap_o",       stage: 6,  coins: 18_900 },
  { rank: 8,  name: "nova",        stage: 5,  coins: 14_300 },
];

const MEDAL: Record<number, string> = { 1: "#facc15", 2: "#d1d5db", 3: "#d97706" };

interface Props {
  show:    boolean;
  onClose: () => void;
}

export function LeaderboardModal({ show, onClose }: Props) {
  // Issue 8 — read the current player's identity from the store.
  const wallet = useGameStore((s) => s.wallet);
  const coins  = useGameStore((s) => s.coins);
  const stage  = useGameStore((s) => s.stage);

  // Truncate wallet to a display name (first 6 + last 4 chars).
  const playerName =
    wallet && wallet.length > 10
      ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
      : (wallet ?? "you");

  // Check if the current player appears in the mock board.
  const playerInBoard = MOCK_ENTRIES.some(
    (e) => e.name.toLowerCase() === playerName.toLowerCase(),
  );

  // Placeholder rank until the real API returns it.
  const playerRank = playerInBoard ? null : MOCK_ENTRIES.length + 1;

  return (
    <ModalShell
      show={show}
      onClose={onClose}
      tier="panel"
      titleBar={
        <ModalTitleBar
          title="Leaderboard"
          subtitle="Top miners by stage"
          onClose={onClose}
        />
      }
      actionDock={
        <ActionDock>
          <button
            type="button"
            onClick={onClose}
            className="wood-frame-light wood-panel-inner px-4 py-2 text-white text-shadow hover:brightness-110 active:translate-y-0.5 transition-all duration-75 cursor-pointer"
            style={{ fontFamily: PIXEL_HEAD, fontSize: 8, letterSpacing: 1 }}
          >
            CLOSE
          </button>
        </ActionDock>
      }
    >
      <div className="flex flex-col gap-1 p-2">
        {/* Header row */}
        <div
          className="grid gap-2 px-2 py-1"
          style={{
            gridTemplateColumns: "2.5rem 1fr 5rem 6rem",
            fontFamily: PIXEL_HEAD,
            fontSize: 7,
            color: "#777",
            letterSpacing: 1,
          }}
        >
          <span>#</span>
          <span>PLAYER</span>
          <span className="text-right">STAGE</span>
              <span className="text-right">{tokenName}</span>
        </div>

        {MOCK_ENTRIES.map((entry) => {
          // Issue 8 — highlight current player row.
          const isCurrent = entry.name.toLowerCase() === playerName.toLowerCase();
          return (
            <div
              key={entry.rank}
              className="grid gap-2 px-2 py-2 rounded items-center"
              style={{
                gridTemplateColumns: "2.5rem 1fr 5rem 6rem",
                background: isCurrent
                  ? "rgba(56,189,248,0.10)"
                  : entry.rank <= 3
                    ? "rgba(251,191,36,0.07)"
                    : "#171717",
                border: `2px solid ${
                  isCurrent
                    ? "rgba(56,189,248,0.4)"
                    : entry.rank <= 3
                      ? "rgba(251,191,36,0.2)"
                      : "#333"
                }`,
              }}
            >
              <span style={{ fontFamily: PIXEL_HEAD, fontSize: 9, color: MEDAL[entry.rank] ?? "#555" }}>
                {entry.rank}
              </span>
              <span className="flex items-center gap-1.5" style={{ fontFamily: PIXEL_BODY, fontSize: 17, color: "#fff" }}>
                {entry.name}
                {isCurrent && (
                  <span
                    className="px-1 text-black"
                    style={{ fontFamily: PIXEL_HEAD, fontSize: 6, background: "#38bdf8" }}
                  >
                    YOU
                  </span>
                )}
              </span>
              <span className="text-right" style={{ fontFamily: PIXEL_BODY, fontSize: 17, color: "#4ade80" }}>
                {entry.stage}
              </span>
              <span className="text-right" style={{ fontFamily: PIXEL_BODY, fontSize: 17, color: "#fbbf24" }}>
                {entry.coins.toLocaleString()}
              </span>
            </div>
          );
        })}

        {/* Issue 8 — if player is not in the top N, append an ellipsis + their pinned row. */}
        {!playerInBoard && playerRank !== null && (
          <>
            {/* Ellipsis spacer */}
            <div
              className="grid gap-2 px-2 py-1 items-center"
              style={{ gridTemplateColumns: "2.5rem 1fr 5rem 6rem", color: "#444" }}
            >
              <span style={{ fontFamily: PIXEL_HEAD, fontSize: 9 }}>…</span>
              <span style={{ fontFamily: PIXEL_BODY, fontSize: 17 }}>—</span>
              <span className="text-right" style={{ fontFamily: PIXEL_BODY, fontSize: 17 }}>—</span>
              <span className="text-right" style={{ fontFamily: PIXEL_BODY, fontSize: 17 }}>—</span>
            </div>

            {/* Current player pinned row */}
            <div
              className="grid gap-2 px-2 py-2 rounded items-center"
              style={{
                gridTemplateColumns: "2.5rem 1fr 5rem 6rem",
                background: "rgba(56,189,248,0.10)",
                border: "2px solid rgba(56,189,248,0.4)",
              }}
            >
              <span style={{ fontFamily: PIXEL_HEAD, fontSize: 9, color: "#555" }}>
                {playerRank}
              </span>
              <span className="flex items-center gap-1.5" style={{ fontFamily: PIXEL_BODY, fontSize: 17, color: "#fff" }}>
                {playerName}
                <span
                  className="px-1 text-black"
                  style={{ fontFamily: PIXEL_HEAD, fontSize: 6, background: "#38bdf8" }}
                >
                  YOU
                </span>
              </span>
              <span className="text-right" style={{ fontFamily: PIXEL_BODY, fontSize: 17, color: "#4ade80" }}>
                {stage}
              </span>
              <span className="text-right" style={{ fontFamily: PIXEL_BODY, fontSize: 17, color: "#fbbf24" }}>
                {coins.toLocaleString()}
              </span>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
