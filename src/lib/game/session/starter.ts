import { HeroRarity, HeroType, rollHeroAttributes } from "@/game/data/HeroRarity";
import type { SessionHero } from "./types";

/** The four starter bombers every new player begins with. */
export function starterHeroes(): SessionHero[] {
  const rarities = [HeroRarity.Common, HeroRarity.Uncommon, HeroRarity.Rare, HeroRarity.Epic];
  const types = Object.values(HeroType);
  return rarities.map((rarity, i) => {
    const a = rollHeroAttributes(rarity);
    return {
      id: `hero-${i}`,
      name: `Bomber #${i + 1}`,
      type: types[(i * 3) % types.length]!,
      rarity,
      power: a.power,
      speed: a.speed,
      stamina: a.stamina,
      bombNumber: a.bombNum,
      bombRange: a.bombRange,
      maxEnergy: a.energy,
    };
  });
}
