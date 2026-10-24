import { HeroRarity, HeroType, pickHeroRarity, pickHeroType, rollHeroAttributes, HERO_RARITY_DEFS } from '@/features/types/HeroRarity';
import { maxEnergyFor } from '@/lib/constants/game';
import type { RosterHero } from '@/features/store/gameStore';

const HERO_DESCRIPTION =
  "Boom Miner Heroes are non-fungible characters that mine treasure by placing bombs across the map. Each hero is randomly generated with a unique combination of Power, Speed, Stamina, Bomb Number, and Bomb Range that determines how effectively they clear terrain and collect $BMCOIN.";

let nextIdSeed = 1;
function makeHero(rarity?: HeroRarity, type?: HeroType): RosterHero {
  const r = rarity ?? pickHeroRarity(Math.random);
  const t = type ?? pickHeroType();
  const a = rollHeroAttributes(r);
  const minted_number = Math.floor(10000 + Math.random() * 89999);
  const maxE = maxEnergyFor(a.stamina);
  return {
    id: `hero-${nextIdSeed++}-${minted_number}`,

    // NFT metadata
    name: t,
    minted_number,
    description: HERO_DESCRIPTION,
    image: null,
    owner: "boom_miner",
    level: 1,
    rarity: r,
    attributes: {
      power: a.power,
      speed: a.speed,
      stamina: a.stamina,
      bomb_number: a.bombNum,
      bomb_range: a.bombRange,
    },
    market: {
      listed: false,
      price: 0,
      seller: null,
      created: 0,
      sold: 0,
    },

    // Runtime state
    type: t,
    rarityLabel: HERO_RARITY_DEFS[r].label,
    currentEnergy: maxE,
    maxEnergy: maxE,
    onMap: false,
  };
}

/**
 * Dev/demo-only roster used by the /test-modals page so the Heroes modal
 * renders a populated list without a live server. Produces a spread of
 * rarities and runtime states (deployed, ready, resting, sleeping).
 */
export function createMockRoster(): RosterHero[] {
  const deployed = makeHero(HeroRarity.Epic);
  deployed.onMap = true;

  const ready = makeHero(HeroRarity.Legendary);

  const resting = makeHero(HeroRarity.Rare);
  resting.currentEnergy = Math.floor(resting.maxEnergy * 0.4);

  const sleeping = makeHero(HeroRarity.Uncommon);
  sleeping.currentEnergy = 0;

  const common = makeHero(HeroRarity.Common);

  return [deployed, ready, resting, sleeping, common];
}

