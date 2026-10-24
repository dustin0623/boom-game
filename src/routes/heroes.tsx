import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { HeroSprite } from "@/components/game/HeroSprite";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/features/stores/auth.store";
import { HERO_SPRITES, type HeroType } from "@/game/data/HeroRarity";
import { listInventory, type InventorySnapshot } from "@/lib/game/inventory/inventory.functions";
import type { SessionHero } from "@/lib/game/session/types";

export const Route = createFileRoute("/heroes")({
  head: () => ({
    meta: [
      { title: "Heroes — Chainframe" },
      { name: "description", content: "Your bombers, their stats and rarities." },
      { property: "og:title", content: "Heroes — Chainframe" },
      { property: "og:description", content: "Your bombers, their stats and rarities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function HeroCard({ hero }: { hero: SessionHero }) {
  const sprite = HERO_SPRITES[hero.type as HeroType] ?? "ricky";
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card/60 p-4 text-center">
      <HeroSprite sprite={sprite} scale={3} />
      <p className="mt-2 text-sm font-semibold">{hero.name}</p>
      <p className="text-[11px] capitalize text-muted-foreground">
        {hero.rarity} · {hero.type}
      </p>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        POW {hero.power} · SPD {hero.speed} · STA {hero.stamina} · BOMBS {hero.bombNumber} · RNG {hero.bombRange}
      </p>
    </div>
  );
}

function Page() {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);

  useEffect(() => {
    if (!player || !token) return;
    listInventory({ data: { playerId: player.id, token } })
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
  }, [player, token]);

  return (
    <>
      <PageHeader title="Heroes" description="Your bombers, their stats and rarities." />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your crew {snapshot ? `(${snapshot.heroes.length})` : ""}</h2>
        {!snapshot ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : snapshot.heroes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No heroes yet — mint some in the Shop.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {snapshot.heroes.map((hero) => (
              <HeroCard key={hero.id} hero={hero} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
