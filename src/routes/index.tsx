import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  Flame,
  Gamepad2,
  LayoutDashboard,
  Pickaxe,
  ShoppingBag,
  Sword,
  Target,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { BrandLogo } from "@/components/brand/Brand";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chainframe — Build your rig. Mine. Raid. Trade." },
      { name: "description", content: "Chainframe is an idle crypto-mining game on XRPL. Sign in with Xaman to start." },
      { property: "og:title", content: "Chainframe — Build your rig. Mine. Raid. Trade." },
      { property: "og:description", content: "Chainframe is an idle crypto-mining game on XRPL. Sign in with Xaman to start." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Pickaxe, title: "Mine $HASH", description: "Your rig generates HASH passively. Upgrade hash rate and vault capacity to compound earnings over time." },
  { icon: Zap, title: "Upgrade stats", description: "Spend HASH on permanent upgrades. Raise Hash Rate, Hack Power, Security and more to climb the leaderboards." },
  { icon: Sword, title: "Raid other rigs", description: "Pick a target and attempt to steal vault HASH. Higher Exploit improves success chance; Firewall helps defend." },
  { icon: Boxes, title: "Open chests", description: "Find gear drops that boost your rig. Chests contain items with rarities from Common to Legendary." },
  { icon: ShoppingBag, title: "Trade on market", description: "List spare gear or shop for powerful items. The marketplace runs on the server with a small fee sink." },
  { icon: Flame, title: "Build Notoriety", description: "Earn Notoriety through in-game activity to unlock Exploit bonuses, higher withdrawal limits and bragging rights." },
];

const STEPS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Wallet, title: "Connect your wallet", description: "Open Xaman and scan the QR code to link your XRPL account." },
  { icon: Target, title: "Approve the sign-in", description: "Confirm the sign-in request in Xaman. Your XRPL address identifies you in raids and marketplace history." },
  { icon: Gamepad2, title: "Play idle or active", description: "Let your vault fill, upgrade stats, raid rivals and trade gear at your own pace." },
];

function Cta({ label }: { label: string }) {
  const connected = useAuthStore((s) => s.player !== null);
  return connected ? (
    <Button asChild size="lg" className="gap-2">
      <Link to="/dashboard">
        <LayoutDashboard className="size-4" />
        {label}
      </Link>
    </Button>
  ) : (
    <ConnectWalletModal>
      <Button size="lg" className="gap-2">
        <Wallet className="size-4" />
        Connect wallet
      </Button>
    </ConnectWalletModal>
  );
}

function LandingPage() {
  return (
    <div className="space-y-16 pb-12 pt-4 md:pt-8">
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-6 md:p-10 lg:p-14">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 size-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative">
          <BrandLogo className="mb-5 h-14 md:h-20 lg:h-24" />
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Build your rig. Mine. Raid. Trade.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Chainframe is an idle crypto-mining game where your rig works around the clock. Upgrade stats, open
            chests, raid other miners and trade gear on the marketplace.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Cta label="Enter dashboard" />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">What you can do</h2>
          <p className="text-xs text-muted-foreground md:text-sm">A mix of idle progression and active strategy.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm transition hover:border-primary/30 hover:bg-card"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">How it works</h2>
          <p className="text-xs text-muted-foreground md:text-sm">Get started in three simple steps.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm">
              <span className="absolute right-4 top-4 font-mono text-2xl font-bold text-muted-foreground/30">
                0{i + 1}
              </span>
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
        <h2 className="text-xl font-semibold md:text-2xl">Ready to enter the mine?</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">Join Chainframe and start building your rig today.</p>
        <div className="mt-6">
          <Cta label="Go to dashboard" />
        </div>
      </section>
    </div>
  );
}
