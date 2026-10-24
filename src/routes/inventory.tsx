import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, PackageOpen } from "lucide-react";
import { HeroSprite } from "@/components/game/HeroSprite";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";
import { HERO_SPRITES, type HeroType } from "@/game/data/HeroRarity";
import { listInventory, openChest, type InventorySnapshot } from "@/lib/game/inventory/inventory.functions";
import { SHOP_ITEM_BY_ID } from "@/lib/game/shop/items";
import type { SessionHero } from "@/lib/game/session/types";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Chainframe" },
      { name: "description", content: "Your bombers and unopened chests." },
      { property: "og:title", content: "Inventory — Chainframe" },
      { property: "og:description", content: "Your bombers and unopened chests." },
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
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!player || !token) return;
    listInventory({ data: { playerId: player.id, token } })
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
  }, [player, token]);

  useEffect(refresh, [refresh]);

  const open = async (itemId: string) => {
    if (!player || !token || busy) return;
    setBusy(itemId);
    setMessage(null);
    try {
      const { hero } = await openChest({ data: { playerId: player.id, token, itemId } });
      setMessage(`${hero.name} joined your crew — a ${hero.rarity} ${hero.type}!`);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not open chest");
    } finally {
      setBusy(null);
    }
  };

  const chests = (snapshot?.items ?? []).filter((i) => i.quantity > 0 && SHOP_ITEM_BY_ID[i.itemId]);

  return (
    <>
      <PageHeader title="Inventory" description="Your bombers and unopened chests." />
      {message && <p className="mb-4 text-sm text-muted-foreground">{message}</p>}

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold">Unopened chests</h2>
        {!snapshot ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : chests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chests yet — buy some in the shop with your mined coins.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {chests.map((chest) => {
              const item = SHOP_ITEM_BY_ID[chest.itemId]!;
              return (
                <div
                  key={chest.itemId}
                  className="flex flex-col items-center rounded-xl border border-border bg-card/60 p-4 text-center"
                >
                  <img src={item.image} alt={item.name} className="mb-2 h-14 w-auto" style={{ imageRendering: "pixelated" }} />
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">× {chest.quantity}</p>
                  <Button
                    className="mt-3 w-full gap-2"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => open(chest.itemId)}
                  >
                    {busy === chest.itemId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PackageOpen className="size-4" />
                    )}
                    Open
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your crew {snapshot ? `(${snapshot.heroes.length})` : ""}</h2>
        {!snapshot ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
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
