# Lovable Game Template Architecture

## 1. Purpose

This repository is a reusable master template for building games with Lovable, React, Phaser, Zustand, Zod, MongoDB, and modular blockchain integrations.

The template is intended to provide a consistent architecture for creating individual games while keeping the resulting code portable to a production Next.js application.

The template is **not a game builder**.

Each project created from this template becomes an actual game application.

The architecture must remain generic enough to support different game genres and game systems.

---

# 2. Core Architecture Philosophy

The application is divided into clear responsibilities:

```text
React
    = ALL application/game UI

Phaser
    = GAME WORLD and runtime

Zustand
    = SHARED client/runtime state

Game Bridge
    = REACT ↔ PHASER communication

Features / Events
    = GAME and PLAYER use cases

Game Rules
    = REUSABLE game logic

Repositories
    = DATA persistence abstraction

MongoDB
    = Persistent database

Chain Providers
    = Authentication providers

Chain Modules
    = Blockchain capabilities

Server Smart Contract Worker
    = Asynchronous transaction processing

Zod
    = Validation and contracts

Vitest
    = Testing

/public/game/
    = ALL public game assets

config.ts
    = Shared application configuration
```

---

# 3. Technology Stack

The standard stack is:

- TypeScript
- React
- Phaser
- Zustand
- Zod
- Vitest
- MongoDB
- Next.js for production conversion
- Blockchain modules where required

The Lovable development environment may use mock implementations where external infrastructure is not required during development.

The architecture must remain portable to a production Next.js application.

---

# 4. Master Project Structure

The recommended structure is:

```text
project/
├── docs/
│   └── LOVABLE_TEMPLATE_ARCHITECTURE.md
│
├── src/
│   ├── components/
│   │   ├── auth/
│   │   ├── hud/
│   │   ├── inventory/
│   │   ├── character/
│   │   ├── combat/
│   │   ├── dungeon/
│   │   ├── dialogs/
│   │   ├── menus/
│   │   └── ui/
│   │
│   ├── features/
│   │   ├── events/
│   │   ├── stores/
│   │   └── types/
│   │
│   ├── game/
│   │   ├── bridge/
│   │   ├── engine/
│   │   ├── scenes/
│   │   ├── entities/
│   │   ├── systems/
│   │   ├── data/
│   │   └── utils/
│   │
│   └── lib/
│       ├── chains/
│       │   ├── providers/
│       │   └── modules/
│       │
│       ├── modules/
│       │   └── {collection}/   (server.model/types/repository.ts)
│       │
│       ├── game/
│       │   ├── combat/
│       │   ├── inventory/
│       │   ├── dungeon/
│       │   ├── loot/
│       │   ├── quests/
│       │   └── calculations/
│       │
│       ├── config/
│       │   ├── config.ts
│       │   └── constants/
│       │
│       └── utils/
│
├── server/
│   └── smart-contract/
│       ├── index.ts
│       ├── worker.ts
│       │
│       ├── processor/
│       │   ├── transaction-processor.ts
│       │   ├── batch-processor.ts
│       │   └── transaction-handler.ts
│       │
│       └── polling/
│           ├── context.ts
│           ├── transaction-poller.ts
│           └── test.ts
│
├── public/
│   └── game/
│       ├── sprites/
│       │   ├── players/
│       │   ├── enemies/
│       │   └── npcs/
│       ├── tiles/
│       ├── maps/
│       ├── items/
│       ├── effects/
│       ├── ui/
│       ├── audio/
│       │   ├── music/
│       │   └── sfx/
│       └── fonts/
│
├── tests/
│   ├── integration/
│   └── fixtures/
│
├── AGENTS.md
├── package.json
└── ...
```

---

# 5. React and Phaser Responsibilities

React and Phaser have deliberately separate responsibilities.

## React owns ALL application/game UI

React is responsible for:

- HUD
- HP bars
- MP bars
- XP bars
- inventory
- equipment
- character panels
- quests
- dialogue
- shops
- crafting
- skills
- combat controls
- menus
- pause menus
- settings
- notifications
- modals
- confirmation dialogs
- tooltips
- interaction prompts
- loading screens
- forms
- buttons
- overlays

The main game HUD must not be rendered by Phaser.

---

# 6. Phaser Responsibilities

Phaser owns the game world and real-time runtime.

Phaser is responsible for:

- player entities
- enemies
- NPCs
- world objects
- maps
- tiles
- collision
- movement
- camera
- animations
- particles
- projectiles
- world effects
- scenes
- real-time simulation
- world interaction detection

A visual that is physically part of the game world may be rendered by Phaser.

For example:

```text
Enemy
 └── Floating world-space health bar
```

is acceptable.

A persistent game HUD is not.

---

# 7. React ↔ Phaser Game Bridge

React and Phaser must communicate through a dedicated bridge.

```text
src/game/bridge/
├── GameBridge.ts
├── GameCommands.ts
├── GameEvents.ts
└── GameBridgeProvider.tsx
```

Architecture:

```text
React
  ↕
Game Bridge
  ↕
Phaser
```

React must not directly access Phaser internals.

Phaser must not import React components.

---

## 7.1 Game Commands

Example commands:

```text
MOVE_PLAYER
ATTACK_TARGET
INTERACT
OPEN_CHEST
SELECT_TARGET
USE_WORLD_OBJECT
PAUSE_GAME
RESUME_GAME
FOCUS_CAMERA
MOVE_CAMERA
```

---

## 7.2 Game Events

Example events:

```text
PLAYER_MOVED
PLAYER_DAMAGED
PLAYER_DIED
ENEMY_DEFEATED
CHEST_NEARBY
INTERACTION_AVAILABLE
COMBAT_STARTED
COMBAT_ENDED
DUNGEON_CHANGED
TARGET_CHANGED
PLAYER_ENTERED_AREA
PLAYER_LEFT_AREA
```

The exact event list is game-specific.

---

## 7.3 Bridge Example

```text
Phaser detects chest
        ↓
CHEST_NEARBY
        ↓
GameBridge
        ↓
Zustand interaction store
        ↓
React "Open Chest" button
        ↓
open-chest/action.ts
        ↓
GameBridge OPEN_CHEST
        ↓
Phaser chest animation
```

The Game Bridge is only a communication layer.

It must not contain:

- database logic
- blockchain logic
- major game business rules
- persistence logic

---

# 8. Zustand

Zustand is the shared client/runtime state layer.

Recommended structure:

```text
src/features/stores/
├── store.ts
├── player.store.ts
├── inventory.store.ts
├── combat.store.ts
├── dungeon.store.ts
├── interaction.store.ts
└── ui.store.ts
```

Zustand may contain:

- player state
- HP/MP
- inventory
- equipment
- combat state
- dungeon state
- interaction state
- UI state
- modal state
- temporary runtime state
- cached data

Zustand is **not the permanent database**.

---

# 9. Features

```text
src/features/
├── events/
├── stores/
└── types/
```

Features contain application/game use cases and shared application types.

---

# 10. Application Events

Important game/application operations belong under:

```text
src/features/events/
```

Examples:

```text
attack/
claim/
equip/
use-item/
open-chest/
enter-dungeon/
craft/
complete-quest/
buy/
sell/
loot/
upgrade/
learn-skill/
claim-reward/
deposit/
withdraw/
marketplace/
```

Each important event should normally contain:

```text
action.ts
test.ts
```

---

# 11. Event Action Responsibilities

An event action should:

1. Validate input with Zod.
2. Load required state/data.
3. Execute applicable game rules.
4. Call repositories when persistence is required.
5. Return a typed result.
6. Update Zustand when appropriate.
7. Trigger Game Bridge commands when required.
8. Create pending transactions when an external asset operation is required.

An action must not:

- render React
- directly manipulate Phaser internals
- contain raw database implementation
- contain blockchain implementation

---

# 12. Game Rules

Reusable game logic belongs under:

```text
src/lib/game/
```

Example:

```text
src/lib/game/
├── combat/
├── inventory/
├── dungeon/
├── loot/
├── quests/
└── calculations/
```

Examples:

```text
calculateDamage()
calculateExperience()
calculateLoot()
calculateStats()
validateEquipment()
calculateDungeonReward()
```

Game rules should not depend on:

- React
- Phaser
- MongoDB
- browser UI
- blockchain RPC

---

# 13. Phaser Runtime

Recommended structure:

```text
src/game/
├── bridge/
├── engine/
├── scenes/
├── entities/
├── systems/
├── data/
└── utils/
```

## Engine

```text
Game.ts
GameLoop.ts
Input.ts
Camera.ts
```

## Scenes

```text
BootScene.ts
PreloadScene.ts
MainMenuScene.ts
DungeonScene.ts
BattleScene.ts
```

## Entities

```text
Player.ts
Enemy.ts
NPC.ts
Item.ts
Projectile.ts
Chest.ts
Door.ts
```

## Systems

```text
CombatSystem.ts
MovementSystem.ts
InventorySystem.ts
DungeonSystem.ts
LootSystem.ts
QuestSystem.ts
InteractionSystem.ts
```

---

# 14. Game Data

Static game content belongs under:

```text
src/game/data/
```

Example:

```text
src/game/data/
├── items/
├── enemies/
├── maps/
├── quests/
└── skills/
```

Game content must be separated from global system constants.

---

# 15. Zod and Types

Game-facing schemas belong under:

```text
src/features/types/
```

Example:

```text
src/features/types/
├── types.ts
└── game/
    ├── item.ts
    ├── weapon.ts
    ├── armor.ts
    ├── character.ts
    ├── enemy.ts
    ├── skill.ts
    ├── dungeon.ts
    ├── quest.ts
    └── loot.ts
```

Zod schemas should be the source of truth.

Prefer:

```ts
type Item = z.infer<typeof ItemSchema>;
```

Avoid unnecessarily duplicating:

```text
Zod schema
+
TypeScript interface
+
database interface
```

when one schema can serve as the contract.

---

# 16. Public Game Assets

All game assets must be stored under:

```text
public/game/
```

Never use:

```text
src/assets/
```

for game assets.

Examples:

```text
public/game/sprites/players/
public/game/sprites/enemies/
public/game/items/
public/game/effects/
public/game/audio/
public/game/fonts/
```

Phaser should load assets using stable public URLs:

```ts
this.load.image(
  "player",
  "/game/sprites/players/player.png"
);
```

Do not use:

```ts
import player from "@/assets/player.png";
```

---

# 17. Configuration

Shared application configuration belongs under:

```text
src/lib/config/
├── config.ts
└── constants/
    ├── game.ts
    ├── player.ts
    ├── combat.ts
    ├── items.ts
    ├── enemies.ts
    ├── dungeon.ts
    └── economy.ts
```

`config.ts` is shared by the frontend and server.

```text
                 config.ts
                    │
           ┌────────┴────────┐
           ↓                 ↓
       Frontend             Server
```

This allows the frontend and server worker to use the same application configuration.

---

# 18. Authentication Configuration

The application determines its authentication model through `config.ts`.

Example:

```ts
export const config = {
  auth: {
    mode: "crypto",
    provider: "hive",
  },
};
```

or:

```ts
export const config = {
  auth: {
    mode: "email",
    provider: "email",
  },
};
```

The exact configuration structure may evolve.

The important rule is that the application has a defined authentication/blockchain environment.

The transaction processor does not ask the user to select a chain for every transaction.

---

# 19. Authentication Providers

Authentication providers belong under:

```text
src/lib/chains/providers/
```

Example:

```text
src/lib/chains/providers/
├── email/
│   ├── login.ts
│   ├── signup.ts
│   ├── password.ts
│   └── types.ts
│
├── solana/
│   ├── login.ts
│   ├── signature.ts
│   └── types.ts
│
├── hive/
│   ├── login.ts
│   ├── signature.ts
│   └── types.ts
│
└── xrpl/
    ├── login.ts
    ├── signature.ts
    └── types.ts
```

The enabled provider is controlled by configuration.

The UI dynamically displays the appropriate authentication system.

---

# 20. Authentication Rules

Supported account configurations include:

```text
Email + Password

Email + Password + Solana
Email + Password + Hive
Email + Password + XRPL

Solana only
Hive only
XRPL only
```

An account may have at most one blockchain authentication provider.

Do not support combinations such as:

```text
Solana + Hive
Solana + XRPL
Hive + XRPL
```

or multiple blockchain providers simultaneously.

---

# 21. Blockchain Authentication

Blockchain authentication must use ownership verification.

General flow:

```text
Connect wallet/account
        ↓
Authentication challenge
        ↓
User signs challenge
        ↓
Verify signature
        ↓
Resolve/create player
        ↓
Authenticated state
```

Never request:

- private keys
- seed phrases
- recovery phrases

from users.

---

# 22. Blockchain Modules

Blockchain capabilities belong under:

```text
src/lib/chains/modules/
```

Example:

```text
src/lib/chains/modules/
├── solana/
│   ├── index.ts
│   └── events/
│
├── hive/
│   ├── index.ts
│   └── events/
│
└── xrpl/
    ├── index.ts
    └── events/
```

The application should only use the blockchain modules relevant to its configured chain.

Each chain exposes a public API through:

```text
index.ts
```

Game code should avoid deep imports where the public module API can be used.

---

# 23. Chain Events

Blockchain operations are organized as events.

Example:

```text
src/lib/chains/modules/hive/events/
├── get-token-balance/
│   ├── action.ts
│   └── test.ts
│
├── transfer-token/
│   ├── action.ts
│   └── test.ts
│
├── broadcast-custom-json/
│   ├── action.ts
│   └── test.ts
│
└── ...
```

Other chains may expose different operations.

Typical operations include:

```text
get-token-balance
transfer-token
get-wallet-assets
get-account-assets
get-transaction
broadcast-transaction
```

The exact event list is chain-specific.

---

# 24. Chain Modules vs Game Events

These are separate concepts.

A game event:

```text
src/features/events/withdraw/action.ts
```

means:

> Handle a player's withdrawal request.

A chain event:

```text
src/lib/chains/modules/hive/events/transfer-token/action.ts
```

means:

> Execute a token transfer on Hive.

For example:

```text
withdraw/action.ts
        ↓
game/player validation
        ↓
create pending transaction
        ↓
server transaction worker
        ↓
Hive transfer-token action
        ↓
Hive
```

The chain module must not need to know why the transfer was requested.

---

# 25. Database Architecture

Production persistence uses MongoDB.

The database layer belongs under:

```text
src/lib/modules/
```

Recommended structure:

```text
src/lib/modules/{collection}/      # one folder per collection / domain
├── server.model.ts                # Zod document schema + collection name
├── server.types.ts                # domain types + repository interface
└── server.repository.ts           # persistence ops (mock now, MongoDB later)

src/features/stores/mock/
└── database.ts                    # in-memory mock store (dev only)
```

Example: `src/lib/modules/players/`, `src/lib/modules/transactions/`, `src/lib/modules/inventory/`, `src/lib/modules/marketplace/`.

Avoid scattering raw MongoDB queries throughout application events.

---

# 26. Mock Database

The Lovable development environment may use a mock database where real MongoDB infrastructure is unavailable or unnecessary during rapid development.

The mock implementation should preserve the same conceptual repository boundaries.

Example:

```text
Event Action
    ↓
Repository
    ↓
Mock Database
```

Do not write:

```text
action.ts
    ↓
mockDatabase.players.push(...)
```

Prefer:

```text
action.ts
    ↓
playerRepository.update(...)
    ↓
Mock Database
```

This makes later MongoDB adoption easier.

---

# 27. MongoDB Transaction Collections

Two collections are mandatory for asynchronous external asset transactions:

```text
transactions-pending
transactions-processed
```

These collections are specifically for transactions that require asynchronous processing.

Examples include:

- crypto deposits
- crypto withdrawals
- marketplace P2P transactions
- external asset settlement
- other asynchronous asset operations

They are **not required for ordinary in-game purchases**.

---

# 28. Normal Game Operations vs External Transactions

Normal game operation:

```text
Player buys sword with game currency
        ↓
buy/action.ts
        ↓
Game rules
        ↓
Player/inventory update
```

No pending transaction is required.

External asset operation:

```text
Player requests withdrawal
        ↓
withdraw/action.ts
        ↓
Create pending transaction
        ↓
Transaction worker
        ↓
Blockchain operation
        ↓
processed transaction
```

The transaction queue exists specifically for asynchronous external/financial asset processing.

---

# 29. Pending Transactions

`transactions-pending` acts as the transaction work queue.

Example conceptual document:

```ts
{
  _id: "...",

  type: "WITHDRAWAL",

  userId: "...",

  status: "PENDING",

  amount: "...",

  asset: "...",

  destination: "...",

  metadata: {
    ...
  },

  createdAt: Date,
  updatedAt: Date
}
```

The schema can evolve depending on the transaction type.

The document should contain enough information for the server worker to safely process the transaction.

---

# 30. Processed Transactions

`transactions-processed` acts as the transaction history/audit collection.

Every attempted transaction must eventually be recorded here.

Successful transaction:

```text
transactions-pending
        ↓
PROCESS
        ↓
SUCCESS
        ↓
transactions-processed
```

Failed transaction:

```text
transactions-pending
        ↓
PROCESS
        ↓
ERROR
        ↓
transactions-processed
```

A failed transaction must not remain permanently in the pending queue.

---

# 31. Processed Transaction Example

Success:

```ts
{
  _id: "...",

  originalTransactionId: "...",

  type: "WITHDRAWAL",

  userId: "...",

  amount: "...",

  asset: "...",

  destination: "...",

  status: "SUCCESS",

  result: {
    transactionHash: "..."
  },

  createdAt: Date,
  processedAt: Date
}
```

Error:

```ts
{
  _id: "...",

  originalTransactionId: "...",

  type: "WITHDRAWAL",

  userId: "...",

  amount: "...",

  asset: "...",

  destination: "...",

  status: "ERROR",

  error: {
    code: "...",
    message: "..."
  },

  createdAt: Date,
  processedAt: Date
}
```

---

# 32. Server Smart-Contract Worker

The server transaction worker lives under:

```text
server/
└── smart-contract/
    ├── index.ts
    ├── worker.ts
    │
    ├── processor/
    │   ├── transaction-processor.ts
    │   ├── batch-processor.ts
    │   └── transaction-handler.ts
    │
    └── polling/
        ├── context.ts
        ├── transaction-poller.ts
        └── test.ts
```

This is a server-side execution layer inside the same application repository.

It is not a separate backend application.

---

# 33. Server Worker Entry Point

`server/smart-contract/index.ts` is the entry point.

The package script should be:

```json
{
  "scripts": {
    "server:smart-contract": "tsx server/smart-contract/index.ts"
  }
}
```

The worker can therefore be started using:

```bash
pnpm server:smart-contract
```

---

# 34. Server Worker Responsibilities

The smart-contract worker is responsible for:

- polling pending transactions
- obtaining batches
- claiming transactions
- processing transactions
- calling the appropriate chain modules
- handling errors
- finalizing transactions
- recording processed results

It must not become a second copy of the application.

It should reuse:

- shared configuration
- shared schemas
- shared repositories
- shared game rules
- shared chain modules
- shared event logic where appropriate

---

# 35. `worker.ts`

`worker.ts` owns the worker lifecycle.

Conceptually:

```text
worker
   ↓
start
   ↓
poll
   ↓
process batch
   ↓
wait for completion
   ↓
poll again
```

The worker must ensure that a new batch does not begin while the previous batch is still processing.

---

# 36. `transaction-poller.ts`

Location:

```text
server/smart-contract/polling/transaction-poller.ts
```

Responsibility:

> Find eligible pending transactions.

Default polling interval:

```text
5 seconds
```

The poller should retrieve transactions from:

```text
transactions-pending
```

It should not contain blockchain processing logic.

---

# 37. Batch Processing

Transactions are processed in batches.

Example:

```text
transactions-pending
        ↓
fetch batch
        ↓
Batch A
        ↓
process
        ↓
finish
        ↓
next batch
```

Example configuration:

```ts
const transactionWorkerConfig = {
  pollIntervalMs: 5000,
  batchSize: 50,
};
```

These values should remain configurable.

---

# 38. No Overlapping Batches

This is a mandatory rule.

Incorrect:

```text
0s   → Batch A starts
5s   → Batch B starts
10s  → Batch C starts
```

If Batch A is still processing, another batch must not start.

Required:

```text
0s
 ↓
Batch A starts
 ↓
Batch A processing
 ↓
5s poll occurs
 ↓
Batch A still active
 ↓
wait
 ↓
Batch A finishes
 ↓
next eligible poll
 ↓
Batch B
```

The worker must maintain a single active batch per worker instance.

---

# 39. Transaction Processing Lifecycle

Each transaction follows:

```text
PENDING
   ↓
PROCESSING
   ↓
SUCCESS
```

or:

```text
PENDING
   ↓
PROCESSING
   ↓
ERROR
```

`PROCESSING` exists to prevent the same transaction from being simultaneously processed.

The claim operation should be atomic.

---

# 40. Batch Processor

`batch-processor.ts` owns batch execution.

Conceptually:

```text
Fetch batch
    ↓
Claim transactions
    ↓
Process transactions
    ↓
Wait for processing
    ↓
Finalize
```

The exact concurrency strategy may evolve.

The architecture must prevent duplicate transaction processing.

---

# 41. Transaction Processor

`transaction-processor.ts` owns the lifecycle of an individual transaction.

Conceptually:

```text
PENDING
   ↓
claim
   ↓
PROCESSING
   ↓
transaction-handler
   ↓
SUCCESS / ERROR
   ↓
transactions-processed
```

It must guarantee that an attempted transaction reaches the processed collection.

---

# 42. Transaction Handler

`transaction-handler.ts` determines what the transaction requires.

For example:

```text
WITHDRAWAL
    ↓
configured chain operation
```

or:

```text
MARKETPLACE_P2P
    ↓
marketplace processing
    ↓
chain operations
```

The handler may call:

```text
src/lib/chains/modules/{chain}/{wallet,server}/events/{event}/action.ts
```

when blockchain interaction is required.

If the transaction affects game/player state, it may also invoke the appropriate application/game event or persistence logic.

---

# 43. Transaction Processing Example

Withdrawal:

```text
React
  ↓
withdraw/action.ts
  ↓
validate request
  ↓
validate player state
  ↓
create transactions-pending document
  ↓
return pending status
```

Server:

```text
server/smart-contract/worker
  ↓
transaction-poller
  ↓
transactions-pending
  ↓
batch-processor
  ↓
transaction-processor
  ↓
transaction-handler
  ↓
configured chain module
  ↓
blockchain
```

Result:

```text
SUCCESS
   ↓
transactions-processed
```

or:

```text
ERROR
   ↓
transactions-processed
```

---

# 44. Player Data and Transactions

External transactions may affect player data.

For example, a withdrawal may require:

```text
Player balance
      ↓
Withdrawal requested
      ↓
Reserve/deduct balance
      ↓
Create pending transaction
```

Then:

```text
Blockchain success
      ↓
Finalize withdrawal
      ↓
Update player state
```

or:

```text
Blockchain failure
      ↓
Restore/release reserved balance
      ↓
Update player state
```

The exact accounting rules are game-specific, but the architecture must support these state transitions.

---

# 45. Chain Selection

The transaction itself does not need to contain:

```text
chain: "SOLANA"
```

The application already has a configured authentication/blockchain environment.

The shared configuration is available to both frontend and server:

```text
src/lib/config/config.ts
             │
       ┌─────┴─────┐
       ↓           ↓
   Frontend      Server
```

The server can use this configuration when determining which chain module to invoke.

There is no need for:

```text
server/smart-contract/chains/
```

The chain implementations already exist under:

```text
src/lib/chains/modules/
```

---

# 46. No Server Chain Duplication

Do not create:

```text
server/smart-contract/chains/solana/
server/smart-contract/chains/hive/
server/smart-contract/chains/xrpl/
```

The server worker should reuse:

```text
src/lib/chains/modules/
```

Example:

```text
server/smart-contract
        ↓
configured chain
        ↓
src/lib/chains/modules/hive/
        ↓
events/transfer-token/action.ts
```

This prevents duplicate blockchain implementations.

---

# 47. Server Is Part of the Same Repository

The `/server` folder is not a separate project.

It shares:

- package.json
- configuration
- TypeScript
- Zod schemas
- database layer
- repositories
- game rules
- chain modules
- types
- utilities

Conceptually:

```text
                 SAME APPLICATION
                       │
        ┌──────────────┴──────────────┐
        ↓                             ↓
     Frontend                       Server
        │                             │
        └──────── shared code ────────┘
```

---

# 48. Package Scripts

The smart-contract worker is launched using:

```bash
pnpm server:smart-contract
```

Example:

```json
{
  "scripts": {
    "dev": "vite",
    "server:smart-contract": "tsx server/smart-contract/index.ts",
    "test": "vitest",
    "test:watch": "vitest --watch"
  }
}
```

The exact frontend development command may change depending on the generated project.

---

# 49. Dependency Direction

Preferred application direction:

```text
React
  ↓
Features / Events
  ↓
Game Rules
  ↓
Repositories
  ↓
MongoDB
```

Game-world communication:

```text
React
  ↓
Game Bridge
  ↓
Phaser
```

and:

```text
Phaser
  ↓
Game Bridge
  ↓
Zustand / Events
  ↓
React
```

Blockchain:

```text
Game Event
  ↓
Chain Module
  ↓
Blockchain
```

Asynchronous external transaction processing:

```text
transactions-pending
        ↓
Server Smart-Contract Worker
        ↓
Transaction Handler
        ↓
Chain Module / Game Event
        ↓
Blockchain / Application State
        ↓
transactions-processed
```

---

# 50. Forbidden Architecture

Do NOT create:

```text
React → MongoDB directly

React → Phaser Scene directly

Phaser → React Component

Phaser → Database

Zustand → Database implementation

GameBridge → Database logic

GameBridge → Game business rules

UI → Private Key

UI → Seed Phrase

Game Event → Raw blockchain RPC

Game code → scattered blockchain implementation

server/smart-contract/chains/

Duplicate server versions of chain modules

Duplicate server versions of game rules
```

---

# 51. Testing

Use Vitest.

Important events should contain:

```text
action.ts
test.ts
```

Tests should cover:

- valid operations
- invalid input
- game rules
- state transitions
- persistence
- reward calculations
- edge cases
- transaction processing
- transaction failures
- transaction claiming
- batch processing

Integration tests:

```text
tests/integration/
```

Fixtures:

```text
tests/fixtures/
```

---

# 52. Transaction Testing

The transaction worker should be testable without performing real blockchain transactions.

Tests should support mocked chain operations.

Example:

```text
Pending withdrawal
       ↓
Mock chain transfer
       ↓
SUCCESS
       ↓
transactions-processed
```

and:

```text
Pending withdrawal
       ↓
Mock chain transfer
       ↓
ERROR
       ↓
transactions-processed
```

The transaction processor should also be tested for:

- duplicate claims
- empty batches
- batch limits
- failed transactions
- long-running transactions
- polling while a batch is active
- successful finalization
- failed finalization

---

# 53. AI Development Workflow

AI agents must:

1. Read `AGENTS.md`.
2. Read the relevant section of this architecture document.
3. Identify the correct architectural layer.
4. Reuse existing modules.
5. Check existing schemas and types.
6. Check existing events.
7. Avoid duplicate logic.
8. Implement the smallest appropriate change.
9. Add or update tests.
10. Run tests.
11. Fix failures.
12. Verify architectural boundaries.

---

# 54. Feature Development Workflow

For a normal game feature:

```text
1. Define/update Zod schema
2. Define event
3. Create test
4. Implement action
5. Implement game rules
6. Implement repository interaction if needed
7. Update Zustand
8. Add Game Bridge command/event if required
9. Implement Phaser behavior
10. Implement React UI
11. Run tests
12. Verify architecture
```

For an external transaction feature:

```text
1. Define transaction schema
2. Define frontend/game event
3. Validate player state
4. Create pending transaction
5. Add transaction processor handling
6. Add required chain event
7. Add player/game state handling if required
8. Add processed transaction handling
9. Add tests
10. Run tests
11. Verify transaction cannot be duplicated
12. Verify success and error paths
```

---

# 55. Future Next.js Production Conversion

The Lovable game can later be converted into a production Next.js application.

The conversion should preserve:

- React UI
- Phaser
- Zustand
- Zod
- Game Bridge
- Game Rules
- Game Data
- Public Assets
- Chain Architecture
- Event Architecture
- Transaction Architecture

The production application can add:

- Next.js App Router
- API routes
- server modules
- MongoDB infrastructure
- production authentication
- production blockchain infrastructure
- deployment infrastructure

---

# 56. Future Production Architecture

Conceptually:

```text
                    LOVABLE GAME
                         ↓
                  Existing Code
                         ↓
       ┌─────────────────┼─────────────────┐
       ↓                 ↓                 ↓
    React              Phaser           Features
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ↓
                 Next.js Project
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
           app/api/              Server
                                    │
                         ┌──────────┴──────────┐
                         ↓                     ↓
                    Smart Contract        Repositories
                    Worker                    │
                                              ↓
                                           MongoDB
```

The `/server/smart-contract` architecture can be preserved during the conversion.

---

# 57. Transaction Architecture in Production

Production flow:

```text
Frontend
    ↓
Next.js API
    ↓
Game / Transaction Event
    ↓
MongoDB
    ↓
transactions-pending
    ↓
Smart Contract Worker
    ↓
Batch Processor
    ↓
Transaction Handler
    ↓
Configured Chain Module
    ↓
Blockchain
    ↓
transactions-processed
```

This architecture allows blockchain processing to remain asynchronous.

The frontend does not need to wait for the blockchain operation to complete.

---

# 58. Important Transaction Principles

The transaction system must follow these principles:

### Durable

A requested external transaction must be stored in MongoDB.

### Asynchronous

Blockchain/external processing happens independently from the frontend request.

### Batch-based

The worker processes pending transactions in batches.

### Non-overlapping

A worker must not begin another batch while its current batch is still processing.

### Claimable

Transactions must be atomically claimed before processing.

### Idempotent

Transaction processing should be designed to avoid duplicate external operations whenever possible.

### Auditable

Every attempted transaction must have a corresponding processed record.

### Failure-aware

Errors are valid transaction outcomes and must be recorded.

### Chain-independent at the worker level

The worker should use the application's configured chain rather than requiring each transaction to specify a chain.

---

# 59. Absolute Architecture Rules

1. Use TypeScript.
2. Use React for all application/game UI.
3. Use Phaser for the game world/runtime.
4. Phaser must not render the main HUD.
5. Phaser must not render application menus.
6. Phaser must not render inventory UI.
7. Phaser must not render dialogs/modals.
8. Use a dedicated React ↔ Phaser Game Bridge.
9. React must not directly access Phaser internals.
10. Phaser must not directly access React components.
11. Use Zustand for shared client/runtime state.
12. Use Zod for validation/contracts.
13. Use Vitest for tests.
14. Important application events should have `action.ts`.
15. Important application events should have `test.ts`.
16. Use repository abstractions for persistence.
17. MongoDB is the production persistence database.
18. Mock database implementations may be used for development.
19. Zustand is not the permanent persistence layer.
20. Game rules belong in `src/lib/game/`.
21. Static game content belongs in `src/game/data/`.
22. Constants belong in `src/lib/config/constants/`.
23. All game assets belong in `/public/game/`.
24. Never use `src/assets` for game assets.
25. Use stable `/game/...` URLs for public game assets.
26. Shared application configuration belongs in `src/lib/config/config.ts`.
27. Frontend and server use the same application configuration.
28. An account may have at most one blockchain authentication provider.
29. Never request private keys or seed phrases.
30. Blockchain authentication uses signature-based ownership verification.
31. Blockchain capabilities belong under `src/lib/chains/modules/`.
32. Each chain module exposes its public API through `index.ts`.
33. Chain operations belong under chain module `events/`.
34. Game events and blockchain events are separate concepts.
35. Authentication providers and blockchain game modules are separate concepts.
36. Keep business logic out of React UI components.
37. Keep database logic out of Phaser.
38. Keep blockchain implementation out of UI components.
39. Do not duplicate game logic.
40. Do not unnecessarily duplicate schemas.
41. Do not expose secrets to browser code.
42. The `/server` directory is part of the same application repository.
43. `/server/smart-contract` is the asynchronous external transaction worker.
44. Start the worker with `pnpm server:smart-contract`.
45. `transactions-pending` is a mandatory MongoDB collection for external transactions.
46. `transactions-processed` is a mandatory MongoDB collection for external transactions.
47. Deposits must use the pending/processed transaction pipeline when asynchronous processing is required.
48. Withdrawals must use the pending/processed transaction pipeline.
49. Marketplace P2P transactions must use the pending/processed transaction pipeline.
50. Normal in-game purchases do not need the external transaction pipeline unless external settlement is actually required.
51. Every attempted pending transaction must eventually be recorded in `transactions-processed`.
52. Both successful and failed transactions must be recorded.
53. Pending transactions must support a processing state.
54. Pending transactions must be atomically claimed before processing.
55. Transaction processing must be asynchronous and server-side.
56. The frontend must not directly execute external financial settlement logic.
57. The frontend must not directly write to MongoDB.
58. The transaction worker processes transactions in batches.
59. The default transaction polling interval is 5 seconds.
60. A new batch must not start while the previous batch is still processing.
61. The worker must prevent duplicate processing.
62. Transaction processing should be idempotent where possible.
63. The transaction worker must record both successful and failed outcomes.
64. Raw MongoDB queries must not be scattered throughout transaction handlers.
65. Do not create `server/smart-contract/chains/`.
66. The server must reuse `src/lib/chains/modules/`.
67. Do not duplicate blockchain implementations inside `/server`.
68. Do not duplicate game rules inside `/server`.
69. Game/player consequences of transactions should use the existing feature/event architecture.
70. Chain operations should use the existing chain event architecture.
71. The server worker should orchestrate processing rather than implement blockchain logic itself.
72. Keep the architecture portable to future Next.js conversion.
73. Do not build a browser-based game builder.
74. Keep the master template generic.
75. Prefer existing architectural patterns over unnecessary abstractions.
76. Preserve the architecture when adding future systems.

---

# 60. Final Architecture Summary

The complete architecture is:

```text
                         APPLICATION
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
        React              Phaser              Server
          │                   │                   │
          │              Game World        Smart Contract
          │                   │                   │
          │                   │              Polling Worker
          │                   │                   │
          └──────────┬────────┘                   ↓
                     │                   transactions-pending
                Game Bridge                      │
                     │                           ↓
                  Zustand                Batch Processor
                     │                           │
                     ↓                           ↓
               Game Events              Transaction Handler
                     │                     /          \
                     ↓                    /            \
                Game Rules               ↓              ↓
                     │          Chain Modules      Game Events
                     │               │                 │
                     │               ↓                 ↓
                     │          Blockchain        Player State
                     │               │                 │
                     └───────────────┴─────────────────┘
                                     ↓
                           transactions-processed
                                     │
                                     ↓
                                  MongoDB
```

The architectural principle is:

```text
GAMEPLAY
    ↓
React + Phaser + Zustand + Game Events

PERSISTENCE
    ↓
Repositories + MongoDB

BLOCKCHAIN
    ↓
Chain Modules + Chain Events

EXTERNAL ASSET TRANSACTIONS
    ↓
transactions-pending
    ↓
server/smart-contract
    ↓
Batch Processing
    ↓
Chain/Game Events
    ↓
transactions-processed
```

The template therefore provides:

```text
GAME ARCHITECTURE
+
SHARED CONFIGURATION
+
MONGODB PERSISTENCE
+
BLOCKCHAIN MODULES
+
ASYNCHRONOUS TRANSACTION WORKER
```

while remaining portable to a future Next.js production deployment.