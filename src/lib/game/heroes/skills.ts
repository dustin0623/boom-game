/** Hero skills: passive perks rolled at mint. Count depends on rarity. */
export const SKILL_IDS = ["heavy_impact", "stamina_saver", "quick_rest", "pierce", "bonus_pay", "sprint"] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const SKILL_INFO: Record<SkillId, { name: string; effect: string }> = {
  heavy_impact: { name: "Heavy Impact", effect: "+2 damage to chests" },
  stamina_saver: { name: "Conserve", effect: "25% chance a bomb costs no stamina" },
  quick_rest: { name: "Quick Rest", effect: "Recovers stamina 50% faster off the map" },
  pierce: { name: "Pierce", effect: "Blast passes through one block" },
  bonus_pay: { name: "Bonus Pay", effect: "+10% coins from chests (shared across the map)" },
  sprint: { name: "Sprint", effect: "+30% speed while stamina is under 50%" },
};

export const HEAVY_IMPACT_DAMAGE = 2;
export const CONSERVE_CHANCE = 0.25;
export const QUICK_REST_MULTIPLIER = 1.5;
export const BONUS_PAY_RATE = 0.1;
export const SPRINT_MULTIPLIER = 1.3;

export function skillSlots(rarity: string, rand: () => number = Math.random): number {
  switch (rarity) {
    case "legendary": return 4;
    case "epic": return 3;
    case "rare": return 2;
    case "uncommon": return 1;
    default: return rand() < 0.2 ? 1 : 0;
  }
}

/** Distinct skills for a freshly minted hero. */
export function rollSkills(rarity: string, rand: () => number = Math.random): SkillId[] {
  const pool = [...SKILL_IDS];
  const out: SkillId[] = [];
  for (let n = skillSlots(rarity, rand); n > 0 && pool.length; n--)
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  return out;
}

export const hasSkill = (h: { skills?: readonly string[] }, s: SkillId) => !!h.skills?.includes(s);

/** Bonus Pay share: each on-map hero with the skill adds an equal slice of the 10% bonus. */
export function bonusPayMultiplier(onMap: { skills?: readonly string[] }[]): number {
  if (!onMap.length) return 1;
  return 1 + (BONUS_PAY_RATE * onMap.filter((h) => hasSkill(h, "bonus_pay")).length) / onMap.length;
}
