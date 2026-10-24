import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";
import { SHOP_ITEMS } from "@/lib/game/shop/items";
import { purchaseItem } from "@/lib/game/shop/shop.functions";
import { listInventory } from "@/lib/game/inventory/inventory.functions";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Chainframe" },
      { name: "description", content: "Spend mined coins on bomber chests and grow your crew." },
      { property: "og:title", content: "Shop — Chainframe" },
      { property: "og:description", content: "Spend mined coins on bomber chests and grow your crew." },
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
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!player || !token) return;
    listInventory({ data: { playerId: player.id, token } })
      .then((snap) => setCoins(snap.coins))
      .catch(() => setCoins(null));
  }, [player, token]);

  useEffect(refresh, [refresh]);

  const buy = async (itemId: string) => {
    if (!player || !token || busy) return;
    setBusy(itemId);
    setMessage(null);
    try {
      const result = await purchaseItem({ data: { playerId: player.id, token, itemId } });
      setCoins(result.coins);
      setMessage("Chest added to your inventory — open it there to hatch your bomber.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Shop" description="Spend mined coins on bomber chests and grow your crew." />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 sm:w-fit">
        <Coins className="size-4 text-primary" />
        <span className="text-xs text-muted-foreground">Your coins</span>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
          {coins === null ? "…" : coins.toLocaleString()}
        </span>
      </div>
      {message && <p className="mb-4 text-sm text-muted-foreground">{message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {SHOP_ITEMS.map((item) => (
          <div
            key={item.id}
            className="flex flex-col items-center rounded-xl border border-border bg-card/60 p-5 text-center transition hover:border-primary/30"
          >
            <img
              src={item.image}
              alt={item.name}
              className="mb-3 h-16 w-auto"
              style={{ imageRendering: "pixelated" }}
            />
            <h3 className="text-sm font-semibold">{item.name}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            <p className="mt-3 font-mono text-sm font-bold tabular-nums text-primary">
              {item.price.toLocaleString()} coins
            </p>
            <Button
              className="mt-3 w-full"
              size="sm"
              disabled={busy !== null || coins === null || coins < item.price}
              onClick={() => buy(item.id)}
            >
              {busy === item.id ? <Loader2 className="size-4 animate-spin" /> : "Buy"}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
