import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { HeroCard } from "@/components/game/HeroCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/features/stores/auth.store";
import { listHeroes, type HeroesSnapshot } from "@/lib/game/heroes/heroes.functions";

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

function Page() {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const [snapshot, setSnapshot] = useState<HeroesSnapshot | null>(null);

  useEffect(() => {
    if (!player || !token) return;
    listHeroes({ data: { playerId: player.id, token } })
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {snapshot.heroes.map((hero) => (
              <HeroCard key={hero.id} hero={hero} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
