# Solana Mint & Withdrawal — Architecture & Flow

> **Audience:** engineers working on Boom Miner's on-chain money paths.
> **Scope:** the two directions value moves between a player and the game treasury:
>
> | Direction | Feature | Who signs on-chain | Settlement style |
> | --- | --- | --- | --- |
> | **Player → Treasury** | **Mint heroes** | The **player** (in the browser) | Asynchronous, durable queue + worker |
> | **Treasury → Player** | **Withdraw $BMCOIN** | The **treasury** (server sidecar) | Asynchronous, durable queue + worker |
>
> Both share one on-chain layer (`lib/chain/solana/*`), one config surface
> (`lib/config/config.ts`), one durable queue (`transactions_pending`), one
> settlement worker (`server/solana-smart-contract`), and one permanent ledger
> (`transactions_processed`). The browser **never mints or sends value** — it
> only signs its own payment and enqueues work; the worker settles both flows.
>
> After a job settles, the client learns about it by **polling**
> `GET /api/transactions` and diffing against what it has already seen; a new
> settled row triggers a WebSocket `player:sync` request and the engine pushes
> back authoritative balance + roster over `player:state` (see §5).

---

## 1. Core concepts

- **$BMCOIN / coins** — the in-game balance stored on the `players` document
  (`coins`). Earned in-game. Can be **withdrawn** to a real SPL token.
- **SPL token** — the on-chain token the treasury holds and pays out. Its
  **mint** address and **decimals** come from config.
- **Treasury wallet** — a single Solana keypair the game controls. It *receives*
  mint payments and *sends* withdrawals. Its secret key (`TREASURY_KEY`) lives
  only on the server.
- **ATA (Associated Token Account)** — on Solana a wallet does not hold SPL
  tokens directly; it holds them in a per-mint sub-account (the ATA). Both flows
  resolve/create ATAs before transferring.
- **Signature** — Solana's transaction id (base58). It is the idempotency key on
  the permanent ledger.

### The money-movement model changed

Minting **used to** spend in-game coins (`deductCoins`), then briefly minted
**synchronously** inside the API request. It now does **neither**. Minting is
**paid on-chain** and **settled asynchronously**: the player transfers SPL
tokens to the treasury in the browser, the API only **enqueues** a pending
job keyed on that transfer signature, and the settlement worker verifies the
transfer and inserts heroes. Coins are now *only* an in-game currency that can
be **withdrawn**; they are never spent on minting.

---

## 2. Shared building blocks

### 2.1 Config — `lib/config/config.ts`
The **only** module that reads `process.env`. Everything else imports `config`.

```
config.blockchain.chain            "solana" (default) | "robinhood" | "hive"
config.blockchain.treasuryAddress  TREASURY_ADDRESS  — treasury public key
config.blockchain.treasuryKey      TREASURY_KEY      — treasury secret (server-only)
config.blockchain.solana.rpcUrl       SOLANA_RPC_URL (public; browser deposit flow)
config.blockchain.solana.heliusApiKey HELIUS_API_KEY (server-only; verify + payout)
config.blockchain.solana.mint         CONTRACT_ADDRESS
config.blockchain.solana.decimals     hardcoded 9
config.withdrawal.workerPollMs     hardcoded 5000
config.withdrawal.maxRetries       hardcoded 8
config.mint.workerMaxRetries       hardcoded 30
config.mint.verifyMaxTries         hardcoded 2
```

There is no withdrawal daily limit. Worker tuning (poll interval, retry
ceilings) is hardcoded in `lib/config/config.ts`, not environment-configurable.

Mint retries are more generous than withdrawals because a mint may sit on the
queue waiting for the player's payment to **confirm** on-chain; each drain does
a short verification poll (`verifyMaxTries`) and, if the tx isn't confirmed yet,
lets the queue re-check on the next cycle rather than dead-lettering it.

### 2.2 On-chain layer — `lib/chain/solana/` (SERVER-ONLY)
| File | Responsibility |
| --- | --- |
| `rpc.ts` | Lazy `Connection` singleton, treasury `Keypair` (base58 **or** JSON array), `getMint()`, `MINT_DECIMALS`. |
| `transfer.ts` | **Treasury → player** payout (`sendTokens` / `sendWithdrawal`). Resolves ATAs, preflights treasury balance, `transferChecked` + memo, send & confirm. Pure chain op, no DB. |
| `verify.ts` | **Verifies a player → treasury** transfer by reading the confirmed tx back (`verifyDepositFromPlayer`). Pure chain op, no DB. |
| `memo.ts` | Namespaced on-chain memo strings (`boom-miner:withdraw:<ref>`) for audit. |

These read `TREASURY_KEY` / mint config and must **never** be imported from a
`'use client'` file.

### 2.3 Browser signer — `lib/client/solana/deposit.ts` (CLIENT-ONLY)
`sendSolanaDeposit(wallet, params)` builds a **player → treasury**
`transferChecked` (+ optional memo), asks the Wallet-Standard wallet to
`signAndSendTransaction`, and returns `{ txId }` (base58 signature). The server
never sees the player's key.

### 2.4 Permanent ledger — `transactions_processed`
One row per settled on-chain movement. `txHash` (the signature) is **uniquely
indexed** — this is the idempotency guard shared by both flows.

```ts
{ txHash, wallet, type: "withdrawal" | "mint", amount, processedAt }
// amount is the net coin delta: negative for withdrawals; for mint it records
// the on-chain token cost as a negative number (no coin balance is touched).
```

Key repository functions:
- `insertProcessedTransaction(...)` — insert, silently swallow duplicates.
- `claimProcessedTransaction(...)` — insert and report `{ claimed }`; exactly one
  caller can win per `txHash`. Used by mint as an at-most-once gate.
- `getTransactionHistory(wallet, limit, cursor?, type?)` — keyset pagination for
  `GET /api/transactions`.

---

## 3. Mint flow (Player → Treasury) — async queue + worker

Minting is paid by an on-chain transfer the **player signs in the browser**, but
the browser **does not mint**. It signs its payment and calls the API only to
**enqueue** a pending job; the settlement worker verifies the transfer and
inserts heroes. This mirrors the withdrawal flow (§4) so a request can never
time out mid-mint and a payment can never mint twice. Price is `MINT_COST`
(500,000) whole tokens **per hero**.

### 3.1 Sequence

```
┌──────────┐  GET /api/mint/config      ┌──────────────────────────────┐
│  Browser │ ─────────────────────────▶ │ returns treasury, token mint, │
│ ShopModal│                            │ decimals, rpcUrl, mintCost     │
└────┬─────┘ ◀───────────────────────── └──────────────────────────────┘
     │
     │ 1. compute amount = mintCost × quantity
     │ 2. sendSolanaDeposit(wallet, { treasury, token, decimals, amount, rpcUrl })
     │    → wallet prompts user → signs & sends player→treasury transfer
     │    → returns txId (signature)
     ▼
┌──────────┐  POST /api/heroes/mint      ┌──────────────────────────────┐
│  Browser │  { txId, count,             │ Next.js route                 │
│          │    minted_numbers }         │  - getWallet() auth           │
└────┬─────┘ ───────────────────────────▶│  - heroMint() shape check     │
     │                                    │  - enqueueMint(txId,...)      │
     │      202 { queued: true }          │    (unique signature = txId)  │
     │ ◀──────────────────────────────────└───────────────┬──────────────┘
     │  UI → "MINTING..." (queued)                         ▼
     │                                        transactions_pending row (mint)
     │                                                     │
     │                          ┌──────────────────────────┴──────────────┐
     │                          │ Settlement worker (single instance)      │
     │                          │  drains oldest-first, per job:           │
     │                          │  verifyAndMintHeroes(wallet,count,#,txId) │
     │                          │   1. verifyDepositFromPlayer (short poll) │
     │                          │      NOT_CONFIRMED → retry next drain     │
     │                          │      INVALID       → dead-letter          │
     │                          │   2. claimProcessedTransaction(txId,mint) │
     │                          │   3. HeroModel.insertMany(seeds)          │
     │                          └──────────────────────────┬───────────────┘
     │                                                      ▼
     │  GET /api/transactions (poll)              transactions_processed row
     │ ◀────────────────────────────────────────────────  │
     │  diff detects new settled mint → emit WS player:sync │
     ▼                                                      ▼
  player:state push  ◀──────  WS engine reads DB (coins + stage + roster)
  → hydrateFromServer + hydrateRoster; ShopModal flips to "done"
```

### 3.2 Enqueue-only route (`POST /api/heroes/mint`)
The route authenticates the wallet, validates the request shape
(`heroMint()`), and calls `enqueueMint({ walletAddress, txId, count,
mintedNumbers })`. It returns **`202 { queued: true }`** and does no chain or
hero work itself. The pending row's **unique `signature` is the on-chain
`txId`**, so re-submitting the same payment is idempotent — `enqueueMint`
catches the duplicate-key error and reports `duplicate: true` (still `202`).

### 3.3 On-chain verification (`verifyDepositFromPlayer`)
Runs inside the worker. It asserts, using the transaction's
`pre/postTokenBalances`:

1. The tx **did not error** on-chain.
2. The **player signed** the transaction (`accountKeys[].signer`).
3. The treasury's token balance for the configured mint **increased by exactly**
   `count × MINT_COST` (base units). Checking the balance *delta* makes it robust
   to ATA-creation instructions and memos.
4. Sanity: the player's balance for that mint **dropped** by at least the amount.

Amount matching is **exact** — overpayment or underpayment is rejected. The
verifier now returns a `code` so the worker can distinguish **`NOT_CONFIRMED`**
(tx not visible/confirmed yet — *transient*, retry via the queue) from
**`INVALID`** (confirmed but breaks a rule — *terminal*). In the worker the
poll is short (`config.mint.verifyMaxTries`, default 2); the queue's poll
interval provides the real backoff between attempts.

### 3.4 Worker settlement, idempotency & retries
`processMintJob` (in `transaction-worker.ts`) calls `verifyAndMintHeroes`, then:

- **`ok` or `ALREADY_PROCESSED`** → `completeJob`. `claimProcessedTransaction`
  keyed on the `txId` is the at-most-once gate: if a previous run already
  minted, the claim is lost and no duplicate heroes are created.
- **`NOT_CONFIRMED`** (and unexpected infra errors) → `failJob(..., mint.workerMaxRetries)`;
  the job stays pending and is re-checked next drain until it confirms or hits
  the (higher) mint retry ceiling.
- **`INVALID_MINTED_NUMBERS` / `VERIFICATION_FAILED`** → dead-lettered immediately.

Because the API only enqueues, its response codes are just `202` (queued),
`400` (bad shape), or auth failures — all *settlement* outcomes now live on the
job row and the `transactions_processed` ledger.

### 3.5 Notification (poll → WebSocket)
The client never blocks on the worker. A global poller
(`hooks/useSettlementNotifier.ts`, mounted in `GameModals`) polls
`GET /api/transactions` and **diffs** the newest settled `txHash` per type
against what it last saw. A newly settled **mint** (or withdrawal):

1. records the marker in the store (`setSettlement` → `lastMintTxHash` /
   `lastWithdrawalTxHash`), and
2. emits WS **`player:sync`**. The engine reads coins + stage + roster from the
   DB and pushes **`player:state`**; `WSSyncManager` calls `hydrateFromServer`
   + `hydrateRoster`. `ShopModal` watches `lastMintTxHash` to flip `queued → done`.

This keeps balance and roster **server-authoritative** after any settlement,
without a page reload, and works even if the shop was closed when the mint landed.

### 3.6 Files
| Layer | File |
| --- | --- |
| Public params endpoint | `app/api/mint/config/route.ts` |
| Browser UI + signing | `features/game-components/shop/ShopModal.tsx` |
| Browser transfer signer | `lib/client/solana/deposit.ts` |
| Mint API route (enqueue-only) | `app/api/heroes/mint/route.ts` |
| Request-shape validation | `features/events/hero-mint/action.ts` |
| Pending queue (mint enqueue) | `lib/modules/transactions-pending/*` → `enqueueMint` |
| Worker settlement | `server/solana-smart-contract/workers/transaction-worker.ts` → `processMintJob` |
| Verify + insert (DB) | `lib/modules/heroes/repository.server.ts` → `verifyAndMintHeroes` |
| On-chain verify | `lib/chain/solana/verify.ts` |
| Settlement poller | `hooks/useSettlementNotifier.ts` |
| WS player-state push | `server/game-websocket-engine/socket/handlers.ts` (`player:sync`) |
| Client WS refresh | `phaser/sync/WSSyncManager.ts` (`player:state`) |
| Price constant | `lib/constants/game.ts` → `MINT_COST` |

---

## 4. Withdrawal flow (Treasury → Player) — async queue + worker

Withdrawing converts in-game coins into on-chain SPL tokens sent from the
treasury. Because an HTTP handler can time out and must never risk a
double-spend, the request only **enqueues**; a single long-lived **worker**
owns on-chain settlement.

### 4.1 Sequence

```
┌──────────┐  POST /api/bank/withdraw    ┌──────────────────────────────┐
│  Browser │  { amount }                 │ Next.js route                 │
│ Withdraw │ ───────────────────────────▶│  - getWallet() auth           │
│  Modal   │                             │  - cheap balance pre-check    │
└────┬─────┘ ◀─────────────────────────  │  - enqueueWithdrawal()        │
     │        202 { status:"queued" }     └───────────────┬──────────────┘
     │                                                     │ insert (status:pending)
     │  GET /api/transactions (poll)                       ▼
     │  ◀───────────────────────────────  ┌──────────────────────────────┐
     │                                     │  transactions_pending (queue) │
     │                                     └───────────────┬──────────────┘
     │                                                     │ drained oldest-first every 5s
     │                                                     ▼
     │                          ┌───���───────────────────────────────────────┐
     │                          │ server/solana-smart-contract (sidecar)      │
     │                          │  TransactionWorker.processJob:              │
     │                          │   withdrawCoins(wallet, amount, sig, send): │
     │                          │     1. validate + re-check rules            │
     │                          │     2. sendWithdrawalToPlayer() ON-CHAIN    │
     │                          │     3. atomic coin debit ($gte guard)       │
     │                          │     4. insert transactions_processed row    │
     │                          │   completeJob (delete) | failJob (retry)    │
     │                          └───────────────┬─────────────────────────────┘
     ▼                                          ▼
  settled row appears                    transactions_processed row (amount < 0)
```

### 4.2 The sidecar — `server/solana-smart-contract/`
A long-lived Node process (run with `pnpm run server:solana-start`), **not**
Vercel serverless.

| File | Responsibility |
| --- | --- |
| `index.ts` | Connects Mongo, logs queue depth, starts the worker, graceful shutdown. |
| `workers/transaction-worker.ts` | Polls the queue every `workerPollMs`, processes jobs **sequentially oldest-first**, retries/dead-letters. |
| `lib/transfers.ts` | Thin adapter delegating to `lib/chain/solana/transfer.ts` (single source of truth for payouts). |
| `lib/logger.ts` | Structured logging (redacts to `signature`/`wallet`/`amount`). |

> **Operational constraint:** run **exactly one** worker instance so the
> sequential, oldest-first guarantee holds (no concurrent double-spends).

### 4.3 Settlement logic — `withdrawCoins` (players repository)
Order is deliberate for safety:

1. Validate amount is an integer ≥ 1.
2. Load player and check `coins ≥ amount`. No daily limit is enforced for now;
   the `withdrawnToday` / `lastWithdrawnAt` fields are still tracked (counter
   lazily reset on a new UTC day) so a cap can be re-added without a migration.
3. **Send on-chain first** (injected `sendOnChain`, so the repo stays
   chain-agnostic). Map chain errors → `TREASURY_INSUFFICIENT` / `TX_REVERTED`.
4. **Then** debit coins atomically with a `{ coins: { $gte: amount } }` guard so
   a concurrent debit can't overdraw.
5. Insert the `type: "withdrawal"` ledger row (`amount: -amount`, keyed on the
   on-chain signature).

If the on-chain send succeeds but the debit fails (balance changed underneath),
it logs a **CRITICAL** reconciliation warning — the tokens already left the
treasury, and the ledger still records the true movement.

### 4.4 Queue durability, retries, dead-lettering
- `transactions_pending` rows have `status: pending | failed | dead`,
  `retryCount`, `lastError`. `signature` (a server UUID) is unique.
- Success → `completeJob` deletes the row.
- Transient failure (RPC/treasury/network) → `failJob` increments `retryCount`;
  after `maxRetries` (8) the row is **dead-lettered** (`status: "dead"`).
- Terminal business failures (`INVALID_AMOUNT`, `NOT_FOUND`,
  `INSUFFICIENT_COINS`) are dead-lettered immediately — retrying can't help.

### 4.5 Files
| Layer | File |
| --- | --- |
| Enqueue API | `app/api/bank/withdraw/route.ts` |
| History API (poll) | `app/api/transactions/route.ts` |
| Queue module | `lib/modules/transactions-pending/*` |
| Settlement (DB + rules) | `lib/modules/players/repository.server.ts` → `withdrawCoins` |
| On-chain payout | `lib/chain/solana/transfer.ts` |
| Worker sidecar | `server/solana-smart-contract/*` |

---

## 5. Why mint is synchronous but withdrawal is queued

| | Mint | Withdrawal |
| --- | --- | --- |
| Who signs / broadcasts | **Player's wallet** (browser) | **Treasury** (server) |
| Server's on-chain action | Read-only **verify** | **Sends** value & signs |
| Double-spend risk if retried | None (server never sends) | High (server sends) → must be serialized |
| Failure blast radius | Player just re-signs; nothing minted until verified | Tokens can leave treasury → needs durable retry/audit |
| Result | Verify-then-write inside the request | Enqueue → single worker settles later |

The asymmetry is intentional: the dangerous direction (treasury spending money)
is isolated behind a durable, single-instance, sequential worker; the safe
direction (player paying, server only reading) can resolve inline.

---

## 6. Idempotency guarantees (both flows)

- **Ledger:** `transactions_processed.txHash` is uniquely indexed. A given
  on-chain signature can be recorded **once**.
- **Mint:** uses `claimProcessedTransaction` — the unique insert *is* the
  at-most-once lock before heroes are created.
- **Withdrawal queue:** `transactions_pending.signature` (UUID) is unique;
  settlement writes the ledger row so a replayed job is a no-op.

---

## 7. Environment variables

| Var | Used by | Notes |
| --- | --- | --- |
| `MONGODB_URI` | all | Mongo connection |
| `JWT_SECRET` | API auth (`getWallet`) | session token verification |
| `NEXT_PUBLIC_CHAIN` / `CHAIN` | config | selects active chain (default `solana`) |
| `SOLANA_RPC_URL` | chain layer + browser | **public** endpoint (surfaced to client); defaults to mainnet-beta |
| `HELIUS_API_KEY` | chain layer (server) | **server-only**; preferred RPC for verify + payout when set |
| `CONTRACT_ADDRESS` | chain layer | the SPL mint moved in both flows; decimals hardcoded to 9 |
| `TREASURY_ADDRESS` | chain layer | treasury public key |
| `TREASURY_KEY` | chain layer (server) | base58 or JSON byte array; **secret** |

Worker poll interval and retry ceilings are hardcoded in `lib/config/config.ts`
(no env vars). There is no withdrawal daily limit.

---

## 8. Security notes

- `lib/chain/solana/*` and the sidecar are **server-only**; they read
  `TREASURY_KEY` and must never be imported into client bundles.
- Both API routes trust only the wallet resolved by `getWallet` (JWT). A client
  cannot mint for, or withdraw to, someone else's wallet.
- Mint verification pins **sender = authenticated wallet**, **recipient =
  treasury**, **exact amount**, **correct mint** — a signature for some unrelated
  transfer cannot be replayed to mint.
- Withdrawal recipient is always the authenticated wallet; amount and rules are
  re-validated at settlement time, not just at enqueue time.
