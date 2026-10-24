import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { Bomb, Coins, Gamepad2, Gem, HeartPulse, Pickaxe, QrCode, Wallet, type LucideIcon } from "lucide-react";
import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { BrandLogo } from "@/components/brand/Brand";
import { PhaserGame } from "@/components/game/PhaserGame";
import { HeroSprite } from "@/components/game/HeroSprite";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";

const TITLE = "Chainframe — Drop bombs. Crack chests. Earn on XRPL.";
const DESCRIPTION =
  "A pixel bomber mining game on XRPL. Send your crew into the mine, blast blocks and open chests. Sign in with Xaman to start mining.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const ROSTER = [
  { name: "Ricky", sprite: "ricky" },
  { name: "Rocky", sprite: "rocky" },
  { name: "Rascal", sprite: "rascal" },
  { name: "Red Horn", sprite: "redhorn" },
  { name: "Ducky", sprite: "ducky" },
  { name: "Bolt", sprite: "bolt" },
  { name: "Pinky", sprite: "pinky" },
  { name: "Mossy", sprite: "mossy" },
  { name: "Ghosty", sprite: "ghosty" },
  { name: "Timmy", sprite: "timmy" },
];

const CHESTS = ["common", "uncommon", "rare", "epic", "legendary"];

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Bomb, title: "Bombers work for you", description: "Your crew walks the mine on its own, planting bombs next to blocks and chests." },
  { icon: Gem, title: "Crack open chests", description: "Five chest tiers from Common to Legendary. Tougher chests pay out more coins." },
  { icon: HeartPulse, title: "Manage stamina", description: "Each bomber has power, speed, stamina, bomb count and blast range. Rest them to recover." },
  { icon: Pickaxe, title: "Clear stages", description: "Destroy every chest on the map to unlock the next stage with a fresh layout." },
];

const STEPS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: QrCode, title: "Scan with Xaman", description: "Connect your XRPL account by scanning a QR code. No private keys requested." },
  { icon: Gamepad2, title: "Enter the mine", description: "Your bombers get to work right away and keep clearing blocks while you watch." },
  { icon: Coins, title: "Build your crew", description: "Collect bombers, open chests and stack coins that are saved to your account." },
];

function EnterMineButton({ size = "lg" }: { size?: "lg" | "default" }) {
  const connected = useAuthStore((s) => s.player !== null);
  if (!connected)
    return (
      <ConnectWalletModal>
        <Button size={size} className="gap-2">
          <Gamepad2 className="size-4" /> Enter the mine
        </Button>
      </ConnectWalletModal>
    );
  return (
    <Button asChild size={size} className="gap-2">
      <Link to="/play">
        <Gamepad2 className="size-4" /> Enter the mine
      </Link>
    </Button>
  );
}

function LandingPage() {
  return (
    <div className="space-y-16 pb-12 pt-2 md:pt-4">
      <section className="relative overflow-hidden rounded-2xl border border-primary/25">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <ClientOnly fallback={null}>
            <PhaserGame muted className="h-full w-full [&_canvas]:!h-full [&_canvas]:!w-full [&_canvas]:object-cover" />
          </ClientOnly>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20" />
        <div className="relative p-6 md:p-10 lg:p-14">
          <BrandLogo className="mb-5 h-14 md:h-20" />
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Drop bombs. Crack chests. Earn on XRPL.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            A pixel bomber mining game. Your crew roams the mine, blasts through blocks and breaks open treasure
            chests while you plan the next move.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <EnterMineButton />
            <WalletButton />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">Meet the crew</h2>
          <p className="text-xs text-muted-foreground md:text-sm">Ten bombers, each in five rarities.</p>
        </div>
        <div className="grid grid-cols-5 gap-3 md:grid-cols-10">
          {ROSTER.map((h) => (
            <div
              key={h.sprite}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/60 p-3 transition hover:-translate-y-0.5 hover:border-primary/40"
            >
              <HeroSprite sprite={h.sprite} scale={3} />
              <span className="text-[11px] text-muted-foreground">{h.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">How the mine works</h2>
          <p className="text-xs text-muted-foreground md:text-sm">Idle progress with real strategy.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card/60 p-5 transition hover:border-primary/30 hover:bg-card">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end justify-center gap-6 rounded-xl border border-border bg-card/40 p-5">
          {CHESTS.map((c) => (
            <div key={c} className="flex flex-col items-center gap-2">
              <img
                src={`/game/items/chests/chest_${c}.png`}
                alt={`${c} chest`}
                className="h-12 w-auto"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="text-[11px] capitalize text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold md:text-xl">Get started</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-xl border border-border bg-card/60 p-5">
              <span className="absolute right-4 top-4 font-mono text-2xl font-bold text-muted-foreground/30">0{i + 1}</span>
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center md:p-12">
        <h2 className="text-xl font-semibold md:text-2xl">Ready to light the fuse?</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">Connect your wallet with Xaman and your crew starts mining right away.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <EnterMineButton />
          <WalletButton />
        </div>
      </section>
    </div>
  );
}
