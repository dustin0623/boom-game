import { useEffect, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { PhaserGame } from "@/components/game/PhaserGame";
import { HeroesDrawer } from "@/components/game/HeroesDrawer";
import { useGameStore } from "@/features/stores/game.store";
import { validateClaims } from "@/lib/game/session/validate";
import { createStarterHeroes } from "@/lib/game/heroes/starter";
import type { PlayerSession, SyncResult } from "@/lib/game/session/types";

/**
 * Developer test bench: runs the real saved-game flow against an in-browser
 * fake server that uses the same claim validation as the real one. Nothing is
 * written to the database. Lets stage-clear/sync behaviour be tested without
 * Xaman sign-in.
 */
export const Route = createFileRoute("/test-game")({
  head: () => ({
    meta: [
      { title: "Game test bench — Chainframe" },
      { name: "description", content: "Offline test bench for Chainframe gameplay and stage saving." },
      { property: "og:title", content: "Game test bench — Chainframe" },
      { property: "og:description", content: "Offline test bench for Chainframe gameplay and stage saving." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestGame,
});

interface FakeMap { stage: number; seed: number; destroyed: string[]; lastSync: number; coins: number }

declare global {
  interface Window { __testGame?: { server: FakeMap; log: string[] } }
}

function TestGame() {
  const { coins, stage, heroesOnMap, session, setSession, stageClearing, saveStatus } = useGameStore();
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const server: FakeMap = { stage: 1, seed: 12345, destroyed: [], lastSync: Date.now(), coins: 0 };
    const lines: string[] = [];
    window.__testGame = { server, log: lines };
    const push = (s: string) => {
      lines.push(s);
      setLog([...lines].slice(-12));
    };
    const heroes = createStarterHeroes().map((h) => ({ ...h, energy: h.maxEnergy, onMap: true, recoveryAt: Date.now() }));
    const loaded: PlayerSession = { playerId: "test-player", coins: 0, stage: 1, seed: server.seed, destroyedNodes: [], heroes };
    setSession(
      loaded,
      async (seed, keys): Promise<SyncResult> => {
        const reply = (accepted: number, rejected: number): SyncResult => ({
          ok: true, coins: server.coins, stage: server.stage, seed: server.seed, destroyedNodes: [...server.destroyed], accepted, rejected,
        });
        if (seed !== server.seed || !keys.length) {
          push(`sync seed=${seed} keys=${keys.length} → ${seed !== server.seed ? "SEED MISMATCH" : "noop"} (server stage ${server.stage})`);
          return reply(0, keys.length);
        }
        const out = validateClaims({ stage: server.stage, seed: server.seed, destroyed: server.destroyed, claimed: keys, elapsedMs: Date.now() - server.lastSync });
        server.lastSync = Date.now();
        if (out.accepted) {
          server.coins += out.coins;
          server.destroyed = out.destroyed;
          if (out.cleared) {
            server.stage++;
            server.seed = Math.floor(Math.random() * 2147483647);
            server.destroyed = [];
          }
        }
        push(`sync keys=${keys.length} ok=${out.accepted} rej=${out.rejected}${out.cleared ? ` → CLEARED, stage ${server.stage}` : ""}`);
        return reply(out.accepted, out.rejected);
      },
      async () => {},
    );
    return () => setSession(null, null);
  }, [setSession]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Game test bench</h1>
          <p className="text-sm text-muted-foreground">Offline fake server — nothing is saved.</p>
        </div>
        {session && <HeroesDrawer />}
      </div>
      <div className="grid gap-2 font-mono text-sm sm:grid-cols-4" data-testid="stats">
        <span>coins: <b data-testid="coins">{coins}</b></span>
        <span>stage: <b data-testid="stage">{stage}</b></span>
        <span>on map: {heroesOnMap}</span>
        <span>save: {saveStatus}{stageClearing ? " (clearing)" : ""}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ClientOnly fallback={<div className="aspect-[41/25] w-full bg-muted" />}>
          {session ? <PhaserGame className="w-full" /> : <div className="aspect-[41/25] w-full bg-muted" />}
        </ClientOnly>
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs" data-testid="log">{log.join("\n")}</pre>
    </div>
  );
}
