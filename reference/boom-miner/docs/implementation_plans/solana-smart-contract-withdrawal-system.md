# Solana Smart Contract — Withdrawal System (Implementation Plan)

> **Scope:** Withdrawal flow **only**. Deposits and marketplace settlement are
> intentionally out of scope for this pass, but the queue/ledger design leaves
> room to add them later without a redesign.
>
> **Status:** Proposal for review. No code has been written yet.
>
> **Reference reviewed:** `reference/robinhood-farm` (its
> `server/farm-smart-contract`, the `transactions-pending` /
> `transactions-processed` modules, and the `bank/withdraw` + `transactions`
> API routes).

---

## 1. Goal

Let a player convert in-game **$BMCOIN** (the `coins` field on the `players`
document) into on-chain **SPL tokens** sent from the game **treasury wallet** to
the player's Solana wallet — reliably, idempotently, and with a durable audit
trail.

The system is built around the two collections you called out:

| Collection                | Role                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `transactions_pending`    | Durable work queue. One row per requested withdrawal, drained by a worker. |
| `transactions_processed`  | Permanent ledger. One row per settled withdrawal (audit + history). |

---

## 2. What the reference does, and what we change

The reference is a working blueprint but it is built for an **EVM L2 (Robinhood
Chain) using `viem`**. Boom Miner is a **Solana** game. The *architecture*
transfers 1:1; the *on-chain layer* must be rewritten.

| Concern            | Reference (robinhood-farm)                                   | Boom Miner (this plan)                                            |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Chain library      | `viem` (`createPublicClient` / `createWalletClient`)         | `@solana/web3.js` (`Connection` + `Keypair`)                      |
| Token standard     | ERC-20 (`transfer`, `balanceOf`)                             | SPL Token (`@solana/spl-token` transfer + ATA)                    |
| Treasury signer    | `privateKeyToAccount(hex)`                                   | `Keypair.fromSecretKey(bs58.decode(...))`                         |
| On-chain tx id     | EVM tx hash                                                  | Solana transaction **signature** (base58)                         |
| Preflight check    | `balanceOf(treasury)`                                        | Treasury **associated token account (ATA)** balance              |
| Server folder      | `server/farm-smart-contract`                                 | `server/solana-smart-contract`                                    |
| Config namespace   | `HFARM_*` env vars                                           | Existing `config.blockchain.*` (`CONTRACT_ADDRESS`, `TREASURY_ADDRESS`, `TREASURY_KEY`) |

Everything else — the pending queue, the worker drain loop, the processed
ledger, the idempotency guard, the retry/dead-letter policy — is adopted
directly from the reference.

---

## 3. End-to-end flow

```
┌──────────┐   POST /api/bank/withdraw     ┌───────────────────────────┐
│  Client  │ ────────────────────────────▶ │ Next.js API route         │
│ (wallet) │                               │  - auth (getWallet)       │
└──────────┘                               │  - validate amount        │
      ▲                                     │  - enqueueWithdrawal()    │
      │ GET /api/transactions (poll)        └────────────┬──────────────┘
      │                                                  │ insert
      │                                                  ▼
      │                                     ┌───────────────────────────┐
      │                                     │  transactions_pending      │
      │                                     │  { type:"withdrawal",      │
      │                                     │    status:"pending" }      │
      │                                     └────────────┬──────────────┘
      │                                                  │ drained every 5s
      │                                                  ▼
      │                                     ┌───────────────────────────┐
      │                                     │ solana-smart-contract      │
      │                                     │ transaction-worker         │
      │                                     │  1. withdrawCoins()        │
      │                                     │     - re-check rules       │
      │                                     │     - SPL transfer on-chain│
      │                                     │     - debit coins (atomic) │
      │                                     │     - write ledger row     │
      │                                     │  2. completeJob (delete)   │
      │                                     │     or failJob (retry)     │
      │                                     └────────────┬──────────────┘
      │                                                  │ insert
      │        ┌─────────────────────────────────────────▼──────────────┐
      └────────┤  transactions_processed  { type:"withdrawal", amount<0, │
               │                            signature, processedAt }     │
               └───────────────────────────────────────────────────────┘
```

**Why a queue instead of doing the transfer inside the HTTP request?**
Serverless request handlers can time out and cannot safely retry an on-chain
send (risk of double-spend). Enqueuing makes the request fast and lets a
single long-lived worker own on-chain settlement with retries and
dead-lettering. This mirrors the reference's `index.ts` + `transaction-worker.ts`.

> **Note on the reference's dual path:** in robinhood-farm the withdraw route
> *also* calls `withdrawCoins` synchronously (legacy path) while the worker can
> too. For Boom Miner we standardize on the **queue-only** path: the route
> enqueues, the worker settles. This avoids the double-execution ambiguity.

---

## 4. Directory layout

New server sidecar, mirroring the existing `server/game-websocket-engine`
conventions (tsx entry point, `connectDatabase()` on boot, graceful shutdown):

```
server/solana-smart-contract/
├── index.ts                      # entry point: connect DB + start worker
├── lib/
│   ├── logger.ts                 # copied verbatim from reference
│   ├── client.ts                 # Solana Connection + treasury Keypair (server-only)
│   ├── token.ts                  # SPL mint config, decimals, ATA helpers
│   └── transfers.ts              # sendWithdrawalToPlayer() — pure on-chain op
└── workers/
    └── transaction-worker.ts     # drains transactions_pending every 5s
```

New shared DB modules under `lib/modules` (Next.js API + worker both import these):

```
lib/modules/
├── transactions-pending/
│   ├── model.server.ts
│   ├── repository.server.ts
│   └── types.server.ts
└── transactions-processed/
    ├── model.server.ts
    ├── repository.server.ts
    └── types.server.ts
```

New API routes:

```
app/api/bank/withdraw/route.ts    # POST — enqueue a withdrawal
app/api/transactions/route.ts     # GET  — paginated history (poll)
```

---

## 5. Collections & schemas

### 5.1 `transactions_pending` (durable work queue)

Adapted from the reference but **trimmed to withdrawals** (enum kept as a union
so deposit/marketplace can be added later).

```ts
// lib/modules/transactions-pending/types.server.ts
export type InboundTxStatus = "pending" | "failed" | "dead";
export type TransactionType = "withdrawal"; // extend later: | "deposit" | "marketplace_purchase"

export interface IInboundTransaction extends Document {
  type: TransactionType;
  /** Idempotency key. For withdrawals this is a server-generated UUID. */
  signature: string;

  // withdrawal fields
  walletAddress: string;   // player's Solana address (recipient)
  withdrawAmount: number;  // whole coins requested

  // lifecycle
  status: InboundTxStatus; // pending | failed | dead
  retryCount: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Schema notes (from reference):
- `collection: "transactions_pending"`, `timestamps: true`.
- `signature` unique index (idempotency).
- Drain index: `{ status: 1, createdAt: 1 }` — worker queries
  `{ status: { $in: ["pending","failed"] } }` oldest-first.

Repository surface:
- `enqueueWithdrawal({ walletAddress, withdrawAmount })` → creates a `pending`
  row with a `randomUUID()` signature.
- `listPendingOldestFirst(limit=0)` → snapshot for the worker.
- `completeJob(id)` → delete row on terminal success.
- `failJob(id, message, maxRetries=8)` → increment `retryCount`; flip to
  `dead` after `maxRetries`. Returns `true` when dead-lettered.
- `countJobsByStatus()` → boot/heartbeat logging.

### 5.2 `transactions_processed` (permanent ledger)

```ts
// lib/modules/transactions-processed/types.server.ts
export type ProcessedTransactionType = "withdrawal"; // extend later

export interface IProcessedTransaction extends Document {
  /** On-chain Solana signature for withdrawals. Unique index. */
  txHash: string;
  wallet: string;
  type: ProcessedTransactionType;
  /** Net coin delta for the player. Negative for withdrawals. */
  amount: number;
  processedAt: number; // unix ms
}
```

Schema notes (from reference):
- `collection: "transactions_processed"`.
- `txHash` unique + indexed (idempotency guard for the ledger).
- Compound index `{ wallet: 1, processedAt: -1 }` for per-player history.

Repository surface:
- `insertProcessedTransaction({ txHash, wallet, type, amount })`
- `findProcessedTransaction(txHash)` / `isTransactionProcessed(txHash)`
- `getTransactionHistory(wallet, limit, cursor?, type?)` → keyset pagination on
  `processedAt`, newest-first, returns `{ transactions, nextCursor }`.

---

## 6. On-chain layer (Solana)

### 6.1 `lib/client.ts` (server-only)

```ts
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "@/lib/config/config";

export const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  "confirmed",
);

let _treasury: Keypair | null = null;
export function getTreasuryKeypair(): Keypair {
  if (!_treasury) {
    if (!config.blockchain.treasuryKey) throw new Error("TREASURY_KEY not set");
    _treasury = Keypair.fromSecretKey(bs58.decode(config.blockchain.treasuryKey));
  }
  return _treasury;
}
```

- Lazy treasury getter so the secret-key check only fires at call time (matches
  the reference's lazy `getWalletClient`).
- `TREASURY_KEY` is the existing env var; add `SOLANA_RPC_URL` (see §9).

### 6.2 `lib/token.ts`

- Export the SPL **mint address** (from `config.blockchain.contractAddress`),
  token **decimals** (must be confirmed — see open question Q3), and a helper to
  derive associated token accounts (`getAssociatedTokenAddress`).

### 6.3 `lib/transfers.ts` — `sendWithdrawalToPlayer(playerWallet, amount)`

Pure on-chain operation; **no MongoDB access** (same contract as the reference).

Steps:
1. Resolve treasury ATA and player ATA for the mint.
2. **Preflight:** read treasury ATA balance; if `< amount` throw
   `{ code: "TREASURY_INSUFFICIENT" }`.
3. If the player ATA does not exist, add a `createAssociatedTokenAccountInstruction`
   (treasury pays rent) — a Solana-specific step with no EVM equivalent.
4. Add `createTransferCheckedInstruction(treasuryATA, mint, playerATA, treasury, amount, decimals)`.
5. `sendAndConfirmTransaction(connection, tx, [treasury])`.
6. Return `{ txHash: signature }`. Throw `{ code: "TX_REVERTED" }` if confirmation fails.

Returns the base58 signature that becomes the ledger `txHash`.

---

## 7. Business rules & `withdrawCoins()`

Add `withdrawCoins(wallet, amount)` to
`lib/modules/players/repository.server.ts`, adapted from the reference. Order of
operations is critical for safety:

1. Validate `amount` is an integer `≥ 1`.
2. Load player; enforce withdrawal rules (see below).
3. **On-chain send first** (`sendWithdrawalToPlayer`) — obtain `txHash`.
4. **Then** atomically debit coins:
   `findOneAndUpdate({ wallet, coins: { $gte: amount } }, { $inc: { coins: -amount }, $set: { withdrawnToday, lastWithdrawnAt } })`.
5. Write the `transactions_processed` ledger row (`amount: -amount`).
6. Return `{ coins, withdrawnToday, nextWithdrawAt, txHash }`.

**Withdrawal rules (from the reference — confirm which to keep, see Q1/Q2):**
- **Once per UTC calendar day** per wallet.
- `amount ≥ 1`, integer.
- `amount ≤ available`, where `available = dailyLimit − withdrawnToday`.
- `coins ≥ amount`.
- Treasury on-chain balance covers `amount` (enforced in the transfer layer).

Error codes to surface (drive HTTP status in the route):
`INVALID_AMOUNT (400)`, `NOT_FOUND (404)`, `ALREADY_WITHDRAWN_TODAY (429)`,
`EXCEEDS_LIMIT (422)`, `INSUFFICIENT_COINS (422)`,
`TREASURY_INSUFFICIENT (503)`, `TX_REVERTED (502)`.

### 7.1 Required `players` schema additions

The current `IPlayer` has only `wallet, username, registrationTime, coins,
stage`. The reference's daily-limit logic needs new fields:

```ts
withdrawnToday:  { type: Number, default: 0 },  // coins withdrawn in current UTC day
lastWithdrawnAt: { type: Number, default: 0 },  // unix ms of last withdrawal
```

> The reference also gates withdrawals behind a `stash` balance earned by
> "burning" coins at a Shrine. Boom Miner has **no burn mechanic**, so this plan
> **drops `stash`** and gates withdrawals with a simpler **daily coin limit**
> instead. Confirm in **Q1**.

---

## 8. API routes

### 8.1 `POST /api/bank/withdraw`

```
Auth:  getWallet(req) → 401 if missing
Body:  { amount: number }
Logic: validate amount ≥ 1 → enqueueWithdrawal({ walletAddress: wallet, withdrawAmount: amount })
Resp:  apiOk({ status: "queued", jobId }) — 202-style; settlement is async
```

The client then **polls** `GET /api/transactions` to see the settled row appear.
Uses the existing `apiOk` / `apiError` helpers.

### 8.2 `GET /api/transactions`

Paginated, newest-first history for the authenticated wallet (keyset pagination
on `processedAt`). Query params: `limit` (default/max 25), `cursor`, `type`.
Response: `{ transactions, nextCursor }`.

---

## 9. Config, env vars & dependencies

### 9.1 New dependencies (not currently installed)

```
@solana/web3.js      # Connection, Keypair, transactions
@solana/spl-token    # ATA + transfer instructions
```

`bs58` and `dotenv`-equivalent loading are already available (`bs58` is a
dependency; the WS engine reads `process.env` directly, so the sidecar can too).

### 9.2 Env vars

Already present and reused: `MONGODB_URI`, `JWT_SECRET`, `CONTRACT_ADDRESS`
(SPL mint), `TREASURY_ADDRESS` (treasury pubkey), `TREASURY_KEY` (base58 secret).

**Add:**
```
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com   # or a paid RPC
WITHDRAW_DAILY_LIMIT=...                              # if we adopt a daily cap (Q1)
TX_WORKER_POLL_MS=5000                                # optional, defaults to 5s
```

### 9.3 `package.json` script

```json
"server:solana-start": "tsx server/solana-smart-contract/index.ts"
```

Matches the existing `server:websocket-start` pattern.

---

## 10. Idempotency, failure handling & safety

- **Queue idempotency:** `signature` is unique on `transactions_pending`.
- **Ledger idempotency:** `txHash` is unique on `transactions_processed`; insert
  the ledger row as part of settlement so a replay is a no-op (E11000).
- **Ordering:** the worker processes rows **sequentially** oldest-first (as in
  the reference) to avoid concurrent double-spends.
- **Retries:** transient failures call `failJob` → `retryCount++`; after
  `maxRetries` (8) the row is **dead-lettered** (`status: "dead"`) and left for
  manual inspection.
- **On-chain-before-debit:** we send on-chain first, then debit coins. If the DB
  debit somehow misses after a successful send, we log loudly (reference does
  the same) — the ledger row still records the true on-chain movement.
- **Single worker instance:** run exactly one sidecar to preserve sequential
  guarantees (documented operational constraint, like the WS engine).

---

## 11. Security considerations

- `client.ts` / `token.ts` / `transfers.ts` are **server-only**; never import
  from a `'use client'` file (they read `TREASURY_KEY`).
- The API route trusts only the wallet resolved by `getWallet` (JWT); the
  client cannot specify an arbitrary recipient — the recipient is always the
  authenticated wallet.
- Amount is re-validated in `withdrawCoins` at settlement time, not just at
  enqueue time (defense against stale/queued requests).
- Treasury key is loaded from env and decoded in-process only; it is never
  logged (logger redacts by only logging `signature`, `wallet`, `amount`).

---

## 12. Phased checklist

- [ ] **P0 — deps & config:** add `@solana/web3.js`, `@solana/spl-token`; add
      `SOLANA_RPC_URL` (+ daily-limit env if adopted); extend `.env.example`.
- [ ] **P1 — collections:** create `transactions-pending` and
      `transactions-processed` modules (model + types + repository).
- [ ] **P2 — players:** add `withdrawnToday` / `lastWithdrawnAt` to the schema;
      implement `withdrawCoins()`.
- [ ] **P3 — on-chain layer:** `server/solana-smart-contract/lib/{logger,client,token,transfers}.ts`.
- [ ] **P4 — worker:** `workers/transaction-worker.ts` + `index.ts` entry point;
      add `server:solana-start` script.
- [ ] **P5 — API:** `POST /api/bank/withdraw` (enqueue) and
      `GET /api/transactions` (history).
- [ ] **P6 — verification:** devnet end-to-end test (enqueue → worker settles →
      ledger row → history poll), plus unit tests for `withdrawCoins` rules.

---

## 13. Open questions for you

1. **Withdrawal gate:** Drop the reference's `stash`/burn requirement and use a
   simple **daily coin limit** (`WITHDRAW_DAILY_LIMIT`)? Or is there a Boom Miner
   equivalent of "stash" you want withdrawals to draw from?
2. **Daily cadence:** Keep the reference's **one withdrawal per UTC day** rule,
   or allow multiple withdrawals up to a daily cap?
3. **Token decimals & mint:** Confirm the $BMCOIN SPL **mint address**
   (`CONTRACT_ADDRESS`?) and its **decimals**, and the coin→token ratio
   (is 1 coin = 1 token, or a conversion rate?).
4. **RPC provider:** Public `api.mainnet-beta` is rate-limited and unreliable for
   production sends — do you have a paid RPC (Helius/QuickNode/Triton) to use?
5. **Rent for new ATAs:** OK for the **treasury to pay** the ~0.002 SOL rent when
   a player has no token account yet? (Alternative: refuse and ask the player to
   create it.)
6. **Hosting:** The sidecar is long-lived (like the WS engine). Confirm it runs
   on the same VPS/Coolify setup rather than Vercel serverless.
```
