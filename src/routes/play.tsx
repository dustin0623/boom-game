import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { CloudCheck, CloudOff, Coins, Layers, Loader2, Users } from "lucide-react";
import { PhaserGame } from "@/components/game/PhaserGame";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/features/stores/auth.store";
import { useGameStore, type SaveStatus } from "@/features/stores/game.store";
import { loadGameSession, syncProgress } from "@/lib/game/session/session.functions";

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

const SAVE_LABEL: Record<SaveStatus, string> = {
  local: "Not connected",
  connecting: "Connecting…",
  saving: "Saving…",
  saved: "Progress saved",
  error: "Save failed — retrying",
};

function SaveIndicator() {
  const status = useGameStore((s) => s.saveStatus);
  const Icon = status === "error" ? CloudOff : status === "saving" || status === "connecting" ? Loader2 : CloudCheck;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        status === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      <Icon className={`size-3.5 ${status === "saving" || status === "connecting" ? "animate-spin" : ""}`} />
      {SAVE_LABEL[status]}
    </span>
  );
}

function PlayPage() {
  const player = useAuthStore((s) => s.player);
  const token = useAuthStore((s) => s.token);
  const { coins, stage, heroesOnMap, session, setSession, setSaveStatus } = useGameStore();

  useEffect(() => {
    if (!player || !token || session?.playerId === player.id) return;
    let cancelled = false;
    setSaveStatus("connecting");
    loadGameSession({ data: { playerId: player.id, token } })
      .then((loaded) => {
        if (cancelled) return;
        setSession(loaded, (seed, keys) =>
          syncProgress({ data: { playerId: player.id, token, seed, keys } }),
        );
      })
      .catch(() => !cancelled && setSaveStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [player, token, session, setSession, setSaveStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader title="Play" description="Your bombers are clearing the mine." />
        <div className="pt-1">
          <SaveIndicator />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat icon={Coins} label="Coins" value={coins.toLocaleString()} />
        <Stat icon={Layers} label="Stage" value={stage} />
        <Stat icon={Users} label="Bombers" value={heroesOnMap} />
      </div>
      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[0_0_40px_-12px_var(--primary)]">
        <ClientOnly fallback={<div className="aspect-[41/25] w-full animate-pulse bg-muted" />}>
          {session ? (
            <PhaserGame className="w-full" />
          ) : (
            <div className="grid aspect-[41/25] w-full place-items-center bg-muted">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </ClientOnly>
      </div>
    </div>
  );
}
