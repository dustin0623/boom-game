/**
 * Central configuration for the social economy (withdrawal capacity,
 * raid exposure, Sabotage / Help, consumable pricing).
 * Values are consumed server-side; clients never supply them.
 */
export const SOCIAL_ECONOMY = {
	/** Flat HASH withdrawable per day regardless of Notoriety. */
	baseWithdrawal: 10,
	/** Extra HASH withdrawable per day for each point of Notoriety. */
	withdrawalNotorietyRate: 0.1,

	raidExposureMin: 0.1,
	raidExposureMax: 0.5,
	raidCriticalMultiplier: 2,
	raidExposureCap: 1.0,

	/**
	 * Stat-specific Sabotage / Help (Hash Rate, Hack Power, Security), approved D4.
	 * Strength is the share of the target stat removed (Sabotage) or restored
	 * (Help). It is rolled like a raid steal: uniform in [strengthMin,
	 * strengthMax] after a successful social roll (25% base plus Luck). New
	 * social effects have no critical multiplier; existing recorded criticals
	 * retain their evidence and strengthCap. There is no timer: every effect on a player is
	 * reset when that player claims or is raided (see `resetTriggers`).
	 */
	statEffects: {
		strengthMin: 0.1,
		strengthMax: 0.5,
		criticalMultiplier: 2,
		strengthCap: 1.0,
		resetTriggers: ['claim', 'raid'],
	},

	/** Abuse limits for applying Sabotage / Help. Enforced server-side per caller. */
	socialActionLimits: {
		/** Max Sabotage / Help applications one caller may attempt per window. */
		maxActionsPerWindow: 10,
		windowMs: 60_000,
	},

	/** Shared by chest and consumable pricing. */
	pricing: {
		/** Every computed HASH price is rounded half-up to a whole number and at least this value. */
		minPrice: 1,
		/** Informational Global Minerate floor; never changes stored contributions or prices. */
		globalMinerateFloor: 1,
		/**
		 * Network emission tiers. Emission is the HASH claimed by all players during
		 * one UTC day. Prices read the highest completed day so far (a ratchet), so
		 * they are constant for a whole day and never decrease.
		 */
		/** Daily emission (HASH) below which prices stay at their base. */
		emissionThresholdPerDay: 100_000,
		/** HASH added to the Equipment Chest for each HASH of daily emission above the threshold. */
		excessRate: 0.01,
		/**
		 * Chest base price. Sets the percentage uplift shared by every HASH price:
		 * `multiplier = 1 + excess x excessRate / referencePrice`.
		 */
		referencePrice: 100,
		/** Most days of missed emission the ratchet will replay when catching up. */
		emissionCatchUpDays: 31,
	},

	/** Network-only consumable bases: 1/100 of the chest, before whole-HASH rounding. */
	consumablePricing: {
		sabotageBasePrice: 1,
		helpBasePrice: 1,
	},
} as const

export const MARKET_FEE = 0.05

/** Stored level-based contribution total; informational for shop pricing. */
export const GLOBAL_MINERATE_KEY = 'globalMinerate'
