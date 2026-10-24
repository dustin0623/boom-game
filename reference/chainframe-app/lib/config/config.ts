// src/lib/config/config.ts
// Server application configuration. Shared Hive SDK configuration holds environment names only.
// Chain configuration is centralized here so server-only values never leak into
// browser-facing modules. Hive is the active supported chain.

export const config = {
	mongoUri: process.env['MONGODB_URI'] ?? '',
	mongoDb: process.env['MONGODB_DB'] ?? 'cryptocore',
	jwtSecret: process.env['JWT_SECRET'] ?? '',

	withdrawal: {
		workerPollMs: 5000,
		maxRetries: 8,
	},

	blockchain: {
		treasuryAccount: process.env['HIVE_TREASURY_ACCOUNT'] ?? '',
		marketAccount: process.env['HIVE_MARKET_ACCOUNT'] ?? '',
		token: process.env['CONTRACT_ADDRESS'] ?? 'HASH',
		tokenPrecision: Number.parseInt(process.env['HASH_TOKEN_PRECISION'] ?? '8', 10),
	},

	game: {
		stream: {
			enabled: process.env['HIVE_GAME_STREAM_ENABLED']?.trim().toLowerCase() !== 'false',
			pollMs: Number.parseInt(process.env['HIVE_GAME_STREAM_POLL_MS'] ?? '5000', 10),
			leaseTtlMs: Number.parseInt(process.env['HIVE_GAME_STREAM_LEASE_TTL_MS'] ?? '30000', 10),
			maxRetries: Number.parseInt(process.env['HIVE_GAME_STREAM_MAX_RETRIES'] ?? '3', 10),
			retryBackoffMs: Number.parseInt(process.env['HIVE_GAME_STREAM_RETRY_BACKOFF_MS'] ?? '250', 10),
		},
	},
} as const
