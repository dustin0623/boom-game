import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Coins, Layers, Pause, Play, Users, Wallet } from "lucide-react";
import { PhaserGame } from "@/components/game/PhaserGame";
import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";
import { useGameStore } from "@/features/stores/game.store";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Play — Chainframe" },
      { name: "description", content: "Send your bombers into the mine, blast blocks and crack open chests." },
      { property: "og:title", content: "Play — Chainframe" },
      { property: "og:description", content: "Send your bombers into the mine, blast blocks and crack open chests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayPage,
});

function Stat({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2">
      <Icon className="size-4 text-primary" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function PlayPage() {
  const connected = useAuthStore((s) => s.player !== null);
  const { coins, stage, heroesOnMap, paused, setPaused } = useGameStore();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Play"
        description={connected ? "Your bombers are clearing the mine." : "Demo mode — progress is not saved."}
      />
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat icon={Coins} label="Coins" value={coins.toLocaleString()} />
        <Stat icon={Layers} label="Stage" value={stage} />
        <Stat icon={Users} label="Bombers" value={heroesOnMap} />
        <Button variant="outline" className="h-full gap-2" onClick={() => setPaused(!paused)}>
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[0_0_40px_-12px_var(--primary)]">
        <ClientOnly fallback={<div className="aspect-[41/25] w-full animate-pulse bg-muted" />}>
          <PhaserGame className="w-full" />
        </ClientOnly>
      </div>
      {!connected && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Like it? Connect your XRPL wallet to own bombers and keep your coins.
          </p>
          <ConnectWalletModal>
            <Button className="gap-2">
              <Wallet className="size-4" /> Connect wallet
            </Button>
          </ConnectWalletModal>
        </div>
      )}
    </div>
  );
}
