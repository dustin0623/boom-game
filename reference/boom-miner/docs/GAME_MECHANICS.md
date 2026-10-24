> Runtime architecture sections in this document describe the retired client-driven implementation. See [GAME_SERVICE.md](./GAME_SERVICE.md) for the current authoritative service, protocol and verification instructions.

# Boom Miner — Game Mechanics

## Overview

Boom Miner is an auto-battler mining game. Players own a roster of NFT heroes that autonomously navigate a tile-based map, plant bombs, and destroy destructible tiles to earn $BMCOIN. Heroes are minted by paying with an on-chain token transfer to the treasury, operate independently via AI pathfinding, and consume energy with each bomb detonation. Coins earned in-game can be withdrawn back on-chain at any time.

---

## The Map

The game world is a **41 × 25-tile** grid (`MAP_WIDTH = 41`, `MAP_HEIGHT = 25`). Each tile is **32 × 32 pixels** (`TILE_SIZE = 32`).

### Tile Types

| Tile | Type ID | Destructible | Notes |
|------|---------|--------------|-------|
| Grass | 0 | No | Walkable; heroes traverse freely |
| Wall | 1 | No | Impassable; forms the perimeter and every interior cell where both `x` and `y` are even |
| Chest | 2 | Yes | Primary coin source; has rarity-dependent HP and coin reward |
| Bush | 3 | Yes | Obstacle; 1 HP; awards 0 coins |
| Tree | 4 | Yes | Destructible obstacle; treated identically to Bush |

**Walkable tiles:** Grass only.
**Destructible tiles:** Chest, Bush, Tree.

### Map Generation

Each stage map is generated deterministically from a **32-bit integer seed** using a mulberry32 seeded PRNG — the same seed always produces the same layout (`generateStageMap` in `lib/modules/stage-maps/generate.ts`).

**Algorithm:**

1. The perimeter (all edge cells) and every interior cell where both `x` and `y` are even become permanent Walls.
2. Three spawn-safe tiles at `(1,1)`, `(2,1)`, and `(1,2)` are excluded from any fill.
3. A target chest count is rolled: **55–65 chests** per map.
4. All eligible Grass tiles (non-wall, non-spawn-safe) are shuffled deterministically.
5. The first `targetChests` tiles become Chests (rarity rolled per chest).
6. Of the remaining tiles, each has a **~60% chance** of becoming a Bush.

A new map (with a new seed) is generated when a stage is completed. The seed is rolled server-side and stored with the `stage_maps` document.

---

## Chests and Coin Rewards

Chests are the only tiles that award coins on destruction. Their rarity is rolled during map generation via `pickChestRarity`.

| Rarity | Spawn Weight | HP | Coin Reward |
|--------|--------------|----|-------------|
| Common | 80.0% | 20 | 800 |
| Rare | 13.0% | 160 | 2,400 |
| Epic | 5.0% | 320 | 8,000 |
| Legendary | 1.6% | 640 | 32,000 |
| Mythic | 0.4% | 1,280 | 160,000 |

Bushes always have **1 HP** and award **0 coins** — they are pure obstacles.

> **Note:** The coin rewards and HP values above are the canonical values from `CHEST_STATS` in `features/types/ChestRarity.ts`. The old document listed different figures (220 / 660 / 2200 / 8800 / 44000) — those were incorrect.

---

## Heroes

### Hero Types

There are **10 hero types**, each with a unique sprite sheet. Hero type is purely cosmetic — it has no effect on attributes.

| Type | Sprite Key |
|------|-----------|
| Ricky | ricky |
| Rocky | rocky |
| Rascal | rascal |
| Red Horn | redhorn |
| Ducky | ducky |
| Bolt | bolt |
| Pinky | pinky |
| Mossy | mossy |
| Ghosty | ghosty |
| Timmy | timmy |

Sprite sheets are `16 × 20` px per frame, 3 columns × 4 rows. Row 0 = walk down, 1 = walk left, 2 = walk right, 3 = walk up.

### Hero Rarity and Attributes

Rarity is rolled at mint time using a weighted random draw via `pickHeroRarity`. It determines the ranges from which the hero's attributes are rolled.

| Rarity | Mint Weight | Power | Speed | Stamina | Bomb Number | Bomb Range |
|--------|-------------|-------|-------|---------|-------------|-----------|
| Common | 80.0% | 1–3 | 1–3 | 1–3 | 1 | 1–2 |
| Uncommon | 14.0% | 3–6 | 3–6 | 3–6 | 2 | 2–3 |
| Rare | 5.0% | 6–8 | 6–8 | 6–8 | 3 | 3–5 |
| Epic | 0.995% | 8–11 | 8–11 | 8–11 | 4 | 5–7 |
| Legendary | 0.005% | 11–16 | 11–16 | 11–16 | 6 | 7–11 |

> **Bomb Range correction:** Common range is 1–2 (not 1–1 as previously documented). See `HERO_RARITY_DEFS` in `features/types/HeroRarity.ts`.

#### Attribute Meanings

- **Power** — damage dealt to every destructible tile in a bomb's blast per detonation. A hero with Power 5 removes 5 HP from each tile the blast touches.
- **Speed** — controls how fast the hero moves between tiles on the map.
- **Stamina** — determines maximum energy: `maxEnergy = stamina × 100`.
- **Bomb Number** — maximum number of live bombs the hero can have planted simultaneously. A Common hero can only maintain 1 bomb at a time.
- **Bomb Range** — blast radius in tile steps from the bomb's center, propagating orthogonally (up / down / left / right). Blocked by walls; stops at the first destructible tile hit in each direction (the destructible is still damaged).

---

## Energy System

Energy is the resource that gates how many bombs a hero can place during a session.

| Constant | Value |
|----------|-------|
| Energy per Stamina point | 100 (`ENERGY_PER_STAMINA`) |
| Regen interval | 5 minutes (`RECOVERY_INTERVAL_SECONDS = 300`) |

### Per-Rarity Regen Rate

Rarer heroes recover energy faster. All heroes use the same 5-minute tick interval, but rarer heroes recover a larger fraction of their max energy per tick (`RARITY_RECOVERY_FRACTION`):

| Rarity | % of Max Energy per Tick | Time to Full (from 0) |
|--------|--------------------------|------------------------|
| Common | 5.00% | ~100 min |
| Uncommon | 6.25% | ~80 min |
| Rare | 8.33% | ~60 min |
| Epic | 10.00% | ~50 min |
| Legendary | 12.50% | ~40 min |

> **Correction from old document:** The old document listed a flat 10% recovery rate for all rarities. This is incorrect — regen is rarity-tiered. The 10% figure applies only to Epic heroes.

### Rules

- Each **bomb detonation** costs the hero exactly **1 energy**, regardless of how many tiles are hit or destroyed. (One bomb = one detonation = one energy.)
- A hero with 0 energy **cannot be deployed**. If a deployed hero's energy reaches 0 after a detonation, the server immediately emits `hero:undeploy` to remove it from the map.
- Energy only regenerates when the hero is **off the map** (resting). Deployed heroes do not regenerate.
- Regen is computed **server-side** by `RegenScheduler` (in `server/game-websocket-engine/session/RegenScheduler.ts`) on a 60-second write-back cadence. The elapsed time is measured from the server clock, not the client, so the client cannot influence regen amounts. The client simulates regen visually via `tickEnergy()` in the store for smooth UI; the server reconciles authoritative values on reconnect/bootstrap.

---

## Minting Heroes

### Cost

Each hero costs **500,000 $BMCOIN** (`MINT_COST = 500_000`) paid as an on-chain token transfer from the player's wallet to the treasury. Up to **10 heroes** can be minted per transaction (`MAX_MINT_PER_TX = 10`).

### Process

1. The client calls `GET /api/mint/config` to fetch chain-specific payment details (treasury address, token address, decimal precision, mint cost).
2. Optionally, the client calls `GET /api/heroes/next-number` to obtain the next sequential minted number.
3. The client broadcasts an on-chain token transfer to the treasury and obtains a transaction signature / hash.
4. The client calls `POST /api/heroes/mint` with the signature and the requested count. This enqueues a mint job in the `transactions_pending` collection.
5. The `game-smart-contract` sidecar worker polls the queue and calls `verifyAndMintHeroes()`, which:
   - Verifies the on-chain transfer (correct wallet, correct treasury, correct amount).
   - Atomically claims the transaction signature in the settlement ledger (idempotency guard — the same tx can never mint twice).
   - Inserts the hero documents using `generateHero()`.
6. Each hero is generated with a randomly rolled rarity, type, and attributes. The hero starts with `onMap: false` and `currentEnergy = maxEnergy`.
7. After settlement, the worker marks the job complete. The client polls `GET /api/transactions` and fires a `player:sync` WebSocket event when a new settled transaction is detected, triggering a server-authoritative roster push (`player:state`).

---

## Deploying and Recalling Heroes

### Deploy (`hero:deploy` with `onMap: true`)

A hero can be deployed to the map if all of the following hold (enforced in `heroDeploy` and double-checked in `setHeroOnMap`):

1. The hero belongs to the authenticated player.
2. The hero is not already deployed (`onMap === false`).
3. The hero has at least **1 energy** (`currentEnergy >= 1`).
4. The number of heroes currently on the map is below **10** (`MAX_ON_MAP = 10`).

The client makes an optimistic store update immediately; the server processes the request asynchronously and sends `hero:deploy:ack` (success) or `hero:deploy:reject` (failure). On rejection the client rolls back.

### Recall (`hero:deploy` with `onMap: false`)

A hero can be recalled at any time regardless of energy level. Once recalled (`heroUndeploy`), it is removed from the active map state and begins regenerating energy. There is no separate undeploy event from the client — both deploy and recall use the same `hero:deploy` event with the `onMap` boolean flag.

The server also emits `hero:undeploy` automatically when a hero's energy reaches 0 after a detonation.

---

## Hero AI

Deployed heroes operate fully autonomously via `AIManager` (`phaser/managers/AIManager.ts`). The AI runs a state machine (`HeroState`) with four states:

### States

| State | Behaviour |
|-------|-----------|
| `Searching` | BFS the map for the nearest reachable destructible tile not already reserved by another hero. If none is found, fall back to `Roam`. |
| `Moving` | Follow the computed A\* path step by step toward the target tile or roam destination. |
| `PlantBomb` | If the hero has fewer live bombs than its Bomb Number stat and the target tile is still in blast range, plant a bomb then immediately path to an escape tile outside the danger zone. |
| `Escaping` | Follow the escape path to safety; return to `Searching` on arrival. |

### Targeting

- **BFS** (breadth-first search) finds the nearest destructible tile reachable by walking, skipping tiles currently reserved by another hero.
- Bomb blast danger zones (all tiles reachable by any live bomb, including the bomb's own tile) are excluded from movement and standing positions.
- When no breakable tile is reachable the hero wanders randomly using `pickRoamTarget` — BFS collecting tiles 3–14 steps away — to keep moving.

### Pathfinding

Pathfinding is **asynchronous A\*** (`phaser/systems/Pathfinding.ts`). Only Grass tiles that are not in an active danger zone are considered walkable. The hero waits in its current state (via a `pending` guard) until the path resolves.

---

## Bomb Mechanics

### Planting

A bomb is spawned at the hero's current tile with a **700 ms fuse** (`fuseMs = 700`). A hero can have at most `hero.bombNum` live bombs planted simultaneously. If the hero already has `bombNum` active bombs, the `PlantBomb` state immediately returns to `Searching`.

The bomb carries the hero's **Power** as its `damage` value so each hit applies the correct HP reduction.

### Blast

The blast propagates **orthogonally** (4 directions) up to `hero.bombRange` steps. In each direction:

- Propagation stops immediately at the first **Wall** tile (walls are never damaged).
- Propagation stops after hitting the first **destructible tile** in that direction (the destructible is damaged, but the blast does not continue beyond it).
- The bomb's own tile is always included in the blast.

### Damage (Server-Authoritative)

- Each detonation deals `hero.power` HP to **every destructible tile** the blast touches.
- Tiles whose HP reaches 0 are destroyed immediately.
- Non-chest tiles (Bush, Tree) are destroyed silently with no coin reward.
- Chests yield their full `coins` value on destruction.
- **1 energy is consumed per detonation**, regardless of how many tiles were hit or destroyed.

### Server Validation (`bombDetonate` in `features/events/bomb-detonate/action.ts`)

The server validates every detonation:

1. The hero must be in the active session (`heroes` map of `MineState`).
2. A minimum interval of **120 ms** must have elapsed since this hero's last accepted detonation (`MIN_DETONATE_INTERVAL_MS`). This is **per-hero** — concurrent heroes never block each other.
3. The hero must have at least **1 energy**.

If all checks pass, the server applies `power` damage to every supplied `nodeKey`, deducts 1 energy, and returns a `BombDetonateAck` with the authoritative coin total, remaining energy, and list of destroyed node keys.

---

## Coin Economy

### Earning

Coins accumulate in the player's session state as chests are destroyed. The server is the authoritative source: `bombDetonate` updates `state.coins` atomically. The `BombDetonateAck` carries the full **authoritative coin total** (`coinsTotal`), not a delta — the client overwrites its local balance with this value to prevent drift.

### Daily Chest Cap

Each hero has a per-day chest contribution cap (`DAILY_CHEST_CAP_PER_HERO`), which limits how many chests a single hero can contribute to the account's rolling daily total:

| Rarity | Chests/day per hero |
|--------|---------------------|
| Common | 12 |
| Uncommon | 18 |
| Rare | 25 |
| Epic | 35 |
| Legendary | 50 |

The account's daily cap is the sum over all owned heroes. For example, 10 Common heroes cap at 120 chests/day; 10 Legendary heroes cap at 500 chests/day.

### Withdrawing

Players can withdraw their in-game coin balance back on-chain:

1. `POST /api/bank/withdraw` with `{ amount: number }` enqueues a withdrawal job in `transactions_pending`.
2. The `game-smart-contract` sidecar worker polls the queue and calls `withdrawCoins()`, which sends an on-chain transfer from the treasury to the player's wallet.
3. Up to `config.withdrawal.maxRetries` retries are attempted on transient failures. Terminal failures (invalid amount, insufficient coins) are dead-lettered immediately.
4. The client polls `GET /api/transactions` to detect settled transactions, then fires `player:sync` over the WebSocket to receive an authoritative balance update.

---

## Stages

A **stage** is complete when every destructible node on the map (chests + bushes) has been destroyed (`destroyedNodes >= totalNodes`). The server computes this condition inside `bombDetonate`; the result is surfaced in the `stageComplete` flag of the `BombDetonateAck`.

When the stage is cleared:

- `FlushScheduler.flushOne()` is called immediately to persist the final map state.
- The server (`persist.ts`) calls `completeStage()`, which advances the player's stage counter, rolls a new seed, and generates a fresh map.
- The WebSocket handler reloads the map from DB and pushes a new `session:state` with the fresh `canonicalState`.
- Heroes remain deployed on the new map with their current energy levels.

---

## Real-Time Sync

Gameplay is **WebSocket-only** (Socket.IO). The WS engine (`server/game-websocket-engine`) manages all real-time communication.

### Events

| Direction | Event | Description |
|-----------|-------|-------------|
| C → S | `mine:hit` | Legacy single-node hit (kept for compatibility) |
| C → S | `bomb:detonate` | Canonical whole-bomb blast — 1 energy, `power` damage to all nodes hit |
| C → S | `session:sync` | Request a full canonical state push |
| C → S | `session:complete` | Stage cleared — trigger immediate DB flush |
| C → S | `hero:deploy` | Deploy (`onMap:true`) or recall (`onMap:false`) a hero |
| C → S | `player:sync` | Request authoritative coin + stage + roster (after mint/withdrawal settles) |
| S → C | `session:state` | Full canonical state (on connect, on sync, after stage advance) |
| S → C | `mine:hit:ack` | Legacy hit accepted |
| S → C | `mine:hit:reject` | Legacy hit rejected |
| S → C | `bomb:detonate:ack` | Blast accepted — authoritative coins, energy, destroyed keys |
| S → C | `bomb:detonate:reject` | Blast rejected — client requests resync if `SESSION_GONE` |
| S → C | `hero:undeploy` | Hero energy reached 0 — client removes hero from map |
| S → C | `hero:deploy:ack` | Deploy/recall accepted — authoritative `onMap` + energy |
| S → C | `hero:deploy:reject` | Deploy/recall rejected — client rolls back optimistic change |
| S → C | `player:state` | Authoritative off-map state: coins + stage + full roster |
| S → C | `session:error` | Fatal session error (`MAP_NOT_FOUND`, `REPLACED_BY_NEW_TAB`) |

### Session Lifecycle

- On connect the server reads `MineState` from the `stage_maps` DB document and pushes `session:state` immediately.
- A **module-level singleton socket** (`WSSyncManager`) is shared across Phaser scene restarts so a stage transition does not create a new connection and trigger the "replaced by new tab" kick.
- If the same wallet opens a second browser tab, the first tab's socket is kicked with `REPLACED_BY_NEW_TAB`. The second tab picks up the first tab's live in-memory state (if the 15-minute retention window has not expired) to avoid losing unsynced hits.
- Dirty in-memory state is written back to DB by `FlushScheduler` every 30 seconds and immediately on disconnect or stage complete.

### Client Reconciliation

- `MapManager.applyServerState()` receives the `canonicalState` shape and reconciles node HP and hero energy on the Phaser side.
- `BombDetonateAck.coinsTotal` is the authoritative running total, not a delta — the store overwrites local balance with it.
- On `BOMB_DETONATE_REJECT` the client only requests a full resync if the code is `SESSION_GONE`; other rejections are logged but do not trigger a blind resync (which would otherwise resurrect tiles the client already destroyed).

---

## Multi-Chain Support

The game runs on one blockchain per deployment, controlled by the `NEXT_PUBLIC_CHAIN` environment variable:

| Value | Chain | Token Standard |
|-------|-------|----------------|
| `solana` (default) | Solana | SPL Token-2022 |
| `robinhood` | Robinhood Chain (EVM) | ERC-20 |
| `hive` | Hive | Hive-Engine layer-2 token |

All game logic is chain-agnostic. Only three modules are chain-specific:

- **Deposit client:** `lib/client/<chain>/deposit.ts` — builds and sends the on-chain payment transaction in the browser.
- **Transfer verifier:** `lib/chain/<chain>/verify.ts` — confirms the on-chain payment server-side.
- **Withdrawal transfer:** `server/game-smart-contract/lib/transfers.ts` — sends the on-chain payout from the treasury.

---

## Authentication

Players authenticate by signing a nonce message with their blockchain wallet. The server issues a **JWT session token** on successful signature verification. All API routes and the WebSocket connection require this token.

| Chain | Wallet | Verification |
|-------|--------|-------------|
| Solana | Wallet-Standard compatible (Phantom, Backpack, etc.) | Ed25519 signature |
| Robinhood Chain | EIP-6963 compatible EVM wallet (MetaMask, etc.) | EIP-191 personal_sign |
| Hive | Hive Keychain browser extension | Hive custom_json memo signature |
