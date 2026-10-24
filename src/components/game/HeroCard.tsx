import type { ReactNode } from "react";
import { Bomb, Flame, Footprints, Heart, Star, Zap } from "lucide-react";
import { HeroSprite } from "@/components/game/HeroSprite";
import { HERO_SPRITES, type HeroType } from "@/game/data/HeroRarity";
import type { SessionHero } from "@/lib/game/session/types";
import { cn } from "@/lib/utils";

/** Static class sets per rarity (kept literal so Tailwind keeps them). */
const RARITY: Record<string, { ring: string; bg: string; text: string; border: string }> = {
  common: { ring: "ring-rarity-common/40", bg: "bg-rarity-common/15", text: "text-rarity-common", border: "border-rarity-common/40" },
  uncommon: { ring: "ring-rarity-uncommon/40", bg: "bg-rarity-uncommon/15", text: "text-rarity-uncommon", border: "border-rarity-uncommon/40" },
  rare: { ring: "ring-rarity-rare/40", bg: "bg-rarity-rare/15", text: "text-rarity-rare", border: "border-rarity-rare/40" },
  epic: { ring: "ring-rarity-epic/40", bg: "bg-rarity-epic/15", text: "text-rarity-epic", border: "border-rarity-epic/40" },
  legendary: { ring: "ring-rarity-legendary/50", bg: "bg-rarity-legendary/15", text: "text-rarity-legendary", border: "border-rarity-legendary/40" },
};

export function rarityClasses(rarity: string) {
  return RARITY[rarity] ?? RARITY.common!;
}

/** Hero card styled after the Chainframe equipment card: rarity rim, icon tile, badges and stat chips. */
export function HeroCard({ hero, footer, children }: { hero: SessionHero; footer?: ReactNode; children?: ReactNode }) {
  const r = rarityClasses(hero.rarity);
  const stats = [
    { icon: Flame, label: "POW", value: hero.power },
    { icon: Footprints, label: "SPD", value: hero.speed },
    { icon: Heart, label: "STA", value: hero.stamina },
    { icon: Bomb, label: "BOMBS", value: hero.bombNumber },
    { icon: Zap, label: "RNG", value: hero.bombRange },
  ];
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card/80 p-4 shadow-sm ring-1 ring-inset backdrop-blur-md transition-transform hover:-translate-y-1",
        r.ring,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl", r.bg)}>
          <HeroSprite sprite={HERO_SPRITES[hero.type as HeroType] ?? "ricky"} scale={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{hero.name}</h3>
            {hero.mintedNumber != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-warning">
                <Star className="size-3 fill-current" />#{hero.mintedNumber}
              </span>
            )}
          </div>
          <p className="truncate text-xs capitalize text-muted-foreground">{hero.type}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize", r.border, r.text)}>
              {hero.rarity}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {stats.map(({ icon: Icon, label, value }) => (
          <span key={label} className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5">
            <Icon className="size-3 text-muted-foreground" />
            {label} <span className="font-semibold text-success">{value}</span>
          </span>
        ))}
      </div>
      {children}
      {footer && <div className="mt-auto flex gap-2">{footer}</div>}
    </article>
  );
}
