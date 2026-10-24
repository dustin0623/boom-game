'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicGameShell } from "@/features/game-components/shell/DynamicGameShell";
import { DynamicPhaserGame } from "@/phaser/DynamicPhaserGame";
import { GameModals } from "@/features/game-components/GameModals";
import { FullPageLoader } from "@/features/game-components/shell/FullPageLoader";
import { loaderEvents } from "@/phaser/loaderEvents";
import { useGameStore, type BootstrapPayload } from "@/features/store/gameStore";

export default function GamePage() {
  const [progress, setProgress] = useState(0);
  const [fileKey, setFileKey] = useState("");
  const [ready, setReady] = useState(false);

  const hydrate      = useGameStore((s) => s.hydrate);
  const bootstrapped = useGameStore((s) => s.bootstrapped);
  const router       = useRouter();

  // Single bootstrap round-trip — populates store before Phaser boots.
  useEffect(() => {
    const token = localStorage.getItem("bm_token");
    if (!token) {
      router.replace("/");
      return;
    }

    fetch("/api/bootstrap", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        // Expired or invalid token — clear it and send the player to login.
        if (res.status === 401) {
          localStorage.removeItem("bm_token");
          router.replace("/");
          return null;
        }
        return res.json() as Promise<{
          success?: boolean;
          player?: BootstrapPayload["player"];
          heroes?: BootstrapPayload["heroes"];
        }>;
      })
      .then((data) => {
        if (!data) return;
        if (data.success && data.player) {
          hydrate({
            player: data.player,
            heroes: data.heroes ?? [],
          });
        }
      })
      .catch(() => {
        // Network failure — game still renders with local defaults.
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const offP = loaderEvents.onProgress((p, f) => {
      setProgress(p);
      if (f) setFileKey(f);
    });
    const offC = loaderEvents.onComplete(() => setReady(true));
    return () => {
      offP();
      offC();
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <DynamicGameShell>
        {bootstrapped ? <DynamicPhaserGame /> : null}
      </DynamicGameShell>
      <GameModals />

      {!ready && <FullPageLoader progress={progress} fileKey={fileKey} />}
    </main>
  );
}
