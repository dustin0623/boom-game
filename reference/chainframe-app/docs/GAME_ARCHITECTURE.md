# Chainframe game architecture

### Equipment upgrade rejection boundary

The shared equipment upgrade owner validates affordability for every requested level before spending, using the existing per-level stat rounding and SPARKS formula. Worker dispatch submits the full signed count to that owner within the existing ordered operation. Each level retains its original debit, equipment update, XP and log behavior. The guarded SPARKS debit distinguishes an acknowledged zero-match update from an applied write: a zero-match result does not establish a resource effect, while matched writes, earlier effects and ambiguous acknowledgments still require the existing uncertainty protection. Insufficient funds without effects finish as a rejected processed receipt (top-level status `failed`) and remove the pending action; they do not enter reconciliation. Existing reconciliation records are not automatically reclassified or replayed.

### Chainframe identity and prelaunch cutover

The application/package is Chainframe (`chainframe-app`). The sole protocol owner, [Hive client](../lib/chains/modules/hive/client.ts), uses `chainframe-game` for Custom JSON and SDK application identity, with version `1` unchanged. Old game IDs are unsupported; there is no dual-ID intake or translation. Login challenges say “Sign in to Chainframe” and Keychain action messages say “Chainframe game action: …”; verification, nonces, authority and bearer transport are unchanged. Browser authentication uses `chainframe-auth` and `chainframe.token`, without reading or migrating old keys. Fresh authentication is required after cutover. The ordered-operation singleton is `chainframe.database.operations.v1`; isolated test databases use generated `chainframe_test_` names with matching cleanup guards.

New outgoing human-readable labels are `Chainframe withdrawal <signature>`, `Chainframe marketplace sale <ref>`, `Chainframe marketplace refund <ref>`, `Chainframe registration refund <ref>` and `Chainframe shop refund <ref>`. SDK actions, incoming JSON envelopes, recipients, signing evidence and finality requirements are unchanged. Persisted memos/intents/receipts are immutable evidence: an earlier memo differing from a newly requested one parks the transfer, without broadcast, rewriting or compensation. Old-brand strings in deliberate rejection tests and immutable-evidence tests are intentional.

The operational database name/default `cryptocore` is an intentional persistence identifier. Keep its URI/configuration, all seven collections/indexes and `hiveStreamCheckpoint` lease ID unchanged. Workspace names, Git remotes, Hive accounts and secrets are outside the brand rename. No migration, historical conversion, cleanup or backfill is provided.

Current assets are [CHAINFRAME wordmark](../public/brand/chainframe-logo.png) (1983×793, alpha), [social preview](../public/brand/chainframe-og.png) (1536×1024) and [HASH coin](../public/brand/hash-token.png) (1254×1254, alpha). Favicon, Apple and Android derivatives retain their existing sizes. [Final image-generation prompts](ASSET_PROMPTS.md#chainframe-brand-artwork) describe the masters. Metadata retains the existing server origin resolution. Referral URLs resolve the current browser origin after mount; exported cards receive that origin instead of reading window during render. ShareStatsModal retains its responsive card preview and image download only; X post text, clipboard handling, copy timers and social-site launches are removed. No production domain is assumed.

Release sequence: stop accepting submissions through worker readiness; finish or review outstanding jobs with the old worker; preserve unresolved records/evidence; stop the old worker and deploy/restart application and worker together; refresh asset caches and reload clients with fresh authentication; verify lease/readiness before accepting gameplay. Never run old/new workers together to bridge identities. This sequence is an operator release requirement, not an automatic application action.

### Authoritative equipment, Luck and raid calculations

The existing shared stat owner resolves scaled permanent stats and staking/Notoriety tables, then adds validated referenced equipment bonuses. Player Luck comes only from staking and equipped bonuses; a shared pure social-success helper adds a separate 25% base chance exclusively for Sabotage and Help, capped at 100%. Both workflows validate the chance before consuming an item. The tick-player owner coordinates backend equipment reads; GET routes read players and batched equipment directly before pure DTO mapping. Profile `stats` is the resolved total before effects; public rival combat values include current effects. Neither stored player totals nor browser-supplied values authorize settlement.

Profile, raid targets, shop informational minerate, Leaderboard and current-output analytics read equipment through its own repository. Existing player batching, authentication, public filtering and 60-second ranking/statistics caches remain. Targets retain their cap/order but no longer prefilter on stored Security, allowing stronger players to be selected for sabotage. The existing `defense` query accepts positive finite decimals and does not authorize attacks.

Raid transfers preserve fractional HASH at six-decimal vault precision, rounded down at transfer boundaries; display remains up to four trimmed decimals. Atomic write-time credit and risk deductions use the same precision as their returned amounts, so logs, Notoriety and stolen milestones reflect actual effects. After player/self/eligibility checks, raids settle attacker and defender mining sequentially at the captured action time and reread both before charge reservation and simulation. Defender mining settles before its effects are cleared; loot, free space and failure risk use current persisted vaults. Existing ordinary write guards, protection and confirmation ownership remain; historical raids are never recalculated or compensated.

Worker and browser share strict Hack Power > Security eligibility, Firewall blocking and raid-only Exploit criticals. Social Luck failures are completed processed outcomes with safe success/consumption metadata on existing logs and receipt results. Unknown writes park under the ordinary action guard. Personal history alone owns confirmation and refreshes; no timer is added.

Mining splits uncredited intervals at the shared `EQUIPMENT_STATS_EFFECTIVE_AT` constant and settles before equipment/stat changes. Set its candidate UTC time to the agreed first deployment time before publication, then retain it across app/worker releases. No migration or historical rewrite is provided.

### Hive account names

Hive account-name validation is shared in `lib/utils/hive/validation.ts`. The login form, authentication endpoints, challenge/signature checks, Hive account helpers and signed-action targets use the same rules: trim and lowercase input, preserve digits/hyphens/dots, enforce total length 3–16, and require each dot-separated label to contain at least three characters, start with a letter and end with a letter or digit. Underscores and other punctuation are rejected. Name syntax does not establish ownership: Posting-signature verification, on-chain authority checks, expiring single-use nonces and bearer sessions remain required.

### Account Histories

The pure [log presentation owner](../lib/utils/logs/presentation.ts) supplies historyEntry messages to completion toasts and Recent history. historiesEntry reuses those messages with modal-specific raid direction tones, upgrade detail and global-sales wording. receiptEntry supplies readable receipt-only fallbacks to the existing personal-history coordinator; it does not create another confirmation or toast owner. Item quantities, amounts, currencies and refund/payout stages come from public recorded evidence. Missing or malformed optional details are omitted rather than fabricated, and rich text agrees with the plain message. Unsupported marketplace records use neutral notification wording while strict market-row validation is preserved. Correlation deduplication, initial-hydration suppression, refresh timing and session guards remain unchanged.

The account menu opens [HistoriesModal](../components/modals/HistoriesModal.tsx) for authenticated wallets, including wallets awaiting registration. Its selector defaults to Claims and has no personal All selection. Every selection shows at most its latest 100 logs, without Load more. `/api/logs` accepts an optional supported category; omission preserves the personal confirmation poller and its cursor pagination. The logs repository applies category and participant restrictions before the limit. The existing personal-market and global-sales routes remain separate views with explicit HIVE currency.

The modal owns only rendering, selector state and session-scoped SWR reads. It fetches on entry, selection, focus and explicit Refresh without a timer or automatic retry. Closing, switching or reconnecting unmounts visible history and rejects late responses. Safe payment-unit and compensation fields are explicitly selected; raw seeds, signing evidence and internal errors remain excluded. Raid colors indicate direction rather than outcome. Recorded logs remain independent of Recent history, Submitted and authoritative receipt confirmation; opening Histories creates no observer, poller, write or completion toast. All 17 API route paths remain present.

The unlaunched game supports current contracts only: Equipment Chests, stat-specific social effects, JSON payment envelopes and explicit HIVE marketplace currency. There are seven production hooks. Unsupported stored financial evidence is parked, never upgraded or converted. UI consumers import unstyled Radix primitives directly; styled components remain locally owned. TypeScript rejects unused locals and parameters, and architecture tests reject unreachable production modules and forwarding exports.

### Published SDK dependencies and deployment

Consume `hivexph-sdk` only through published npm releases. The current exact pin is 1.2.2 in package.json and pnpm-lock.yaml. The 2026-10-22 upgrade passes the eight-case independent signing gate and fixes SDK abort-listener cleanup during polling and reader-stream shutdown. An offline check of the published sleep helper leaves zero abort listeners after 100 completed waits. SDK changes belong upstream; do not edit installed files, use a local checkout/alias, patch dependencies or rewrite them during installation. A new published release must pass the independent native-signing gate and application compatibility checks before acceptance.

Commit the application source, package.json and pnpm-lock.yaml; keep node_modules ignored. Vercel installs the committed dependency graph with `pnpm install --frozen-lockfile`. Run the persistent smart-contract worker separately from the Vercel application, using the same verified dependency version. Build/deployment must not depend on temporary checkouts or local cache files. The current worker still waits for irreversibility and rereads canonical blocks through the existing SDK APIs. Bounded network deadlines and a single SDK irreversible iterator remain unimplemented; the rollback does not fix prolonged network waits.

### Internal treasury reconciliation

Native payouts continue through the shared `hivexph-sdk` client and its public native-transfer API. Published SDK 1.2.1 passed the independent HIVE/HBD signing release gate on 2026-10-15 before being pinned exactly in the application and lockfile. Its internal native-asset signing correction resolves the defect reproduced against 1.2.0; public payment symbols, transfer APIs, type declarations and memo envelopes remain unchanged. Preserve [the historical reproduction, verification and recovery requirements](HIVE_SDK_PAYOUT_REPRODUCTION.md), and require future SDK releases to pass the same gate before updating the exact pin. No application serializer, currency conversion, dependency patch or dhive payment implementation is permitted. Test-only synthetic signing fixtures intercept every RPC and use an independent verifier; dhive's production use remains login signature verification. Deploy matching dependencies and fully restart application/worker processes after validation; existing parked payouts still require exact-evidence operator recovery.

Treasury send errors retain an internal exception cause while worker logs select only source/transfer identities, processing stage and allowlisted codes. Missing transaction IDs and SDK exceptions are distinguished, and reconciliation parking is explicit. Raw SDK/RPC errors, credentials and signed transactions never enter diagnostic logs or public responses. Diagnostics do not alter payout eligibility, clear a claim or retry an uncertain broadcast. Registration/Shop source completion remains independent of a retained referral payout.

`reconcileTreasurySettlement(jobSignature, key, transactionId)` in [treasury/reconcile.ts](../server/game-smart-contract/features/events/treasury/reconcile.ts) is an internal operator entrypoint, not an HTTP endpoint, CLI or automatic task. The signature identifies pending work, the key identifies its durable transfer intent, and the transaction ID supplies exact blockchain evidence. It uses the normal verifier: recorded account alias/sender, recipient, symbol, amount, memo, operation identity and irreversible execution must match. Pending evidence cannot resume settlement; missing routing evidence and mismatches require review. A verified pending intent may resume through the normal payment drain; archived intents do not recreate deleted jobs. It never broadcasts, guesses missing intent data or bypasses an interrupted ordinary database-effects guard.

This is the architecture guide for the current root-level Next.js application. Read [GAME_MECHANICS.md](GAME_MECHANICS.md) for gameplay rules and implementation differences. This document replaces the former template architecture and backend/runbook documents referenced by older comments.

The application is wallet-only, Hive-only and MongoDB-only. There is no runtime mock persistence, demo player, local gameplay simulation, multi-chain registry or compatibility API for retired gameplay mutations. The `reference/` application is comparison material, not a runtime dependency or a source of game policy.

### Public player documentation

About $HASH shows only PeakD, Discord and Tribaldex trading links. PeakD uses the existing public treasury-account configuration; an unset treasury account displays as unavailable rather than creating a broken link. Discord links directly to https://discord.gg/tBBPhRt7kW without an environment variable. Tribaldex points directly to the HASH market. The former token-contract/copy panel, unrelated social links and its clipboard timer are removed; no additional state, subscription or API is involved.

The public [Wiki](../components/pages/WikiPage.tsx) is a rendered player guide: quick start and access rules, currencies, mining/upgrades, equipment, raids/effects, shop/trading, transfers, progress/history and reference help. Static content remains server-rendered; [Wiki navigation](../components/wiki/WikiNavigation.tsx) owns only the mobile section selector and desktop anchor selection, with no subscription, API read or game state. Examples reuse existing public constants and pure calculations. Exact settlement behavior is distinguished from observations and client estimates. Known client/worker differences are described without changing gameplay. Native expandable details and labelled tables keep formulas and limitations accessible.

## 1. Runtime and authority

Chainframe has a Next.js web application and a separate Node smart-contract worker. The worker is an off-chain processor of Hive operations; gameplay is not executed by a native Hive virtual-machine contract.

| Runtime               | Responsibility                                                                                            | What constitutes authority                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Browser               | Render snapshots, collect input, ask Keychain to sign, poll personal history, display blockchain activity | No local balance, inventory or progression mutation is authoritative |
| Next.js server        | Authenticate requests, coordinate read workflows, issue/verify login challenges, return normalized DTOs   | JWT authorizes reads; repositories provide persisted state           |
| Smart-contract worker | Observe irreversible operations, execute game rules and settle payments                                   | Ordered MongoDB writes record outcomes, logs and receipts            |
| Hive / Hive Engine    | Record signed Custom JSON and native/token transfers                                                      | An observed submission is evidence of broadcast, not game settlement |
| MongoDB               | Persist players, items, activity, statistics, queued work and receipts                                    | The source of truth for game state and processing outcomes           |

React, Zustand, Zod, Mongoose, `hivexph-sdk`, SWR and Vitest are the main application tools. Next.js uses App Router. React Query is installed at the app provider boundary; shop pricing currently uses SWR. The game has no Phaser runtime.

## 2. File ownership and dependency direction

```text
GET route -> collection repository -> MongoDB -> pure DTO mapping
Wallet balance GET -> Hive balance-read event
Application write -> shared backend feature event -> collection repository -> MongoDB
Smart-contract worker -> local feature event -> shared gameplay / repository / Hive server event
Component / hook / store -> frontend feature event -> API or Hive wallet operation
Login feature -> focused Hive authentication provider -> SDK / authority event
Authenticated activity panel -> local Submitted metadata / authenticated Stats reads
```

| Location                           | Owns                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `app/`                             | Pages/layouts and HTTP boundaries: parsing, session resolution, CORS, status codes, serialization                           |
| `components/`                      | Presentation, accessibility, forms, dialogs and local interaction                                                           |
| `hooks/`                           | React lifecycle, subscriptions, timers and cleanup                                                                          |
| `features/events/frontend/`        | Browser submission, authentication, readiness and confirmation workflows; preserve client entry points and supporting files |
| `features/events/backend/`         | Authoritative gameplay, authentication verification, initialization, pricing workflows                                      |
| `features/stores/`                 | Session state and transient player, inventory, history, confirmation and clock caches                                       |
| `features/types/`                  | Shared contracts and existing pure gameplay calculations; this folder currently contains more than type declarations        |
| `features/types/game/templates.ts` | Static equipment/cosmetic templates, catalog contracts and pure lookup/unlock helpers                                       |
| `lib/modules/`                     | Collection models, persistence types and repositories only                                                                  |
| `lib/config/`                      | Server configuration, lazy MongoDB connection and shared constants                                                          |
| `lib/chains/modules/hive/`         | One configured SDK client, fixed game ID/version constants and wallet/server blockchain operations                          |
| `lib/chains/providers/hive/`       | Login connection, signing and server-side ownership verification                                                            |
| `lib/utils/`                       | Focused pure helpers and explicitly server-only infrastructure                                                              |
| `lib/auth/`                        | Challenge/JWT primitives and request-session helpers                                                                        |
| `lib/api/`                         | Browser HTTP client, public DTOs and transport helpers                                                                      |
| `server/game-smart-contract/`      | Worker startup, stream iteration, scheduling, backoff and shutdown                                                          |
| `tests/`                           | Deterministic test fixtures, boundary checks and integration tests                                                          |
| `public/`                          | Static game and UI assets                                                                                                   |
| `reference/`                       | Independent reference application; do not import its runtime into the game                                                  |

Frontend events coordinate existing HTTP APIs and Hive wallet operations; backend events coordinate repositories and Hive server operations. Repositories own Mongoose queries, ObjectId conversion, guarded writes and normalization. Each repository queries its own collection. GET routes may combine results from multiple repositories without a forwarding read event. Cross-collection write workflows belong to feature events and use ordered database operations.

Do not add a generic service layer, aggregate database provider, mixed browser/server barrel or compatibility re-export. Import definitions directly from their owning files, including feature contracts and auth primitives. The former `features/types/index.ts` and `lib/auth/index.ts` barrels are superseded by direct imports. Existing data GET routes import named repository read operations directly; all routes remain forbidden from raw models/Mongoose and repository mutations. Pages, workers, components, hooks and stores cannot import repositories. The worker entry point initializes infrastructure through its dedicated database utility; only that utility directly imports the seven models and Mongoose for startup. Only the two wallet-balance GET routes directly import the Hive balance-read event; transfers and signing remain feature workflows. The earlier all-reads-through-events ownership is superseded.

`lib/api/dto/` contains pure player, inventory/listing, rival, pending transaction and shop-price response mappings. These explicitly select public fields and use erased persistence types. Missing profiles and authentication shells delegate first-touch writes to `player-lifecycle/initialize.ts`; ordinary initialized profiles are returned through a direct read. Explicit eligible prepayment referral attribution uses that same initialization owner, as described below. `shop-pricing` owns emission recording/ratcheting and authoritative purchase quotes, while the GET route reads personal counts and informational minerate and builds its DTO. No compatibility exports or read-service layer is introduced.

### Frontend and backend event ownership

```text
features/
├── events/
│   ├── frontend/    # 11 flat submission/session/confirmation use cases
│   └── backend/     # 14 shared gameplay/authentication/pricing owners
├── stores/
└── types/
```

The former flat event paths are superseded by direct imports from their runtime owner. Whole implementations, supporting files and colocated tests move together; names, exported interfaces and client directives remain unchanged. No runtime-owner barrels, forwarding exports or generic services are introduced. Plain frontend coordination stays framework-independent where it already was. Backend has cohesive owners containing several directly imported operations; the former one-use-case-per-folder backend rule is superseded.

Browser dependency checks start from every frontend production file, including submit helpers. Frontend events cannot import backend events, repositories, models, secrets or Node infrastructure. Backend events cannot import frontend events, stores, React, browser API clients or wallet signing operations. Routes use shared backend events; workers use smart-contract feature events; components/hooks/stores use frontend events. Opposite-tree contract imports are also forbidden, including erased types: contracts belong in shared type owners. HTTP and blockchain remain the communication boundaries.

Authoritative claim, raid, upgrade and withdrawal execution stays in backend even when initiated by a frontend dialog. Personal-history coordination, confirmation subscriptions, readiness preflight and session reset stay in frontend. Existing GET repository reads, profile initialization, emission ratcheting and the two direct Hive balance-read exceptions retain their established behavior.

### Cohesive backend workflows

The shared backend owners are wallet-auth, player-lifecycle, equipment, social-actions, claim-vault, equip-cosmetic, market-listing, purchase-item, raid, request-withdrawal, shop-pricing, stake-vault, tick-player and upgrade-stat. Worker-only process-game-action, payment-processing, treasury and worker-lifecycle belong to the smart contract. There are no owner barrels or compatibility paths. Tests stay beside descriptive implementation files.

Payment intake, sequential draining, dispatch and individual settlement files share the smart contract's payment-processing owner. Registration/shop native HIVE refunds use one refund-native workflow with their original transfer keys, memo bytes, log types and private receipt metadata. It retains confirmation-before-writes, existing receipt reuse and the same log/mark/lease/receipt order. Pending transfers propagate without spending failure retries; other uncertain outcomes retain existing parking. Marketplace native HIVE refunds and withdrawal compensation do not use this helper because their durable recovery rules differ. Pure observation classification belongs in smart-contract utils/payment.ts; caller-specific identity, memo, amount and rejection ordering remain in settlement.

Help and sabotage share socialActionInput from the consumable contract owner and preparation for locks, rate limits and participant/inventory checks. The stat-target contract has the same owner to avoid circular imports. Effects remain separate: Help uses compare-and-set replacement; Sabotage retains protection checks and mining settlement. Compensation and post-effect log-failure behavior remain unchanged. Equipment files retain distinct equip/unequip guards and use the existing pure upgrade-cost calculation directly.

Worker acquisition returns a captured lease with check, markStarting, markBlockChecked and release methods. check reports unsuccessful renewal without publishing readiness; database errors propagate unchanged. The worker retains heartbeat timers, non-overlap, abort and lease-loss handling. Pending gameplay recovery loads saved submissions and passes them sequentially to the same guarded processing callback after the initial transient block position is captured. No persistent checkpoint or extra stream/poller is introduced.

### Smart-contract runtime ownership

```text
server/game-smart-contract/
├── index.ts
├── workers/
├── features/
│   ├── events/
│   │   ├── process-game-action/
│   │   ├── payment-processing/
│   │   ├── treasury/
│   │   └── worker-lifecycle/
│   └── types/
│       ├── processing.ts
│       ├── settlement.ts
│       └── stream.ts
└── utils/
    ├── database.server.ts
    ├── payment.ts
    └── wait.ts
```

The smart contract owns worker-specific workflows, contracts and utilities. Application routes/backend events, repositories and shared utilities never import worker internals, including erased type contracts. Smart-contract events may call shared gameplay, repositories and Hive server operations; workers retain iteration, timers, retries, cancellation and shutdown. Browser graphs exclude the entire server folder. No copied implementations, forwarding exports or additional SDK client are introduced.

Database startup still uses the shared lazy connection owner and initializes the seven models/indexes. Shared ordered-write infrastructure, game execution context, RNG, operation identity, protocol, activity decoding, payment contracts and pricing remain outside the worker because application/repository consumers use them. The former contract-runtime database utility and application processing/settlement type locations are superseded.

One abortable wait utility handles startup recovery, finality waits and stream retry backoff with existing durations and listener cleanup. Fresh processes still start at the latest irreversible block; in-process recovery retains memory, and pending recovery follows initial position capture. Sequential gameplay and payment drains, lease readiness, irreversible canonical rereads and settlement parking remain unchanged. The existing smart-contract command and entry-point path remain. Tests stay colocated with descriptive *.test.ts names, including process-game-action/action.test.ts.

The 20 production files in lib/utils are grouped into exactly four folders:

- `game`: protocol/schema, browser-safe authority validation, activity decoding, payment memo contracts, mining projection, emission/pricing calculations and shared server execution/guard helpers.
- `hive`: operation decoding, account/decimal validation, safe SDK error/result normalization, public wallet configuration and server-only signature helpers.
- `logs`: cursor contracts, participant selection, safe metadata and viewer-specific presentation.
- `database`: shared nested direct-operation coordination and interrupted-operation errors. Worker initialization/disconnection lives in smart-contract utils/database.server.ts. Treasury uncertainty errors live beside treasury dispatch in feature events.

Keep the existing `cn` helper in `lib/utils.ts`; import utility subfolders explicitly.

Utility consolidation preserves separate browser/server boundaries. game/hive-activity.ts owns pure worker intake decoding; game/rng.server.ts retains Node seed generation. game/pricing.ts combines emission keys, UTC-day calculations, HASH pricing, integer HASH and milli-HIVE totals and fixed HIVE amounts without repository access; the pricing feature retains emission recording, caching and ratcheting. Processor validation and its single GameActionRejectedError definition live in smart-contract features/events/process-game-action/validation.ts. Raid calculations live beside backend raid in calculations.server.ts; shared gearExploitOf implementations live in features/types/game/stats.ts, avoiding a reverse dependency or an item/stats cycle. database/operation.server.ts owns DatabaseOperationUncertainError and ordered writes; importing it never connects to MongoDB. game/action-guards.server.ts retains the existing shared lock/rate-limit state. logs/presentation.ts remains separate from history contracts and private transaction metadata. The former game-stats and market utility folders, separate database error file and shared raid/processor-validation paths are superseded. Both charge-regeneration implementations retain their different existing behavior.

## 3. Collection persistence

Each of the seven MongoDB collection folders contains exactly:

```text
server.model.ts
server.types.ts
server.repository.ts
```

| Collection               | Mongoose model         | Responsibility                                                                                                                                 |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `players`                | `Player`               | Identity, login nonce, profile initialization, registration, balances, levels, charges, effects, equipment references, cosmetics and referrals |
| `equipments`             | `Equipment`            | Individual rolled gear, ownership, upgrades, salvage and embedded marketplace reservations                                                     |
| `items`                  | `InventoryItem`        | Unique wallet/item-ID stacks with guarded non-negative safe-integer quantities                                                                 |
| `logs`                   | `Log`                  | Activity outcomes, participants and correlated history                                                                                         |
| `game-stats`             | `GameStat`             | Numeric counters, emission ratchet, global minerate and reserved exclusive worker lease                                                        |
| `transactions-pending`   | `InboundTransaction`   | Financial queue, gameplay claims, execution context, retries, parked reconciliation and embedded treasury transfers                            |
| `transactions-processed` | `ProcessedTransaction` | Terminal gameplay/payment receipts and private archived treasury tracking                                                                      |

The inventory split explicitly replaces the equipment-only items collection with equipments and introduces stackable items. No runtime conversion or compatibility reader is provided. Preserve other collection names, reuse guards and indexes. The items wallet/item-ID unique index and bounded atomic increments prevent duplicate stacks and quantity overflow. Keep tests, workflows, formatting and calculations outside collection modules.

Important indexes include player wallet/username uniqueness, pending signature uniqueness and status/creation ordering, processed transaction identity uniqueness, archived transfer-key lookup, participant history ordering and marketplace lookup indexes. These are persistence details; callers use typed repository operations.

### Direct MongoDB operations

`lib/config/database.ts` owns the reused lazy Mongoose connection. Missing `MONGODB_URI` or a failed connection is an error; there is no memory fallback. Imports and production compilation never connect to MongoDB.

The application supports standalone self-hosted MongoDB. Use the existing URI, port, credentials and database; no replica-set configuration, session or transaction-support probe is required. Local examples are `mongodb://localhost:27017/cryptocore` or `mongodb://localhost:2707/cryptocore` for an instance actually listening on 2707. Keep `MONGODB_DB` unchanged. The worker loads `.env`; Next.js may override settings through `.env.local`.

`withDatabaseOperation` serializes outer write workflows within each process, and nested workflows join the same operation. Repositories continue using atomic single-document writes, unique indexes and guarded claims. Multi-document sequences execute directly: they have no rollback, isolation from other processes or all-or-nothing visibility. The earlier replica-set setup and transaction guarantee are superseded by this direct-write design.

Ordinary gameplay, registration, shop and deposit writes retain the databaseEffectsStarted guard. Raids have the versioned recovery and durable isolation exception below; other interrupted or ambiguous ordinary effects remain parked for review. Withdrawal and marketplace version-1 workflows instead use private single-document reservations and keyed effects to recover proven steps. They never infer completion from an unproven write or automatically resume unsupported financial evidence. Validation and acknowledged mining/charge preparation retain the existing handling; preserve original timestamps and seeds.

Success receipts follow effects, logs and statistics. Withdrawal/market recovery markers remain until the terminal receipt is durable; finalization archives verified treasury tracking before deleting pending work. A visible log alone is not confirmation. Treasury reconciliation can resume proven financial workflows, but cannot bypass an interrupted generic database-effects guard. Unknown broadcasts remain parked without another transfer.

First-touch profile initialization uses a single-document initialization guard plus ordered referral/statistics writes. A mid-sequence failure can leave partial initialization metadata; it does not roll back or award initialization twice. This limitation also applies to registration and aggregate changes interrupted across collections. Run one authoritative worker under the existing persisted lease.

Run `pnpm exec vitest run tests/integration/mongodb-standalone.test.ts` against `MONGODB_URI`. Tests use generated isolated databases and never clean the application database or send payments. Then run the full checks and restart Next.js and `pnpm run server:smart-contract` to load the changed Mongoose schema/runtime. No MongoDB service reconfiguration is needed. The worker must acquire its lease and capture the latest irreversible starting block before accepting gameplay. The browser does not watch blocks; local broadcast acknowledgement does not mean the backend processed an action.

Game timestamps exposed to clients are Unix milliseconds. Mongoose Date/ObjectId fields are normalized before crossing HTTP boundaries. Log pagination uses `recordedAt` plus ID; receipt pagination uses `processedAt` plus ID. Both directions use stable tie-breakers for equal timestamps.

### Special records inside existing collections

- `game-stats/globalMinerate` stores registered players' level-based hash-rate contributions. Missing means zero. Pricing applies its minimum locally without writing that minimum into the aggregate.
- `game-stats/hiveStreamCheckpoint` stores the exclusive expiring worker lease, workerReady and lastCheckedAt timestamps; no persistent block position. The legacy document ID is retained for lease continuity; any old checkpoint fields are ignored and never read or updated. Numeric statistics helpers exclude/reject this reserved document.
- Player login nonce fields store a SHA-256 hash and expiration; they are excluded from normal reads. Expiration invalidates a challenge and never deletes the player.
- Pending `treasuryTransfers` record exact intent and broadcasting/submitted/confirmed/failed stages. Confirmed and failed require verified transaction, operation, block and verification time. Terminal receipts archive these private records before pending deletion. Withdrawal reservations on players, purchase reservations on items, unique settlement keys on logs and effect markers on statistics never enter public DTOs.

### Registration event starter pack

The fixed Chainframe Invite Challenge window is 2026-10-19T00:00:00.000Z inclusive to 2026-11-02T00:00:00.000Z exclusive (08:00 Singapore). After exact irreversible native-payment verification, registration requests an optional canonical block reread for the payment timestamp and exact transfer operation. Missing identity/time evidence parks the job; browser time and queue time never authorize awards.

The registration backend coordinates 4 unopened Equipment Chests, 10 Sabotage Devices and 10 Help Kits through the existing items repository, in addition to the atomic 10 HASH registration transition. A private write-once registrationStarterPack decision and acknowledged item grants live on the existing pending job and are archived on its receipt. Existing supported queued jobs can capture a decision only before effects start and while the player remains unregistered; completed registrations receive no backfill. Generic interrupted-write parking remains authoritative: partial grants are retained for review, never automatically repeated or compensated. Success follows all grants, logs and counters. Referral recovery checks archived reward evidence before cleanup and never repeats the primary rewards.

Only recorded startingItems (known item IDs and positive quantities) enter public logs/receipts. The personal-history owner already refreshes inventory and players and remains the sole confirmation/toast owner. The registration dialog shares the existing one-second clock for copy only; no poller, endpoint, collection, index, SDK update or financial-workflow upgrade is added. Discord invitation tracking, staff verification and 150 HIVE prize payments are outside application automation. Deploy application and worker together after outstanding-job review, then reload clients and verify lease/readiness. Never shift the event window or backfill operational records as part of deployment.

## 4. Authentication and registration

The focused Hive provider contains `connect.ts`, `sign.ts` and `verify.server.ts`, with colocated tests and no barrel.

1. The client authentication feature normalizes/connects the entered Hive username. Connection only checks input and Keychain availability.
2. `POST /api/auth/challenge` calls the challenge feature, which creates a single-line, versioned HMAC-protected challenge with the normalized account, random 32-byte nonce and five-minute expiration, then stores the nonce hash/expiration on the player. The single-line representation is required for compatibility with Hive Keychain mobile's sign-buffer bridge.
3. Provider signing uses the shared SDK Keychain message-signing flow with Posting authority and the exact challenge bytes. Its serialized SDK response preserves the current verify API contract. The verifier continues to accept valid, unexpired legacy multiline challenges already issued before the format change.
4. `POST /api/auth/verify` calls the login feature. It validates the response/challenge and delegates ownership proof to the server provider.
5. The provider recovers/verifies the signature and reads the account's current Posting authority through a Hive server event. The single signing key must satisfy its threshold; unsupported insufficient/delegated arrangements fail.
6. The login feature atomically consumes the matching unexpired nonce and issues the existing seven-day HS256 bearer JWT. Forged success flags are not ownership proof.

New challenges replace previous ones. Failed proof or unavailable account lookup does not consume the nonce. Concurrent verification succeeds once. JWT creation failure does not restore a consumed nonce.

The client surfaces the challenge/verification API's error text when login fails; it must not hide the reason behind a generic wallet-verification toast. Login requests a Posting message signature, not a Custom JSON broadcast. Login nonce writes are atomic single-document operations; wallet ownership verification and worker startup do not require database transactions.

After changing Mongoose schemas, restart the Next.js development server and any affected worker. Model reuse guards deliberately keep an already compiled model alive across hot reloads; source changes alone do not update that model's schema. A cached Player model without the login nonce fields can silently discard them during challenge issuance, then reject the valid signature when nonce consumption finds no matching record. Signing out does not clear server-side model caches. Never bypass nonce consumption to work around this; restart the affected runtime and request a fresh challenge.

Challenge-only player inserts are unregistered `profileInitialized: false` shells. First authenticated profile retrieval claims first-touch initialization once and writes statistics/referrals in order. Existing records without the marker count as initialized. The historical `registeredPlayers` counter describes profile initialization; `registeredPlayersPaid` describes paid registration.

Ordinary initialized-player profile reads perform no first-touch writes. Missing profiles and authentication shells are rechecked in the ordered operation, and an atomic initialization guard prevents duplicate initialization. An explicit referral link is a narrow exception: an initialized unregistered account with no referrer or registration transaction may accept an existing non-self inviter while no pending or processed registration record exists. The same player-lifecycle owner reads those collection-local repositories and uses an atomic conditional player assignment; only the winner increments the inviter's counter, without repeating profile statistics. Existing referrals, registration outcomes and saved payout obligations remain immutable. These paths support standalone MongoDB and require no migration or backfill.

Browser links use `/?join=<Hive username>`. The authentication workflow captures and normalizes join before asynchronous Keychain approval, then forwards it as the existing `/api/player/me?ref=<username>` query after authentication. Saved-session restoration first verifies the bearer wallet with an ordinary read before sending referral attribution; a token for another wallet cannot attach the invitation to that wallet. Server validation remains authoritative, and the registration dialog shows only the returned referredBy value. No new browser storage, cookie, endpoint or payment memo is introduced. Normal profile refreshes omit ref and stay read-only.

Registration is a separate fixed 75 HIVE payment. Its backend supplies REGISTRATION_STARTING_HASH (10) to the players repository; the conditional single-document registration transition also increments liquid HASH, preserving any existing balance. Registration repeats and competing transitions cannot award twice. Authentication/profile creation stays at zero, with no backfill for existing registered players. The worker records the actual startingHash award in registration log data and successful receipt metadata; amount remains the HIVE fee. Safe public allowlists expose only that award field, and history never assumes a missing award. Interrupted later effects retain existing registration/HASH and park through the existing ordinary-write policy, without recredit or automatic compensation. The reward changes no XP, referral credit or claim/emission counters. Its client workflow retains a broadcast retry guard and subscribes to personal receipts. Only authoritative player data sets registration complete and refreshes the balance. Login ownership does not imply paid registration.

JWT transport is `Authorization: Bearer ...`; cookie auth is not implemented. JWT_SECRET is required in every runtime issuing challenges or tokens: at least 32 UTF-8 bytes, excluding the known development value. Validation is lazy at issuance/verification, so imports and builds need no credentials. Auth persistence restores supported wallet sessions, checks authoritative profile identity, and rejects former demo sessions. Session identity includes address and `connectedAt`, so reconnecting the same wallet invalidates old asynchronous work.

## 5. Signed gameplay processing

### Page authentication and registered gameplay

Homepage and Wiki are the only public application pages. AppShell requires verified wallet authentication for every other page, with no protected-content rendering during hydration/restoration. Marketplace and Leaderboard support authenticated browsing before registration and do not wait for inventory/player hydration. Other game pages still require registration and authoritative caches. Browsing pages show a registration notice and a dismissible explicit entry point; the global forced registration modal remains on other protected game routes, not Homepage/Wiki. Connecting on a protected route retains its controlled internal destination.

Bearer tokens live in the existing browser authentication transport, not cookies. Page shells cannot replace API authorization: marketplace listings, completed sales history, treasury balance and leaderboard reads authenticate before accessing data, including cached results. Login and health remain available. Wallet switching, logout and same-wallet reconnection discard previous-session content and asynchronous results. Browsing remains available while worker signing readiness is unavailable.

```text
Action dialog / API-facing client helper
  -> shared broadcast executor
  -> Keychain Custom JSON
  -> irreversible worker intake
  -> process-game-action feature
  -> gameplay feature / repositories
  -> ordered effects + logs + processed receipt
  -> personal-history poll -> refreshed player/inventory + UI feedback
```

The protocol is version 1, Custom JSON ID `chainframe-game`, with strict `{ version, action, metadata }` payloads. Both immutable configuration constants are defined directly in [the shared Hive client](../lib/chains/modules/hive/client.ts); its SDK applicationId uses the same ID. [The game contract](../lib/utils/game/action-protocol.ts) imports the version and retains schemas/builders. Validation, activity decoding and broadcasting import configuration directly from the client, without re-exports. The raw SDK broadcast requires an explicit ID; SDK configuration does not replace payload or signer validation. Metadata contains a unique action nonce. Withdrawal requests require Active authority; other supported actions require Posting. Required signers are checked against the operation itself, not trusted payload fields.

The shared executor validates input, captures the wallet session, broadcasts once and subscribes to existing receipt observations. Dialog lifecycle remains `idle`, `broadcasting`, `broadcast`, `processed`, `failed`. Forms close immediately on known submission and open the activity popover on Submitted; no transaction-ID/status cards remain in action forms. Captured-session callbacks and duplicate-signing guards survive closure, and confirmation promises still resolve only according to existing receipt requirements. Missing transaction IDs and visible-page confirmation timeouts remain uncertain; never automatically sign again.

The processor serializes action execution and uses durable pending claims. Processing order is claim/retry-limit check, protocol/authority validation, account nonce replay check, timestamp validation, registry dispatch and ordered completion. The registry enforces registration and application-specific ownership/limits. Rule rejection before writes records a failed terminal receipt. Failures before writes retain retryable work; failures after write attempts require review and never claim rollback. Actions exceeding the durable attempt budget require operator review.

Operation identity is transaction ID plus operation index. Logs inherit the execution correlation key. Receipt success means the action was processed: for a raid, a resolved gameplay loss can still have a successfully processed submission. Messages must describe the game outcome rather than infer a win from receipt status.

## 6. Transfer payments and treasury protection

Native HIVE and Hive Engine token payments are separate from gameplay Custom JSON. The SDK builds existing action/metadata memo envelopes. Features choose game assets, amounts and memo intent; generic Hive events perform blockchain operations only.

| Payment intent    | Current asset | Settlement                                                       |
| ----------------- | ------------- | ---------------------------------------------------------------- |
| `registration`    | HIVE          | Fixed fee; mark registered and add minerate once                 |
| `shop_purchase`   | HIVE          | Verify exact catalog payment; grant equipment/consumables        |
| `deposit`         | HASH token    | Verify incoming transfer; credit in-game liquid HASH             |
| `market_purchase` | HIVE          | Verify item/price; pay seller and transfer ownership; forward the recorded fee to treasury |
| Withdrawal job    | HASH token    | Signed request reserves in-game HASH; worker transfers or issues the full payout |

Worker intake recognizes purpose-specific recipients: native HIVE registration/shop and HASH deposits go to treasury; native HIVE marketplace purchases go to market. Wrong recipient/currency never reserves/transfers an item. Durable queueing remains independent from settlement. Native/token verification preserves identity and finality; Engine evidence is required only for tokens. Multiple relevant payments in one transaction require indexed reconciliation.

Financial jobs carry original execution time/seed and run oldest-first in a non-overlapping drain. Pending finality, retryable failure, terminal rejection and uncertain outgoing broadcasts remain distinct. Blockchain intake advances after a payment is durably queued. Verification, payouts and refunds continue in the independent sequential drain; delayed settlement does not hold later blocks. Queue insertion failure, cancellation or lease loss still prevents advancement.

Marketplace settlement atomically reserves the exact listing and keeps ownership with the seller until verified payout. Reserved items cannot be listed, cancelled, equipped, upgraded, salvaged or transferred. Proven payout permits an idempotent ownership change. A definitive seller-payment failure requires a verified buyer refund before releasing the listing. Financial finalization uses keyed log upserts and atomic counter markers, then a terminal receipt, transfer archive and normal evidence cleanup. External transfers are never inside database write callbacks.

Treasury dispatch uses explicit parent job signature, transfer key and exact recipient/asset/quantity/memo:

1. Check the lease, parent job, archived tracking and exact intent. Reuse only verified terminal evidence.
2. Atomically claim broadcasting on the existing parent. Only the claimant can send.
3. Broadcast once outside database callbacks; persist its ID as submitted.
4. Verify sender, recipient, symbol, exact amount, serialized memo, transaction and operation through the Hive event. Require irreversibility and successful Engine transfer execution for tokens.
5. Pending execution or temporary lookup failure stays pending without spending settlement failure retries. Confirmed evidence permits settlement; definitive failure permits its documented compensation path.
6. Missing IDs, thrown broadcasts, mismatches or uncertain persistence park the job. Neither submitted nor failed intents automatically rebroadcast.

Reconciliation accepts explicit job signature, transfer key and transaction ID and uses the same verifier, never a caller-supplied verification callback. It confirms or proves failure and resumes the original job; normal settlement handles compensation. There is no public recovery endpoint or CLI. Older pending entries labelled confirmed without evidence must be verified before reuse; completed historical receipts are not rewritten.

### Marketplace fee forwarding

New marketplace jobs carry private `marketFeePolicyVersion: 1` and capture the treasury recipient at intake while retaining `financialWorkflowVersion: 1`. After exact incoming verification and reservation, [payment-processing/market-fee.ts](../server/game-smart-contract/features/events/payment-processing/market-fee.ts) captures a write-once obligation containing source operation, buyer/seller/item identity, integer milli-HIVE price/fee/proceeds, market sender and treasury recipient. Missing or changed routing parks before seller payout; no recipient is guessed. The fee remains the recorded 5% amount from the reservation, not the market wallet's remaining balance or a repriced historical charge.

Seller payment, ownership, keyed sale log/counter and the buyer's successful receipt finish first. The worker archives the verified seller evidence and fee obligation on that receipt before clearing the completed item reservation and counter marker. This release is independent of fee forwarding: the buyer can equip or resell the item while the fee is pending. Receipt recovery performs only guarded cleanup and fee work; it never replays ownership or the primary sale effects.

The fee uses the existing market signing alias and SDK native HIVE transfer API, with key `market-fee:<source signature>` and human-readable label `Chainframe marketplace fee <payment reference>` inside the unchanged market `withdrawal` memo envelope. Exact immutable sender, recipient, amount, memo, transaction/operation and irreversible verification are required before marking it paid. A zero fee or identical market/treasury accounts records `not_due` without a transfer; otherwise status remains `pending` until verified `paid`. Broadcasts stay outside database callbacks. Missing IDs, thrown broadcasts, mismatches and definitive fee failures retain evidence for review without automatic rebroadcast, buyer refunds or purchase-failure notifications.

Successful source receipts are recognized independently of referral policy. The transactions route extends its existing receipt-backed filtering to omit completed purchases whose private parent jobs remain for fee recovery, without changing public response shapes. Pending fee obligations prevent job deletion. Final fee status and transfer evidence are archived before deletion; the existing internal exact-evidence reconciliation can resume uncertain fee transfers without broadcasting. Old supported jobs remain fee-retaining, with no new obligation, migration, historical forwarding or wallet sweep. SDK 1.2.2, collection/index/job-type inventories, confirmation owner and polling intervals remain unchanged. Review old jobs and deploy matching app/worker code together, then verify accounts and worker readiness before publication. Live payment checks require separate explicit authorization.

### HASH withdrawal liquidity policy

New withdrawal jobs record `withdrawalPayoutPolicyVersion: 1` without changing `financialWorkflowVersion: 1`, authorization, atomic reservations or capacity limits. The treasury's [withdrawal payout owner](../server/game-smart-contract/features/events/treasury/withdrawal-payout.ts) first reads any saved journal intent. Only a job without an intent reads token state through the shared SDK: sufficient liquid HASH selects a full transfer; insufficient funds select full issuance directly to the player. A partial balance stays in treasury. There are no split payouts. Successful missing balance rows mean zero; unavailable, malformed or mismatched evidence never means zero. Issuance requires the treasury to be the token issuer, matching configured precision and enough remaining supply; failed prerequisites park before broadcast.

The existing parent treasury journal atomically records the explicit `transfer` or `issue` operation with immutable sender, recipient, symbol, quantity and memo before broadcasting. Retries reuse the saved operation without another liquidity decision. Focused Hive server events call the published SDK 1.2.2 `issuer.token.transfer()` or `issuer.token.issue()` APIs with the unchanged withdrawal JSON memo envelope and SDK Engine ID. The exact dependency pin and lockfile remain unchanged; no SDK patch, alternate signer or new client is used.

For these explicit token operations, [the Hive execution verifier](../lib/chains/modules/hive/server/events/verify-token-execution/action.ts) uses the SDK transaction reader, irreversible block properties, canonical block reread and Engine transaction info. It requires one unambiguous Engine operation, the exact Active signer/action/payload/memo, canonical transaction identity and matching Engine execution identity. Transfer confirmation requires a `tokens` transfer event; issuance requires a `tokens` `transferFromContract` event from `tokens` to the intended player. Missing execution evidence stays pending; mismatches park. Engine errors prove failure only alongside the exact irreversible operation and no events. Raw Engine errors are not published or logged.

A proven failed transfer or issuance restores the reservation exactly once; a failed transfer never switches to minting. Missing IDs, thrown broadcasts and uncertain execution never resend or compensate. The normal terminal receipt archives the operation/evidence before reservation and pending-job cleanup; internal reconciliation uses the same operation-specific verifier without broadcasting. Existing supported jobs without the policy marker retain their transfer-only paths and unchanged intents; unsupported formats park rather than being upgraded. Deposits still replenish treasury through verified token transfers and credit game HASH once. No public DTO, endpoint, collection, index, browser timer or confirmation owner changes. Review outstanding work before deploying the application and worker together, then verify issuer configuration and lease/readiness; controlled live payments require separate authorization.

## 7. Worker startup, live streaming and shutdown

Run `pnpm server:smart-contract` separately from the Next.js process. This section is the current worker runbook; persisted checkpoint recovery and the historical start-block override are superseded.

1. Load environment configuration and confirm the configured Custom JSON ID matches the protocol.
2. Connect directly and initialize models/indexes.
3. Acquire the exclusive worker lease and start renewal.
4. On the first successful startup in this process, fetch the latest irreversible block and capture it in memory before queued recovery or payment draining.
5. Recover durable pending gameplay using its original identity/context.
6. Start the payment drain, then stream blocks from the captured position inclusively.
7. Wait for irreversibility and reread canonical blocks before authoritative processing.
8. Process relevant operations sequentially and update the in-memory block position only after required processing and valid lease checks.

A new server process always starts at the current latest irreversible block. Automatic recovery within the same process retains the last completed block (or the initial boundary if none completed) and replays it inclusively using existing operation/receipt deduplication. The position lives outside the entry point's retry loop, is not persisted, and needs no transaction/operation checkpoint indexes. Empty blocks advance memory without producing activity-panel entries.

Lease conflict/loss, unresolved processing and cancellation prevent advancement. SIGINT/SIGTERM stop intake, drain current settlement, release the lease and disconnect. The entry point recovers interrupted stream runs with a delay. `HIVE_GAME_STREAM_ENABLED=false` disables Custom JSON handling, not the entire payment worker.

Start the worker before enabling live gameplay. Already-created pending documents remain recoverable; downtime transactions without a pending document are not automatically reconstructed on restart and require manual transaction review. The application checks worker readiness before each new Custom JSON/payment Keychain request. Independently broadcast Hive transactions and downtime transactions remain outside that client gate.

The worker runs two coordinated loops: the SDK blockchain stream reads blocks and dispatches Custom JSON/payment operations; the transaction queue drains persisted payment jobs every five seconds. Console messages identify `Blockchain stream started` with its starting block and source (`latest-irreversible` or `in-memory-resume`) and `Transaction queue started` separately. Each completed block emits `Hive block checked`, including empty blocks and relevant operation counts. Game submissions emit `Game action received` and `Game action processed` with transaction ID, operation index and executed/rejected result. Payment intake, SDK read failures and processing retries also appear in the console.

The browser can observe a head-block operation before the worker accepts its irreversible block. `Blockchain stream waiting for irreversible block` explains that delay. A stream observation is not settlement; the terminal receipt and personal history determine completion. Browser stream connectivity does not indicate worker health. Absence of payment queue activity alone does not imply that blockchain streaming has stopped.

### Worker availability

The existing uncached /api/health response retains liveness fields and adds worker availability plus coarse reasons only. Readiness requires database access, a valid lease, initialized queue/recovered startup, and a successful recent block check. A check is stale after max(90 seconds, 18 times the stream poll interval). Lease heartbeats cannot establish readiness. Recovery and shutdown clear it; timestamps do not store blockchain progress.

The client checks on authenticated route entry and focus, offers Retry availability, and performs a fresh preflight immediately before each Custom JSON, registration, HIVE shop, HASH deposit or marketplace Keychain request. Session changes discard the result. Failed or unavailable checks disable new submission controls. Login, public browsing, dialog dismissal, personal history and existing confirmations remain available. No recurring readiness polling loop is introduced. Availability can change after preflight, so it cannot guarantee acceptance of independently signed operations.

## 8. Client reads, confirmation and display

### Stackable inventory and chests

The authenticated /api/items read combines the equipments and items repositories into explicitly selected equipments/items arrays. Stack DTOs expose only itemId and quantity. The inventory store replaces both snapshots together after guarded success and resets both on wallet/session replacement. Shop quote ownership counts also come from items; player persistence, DTOs and caches no longer hold consumables.

purchase-item coordinates HASH stock purchases and confirmed HIVE stock grants. Chests support 1–25 units per purchase, with 10 HIVE per unit; consumable limits/prices retain their existing behavior. New HIVE shop jobs record shopFulfillment inventory evidence. Missing evidence parks a job before effects. Purchases credit stacks and reward actual paid totals in the payment currency; they never mint equipment. Public version-1 purchase_chest metadata contains itemId/quantity/expectedUnitPrice/nonce. open_chest contains itemId/nonce only, consuming one chest and minting under the existing captured execution context and current stored Luck. Retired paid-opening metadata fails strict validation.

### Referral settlement ownership

Shared game constants define REFERRAL_REWARD_BPS (500); game/pricing.ts calculates safe HASH rewards and integer milli-HIVE rewards. purchase-item credits HASH and the HASH-only earnings counter atomically through players. It rewards every Shop product, never opening or marketplace trades. Referrers must be existing non-self players, without a registration requirement.

Registration and HIVE Shop intake record referralPolicyVersion 1 on the existing parent jobs. After exact payment verification, payment-processing/referral-native.ts captures immutable private obligation evidence through the pending repository, including an explicit no-referrer outcome. Primary registration/stock effects and the normal success receipt finish under the existing ordinary interrupted-write fence before referral dispatch. The referral phase requires that exact source receipt and cannot bypass databaseEffectsStarted or replay primary effects. A retained obligation is excluded from customer pending responses once its successful receipt exists.

HIVE referral transfers reuse the treasury alias, signing evidence, broadcast-once intents and irreversible verification, outside database callbacks. Memo labels are `Chainframe referral registration <source identity>` and `Chainframe referral shop <source identity>` inside the unchanged native SDK envelope. Pending verification consumes no failure retries; missing IDs, changed routing/intents and failed transfers park without a second broadcast or buyer compensation. Verified payouts write keyed, currency-aware referral logs, then archive obligation/transfer evidence on the parent receipt before deletion. Keyed follow-up writes may be retried without redoing the primary effects; the internal reconciliation entrypoint can resume verified pending payouts but never bypass an interrupted primary write.

The authenticated referrals GET reads players and the logs repository directly. referralEarned remains HASH; referralHiveEarned sums only keyed paid HIVE referral logs. DTO allowlists omit obligations, policy/eligibility flags, intents and signing evidence. ReferralModal uses guarded session-scoped SWR on open/focus/Refresh with no timer/retry loop; session replacement closes it and hides old totals. Personal history retains sole confirmation/refresh/toast ownership. There are still 17 routes, seven collections and seven production hooks, with no new job type, index or protocol. Review old registration/Shop jobs before coordinated app/worker deployment; no migration or historical conversion is provided.

Shop chest cards expose price, owned count and quantity, with an accessible reduced-motion-aware odds flip. Inventory hosts Open one and the existing authoritative reward modal. The shared session lock survives navigation; rewards require confirmed receipts and refreshed inventory in the same mounted session. No new timer or confirmation owner is added. Interrupted multi-document consumption/grant sequences remain parked without automatic replay or blind compensation.

Development cutover is manual: the implementation does not migrate consumable counts, delete the old items collection, reset equipped references/cached gear stats or delete pending jobs. Review old financial work, prepare clean development inventory, deploy app/worker together and reload clients before accepting the new contracts.

Guests can view `/` and `/wiki`. Marketplace and Leaderboard require verified wallet authentication but allow unregistered browsing. Dashboard, inventory, shop and profile require authenticated paid registration and loaded player/inventory snapshots. Unknown registration is not permission to play. Initial store values are placeholders hidden by loading gates, not funded players.

`usePersonalHistory` is the sole five-second confirmation flow. It is mounted at the app shell for authenticated wallet sessions, including registration:

- Pause while hidden; refresh immediately on focus/visibility recovery.
- Drain all cursor pages and prevent overlapping polls.
- Publish normalized logs/receipts to the transaction store independently of display/toast deduplication.
- Initial successful hydration displays history without replaying old toasts.
- Retain cursors/baselines after failed requests; suppress stale-session results.
- Correlate receipt/log feedback and refresh player/inventory before successful subscriptions resolve.

The personal-history client feature owns stopped-state protection, refresh coalescing and pending refresh retries. It receives session-guarded observation, publication, refresh and readiness callbacks, with no React, DOM, store imports or timers. Its hook owns the five-second interval and focus/visibility lifecycle. Cleanup stops the feature before removing listeners; an account switch or same-account reconnect invalidates late callbacks.

Confirmation subscribes to transaction ID plus operation index and receipt type, consults already observed receipts and optionally requires a correlated claim/chest log or authoritative registration. Its three-minute timeout counts visible time only. Closing a submitted dialog preserves its receipt wait and session-local tracking; detached callbacks cannot update an unmounted form or another session. Personal history remains responsible for later completion feedback.

Player/equipment/transaction/notification caches are transient. Only supported authentication persists. Reset caches on logout/session replacement; discard delayed responses after switching or same-account reconnects. The notification store is temporary activity presentation, not a persistent read/unread system.

Mining display projects vault growth from the last authoritative snapshot using shared calculations and a one-second shared clock. It never credits wallets, rewrites snapshots or awards milestones. Refresh rebases the projection. There is no HTTP tick endpoint or client mining mutation loop.

Raid targets use the shared pure `vaultAtTime` calculation in the mining owner, also used by server ticks. The authenticated GET reads players and batched equipment, captures one server timestamp and maps estimated unclaimed vaults without writes. The existing `Rival.vault` response field is an estimate; private mining/effect history stays server-side. Candidate selection retains the stored-vault order and 100-record cap, while the table sorts estimated values within that batch. Desktop/mobile labels explain that execution determines actual amounts. Estimates refresh through the existing ten-second target interval, focus/visibility, New targets and post-confirmation reads; no new timer or confirmation flow is added. Deploy application and worker together, reload clients and verify lease/readiness before live gameplay.

Shop SWR keys include wallet and connection identity; unauthenticated requests are disabled and stale responses are discarded. Prices refresh every 60 seconds. Marketplace sales are read on demand in account Histories; there is no inline sales panel or sales polling timer. Shared countdown clocks use one timer per cadence and stop after their last subscriber leaves.

The guarded shop-price API client validates the session before and after fetching. The hook supplies its guard from the actual SWR request key, so a late response cannot be accepted for a newer connection. Equipment dialogs use `useGameActionFlow` and the pure protocol equipment builder directly. The seven production hooks stay flat; native HIVE purchase lifecycle, personal history, SWR caching and hydration remain separate. Browser block observation, its retry loop and observer health timer are removed.

Marketplace uses Browse/My listings tabs over the same session-guarded listing snapshot. Name, single-slot, multiple-rarity and milli-HIVE maximum-price filters apply locally before explicit directional sorting. Tab changes and clearing filters preserve the selected sort; invalid price drafts retain the last valid cap with an error. Mobile filters start collapsed and desktop filters stay visible. Native HIVE balance loading/unavailability is explicit, and Refresh reloads both reads without adding a timer. Failed listing refreshes retain only visibly stale same-session data. EquipmentCard displays the stacked POWER/value/SPARKS block at the top right across Marketplace, Inventory and chest rewards. The marketplace variant wraps names and aligns price/action footers. Trading delegates to the existing purchase/cancellation workflows and personal confirmation.

Shop HASH prices share the highest completed UTC-day emission above 100,000: chest adds 0.01 HASH per excess HASH to its base 100; consumables add 0.0001 to base 1. Round each formula half-up to a whole number, minimum one. Expected HASH quotes and bulk totals are positive safe integers; stale quotes reject before spending. HIVE validation/totals are separate milli-HIVE calculations, preserving fixed 10/0.1 prices and three-decimal transfers. Stats/balances/vault/bonuses use up to four trimmed decimals; mining rates use five with extra precision for positive tiny values. HASH shortfalls round upward to four decimals, HIVE display uses up to three. Stored gameplay values never change through formatting. Minerate fields remain informational and owned counts session-specific.

### Session-scoped Game activity

[GameActivityPanel](../components/game/GameActivityPanel.tsx) renders Submitted and Stats, starting on Stats. The neutral Activity icon has a minimum 44px touch target and shows the exact unresolved current-session submission count, including delayed and unknown entries, with no zero badge or connectivity status. Tabs preserve selection across closing/reopening; Home/End and arrow keys navigate both tabs. New local broadcasts open Submitted and close charts; receipt/removal updates never reopen or switch views. Submitted preserves timestamps, valid transaction links and its empty state, with an Awaiting backend confirmation footer. Stats retains authenticated reads, pricing excess and separate charts. Session replacement closes and resets views; detached callbacks cannot restore stale charts or focus. The panel remains available before registration and during worker unavailability. It adds no block watcher, poller or confirmation owner. Reload old browser tabs after frontend deployment to stop their previous observers; no worker cutover or database operation is required for this presentation change.

## 9. HTTP boundary inventory

Retained routes are reads except challenge/verification POSTs. Routes also provide their existing OPTIONS behavior.

| Endpoint                       | Method | Access / purpose                                                                  |
| ------------------------------ | ------ | --------------------------------------------------------------------------------- |
| `/api/auth/challenge`          | POST   | Issue/store wallet challenge                                                      |
| `/api/auth/verify`             | POST   | Verify ownership, redeem nonce and create JWT                                     |
| `/api/game/leaderboard`        | GET    | Authenticated registered-player ranks and viewer rank                             |
| `/api/game/stats`              | GET    | Authenticated current mining values and completed activity totals/daily graphs    |
| `/api/health`                  | GET    | Liveness plus uncached worker availability and coarse reasons                     |
| `/api/market`                  | GET    | Authenticated current listings                                                    |
| `/api/logs/market/sales`       | GET    | Authenticated sales history                                                       |
| `/api/player/me`               | GET    | Authenticated profile and first-touch initialization/referral                     |
| `/api/player/referrals`        | GET    | Authenticated referral records                                                    |
| `/api/items`                   | GET    | Authenticated inventory                                                           |
| `/api/game/raid/targets`       | GET    | Authenticated target candidates; `defense` query is used as a filtering threshold |
| `/api/logs`                    | GET    | Authenticated participant history with cursor pagination                          |
| `/api/logs/market`             | GET    | Authenticated marketplace history                                                 |
| `/api/transactions`            | GET    | Authenticated pending jobs and paginated terminal receipts                        |
| `/api/shop/prices`             | GET    | Authenticated network/player price snapshot                                       |
| `/api/wallet/balance`          | GET    | Authenticated wallet balance                                                      |
| `/api/wallet/treasury-balance` | GET    | Authenticated treasury balance read                                               |

There are no HTTP gameplay-mutation, payment-acknowledgement, registration-quote, action-status or shop-settlement routes. Burn is explicitly unsupported in the real client. Preserve public response contracts and session-derived wallet authorization.

Personal logs are visible to recorded participants: actor and target. Viewer-role helpers format messages. Safe DTOs exclude internal seeds, durable execution records, treasury tracking and authentication nonce fields.

## 10. Configuration, checks and release constraints

| Configuration                                                                                        | Purpose                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`, `MONGODB_DB`                                                                          | Server persistence; default database name `cryptocore`                                                     |
| `JWT_SECRET`                                                                                         | Required JWT/challenge HMAC secret: at least 32 UTF-8 bytes, no development fallback                       |
| `HIVE_TREASURY_ACCOUNT`, `HIVE_TREASURY_ACTIVE_KEY`                                                  | Server treasury identity/signing                                                                           |
| `NEXT_PUBLIC_HIVE_TREASURY_ACCOUNT`                                                                  | Browser payment recipient; align with the server account                                                   |
| `NEXT_PUBLIC_HASH_TOKEN_ID`                                                                          | Browser-safe token configuration                                                                           |
| `CONTRACT_ADDRESS`, `HASH_TOKEN_PRECISION`                                                           | Server token symbol/precision; current defaults HASH / 3                                                   |
| `HIVE_GAME_STREAM_POLL_MS`                                                                           | Block polling; fresh processes always start at the latest irreversible block; default polling five seconds |
| `HIVE_GAME_STREAM_LEASE_TTL_MS`, `HIVE_GAME_STREAM_MAX_RETRIES`, `HIVE_GAME_STREAM_RETRY_BACKOFF_MS` | Lease/retry controls; defaults 30 seconds, 3 and 250 ms                                                    |

The shared Hive client contains fixed public game ID/version configuration and treasury/market environment-variable names, with no actual treasury credentials. The former HIVE_GAME_CUSTOM_JSON_ID and HIVE_GAME_PROTOCOL_VERSION environment mirrors are superseded by these fixed constants; existing environment entries are ignored. Browser/server runtimes receive separate instances. Configuration of a field does not guarantee every consumer uses it: current token-payment clients explicitly select HASH and three decimals; see mechanics review notes before changing assets.

Validation commands:

```sh
pnpm test
pnpm typecheck
pnpm exec eslint app components features hooks lib server tests
pnpm build
```

Vitest discovers provider/event/store/hook/utility/route/worker tests and boundary checks. Test fixtures are test-only, never runtime persistence. Real MongoDB integration uses `MONGODB_URI` with generated isolated test database names; cleanup must never target `MONGODB_DB` or the URI's operational database. Direct-write integration checks run on standalone MongoDB and verify replay protection and interruption parking; there is no rollback guarantee. Documentation updates do not certify live Keychain or settlement behavior.

Before deployment stop the old worker and review outstanding financial jobs; deploy web application and worker together. Before publication verify worker recovery/readiness and controlled live deposit, withdrawal, purchase and refund execution, plus actual login/registration, session switching, claims/upgrades, shop/market inventory refresh, fresh worker restart and in-process replay and live Hive settlement separately. Automated tests must never broadcast real payments. Resolve the implementation differences recorded in GAME_MECHANICS.md before claiming those mechanics behave consistently end to end.

No migration, backfill, production seeding, historical reconstruction, automatic collection deletion or maintenance scripts are part of this architecture.

Submitted transaction presentation extends the existing transaction store and confirmation feature. Entry membership comes only from local broadcast results; the existing personal-history hook reconciles exact transaction/operation/type identities after observations and refresh readiness. Unknown-ID entries are retained without inferred identities, and unresolved entries are never evicted to satisfy a display limit. GameActivityPanel does not complete submissions; the personal-history poller remains authoritative. The panel remains mounted for authenticated, unregistered wallets; an actual registration submission suppresses the forced dialog for that session while protected routes remain gated. Recent history and database-backed history views retain their data/layout. No persistence middleware, additional stream subscription, recurring poller or completion toast is introduced.

### HIVE marketplace cutover

New market_list metadata requires currency: "HIVE" and a manual positive price exactly representable in safe milli-HIVE. Public listings query HIVE only; unsupported currency is never inferred or converted. The existing wallet balance GET/client accepts optional asset=HIVE, returns native precision 3 and skips Engine access; omission retains HASH. No new endpoint or client is introduced.

Marketplace seller payouts/refunds use hiveClient.accounts.market; other financial flows retain treasury. Generic transfer events accept an explicit signing reference, resolve credentials lazily, and remain independent of game policy. Durable intents require private accountAlias/from evidence; dispatch and verification compare them and park changed routing before any rebroadcast or sender substitution. Logs/receipts expose currency while routing/reservations stay private. Market history excludes records without explicit HIVE currency. Fee math uses overflow-safe integer milli-HIVE, floor at 5%, with exact remainder paid to the seller.

Configure HIVE_MARKET_ACCOUNT/HIVE_MARKET_ACTIVE_KEY server-side and matching NEXT_PUBLIC_HIVE_MARKET_ACCOUNT for browsers. Review outstanding financial jobs and stop the existing worker, deploy both runtimes together, rebuild public configuration and reload clients. Workers park unsupported jobs without current currency/routing evidence; no conversion, migration, deletion or historical rewrite. Publication still requires market-account readiness and controlled purchase/payout/refund checks; automated validation must not broadcast real payments.

### Global statistics and daily charts

Shop shows Equipment Chest, Sabotage Device and Help Kit together in one responsive one/two/three-column product grid, without separate category headings or pricing-stat cards. Existing chest purchase coordination renders its card directly; product cards share padding, owned/price rows, 44px controls and bottom-aligned purchase actions. Chest odds flipping retains focus, inactive-face isolation and reduced motion. A single explanation below the grid directs players to open owned chests in Inventory. Purchase coordination, independent guard scopes and pricing remain unchanged. The existing Stats panel reads server-provided pricing excess through the guarded shop-price client, reusing [the quote API](../app/api/shop/prices/route.ts) and its wallet/connection cache key. This consumer refreshes on entry, focus and manual Refresh without adding an interval; the Shop hook keeps its existing schedule. Pricing has its own loading, unavailable and stale state, so quote failures never hide mining values or historical charts. The non-clickable excess row uses completed-day recorded claims and the returned threshold; it is not calculated from current mining output and has no graph. Neither API contract changes.

Inventory has Items and Equipment tabs, defaulting to Items. Owned stacks render in catalog order (Equipment Chest, Sabotage Device, Help Kit) in a one/two/three-column grid; zero stacks are omitted. Equipment keeps search, slot, rarity, equipped-status filters and existing equipped-first sorting across tab changes. Mobile filters collapse; desktop controls remain visible. Compact result/equipped counts replace the aggregate summary cards. The page owns manual guarded refresh through the existing combined inventory-store read; unavailable data never becomes zero and retained failed-refresh snapshots are labelled stale with submissions disabled. Tabs retain mounted equipment state; chest-opening coordination, confirmed reward modal and equipment dialogs stay outside their content, including when the last chest disappears. Session replacement resets selection/dialog state and ignores earlier callbacks. Empty equipment links to owned chests, focusing its opening control, or to Shop to buy chests. No hook, timer, API or persistence owner is added.

ActiveEffectsSection belongs to Dashboard immediately below Permanent stats, before equipped rig slots and raid targets. It reads the same authoritative player store, retains empty/critical/helped states and changes no timers or effect lifecycle. Its description explains claim/raid clearing rather than automatic expiry.

Help eligibility uses the shared pure active-sabotage-by-actor check. The social-actions Help workflow rejects `own_sabotage` before inventory consumption whenever any remaining sabotage on the target belongs to the caller, regardless of the selected stat. The authenticated raid-target GET passes its session wallet into the pure DTO mapper, adding `helpBlockedByOwnSabotage` without exposing effect authors, item IDs or raw effects. PlayerModal and the Help dialog disable entry/submission and show the same rejection text; missing eligibility offers the existing manual target refresh. Server validation remains authoritative for stale submissions. No new timer, endpoint, persistence field or confirmation owner is added. Deploy application and worker together; fully countered or cleared effects lift the restriction without migration or historical changes.

The game activity popover has Submitted and Stats tabs, with Stats selected initially and an Activity icon/count trigger. Stats is available to authenticated wallets before registration. Current mining values are read-only potential output: sum each registered player's authoritative mining calculation at one captured time, including softcap, decay and active Hash Rate effects. Ignore vault fullness and exclude gear contributions absent from the worker formula. Multiply HASH/second by 86,400 for the daily equivalent, labelled at current rates. No historical mining rates are stored or graphed; claim-based shop pricing remains unchanged.

The read-only [statistics route](../app/api/game/stats/route.ts) adds one endpoint, bringing the inventory at that update to **16 routes**. Without metric it returns registered-player count, current mining values and lifetime completed activity totals. With metric and days=7|30|90 it returns daily points and period totals, defaulting to 30 days. Mining/emission are not supported chart metrics. The route authenticates before its shared server cache, disables HTTP caching, uses normal CORS and returns 400/503 for invalid queries/unavailable reads.

Players, logs and processed-transactions repositories query only their own collections. Read pages contain at most 250 projected records and preserve stable keyset ordering without truncating history. The route coordinates exact receipt lookup per log batch; [pure DTO aggregation](../lib/api/dto/game-stats.ts) validates actor, expected action/payment and operation identity before counting. Rejected, pending, refunded, mismatched or uncorrelated work is excluded. Successful receipts count even while pending-document cleanup remains unfinished. Only final aggregates enter the shared 60-second cache, which also expires at UTC midnight; concurrent reads coalesce. Failures never return partial totals or zero fallbacks.

Daily buckets use original log createdAt execution dates in UTC, with today marked partial and missing activity days filled with zero. recordedAt and receipt processedAt exclude evidence published/completed after asOf but do not choose its historical day. Registrations count the first completed paid event per wallet; the current registered-record count remains a distinct snapshot. Raid theft counts actual attacker credit, not defender deductions or destruction. Only confirmed open_chest mint logs count opened chests; stock purchases never count as minting. Salvage and equipment upgrades use SPARKS, stat upgrades use recorded HASH costs and purchased levels, and marketplace volume uses explicit HIVE purchase records. Queued withdrawals and refunds are excluded from paid-withdrawal totals.

Metric rows open [a separate chart modal](../components/modals/GameStatsChartModal.tsx), using existing Radix/styled dialog ownership, a small SVG daily-bar renderer and accessible table. Amount/count series have separate scales through a series selector. Close restores the Stats row focus; session replacement closes views, while new submissions take priority and open Submitted. React/SWR reads are keyed by wallet/session/metric/range, guarded before and after fetching, and revalidate only on entry, visible focus, range changes or explicit refresh. There is no polling/retry loop, extra observer, analytics write or added completion owner. Failed-refresh data remains visible as stale, with its actual range and timestamp.

### Leaderboard

The authenticated [leaderboard API](../app/api/game/leaderboard/route.ts) serves one combined ranking to the [Leaderboard page](../components/pages/LeaderboardPage.tsx). Query defaults to page=1; pages 1–4 contain up to 25 rows from the first 100 registered players. The former metric query and three-tab contract are removed without aliases. Responses contain fixed 30/30/40 weights and each player's total and category-point breakdown. The current API inventory remains **17 routes**.

Players repository reads only its own collection in projected stable batches of 250. [Pure ranking](../lib/api/dto/leaderboard.ts) uses stored Notoriety, cumulative XP and each player's current authoritative mining rate at a captured timestamp. It finds independent category maxima across the entire registered population before normalization and pagination: points = player value / category maximum × weight, weighted 30 Notoriety, 30 Mining and 40 Progression. Zero-max categories contribute zero without redistribution; the combined leader is not automatically assigned 100. Divide before multiplication to avoid overflowing large finite values. Mining ignores vault fullness, respects softcap/decay/effects and follows existing worker inputs. Scores are never rounded before ranking; ties share competition ranks (1, 1, 3), with Hive account names determining stable presentation order. Display levels follow the existing XP-derived UI helper without changing stored levels or cosmetic authorization.

The server coalesces reads and caches finished rankings for 60 seconds. Authentication precedes cache access; viewer selection follows it. Your rank covers the entire registered population even outside the first 100. Only rank, Hive username, avatar template, display level, stored Hash Rate level, Notoriety, total XP, combined score and category points are exposed; raw effects, credentials, balances and financial data remain private. Cache failures return 503 rather than partial or fabricated results. Browser SWR keys include wallet, connection timestamp and page; entry/focus/explicit refresh revalidate without a recurring timer, and stale results never cross sessions. The single table shows Rank, Player, Minerate (stored Hash Rate level), Notoriety and Experience (total XP). The shared XP-derived player-level badge follows the username; Notoriety trims to four decimals, while levels and XP use full integer values. Score values, breakdowns and the scoring explanation card are hidden. The separate Your rank summary shows rank only; API ranking data and the combined scoring calculation remain unchanged apart from the added public display fields. Scores may change when category maxima change even if a player's own values do not.

Marketplace settlement checks registration only when creating a new reservation, after existing routing/version/payment verification. Unregistered or missing buyers receive full verified refunds through the existing phase before terminal rejection. Matching saved reservations continue financial recovery. A missing reservation with settlement or seller-intent evidence parks for review rather than starting a new refund or payment.

### Essential test ownership

Formula and numerical boundaries belong beside shared calculations. Backend tests prove gameplay effects, rejection and write coordination; route tests prove authorization and public response contracts. Frontend features prove submission and authoritative confirmation, while hook/component tests prove session isolation, cleanup and displayed totals. Architecture checks reuse cached source inventories, syntax trees and import graphs, keeping runtime and erased-type ownership analysis separate. Second-layer cases remain when they protect different wiring or recovery guarantees.

Real isolated standalone-MongoDB tests own consumable competition, stat-effect compare-and-set/replacement, one-time effect clearing, raid charge reservation, defender protection and capacity-limited credit/Notoriety. Fixture repositories remain test infrastructure: their minimal safety suite checks reset/cache/ID isolation, snapshots, seeded defaults, nested operations and uncertainty after failed writes. They are not a production provider. Financial crash, reservation, verification, refund and reconciliation coverage remains intact.

Permanent-stat totals and affordability use the supplied current level, charging max(1, L²) before each increment. Workflow and UI wiring checks agree on debit, XP and displayed cost without duplicating the full formula matrix. Equipment upgrades, shop prices and XP-per-HASH policy are unchanged. Completed upgrades are never repriced; deploy web and worker together.

#### Test consolidation coverage map

The measured baseline was **124 discovered files / 1,256 passing cases**. After consolidation it is **121 files / 1,219 passing cases**, a reduction of **3 files and 37 cases**. The complete run has no skipped cases; Vitest discovery patterns remain unchanged.

| Before                                                                                    | Retained coverage and owner                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three fixture contract/consumable/effect suites (37 cases)                                | [fixture safety](../tests/integration/fixture-safety.test.ts): five infrastructure guarantees; production concurrency is tested in [standalone MongoDB](../tests/integration/mongodb-standalone.test.ts).                                                                                                                                                                                                                                      |
| Fixture and mocked consumable/social/raid outcomes                                        | Eight added MongoDB scenarios verify last-item competition, sabotage/Help replacement, one-time clearing, charge reservation, defender protection, capacity-limited credits and risk deductions. [Raid query checks](../tests/integration/players-raid-writes.test.ts) retain distinct guard and field-coupling assertions.                                                                                                                    |
| Repeated stat/equipment formula descriptions in workflows                                 | [Shared stats](../features/types/game/stats.test.ts) and [item calculations](../features/types/game/items.test.ts) own formula boundaries. [Authoritative upgrades](../features/events/backend/upgrade-stat/test.ts) prove exact debit, XP, logs, rejection and minerate; [dialog](../components/modals/action-dialogs.test.tsx) and [reference-table](../components/cards/StatsPrecision.test.tsx) tests prove display and submission wiring. |
| Duplicate chest same-seed comparisons                                                     | [Chest tests](../features/events/backend/equipment/chest.test.ts) retain one fixed deterministic regression vector, distribution, rarity/slot constraints and Luck behavior.                                                                                                                                                                                                                                                                   |
| Broad backend mock scaffolding                                                            | Unused repository mocks are removed; remaining stubs expose required repository owners without proxy forwarding. Financial sequencing and interruption tests are retained.                                                                                                                                                                                                                                                                     |
| Repeated architecture parsing, overlapping alias checks and historical file-absence lists | [Boundary checks](../tests/integration/workflow-boundaries.test.ts) share cached inventory, ASTs and dependency graphs. Current ownership, reachability, browser/server isolation, DTO purity, collection boundaries, GET allowlists and the sole SDK client remain enforced.                                                                                                                                                                  |
| Retired chest redirects and navigation-only assertions                                    | The redirect configuration and its test suite are removed. Shop navigation and all 15 API routes remain unchanged.                                                                                                                                                                                                                                                                                                                             |

Authentication, nonce replay, gameplay outcomes, finance/reconciliation, worker recovery, session isolation, Submitted tracking, history privacy and confirmation suites remain discovered. All eight existing MongoDB integration suites ran through MONGODB_URI against generated isolated databases: **78 passing cases**, including the eight new concurrency/effect cases. No application database cleanup or real payment broadcast is part of validation.


### Raid isolation and recovery

The existing action processor returns executed, rejected, deferred or quarantined. A raid with verifiable saved operation identity, event, seed and reconciliation status can be quarantined without stopping unrelated intake. Failure to save/verify isolation, unknown participants, malformed interrupted evidence, database outage or lease loss still stops safe advancement. Block progress remains inclusive, irreversible and in memory; no persistent blockchain checkpoint is introduced.

Pending game records retain participant wallets and dependency keys. Earlier unresolved game actions and their held followers form account barriers in blockchain operation order. Most actions involve their actor; Raid/Help/Sabotage also involve their target, and HASH Shop includes its application-credit referrer. A third party interacting with a held account joins the dependency chain. Waiting performs no gameplay effects and consumes no execution attempts. Reads, authentication and existing history confirmation remain available.

Payment intake continues. Dispatch checks recorded participants; exact-payment processing resolves additional seller/referrer participants before new primary fulfillment, then rechecks inside the ordered primary-write operation. A hold records dependencyKeys without failure-budget increments, refunds or terminal receipts. Reserved payouts, refunds and existing primary receipts keep their established financial recovery. Queued withdrawals already own their creation-time reservation; their treasury recovery is not suspended by new gameplay holds.

The existing transaction-worker tick runs one serialized game-recovery pass before the payment drain. Repository reads use 250-row batches in blockchain order, scanning past held records and attempting at most 100 runnable actions per tick. No new timer, collection, index, route or browser observer is added. Startup retains queued recovery; all retries use the same lease-guarded processor.

New raid journals use raidSettlement.version 1, separate from financialWorkflowVersion. Shared backend raid/action.ts owns original-time preparation, immutable calculation inputs/outcome and ordered settlement. Each player carries one private activeRaid slot. Every charge/effect/vault/Notoriety/XP/milestone mutation writes its expected-state patch and applied-step evidence atomically in that player document. Lost acknowledgments are resolved from exact markers, never current balances alone. Recovery validates the stored plan against its original inputs/seed, then applies only missing steps; it never rerolls against current state. Evidence conflicts quarantine immediately. Transient proven recovery is bounded to eight attempts.

Raid logs and global raid counters are keyed by operation identity. New raid logs remain private drafts (settlementPending) until the terminal receipt is durable; public history and analytics filter drafts before limits. Publication advances only the new draft's recordedAt beyond existing participant cursors, preserving its original action time and all historical records. Effects precede logs/counters and the terminal receipt; journals are archived privately on that receipt. Matching receipt replay resumes cleanup only. Player markers and counter keys are cleared after the receipt, and the pending job is deleted last. No automatic catch-and-refund is performed after an uncertain credit. Queue bookkeeping is explicitly excluded from resource-effect observation; player, inventory, log and counter writes are never bookkeeping.

Safe stage/code diagnostics preserve the first failure separately from later retries. Journals, markers, seeds and dependencies remain private through explicit DTO/metadata selection. Deferred/quarantined work is unresolved, not rejected or complete; the personal-history poller remains the sole confirmation/toast owner.

The worker-owned internal inspectRaidRecovery/resumeRaidRecovery entrypoints in process-game-action/recovery.ts validate version-1 journals/markers and require a live lease for resumption. They are neither HTTP endpoints nor CLI commands and provide no arbitrary edits or force unlock. Legacy raids without these markers stay under review; a log alone cannot authorize replay or completion. Existing production failures still require their original exception and exact historical evidence.

Deploy application and worker together, without overlapping workers. Preserve old unresolved jobs and establish their participant barriers before reopening readiness. Verify lease ownership, latest irreversible start and advancing block checks. Never roll back to an older worker over live version-1 journals. Publication still requires authorized manual Keychain/settlement validation; automated tests do not broadcast payments or repair operational records.

Raid target reads filter isRegistered: true in the players repository before sorting/limiting. New raid execution rejects an unregistered defender before mining, charges or effects. Previously saved version-1 settlement evidence remains immutable and is not reinterpreted by the eligibility change.
