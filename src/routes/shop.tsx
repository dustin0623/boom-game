import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { HeroCard } from "@/components/game/HeroCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";
import { useGameStore } from "@/features/stores/game.store";
import { HERO_RARITY_DEFS, HeroRarity } from "@/game/data/HeroRarity";
import { listHeroes } from "@/lib/game/heroes/heroes.functions";
import { mintHeroes } from "@/lib/game/heroes/heroes.functions";
import { MAX_MINT_PER_TX, mintCost } from "@/lib/game/heroes/mint";
import type { SessionHero } from "@/lib/game/session/types";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Chainframe" },
      { name: "description", content: "Mint new bombers with your in-game coins." },
      { property: "og:title", content: "Shop — Chainframe" },
      { property: "og:description", content: "Mint new bombers with your in-game coins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const [coins, setCoins] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [minted, setMinted] = useState<SessionHero[]>([]);

  const refresh = useCallback(() => {
    if (!player || !token) return;
    listHeroes({ data: { playerId: player.id, token } })
      .then((snap) => setCoins(snap.coins))
      .catch(() => setCoins(null));
  }, [player, token]);
  useEffect(refresh, [refresh]);

  const total = mintCost(qty);
  const mint = async () => {
    if (!player || !token || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await mintHeroes({ data: { playerId: player.id, token, count: qty } });
      setCoins(result.coins);
      setMinted(result.heroes);
      const store = useGameStore.getState();
      store.addHeroes(result.heroes);
      store.patchSession({ coins: result.coins });
      store.setStats({ coins: result.coins, stage: store.stage, heroesOnMap: store.heroesOnMap });
      setMessage(`${result.heroes.length} hero${result.heroes.length > 1 ? "es" : ""} joined your crew.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Shop" description="Mint new bombers with your in-game coins. Deposits add coins." />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 sm:w-fit">
        <Coins className="size-4 text-primary" />
        <span className="text-xs text-muted-foreground">Your coins</span>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
          {coins === null ? "…" : coins.toLocaleString()}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-primary/25 bg-card/60 p-6 text-center">
          <Sparkles className="mx-auto mb-2 size-8 text-primary" />
          <h2 className="text-lg font-semibold">Mint a hero</h2>
          <p className="mt-1 text-xs text-muted-foreground">Each mint rolls a random bomber from the drop table.</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button size="icon" variant="outline" disabled={qty <= 1 || busy} onClick={() => setQty(qty - 1)} aria-label="Fewer">
              <Minus className="size-4" />
            </Button>
            <span className="w-10 font-mono text-2xl font-bold tabular-nums">{qty}</span>
            <Button size="icon" variant="outline" disabled={qty >= MAX_MINT_PER_TX || busy} onClick={() => setQty(qty + 1)} aria-label="More">
              <Plus className="size-4" />
            </Button>
          </div>
          <p className="mt-4 font-mono text-sm font-bold tabular-nums text-primary">{total.toLocaleString()} coins</p>
          <Button className="mt-4 w-full" disabled={busy || coins === null || coins < total} onClick={mint}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : `Mint ${qty}`}
          </Button>
          {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-6">
          <h3 className="mb-3 text-sm font-semibold">Drop rates</h3>
          <ul className="space-y-1.5 text-sm">
            {Object.values(HeroRarity).map((r) => (
              <li key={r} className="flex justify-between">
                <span className="capitalize">{HERO_RARITY_DEFS[r].label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{HERO_RARITY_DEFS[r].weight}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {minted.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Just minted</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {minted.map((h) => (
              <HeroCard key={h.id} hero={h} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
