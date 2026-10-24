<!-- LOVABLE:BEGIN -->
# AGENTS.md

## Project Instructions

You are working inside a reusable game-development template.

Before making changes, read:

```text
docs/LOVABLE_TEMPLATE_ARCHITECTURE.md
```

The architecture document is the source of truth for project structure and boundaries.

This file provides the operational rules that AI agents must follow when modifying the project.

---

# 1. Core Architecture

The application uses:

- React for all application/game UI
- Phaser for the game world and runtime
- Zustand for shared client/runtime state
- Zod for schemas and validation
- Vitest for testing
- MongoDB for persistent production data
- Repository abstractions for persistence
- Modular blockchain integrations
- A server-side asynchronous transaction worker

The architecture is intentionally modular and must remain portable to a future Next.js production application.

---

# 2. Before Changing Code

Before implementing a feature:

1. Read `docs/LOVABLE_TEMPLATE_ARCHITECTURE.md`.
2. Inspect the existing project structure.
3. Search for existing implementations before creating new ones.
4. Reuse existing types and schemas.
5. Reuse existing events.
6. Reuse existing game rules.
7. Reuse existing repositories.
8. Reuse existing chain modules.
9. Determine which architectural layer owns the change.
10. Implement the smallest change that satisfies the requirement.
11. Add or update tests.
12. Run tests.
13. Fix failures.
14. Verify that the architecture boundaries remain intact.

Do not immediately create new files or abstractions without checking whether an existing module already provides the required functionality.

---

# 3. React Rules

React owns all application and game UI.

React may render:

- HUD
- health bars
- mana bars
- XP bars
- inventory
- equipment
- character screens
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
- forms
- buttons
- overlays

Keep business logic out of UI components.

UI components should call appropriate actions, stores, or bridge APIs.

Do not put database queries, blockchain implementation, or complex game calculations directly inside React components.

---

# 4. Phaser Rules

Phaser owns the game world and real-time game runtime.

Phaser may handle:

- player entities
- enemies
- NPCs
- world objects
- maps
- tiles
- collision
- movement
- camera
- animation
- particles
- projectiles
- world effects
- scenes
- real-time simulation
- world interaction detection

Phaser must NOT render the main application/game HUD.

Do not implement:

- inventory screens
- application menus
- dialogs
- modals
- settings screens
- character panels

inside Phaser.

World-space visuals are allowed when they are genuinely part of the game world.

---

# 5. React ↔ Phaser Communication

React and Phaser communicate through:

```text
src/game/bridge/
├── GameBridge.ts
├── GameCommands.ts
├── GameEvents.ts
└── GameBridgeProvider.tsx
```

Required architecture:

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

Never:

```text
React → Phaser internals
Phaser → React components
```

Do not put database logic or major game business rules inside the bridge.

---

# 6. Zustand Rules

Use Zustand for shared client/runtime state.

Recommended stores include:

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

- current player state
- runtime HP/MP
- inventory state
- equipment
- combat state
- dungeon state
- interaction state
- UI state
- modal state
- temporary runtime state
- cached data

Zustand is NOT the permanent database.

Never treat Zustand as the source of permanent persistence.

---

# 7. Event Architecture

Important application/game operations belong under:

```text
src/features/events/
```

Examples:

```text
attack
claim
equip
use-item
open-chest
enter-dungeon
craft
complete-quest
buy
sell
loot
upgrade
learn-skill
claim-reward
deposit
withdraw
marketplace
```

Important events should normally contain:

```text
action.ts
test.ts
```

An action should:

1. Validate input with Zod.
2. Load required state/data.
3. Execute game rules.
4. Use repositories for persistence.
5. Return a typed result.
6. Update Zustand when appropriate.
7. Trigger Game Bridge commands when necessary.
8. Create a pending transaction when external asset processing is required.

Actions must not render React or directly manipulate Phaser internals.

---

# 8. Game Rules

Reusable game logic belongs under:

```text
src/lib/game/
```

Examples:

```text
src/lib/game/combat/
src/lib/game/inventory/
src/lib/game/dungeon/
src/lib/game/loot/
src/lib/game/quests/
src/lib/game/calculations/
```

Examples of game rules:

```text
calculateDamage()
calculateExperience()
calculateLoot()
calculateStats()
validateEquipment()
calculateDungeonReward()
```

Game rules should be independent from:

- React
- Phaser
- MongoDB
- blockchain RPC
- UI
- browser-specific APIs

Do not duplicate game calculations in components, events, or Phaser systems.

---

# 9. Types and Zod

Use Zod as the source of truth for important data contracts.

Game types belong under:

```text
src/features/types/
```

Prefer:

```ts
const ItemSchema = z.object({
  ...
});

type Item = z.infer<typeof ItemSchema>;
```

Avoid unnecessary duplicate schemas and interfaces.

Before creating a new type:

1. Search for an existing type.
2. Search for an existing Zod schema.
3. Extend the existing contract when appropriate.

---

# 10. Configuration

Shared application configuration belongs in:

```text
src/lib/config/config.ts
```

Configuration is shared by frontend and server.

```text
config.ts
   ├── React
   └── server/smart-contract
```

Configuration may control:

- authentication mode
- enabled blockchain provider
- feature flags
- game configuration
- transaction worker settings
- mock/development settings
- other application-level configuration

Do not create separate conflicting frontend and server configuration when the value represents shared application configuration.

Do not place secrets in browser-accessible configuration.

---

# 11. Authentication

Authentication providers belong under:

```text
src/lib/chains/providers/
```

Supported authentication models may include:

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

Do not implement multiple simultaneous blockchain authentication providers for the same account.

Blockchain authentication must use signature-based ownership verification.

Never request:

- private keys
- seed phrases
- recovery phrases

from users.

---

# 12. Blockchain Architecture

Blockchain capabilities belong under:

```text
src/lib/chains/modules/
```

Example:

```text
src/lib/chains/modules/
├── solana/
├── hive/
└── xrpl/
```

Each chain module should expose its public API through:

```text
index.ts
```

Chain operations belong under:

```text
src/lib/chains/modules/{chain}/{wallet,server}/events/
```

Example:

```text
src/lib/chains/modules/hive/events/
├── get-token-balance/
│   ├── action.ts
│   └── test.ts
├── transfer-token/
│   ├── action.ts
│   └── test.ts
└── ...
```

Do not scatter raw blockchain RPC calls throughout the application.

Do not put blockchain implementation inside React components.

Do not put blockchain implementations inside Phaser.

Do not duplicate chain modules inside `/server`.

---

# 13. Chain Events vs Game Events

These are different architectural layers.

Game event:

```text
src/features/events/withdraw/action.ts
```

means:

> Handle the game's withdrawal operation.

Chain event:

```text
src/lib/chains/modules/hive/events/transfer-token/action.ts
```

means:

> Execute a token transfer on Hive.

A game event may call a chain module when necessary.

Example:

```text
withdraw/action.ts
      ↓
create pending transaction
      ↓
server worker
      ↓
chain transfer action
      ↓
blockchain
```

Do not put the game's business reason inside the chain module.

---

# 14. Database Architecture

Persistent production data uses MongoDB.

Database code belongs under:

```text
src/lib/modules/
```

Use repository abstractions.

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

Do not create one giant generic repository unless there is a real architectural reason.

Do not scatter raw MongoDB queries throughout application actions.

---

# 15. Pending Transactions

The following MongoDB collection is mandatory:

```text
transactions-pending
```

It is used for asynchronous external asset operations such as:

- crypto deposits
- crypto withdrawals
- marketplace P2P transactions
- external asset settlement
- other operations requiring asynchronous processing

Normal game purchases do not automatically require a pending transaction.

For example:

```text
Game currency → sword
```

is a normal game event.

Whereas:

```text
Crypto withdrawal
```

must use the transaction processing system.

---

# 16. Processed Transactions

The following MongoDB collection is mandatory:

```text
transactions-processed
```

Every attempted pending transaction must eventually be recorded here.

Both outcomes are valid:

```text
SUCCESS
ERROR
```

Successful transaction:

```text
transactions-pending
      ↓
process
      ↓
SUCCESS
      ↓
transactions-processed
```

Failed transaction:

```text
transactions-pending
      ↓
process
      ↓
ERROR
      ↓
transactions-processed
```

Do not leave failed transactions permanently in `transactions-pending`.

---

# 17. Server Smart-Contract Worker

The server transaction processor is located at:

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

This is part of the same repository and application.

It is NOT a separate backend project.

---

# 18. Server Package Script

The smart-contract worker is started with:

```bash
pnpm server:smart-contract
```

The package script should point to:

```text
server/smart-contract/index.ts
```

Example:

```json
{
  "scripts": {
    "server:smart-contract": "tsx server/smart-contract/index.ts"
  }
}
```

Do not create a separate package.json solely for the smart-contract worker unless explicitly required by the project architecture.

---

# 19. Server Responsibilities

The smart-contract server is responsible for:

- polling `transactions-pending`
- fetching batches
- claiming transactions
- processing transactions
- calling appropriate application/chain operations
- handling failures
- recording results
- moving completed attempts to `transactions-processed`

The server worker must NOT become a second copy of the game.

Reuse shared:

- configuration
- types
- Zod schemas
- repositories
- game rules
- chain modules
- application events
- utilities

---

# 20. Smart-Contract Server File Responsibilities

## `index.ts`

Entry point.

Starts the smart-contract worker.

```text
index.ts
   ↓
worker.ts
```

---

## `worker.ts`

Owns worker lifecycle.

Conceptually:

```text
start
 ↓
poll
 ↓
process batch
 ↓
wait
 ↓
poll again
```

Only one active batch may be processed by the worker instance at a time.

---

## `polling/transaction-poller.ts`

Responsible for retrieving eligible pending transactions.

Default polling interval:

```text
5000ms
```

The poller must not contain blockchain business logic.

---

## `processor/batch-processor.ts`

Responsible for:

- batch lifecycle
- claiming transactions
- processing the batch
- waiting for completion
- finalizing the batch

---

## `processor/transaction-processor.ts`

Responsible for the lifecycle of an individual transaction:

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

---

## `processor/transaction-handler.ts`

Determines what a transaction needs to do.

It may invoke:

```text
src/lib/chains/modules/{chain}/{wallet,server}/events/{event}/action.ts
```

or appropriate:

```text
src/features/events/{event}/action.ts
```

when player/game state must also be changed.

---

# 21. Polling Rules

Default polling interval:

```text
5 seconds
```

However, polling must never cause overlapping batches.

Incorrect:

```text
0s   → Batch A
5s   → Batch B
10s  → Batch C
```

when Batch A is still processing.

Correct:

```text
0s
 ↓
Batch A starts
 ↓
Batch A processing
 ↓
5s poll
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

The worker must wait for the active batch to finish before processing another batch.

---

# 22. Transaction Claiming

Pending transactions must be atomically claimed.

The lifecycle is:

```text
PENDING
   ↓
PROCESSING
```

before the external operation is executed.

This prevents the same transaction from being processed multiple times by the same or another worker.

Do not simply:

```text
find all PENDING
```

and then process them without a claim mechanism.

---

# 23. Batch Processing

Transactions must be processed in batches.

Example configuration:

```ts
const transactionWorkerConfig = {
  pollIntervalMs: 5000,
  batchSize: 50,
};
```

The exact values may change.

Do not hard-code assumptions that prevent future configuration.

---

# 24. Transaction Idempotency

Transaction processing should be idempotent wherever possible.

Before performing an external operation, consider whether the operation could already have been executed.

Avoid:

```text
retry
 ↓
send blockchain transaction again
```

when the first transaction may already have succeeded.

External transaction identifiers, hashes, nonces, or equivalent provider-specific identifiers should be used where appropriate.

---

# 25. Transaction Errors

Errors are valid transaction outcomes.

Example:

```text
Blockchain operation fails
        ↓
transaction status = ERROR
        ↓
transactions-processed
```

The error should contain enough information for debugging and auditing without exposing sensitive information.

Never silently discard transaction failures.

---

# 26. Player State and External Transactions

External transactions may affect player state.

Example:

```text
withdraw
   ↓
reserve player balance
   ↓
create pending transaction
```

Then:

```text
SUCCESS
   ↓
finalize state
```

or:

```text
ERROR
   ↓
release/restore state when appropriate
```

Player state changes should use the existing application/game event and repository architecture.

Do not create a second player-data system inside `/server`.

---

# 27. Assets

All game assets belong under:

```text
public/game/
```

Never use:

```text
src/assets/
```

for game assets.

Use stable URLs:

```text
/game/sprites/players/player.png
/game/items/iron-sword.png
/game/effects/explosion.png
```

---

# 28. Testing Requirements

Use Vitest.

Important actions should have:

```text
action.ts
test.ts
```

Tests should cover:

- valid input
- invalid input
- game rules
- state transitions
- persistence
- edge cases
- transaction creation
- transaction claiming
- batch processing
- successful processing
- failed processing
- duplicate processing prevention
- long-running processing
- empty queues

Use:

```text
tests/integration/
```

for integration tests.

Use:

```text
tests/fixtures/
```

for shared fixtures.

---

# 29. Mocking Blockchain Operations

Tests and development must be able to simulate blockchain operations.

Do not require real blockchain transactions for ordinary development tests.

Mock:

```text
get balance
transfer
transaction lookup
asset lookup
broadcast
```

as appropriate for the chain module.

The server transaction processor must be testable independently of real blockchain infrastructure.

---

# 30. Development Workflow

When implementing a feature:

### Step 1 — Understand

Read:

```text
docs/LOVABLE_TEMPLATE_ARCHITECTURE.md
```

and inspect existing code.

### Step 2 — Find existing functionality

Search for:

- existing schema
- existing type
- existing event
- existing store
- existing repository
- existing game rule
- existing chain module
- existing component

### Step 3 — Choose the correct layer

Ask:

```text
Is this UI?
Is this game-world behavior?
Is this game logic?
Is this player/application logic?
Is this persistence?
Is this blockchain logic?
Is this asynchronous external transaction processing?
```

Put the code in the corresponding layer.

### Step 4 — Implement

Prefer the smallest change that fits the architecture.

### Step 5 — Test

Add or update tests.

### Step 6 — Verify

Run the appropriate test suite and verify architecture boundaries.

---

# 31. External Transaction Workflow

For a new withdrawal/deposit/marketplace transaction:

```text
1. Define transaction data contract.
2. Add/update Zod schema.
3. Create application event.
4. Validate player state.
5. Create pending transaction.
6. Add transaction handler behavior.
7. Use existing chain module for blockchain operations.
8. Update player/game state when required.
9. Record success or error.
10. Add tests.
11. Test duplicate processing protection.
12. Test failure handling.
13. Verify processed transaction creation.
```

---

# 32. Do Not Add Unnecessary Abstractions

Do not create an abstraction merely because another project might eventually need it.

Before creating:

```text
manager
service
controller
repository
adapter
factory
provider
wrapper
helper
```

ask:

1. Does an existing abstraction already handle this?
2. Does the new abstraction have one clear responsibility?
3. Is it required by the architecture?
4. Will it reduce duplication or complexity?

Prefer simple code when a new abstraction does not provide meaningful architectural value.

---

# 33. Forbidden Architecture

Never create:

```text
React → MongoDB

React → Phaser internals

Phaser → React components

Phaser → MongoDB

Zustand → MongoDB implementation

GameBridge → MongoDB

GameBridge → blockchain

GameBridge → major game rules

React → raw blockchain RPC

Game code → raw blockchain RPC

server/smart-contract/chains/

Duplicate blockchain modules inside /server

Duplicate game rules inside /server

Duplicate player systems inside /server
```

---

# 34. Security Rules

Never expose:

- private keys
- seed phrases
- recovery phrases
- database credentials
- server secrets
- privileged RPC credentials
- server-only environment variables

to browser code.

Never trust browser configuration for security-sensitive server decisions.

Shared configuration may determine the application environment, but server-side security enforcement must remain server-side.

---

# 35. Architecture Boundaries

Always maintain:

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

Game world:

```text
React
 ↓
Game Bridge
 ↓
Phaser
```

Blockchain:

```text
Game Event
 ↓
Chain Module
 ↓
Blockchain
```

External transactions:

```text
Application Event
 ↓
transactions-pending
 ↓
Smart-Contract Worker
 ↓
Transaction Handler
 ↓
Chain Module / Game Event
 ↓
Blockchain / Player State
 ↓
transactions-processed
```

---

# 36. Future Next.js Conversion

The architecture must remain portable to Next.js.

Do not introduce architecture that makes future conversion unnecessarily difficult.

Preserve:

- React
- Phaser
- Zustand
- Zod
- Game Bridge
- Game Rules
- Game Data
- Chain Modules
- Events
- Repositories
- MongoDB
- Transaction Worker

A future production application may add:

```text
app/
├── api/
└── ...
```

without requiring the game to be rewritten.

---

# 37. Final Rules

When uncertain, prioritize:

1. Existing architecture.
2. Existing modules.
3. Existing schemas.
4. Existing events.
5. Existing repositories.
6. Clear separation of responsibilities.
7. Minimal duplication.
8. Testability.
9. Portability.
10. Simplicity.

Do not bypass the architecture to make a feature work quickly.

Do not create shortcuts that move database, blockchain, or business logic into UI components.

Do not duplicate systems that already exist.

The goal is to keep the project easy for both humans and AI agents to extend without degrading its architecture.

---

# 38. Quick Reference

```text
UI
→ src/components/

Game/Application Events
→ src/features/events/

Shared State
→ src/features/stores/

Types / Zod
→ src/features/types/

Phaser
→ src/game/

Game Bridge
→ src/game/bridge/

Game Data
→ src/game/data/

Game Rules
→ src/lib/game/

Configuration
→ src/lib/config/

Authentication
→ src/lib/chains/providers/

Blockchain
→ src/lib/chains/modules/

Database
→ src/lib/modules/{collection}/ (mock store: src/features/stores/mock/database.ts)

Server Transaction Worker
→ server/smart-contract/

Pending Transactions
→ MongoDB: transactions-pending

Processed Transactions
→ MongoDB: transactions-processed

Public Game Assets
→ public/game/

Integration Tests
→ tests/integration/

Fixtures
→ tests/fixtures/
```

# Final Instruction

**Before writing code, determine which layer owns the responsibility.**

If the requested feature does not clearly fit an existing layer, inspect the architecture document and existing implementation patterns before introducing a new architectural layer.

Preserve the architecture unless the user explicitly requests an architectural change.
<!-- LOVABLE:END -->

# Auth decisions
- Each chain module splits into wallet/ (browser-only: extension/WalletConnect signing, player transfers) and server/ (verification, treasury payouts, RPC reads), each with events/{event}/action.ts and an index.ts barrel; shared client.ts/types.ts stay at the chain root. providers/{chain}/sign.ts imports from wallet/, verify.ts from server/ (why: secrets and server crypto never mix with browser wallet code).
- Auth lives in src/lib/chains/providers/{email}; wallet login = HMAC-signed challenge → wallet signature via module signer → server verify via module verifier (why: stateless, no private keys ever requested).
- Hive login uses hivexph-sdk (Keychain client for signing, shared rpc client for account keys) plus @noble/secp256k1 for key recovery; @hiveio/dhive is a devDependency used only to generate reference signatures in tests (why: one SDK for all Hive traffic).
- Solana login: Phantom/Solflare/Backpack via injected providers, MetaMask via @metamask/connect-solana (standard:connect + solana:signMessage); all yield ed25519 detached sigs so one verifier covers all (why: no per-wallet server code).
- Enabled chain set via config.auth.chain (single value) — at most one chain provider.
- Persistence: one folder per collection in src/lib/modules/{collection}/ (server.model/types/repository.ts); mock store in src/features/stores/mock/database.ts, only repositories touch it (why: swap to MongoDB without touching callers).
- DB connection lives in src/lib/config/database.ts: MONGODB_URI set → lazy shared MongoClient ("mongodb" mode); unset → "mock" mode and the module is never touched (why: single place decides the storage backend).

# Chain module decisions
- Chain-specific settings (endpoints, application id, signing env var NAMES) live in src/lib/chains/modules/config.ts; src/lib/config/config.ts is app config only. The SDK's own defaults (RPC/beacon URLs) and token symbols/precisions are NOT duplicated there — pass tokens directly in each action file and only add config entries to override the SDK.
- Hive operations use hivexph-sdk via one shared client in src/lib/chains/modules/hive/client.ts (why: single RPC engine, lazy server-side key resolution).
- Chain events return HiveActionResult instead of throwing (why: the worker must record ERROR outcomes, never lose failures).
- Chain event actions accept an optional `client` for injection (why: testable without real blockchain infrastructure).


# Transaction Polling Rule

- The poller (server/smart-contract/polling) reads and writes only through the transactions-pending and transactions-processed repositories (why: it works unchanged on the mock store and on MongoDB).

- Smart-contract worker is unified: server/smart-contract/processor routes `chain:action` to handlers; in mock mode the app runs one poll cycle every few seconds via a dev-only hook calling runTransactionBatch, in live mode a separate worker process runs the same poller (why: one code path, no mock/live duplication).
