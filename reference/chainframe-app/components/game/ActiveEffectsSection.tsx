import { usePlayerStore } from "@/features/stores/playerStore";
import { STAT_EFFECT_LABELS } from "@/features/types/game/stat-effects";
import { STAT_EFFECT_TARGETS } from "@/features/types/game/consumables";
import { formatPercent } from "@/lib/format";

/** Sabotage currently applied to the player. Separate from owned consumables, which are items in the inventory. */
export function ActiveEffectsSection() {
  const statEffects = usePlayerStore((state) => state.statEffects);
  const active = STAT_EFFECT_TARGETS.flatMap((stat) => {
    const effect = statEffects[stat];
    return effect ? [{ stat, effect }] : [];
  });

  return (
    <section aria-labelledby="active-effects-heading">
      <h2 id="active-effects-heading" className="mb-1 text-sm font-semibold">
        Active effects ({active.length})
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Sabotage affecting your stats. Help can reduce its strength. Effects
        clear when you claim your vault or are raided.
      </p>
      {active.length === 0 ? (
        <p className="card-soft p-4 text-xs text-muted-foreground">
          No stats are sabotaged right now.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map(({ stat, effect }) => (
            <li
              key={stat}
              className="card-soft flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {STAT_EFFECT_LABELS[stat]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {effect.critical ? "Critical sabotage" : "Sabotaged"}
                  {effect.helped
                    ? ` · reduced from -${formatPercent(effect.originalStrength * 100)}`
                    : ""}
                </p>
              </div>
              <span className="font-mono text-lg font-bold tabular-nums text-destructive">
                {`-${formatPercent(effect.strength * 100)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
