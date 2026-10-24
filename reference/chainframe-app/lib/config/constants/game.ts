import type { ChestKey, Rarity, SlotKey, StatKey } from '@/features/types/game/types'

export const SOCIAL_ACTION_BASE_SUCCESS_PERCENT = 25
/** Immutable mining cutover, shared by browser, application and worker. See release guide. */
export const EQUIPMENT_STATS_EFFECTIVE_AT = Date.parse('2026-10-17T03:30:00.000Z')

export const STAT_KEYS: StatKey[] = ['hashRate', 'hackPower', 'security', 'luck', 'firewall', 'exploit']

export const STAT_META: Record<StatKey, { label: string; description: string; icon: string }> = {
	hashRate: {
		label: 'Hash Rate',
		description: 'HASH mined per second.',
		icon: 'Cpu',
	},
	hackPower: {
		label: 'Hack Power',
		description: 'Must exceed the target’s Security to raid.',
		icon: 'Swords',
	},
	security: {
		label: 'Security',
		description: 'Defends your vault against raiders.',
		icon: 'ShieldCheck',
	},
	luck: {
		label: 'Luck',
		description: 'Adds to the 25% base success chance for Sabotage and Help.',
		icon: 'Clover',
	},
	firewall: {
		label: 'Firewall',
		description: 'Chance to block an incoming raid outright.',
		icon: 'Flame',
	},
	exploit: {
		label: 'Exploit',
		description: 'Raid critical chance: doubles the rolled stolen percentage.',
		icon: 'Bug',
	},
}

export const SLOT_KEYS: SlotKey[] = [
	'asicMiner',
	'motherboard',
	'powerSupply',
	'coolingSystem',
	'networkModule',
	'firmwareChip',
]

export const SLOT_META: Record<SlotKey, { label: string; icon: string }> = {
	asicMiner: { label: 'ASIC Miner', icon: 'Cpu' },
	motherboard: { label: 'Motherboard', icon: 'CircuitBoard' },
	powerSupply: { label: 'Power Supply', icon: 'Zap' },
	coolingSystem: { label: 'Cooling System', icon: 'Fan' },
	networkModule: { label: 'Network Module', icon: 'Network' },
	firmwareChip: { label: 'Firmware Chip', icon: 'Microchip' },
}

export const RARITY_KEYS: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export const RARITY_META: Record<
	Rarity,
	{
		label: string
		min: number
		max: number
		textClass: string
		ringClass: string
		bgClass: string
	}
> = {
	common: {
		label: 'Common',
		min: 1,
		max: 10,
		textClass: 'text-rarity-common',
		ringClass: 'ring-rarity-common/40',
		bgClass: 'bg-rarity-common/15',
	},
	uncommon: {
		label: 'Uncommon',
		min: 2,
		max: 20,
		textClass: 'text-rarity-uncommon',
		ringClass: 'ring-rarity-uncommon/40',
		bgClass: 'bg-rarity-uncommon/15',
	},
	rare: {
		label: 'Rare',
		min: 3,
		max: 30,
		textClass: 'text-rarity-rare',
		ringClass: 'ring-rarity-rare/40',
		bgClass: 'bg-rarity-rare/15',
	},
	epic: {
		label: 'Epic',
		min: 4,
		max: 50,
		textClass: 'text-rarity-epic',
		ringClass: 'ring-rarity-epic/40',
		bgClass: 'bg-rarity-epic/15',
	},
	legendary: {
		label: 'Legendary',
		min: 6,
		max: 60,
		textClass: 'text-rarity-legendary',
		ringClass: 'ring-rarity-legendary/40',
		bgClass: 'bg-rarity-legendary/15',
	},
}

/** Canonical identifier of the single purchasable Equipment Chest. */
export const EQUIPMENT_CHEST_ID = 'equipment' as const satisfies ChestKey

/** HASH base price before the emission tier multiplier. */
export const EQUIPMENT_CHEST_BASE_PRICE = 100

/** Fixed HIVE price of one Equipment Chest. Never changes with emission. */
export const EQUIPMENT_CHEST_HIVE_PRICE = 10

/**
 * Rarity distribution of the Equipment Chest, in percent. Must total exactly
 * 100 (enforced by tests). Pending owner approval (audit D1). The server roll
 * and the odds shown in the Shop are both derived from this one table.
 */
export const EQUIPMENT_CHEST_ODDS: Record<Rarity, number> = {
	common: 70,
	uncommon: 20,
	rare: 8,
	epic: 1.8,
	legendary: 0.2,
}

/** Ladder scale: a roll of 0-99,999, so 1% of odds is 1,000 roll units. */
const EQUIPMENT_CHEST_LADDER_SCALE = 1_000

/** Cumulative ladder walked by the rarity roll, lowest rarity first. */
const EQUIPMENT_CHEST_LADDER: { max: number; rarity: Rarity }[] = (() => {
	let cumulative = 0
	return RARITY_KEYS.map((rarity, index) => {
		cumulative += Math.round(EQUIPMENT_CHEST_ODDS[rarity] * EQUIPMENT_CHEST_LADDER_SCALE)
		const isLast = index === RARITY_KEYS.length - 1
		return { max: isLast ? Infinity : cumulative, rarity }
	})
})()

export const CHESTS: Record<ChestKey, { label: string; price: number; blurb: string; icon: string }> = {
	equipment: {
		label: 'Equipment Chest',
		price: EQUIPMENT_CHEST_BASE_PRICE,
		blurb: 'Mixed hardware salvaged from across the network. Any rarity can drop.',
		icon: 'Package',
	},
}

export const VAULT_BASE_CAPACITY = 1
export const MINING_MULTIPLIER = 1
export const MAX_ACTIVITY_ENTRIES = 30

/* ---------------- Mining economy ---------------- */

/** Hash rate above this contributes at HASHRATE_SOFTCAP_RATE per point. */
export const HASHRATE_SOFTCAP = 333
export const HASHRATE_SOFTCAP_RATE = 0.5

/** Mining is calibrated so the next upgrade is affordable in ~48h. */
export const UPGRADE_TARGET_SECONDS = 48 * 60 * 60

/** Idle decay: full rate for 14 days, then -10%/week down to a 25% floor. */
export const DECAY_GRACE_DAYS = 14
export const DECAY_PER_WEEK = 0.9
export const DECAY_FLOOR = 0.25

/* ---------------- Charges ---------------- */

export const MAX_CLAIM_CHARGES = 5
export const MAX_RAID_CHARGES = 8
/** One charge regenerates every 4 hours. */
export const CHARGE_REGEN_MS = 4 * 60 * 60 * 1000
/** Marketplace fee charged on player-to-player sales, in basis points. */
export const MARKET_FEE_BPS = 500 // 5%

export const RAID_CHARGE_DECAY_DAYS = 5

/* ---------------- Registration ---------------- */

/**
 * One-time on-chain HIVE registration fee. Fixed in HIVE, so there is no price
 * oracle and no tolerance band: the settlement worker requires exactly this
 * amount (3 decimals). Hardcoded policy constant, not an env var.
 */
export const REGISTRATION_FEE_HIVE = 75

/** Liquid HASH awarded by the one-time verified registration transition. */
export const REGISTRATION_STARTING_HASH = 10
/** Fixed event window: 19 October–2 November 2026, 08:00 Singapore. */
export const REGISTRATION_STARTER_EVENT_ID = 'chainframe-invite-challenge-2026-10'
export const REGISTRATION_STARTER_STARTS_AT = Date.parse('2026-10-19T00:00:00.000Z')
export const REGISTRATION_STARTER_ENDS_AT = Date.parse('2026-11-02T00:00:00.000Z')
export const REGISTRATION_STARTER_CHESTS = 4
export const REGISTRATION_STARTER_SABOTAGE = 10
export const REGISTRATION_STARTER_HELP = 10
export const REFERRAL_REWARD_BPS = 500;

/* ---------------- Raiding ---------------- */

/** A rival cannot be raided again within this window. */
export const RIVAL_RAID_COOLDOWN_MS = 60 * 1000

/* ---------------- Loot ---------------- */

/** Rarity index used by the loot value formula. */
export const RARITY_INDEX: Record<Rarity, number> = {
	common: 1,
	uncommon: 2,
	rare: 3,
	epic: 4,
	legendary: 6,
}

/**
 * Chest rarity ladders (upgrade ladder model from the reference game).
 * A roll of 0–99,999 walks the ladder; the first entry it fits decides rarity.
 * Equipment is the only purchasable chest; its ladder is unchanged.
 */
export const CHEST_LADDERS: Record<ChestKey, { max: number; rarity: Rarity }[]> = {
	equipment: EQUIPMENT_CHEST_LADDER,
}

/** Percentage odds per rarity, derived from each chest's ladder. */
export const CHEST_ODDS: Record<ChestKey, Record<Rarity, number>> = [EQUIPMENT_CHEST_ID].reduce(
	(acc, chest) => {
		const odds = RARITY_KEYS.reduce((map, rarity) => ({ ...map, [rarity]: 0 }), {} as Record<Rarity, number>)
		let previous = 0
		for (const step of CHEST_LADDERS[chest]) {
			const max = Number.isFinite(step.max) ? step.max : 100_000
			odds[step.rarity] += Math.round(((max - previous) / 1000) * 100) / 100
			previous = max
		}
		return { ...acc, [chest]: odds }
	},
	{} as Record<ChestKey, Record<Rarity, number>>,
)
