import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { CloudCheck, CloudOff, Layers, Loader2, Pause, Trophy } from "lucide-react";
import { PhaserGame } from "@/components/game/PhaserGame";
import { PageHeader } from "@/components/layout/PageHeader";
import { HeroesDrawer } from "@/components/game/HeroesDrawer";
import { useAuthStore } from "@/features/stores/auth.store";
import { useGameStore, type SaveStatus } from "@/features/stores/game.store";
import { loadGameSession, syncProgress } from "@/lib/game/session/session.functions";
import { saveHeroesState } from "@/lib/game/heroes/heroes.functions";

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
  const gamePaused = useGameStore((s) => s.gamePaused);
  const { stage, session, setSession, setSaveStatus, stageClearing, saveStatus } = useGameStore();

  useEffect(() => {
    if (!player || !token || session?.playerId === player.id) return;
    let cancelled = false;
    setSaveStatus("connecting");
    loadGameSession({ data: { playerId: player.id, token } })
      .then((loaded) => {
        if (cancelled) return;
        setSession(
          loaded,
          (seed, keys) => syncProgress({ data: { playerId: player.id, token, seed, keys } }),
          (heroes) =>
            saveHeroesState({ data: { playerId: player.id, token, heroes } }).then(() => {}),
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
        <PageHeader title="Play" description="Deploy your heroes from the Heroes panel to clear the mine." />
        <div className="flex flex-col items-end gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-card/70 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-primary">
            <Layers className="size-3.5" /> Stage {stage}
          </span>
          <div className="flex items-center gap-3">
            <SaveIndicator />
            {session && <HeroesDrawer />}
          </div>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-card shadow-[0_0_40px_-12px_var(--primary)]">
        <ClientOnly fallback={<div className="aspect-[41/25] w-full animate-pulse bg-muted" />}>
          {session ? (
            <PhaserGame className="w-full" />
          ) : (
            <div className="grid aspect-[41/25] w-full place-items-center bg-muted">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </ClientOnly>
        {gamePaused && !stageClearing && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <Pause className="size-8 text-primary" />
              <p className="text-base font-semibold tracking-wide">Game paused</p>
              <p className="text-sm text-muted-foreground">Your bombers rest while you're away. Click here to continue.</p>
            </div>
          </div>
        )}
        {stageClearing && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <Trophy className="size-10 text-primary" />
              <p className="text-lg font-semibold tracking-wide">Stage cleared!</p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {(saveStatus === "saving" || saveStatus === "connecting") && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {saveStatus === "saving" || saveStatus === "connecting"
                  ? "Verifying and saving your progress…"
                  : saveStatus === "error"
                    ? "Connection issue — retrying the save…"
                    : "Stage cleared!"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
