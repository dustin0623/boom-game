"use client";

import Link from "next/link";
import {
  Boxes,
  Flame,
  Gamepad2,
  Pickaxe,
  ShoppingBag,
  Sword,
  Target,
  Wallet,
  Zap,
} from "lucide-react";

import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/authStore";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Pickaxe,
    title: "Mine $HASH",
    description:
      "Your rig generates HASH passively. Upgrade hash rate and vault capacity to compound earnings over time.",
  },
  {
    icon: Zap,
    title: "Upgrade stats",
    description:
      "Spend HASH on permanent upgrades. Raise Hash Rate, Hack Power, Security and more to climb the leaderboards.",
  },
  {
    icon: Sword,
    title: "Raid other rigs",
    description:
      "Pick a target and attempt to steal vault HASH. Higher Exploit improves success chance; Firewall helps defend.",
  },
  {
    icon: Boxes,
    title: "Open chests",
    description:
      "Find gear drops that boost your rig. Chests contain items with rarities from Common to Legendary.",
  },
  {
    icon: ShoppingBag,
    title: "Trade on market",
    description:
      "List spare gear or shop for powerful items. The marketplace runs on the server with a small fee sink.",
  },
  {
    icon: Flame,
    title: "Build Notoriety",
    description:
      "Earn Notoriety through in-game activity to unlock Exploit bonuses, higher withdrawal limits and bragging rights.",
  },
];

const STEPS = [
  {
    icon: Wallet,
    title: "Connect your wallet",
    description:
      "Link your Hive account with Keychain and complete registration to play.",
  },
  {
    icon: Target,
    title: "Verify your Hive account",
    description:
      "Approve the Keychain message signature. Your Hive username identifies you in raids and marketplace history.",
  },
  {
    icon: Gamepad2,
    title: "Play idle or active",
    description:
      "Let your vault fill, upgrade stats, raid rivals and trade gear at your own pace.",
  },
];

function HeroCard({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm transition hover:border-primary/30 hover:bg-card",
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function LandingPage() {
  const connected = useAuthStore((state) => state.address !== null);

  return (
    <div className="space-y-16 pb-12 pt-4 md:pt-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-6 md:p-10 lg:p-14">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 size-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative">
          <BrandLogo className="mb-5 h-14 md:h-20 lg:h-24" />
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Build your rig. Mine. Raid. Trade.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Chainframe is an idle crypto-mining game where your rig works around
            the clock. Upgrade stats, open chests, raid other miners and trade
            gear on the marketplace.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {connected ? (
              <Button asChild size="lg" className="gap-2">
                <Link href="/dashboard">
                  <LayoutDashboardIcon className="size-4" />
                  Enter dashboard
                </Link>
              </Button>
            ) : (
              <ConnectWalletModal>
                <Button size="lg" className="gap-2">
                  <Wallet className="size-4" />
                  Connect wallet
                </Button>
              </ConnectWalletModal>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold md:text-xl">
              What you can do
            </h2>
            <p className="text-xs text-muted-foreground md:text-sm">
              A mix of idle progression and active strategy.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <HeroCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold md:text-xl">How it works</h2>
          <p className="text-xs text-muted-foreground md:text-sm">
            Get started in three simple steps.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm"
            >
              <span className="absolute right-4 top-4 font-mono text-2xl font-bold text-muted-foreground/30">
                0{index + 1}
              </span>
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <step.icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center md:p-12">
        <h2 className="text-xl font-semibold md:text-2xl">
          Ready to enter the mine?
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Join Chainframe and start building your rig today.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {connected ? (
            <Button asChild size="lg" className="gap-2">
              <Link href="/dashboard">
                <LayoutDashboardIcon className="size-4" />
                Go to dashboard
              </Link>
            </Button>
          ) : (
            <ConnectWalletModal>
              <Button size="lg" className="gap-2">
                <Wallet className="size-4" />
                Connect wallet
              </Button>
            </ConnectWalletModal>
          )}
        </div>
      </section>
    </div>
  );
}

function LayoutDashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}
