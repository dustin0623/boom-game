# Hive & Robinhood Smart-Contract Workers — Implementation Plan

> **Status:** Draft — for review before implementation begins.
>
> **Scope:** Wire the Hive and Robinhood chains into the same mint-and-withdrawal
> worker pipeline that the Solana sidecar already implements. The goal is that
> setting `NEXT_PUBLIC_CHAIN=hive` or `NEXT_PUBLIC_CHAIN=robinhood` causes the
> game to use the matching chain end-to-end: browser signing, server verification,
> treasury payouts, and the worker sidecar — without touching any game logic, DB
> models, or the shared queue machinery.
>
> Everything the game stores in MongoDB (heroes, transactions, player coins) is
> already chain-agnostic. Only two seams need new chain-specific code:
>
> | Seam | What changes |
> | --- | --- |
> | **Verify** (server reads player → treasury tx) | New `verify.ts` per chain |
> | **Transfer** (treasury → player payout) | Already implemented — thin adapter wiring |
> | **Worker sidecar entry point** | New `index.ts` per chain, same `TransactionWorker` class |
> | **Deposit (browser signer)** | Already implemented — ShopModal wiring only |

---

## 0. Pre-flight: what already exists

Before writing a single line of code, confirm these files are already present
and their stubs work. All three chain layers are substantially complete —
no NPM packages need to be added.

### 0.1 Chain layer stubs (server, lib/chain/)

| File | Status | Notes |
| --- | --- | --- |
| `lib/chain/solana/rpc.ts` | Done | Reference implementation |
| `lib/chain/solana/transfer.ts` | Done | Reference implementation |
| `lib/chain/solana/verify.ts` | Done | Reference implementation |
| `lib/chain/solana/memo.ts` | Done | Reference implementation |
| `lib/chain/robinhood/rpc.ts` | Done | ethers v6 `JsonRpcProvider` + `Wallet` + ERC-20 ABI |
| `lib/chain/robinhood/transfer.ts` | Done | `sendWithdrawal` implemented |
| `lib/chain/robinhood/memo.ts` | Done | `buildWithdrawMemo` + `encodeMemoHex` |
| `lib/chain/hive/rpc.ts` | Done | dhive `Client`, `PrivateKey`, Hive-Engine balance fetch |
| `lib/chain/hive/transfer.ts` | Done | `custom_json` tokens.transfer broadcast |
| `lib/chain/hive/memo.ts` | Done | `buildWithdrawMemo` |

### 0.2 Client deposit stubs (browser, lib/client/)

| File | Status | Notes |
| --- | --- | --- |
| `lib/client/solana/deposit.ts` | Done | Wallet-Standard `signAndSendTransaction` |
| `lib/client/robinhood/deposit.ts` | Done | EIP-6963 `eth_sendTransaction` |
| `lib/client/hive/deposit.ts` | Done | Hive Keychain `requestCustomJson` |

### 0.3 Config

`lib/config/config.ts` already has `blockchain.hive.*` and `blockchain.robinhood.*`
blocks. All env vars are defined. No config changes required.

### 0.4 What is MISSING (the actual work)

| Missing piece | Where to add it | Details in step below |
| --- | --- | --- |
| `lib/chain/robinhood/verify.ts` | New file | Step 1 |
| `lib/chain/hive/verify.ts` | New file | Step 2 |
| `lib/modules/heroes/repository.server.ts` — chain router | Edit existing | Step 3 |
| `server/robinhood-smart-contract/` sidecar | New directory | Step 4 |
| `server/hive-smart-contract/` sidecar | New directory | Step 5 |
| `package.json` start scripts | Edit existing | Step 6 |
| ShopModal — branch on chain for browser signing | Edit existing | Step 7 |

---

## 1. Implement `lib/chain/robinhood/verify.ts`

**Goal:** given an EVM tx hash, verify that the player sent exactly
`count × MINT_COST` ERC-20 tokens to the treasury on Robinhood Chain (chain id
4663). Mirror the contract of Solana's `verifyDepositFromPlayer` exactly —
same return type `DepositVerification`, same `NOT_CONFIRMED` / `INVALID` codes.

### 1.1 What to verify

Robinhood Chain is EVM-compatible. Token transfers emit a standard ERC-20
`Transfer(address indexed from, address indexed to, uint256 value)` event.
That event is the authoritative proof of payment.

Checklist:
1. Call `provider.getTransactionReceipt(txHash)`. If `null` → `NOT_CONFIRMED`.
2. If `receipt.status !== 1` → `INVALID` ("Transaction reverted on-chain").
3. Check `receipt.from.toLowerCase() === expectedPlayerWallet.toLowerCase()`.
   If not → `INVALID` ("Signed by wrong address").
4. Parse the `Transfer` log from the ERC-20 contract (`receipt.logs`):
   - filter `log.address.toLowerCase() === tokenAddress.toLowerCase()`
   - decode with `Interface.parseLog(log)`
   - find a log where `args.to.toLowerCase() === treasury.toLowerCase()`
5. Sum the `value` across all matching logs (normally one, but be safe).
6. `parseUnits(String(count * MINT_COST), TOKEN_DECIMALS)` is the expected amount.
   If `totalReceived !== expectedRaw` → `INVALID` ("Treasury received wrong amount").
7. Return `{ valid: true }`.

### 1.2 Polling

The Robinhood Chain RPC should confirm immediately, but the receipt may be
`null` for a brief moment after the browser submits. Use the same short-poll
pattern as Solana: `maxTries` (default 12), `delayMs` (default 2 000 ms),
both overridable via `opts`. The worker passes `maxTries: 2` and retries via
the queue.

### 1.3 File skeleton

```typescript
// lib/chain/robinhood/verify.ts
// SERVER-ONLY

import { Interface, parseUnits } from "ethers";
import { getProvider, TOKEN_DECIMALS, ERC20_ABI } from "./rpc";
import { config } from "@/lib/config/config";

export interface DepositVerification {
  valid: boolean;
  reason?: string;
  code?: "NOT_CONFIRMED" | "INVALID";
}

export interface VerifyDepositOptions {
  maxTries?: number;
  delayMs?: number;
}

export async function verifyDepositFromPlayer(
  txHash: string,
  expectedPlayerWallet: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> { ... }
```

### 1.4 Key helpers

- `getProvider()` from `./rpc` — already implemented, lazy singleton.
- `ERC20_ABI` from `./rpc` — already exports the Transfer event.
- `config.blockchain.robinhood.tokenAddress` — the ERC-20 contract.
- `config.blockchain.treasuryAddress` — the recipient to assert.
- `TOKEN_DECIMALS` from `./rpc` — already exported.

---

## 2. Implement `lib/chain/hive/verify.ts`

**Goal:** given a Hive consensus-layer tx id, verify that the player broadcast
a `tokens.transfer` custom_json op via Hive-Engine paying exactly
`count × MINT_COST` of the configured token symbol to the treasury account.
Same return type/codes as Solana.

### 2.1 What to verify

Hive-Engine maintains a ledger of token transfers queryable via its
JSON-RPC contracts API. Two approaches exist — use the one that is more robust:

**Approach A — Hive-Engine transfer history (recommended)**
Query the Hive-Engine `tokens` contract `transferHistory` table for a row
matching the `txId`. This returns the transfer record directly.

```
POST https://api.hive-engine.com/rpc
{
  "jsonrpc": "2.0", "id": 1,
  "method": "find",
  "params": {
    "contract": "tokens",
    "table": "transferHistory",
    "query": { "txId": "<hiveTxId>", "symbol": "<TOKEN_SYMBOL>" }
  }
}
```

Expected shape of a result row:
```json
{ "txId": "...", "from": "player_account", "to": "treasury_account",
  "symbol": "BMCOIN", "quantity": "1.00000000", "memo": "..." }
```

**Approach B — Hive consensus layer tx lookup (fallback)**
Use `client.database.getTransaction(txId)` from dhive, then parse the
`custom_json` operation JSON payload inside. More code, less reliable for
Hive-Engine-layer checks.

Use Approach A. If the Engine API is temporarily unavailable it is a transient
error → `NOT_CONFIRMED`.

### 2.2 Checklist

1. Query `tokens` `transferHistory` with `txId` and `symbol`.
   If result is empty → `NOT_CONFIRMED` (op may not have reached the Engine
   sidechain yet; Hive block time is ~3s but the sidechain can lag).
2. If `result[0].from.toLowerCase() !== expectedPlayerAccount.toLowerCase()`
   → `INVALID` ("Transfer is from wrong account").
3. If `result[0].to.toLowerCase() !== treasury.toLowerCase()`
   → `INVALID` ("Transfer recipient is not the treasury").
4. Parse `parseFloat(result[0].quantity)` and compare against `expectedAmount`
   within floating-point tolerance (or compare strings after
   `expectedAmount.toFixed(TOKEN_PRECISION)`).
   If mismatch → `INVALID` ("Wrong quantity").
5. Return `{ valid: true }`.

### 2.3 Polling

Same short-poll pattern: `maxTries` (default 12), `delayMs` (default 3 000 ms;
slightly longer to account for Hive's ~3s block time). Worker passes
`maxTries: 2`.

### 2.4 File skeleton

```typescript
// lib/chain/hive/verify.ts
// SERVER-ONLY

import { ENGINE_RPC_URL, getTreasuryAccount, getTokenSymbol, TOKEN_PRECISION } from "./rpc";
import { config } from "@/lib/config/config";

export interface DepositVerification {
  valid: boolean;
  reason?: string;
  code?: "NOT_CONFIRMED" | "INVALID";
}

export interface VerifyDepositOptions {
  maxTries?: number;
  delayMs?: number;
}

export async function verifyDepositFromPlayer(
  txId: string,
  expectedPlayerAccount: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> { ... }
```

---

## 3. Make `verifyAndMintHeroes` chain-agnostic

**File:** `lib/modules/heroes/repository.server.ts`

Currently the function hard-imports Solana's verify:

```typescript
import { verifyDepositFromPlayer } from "@/lib/chain/solana/verify";
```

This must be replaced with a runtime chain-router so the same function works
for all three chains without any caller changes.

### 3.1 Add a chain-router module

Create `lib/chain/verify.ts` (new file):

```typescript
// lib/chain/verify.ts
// SERVER-ONLY — routes to the active chain's verifier.

import { config } from "@/lib/config/config";
import type { DepositVerification, VerifyDepositOptions } from "@/lib/chain/solana/verify";

export type { DepositVerification, VerifyDepositOptions };

export async function verifyDepositFromPlayer(
  txId: string,
  expectedPlayerWallet: string,
  expectedAmount: number,
  opts: VerifyDepositOptions = {},
): Promise<DepositVerification> {
  const chain = config.blockchain.chain;

  if (chain === "robinhood") {
    const { verifyDepositFromPlayer: verify } = await import("./robinhood/verify");
    return verify(txId, expectedPlayerWallet, expectedAmount, opts);
  }

  if (chain === "hive") {
    const { verifyDepositFromPlayer: verify } = await import("./hive/verify");
    return verify(txId, expectedPlayerWallet, expectedAmount, opts);
  }

  // Default: Solana
  const { verifyDepositFromPlayer: verify } = await import("./solana/verify");
  return verify(txId, expectedPlayerWallet, expectedAmount, opts);
}
```

> Dynamic imports are intentional — they ensure only the active chain's
> dependencies are loaded at runtime, which matters for the browser bundle
> (none of these are client-imported, but for future safety).

### 3.2 Update `repository.server.ts`

Replace the hard Solana import:

```typescript
// BEFORE
import { verifyDepositFromPlayer } from "@/lib/chain/solana/verify";

// AFTER
import { verifyDepositFromPlayer } from "@/lib/chain/verify";
```

No other changes to `verifyAndMintHeroes` — the logic is identical across chains.

---

## 4. Create `server/robinhood-smart-contract/` sidecar

The Robinhood sidecar is structurally identical to `server/solana-smart-contract/`.
It shares the same `TransactionWorker` class and the same DB modules. Only the
transfer adapter (`lib/transfers.ts`) changes.

### 4.1 Directory layout

```
server/robinhood-smart-contract/
  index.ts          ← entry point (copy of solana's, env docs updated)
  lib/
    transfers.ts    ← thin adapter delegating to lib/chain/robinhood/transfer.ts
    logger.ts       ← copy of solana's (identical)
  workers/
    transaction-worker.ts  ← symlink or re-export of the shared worker
```

### 4.2 `server/robinhood-smart-contract/lib/transfers.ts`

```typescript
// Delegates to the Robinhood chain layer — the single source of truth for
// ERC-20 treasury payouts on Robinhood Chain.
import { sendWithdrawal, type RobinhoodTransferResult } from "@/lib/chain/robinhood/transfer";

export async function sendWithdrawalToPlayer(
  playerWallet: string,
  amount: number,
  ref: string,
): Promise<RobinhoodTransferResult> {
  return sendWithdrawal(playerWallet, amount, ref);
}
```

Note: `withdrawCoins` expects the `sendOnChain` function to return
`{ signature: string }`. `RobinhoodTransferResult` has `{ txHash: string }`.
Map `txHash` → `signature` in the adapter:

```typescript
const result = await sendWithdrawal(playerWallet, amount, ref);
return { signature: result.txHash };
```

### 4.3 `server/robinhood-smart-contract/workers/transaction-worker.ts`

Do NOT duplicate `TransactionWorker`. Instead re-export it with the Robinhood
transfer adapter injected. Option A (recommended): make `TransactionWorker`
accept the adapter as a constructor argument, then each sidecar passes its own.

If `TransactionWorker` currently calls `sendWithdrawalToPlayer` directly via
import, refactor it to accept the function as a constructor parameter:

```typescript
// In the shared TransactionWorker constructor signature:
constructor(
  private sendOnChain: (wallet: string, amount: number, ref: string) => Promise<{ signature: string }>,
  private pollMs = config.withdrawal.workerPollMs,
  private maxRetries = config.withdrawal.maxRetries,
) {}
```

The Solana sidecar passes `sendWithdrawalToPlayer` from its own `lib/transfers.ts`.
The Robinhood sidecar passes its own adapter. Nothing in the worker changes.

> If refactoring the worker constructor is too invasive, Option B is to create
> a separate `RobinhoodTransactionWorker` subclass that overrides only the
> `processWithdrawalJob` method. Option A is preferred to avoid code duplication.

### 4.4 `server/robinhood-smart-contract/index.ts`

Copy `server/solana-smart-contract/index.ts` verbatim. Update:

- The file-header comment env var table (replace Solana vars with Robinhood ones).
- The `pnpm run` command reference in the header comment.
- Import `sendWithdrawalToPlayer` from `../lib/transfers` (the Robinhood adapter).

Required env vars for this worker:

| Var | Notes |
| --- | --- |
| `MONGODB_URI` | shared |
| `JWT_SECRET` | shared |
| `NEXT_PUBLIC_CHAIN=robinhood` | routes verify + config |
| `ROBINHOOD_RPC_URL` | Robinhood Chain JSON-RPC (default in config) |
| `ROBINHOOD_CHAIN_ID` | 4663 (default in config) |
| `ROBINHOOD_TOKEN_ADDRESS` | ERC-20 contract (or `CONTRACT_ADDRESS`) |
| `ROBINHOOD_TOKEN_DECIMALS` | defaults to 18 |
| `TREASURY_ADDRESS` | treasury EVM address (0x…) |
| `TREASURY_KEY` | treasury private key (hex, with or without 0x prefix) |

---

## 5. Create `server/hive-smart-contract/` sidecar

Mirrors Step 4, adapted for Hive. The identity model is different: on Hive,
wallets are named accounts (e.g. `"boomminer-treasury"`) not public keys.

### 5.1 Directory layout

```
server/hive-smart-contract/
  index.ts
  lib/
    transfers.ts
    logger.ts
  workers/
    transaction-worker.ts
```

### 5.2 `server/hive-smart-contract/lib/transfers.ts`

```typescript
import { sendWithdrawal, type HiveTransferResult } from "@/lib/chain/hive/transfer";

export async function sendWithdrawalToPlayer(
  playerAccount: string,
  amount: number,
  ref: string,
): Promise<{ signature: string }> {
  const result: HiveTransferResult = await sendWithdrawal(playerAccount, amount, ref);
  // Map Hive consensus tx id → the generic "signature" field the worker stores.
  return { signature: result.txId };
}
```

### 5.3 `server/hive-smart-contract/index.ts`

Copy from `server/solana-smart-contract/index.ts` and update the comment/env table.

Required env vars for this worker:

| Var | Notes |
| --- | --- |
| `MONGODB_URI` | shared |
| `JWT_SECRET` | shared |
| `NEXT_PUBLIC_CHAIN=hive` | routes verify + config |
| `HIVE_RPC_NODES` | comma-separated Hive API nodes (defaults to `https://api.hive.blog`) |
| `HIVE_ENGINE_RPC_URL` | Hive-Engine contracts API (defaults to `https://api.hive-engine.com/rpc`) |
| `HIVE_ENGINE_ID` | custom_json id (defaults to `ssc-mainnet-hive`) |
| `HIVE_TOKEN_SYMBOL` | Hive-Engine token symbol (or `CONTRACT_ADDRESS`) |
| `HIVE_TOKEN_PRECISION` | decimal places (defaults to 8) |
| `TREASURY_ADDRESS` | treasury Hive account username (lowercase) |
| `TREASURY_KEY` | treasury ACTIVE private key (WIF string) |

### 5.4 Identity note

On Solana/Robinhood, the player's wallet is an address (base58 / 0x hex). On
Hive it is a **username string** (e.g. `"alice"`). The `wallet` field on player
and hero documents must hold the Hive username when operating in Hive mode.
Confirm the login flow stores the Hive account name in `JWT_SECRET`-signed
session token's `wallet` field. If not, that is a prerequisite fix.

---

## 6. Add `package.json` start scripts

Add three new scripts alongside the existing one:

```json
{
  "scripts": {
    "server:solana-start":    "tsx server/solana-smart-contract/index.ts",
    "server:robinhood-start": "tsx server/robinhood-smart-contract/index.ts",
    "server:hive-start":      "tsx server/hive-smart-contract/index.ts"
  }
}
```

Each script is run as a long-lived Node process (never Vercel serverless).
**Run exactly one instance** of the active chain's worker — the sequential
oldest-first guarantee breaks with concurrent instances.

---

## 7. Wire the browser deposit through `ShopModal`

`ShopModal.handleMint` currently hard-calls `sendSolanaDeposit`. It must
branch on `config.blockchain.chain` (available as `NEXT_PUBLIC_CHAIN`).

### 7.1 Read the active chain

```typescript
// lib/client/chain.ts  (new, 'use client')
const chain = (process.env.NEXT_PUBLIC_CHAIN ?? "solana").toLowerCase();
export const activeChain = chain === "hive" ? "hive"
  : chain === "robinhood" ? "robinhood"
  : "solana";
```

### 7.2 Branch in `handleMint`

```typescript
import { activeChain } from "@/lib/client/chain";

// Inside handleMint, replace the Solana-specific call with:
let txId: string;

if (activeChain === "robinhood") {
  const { sendRobinhoodDeposit } = await import("@/lib/client/robinhood/deposit");
  const selected = pickRobinhoodWallet(); // see §7.3
  const result = await sendRobinhoodDeposit(selected, {
    treasury: mintConfig.treasury,
    token: mintConfig.tokenAddress,
    decimals: mintConfig.decimals,
    amount,
  });
  txId = result.txId;

} else if (activeChain === "hive") {
  const { sendHiveDeposit } = await import("@/lib/client/hive/deposit");
  const hiveAccount = getHiveAccount(); // see §7.3
  const result = await sendHiveDeposit(hiveAccount, {
    treasury: mintConfig.treasury,
    token: mintConfig.tokenSymbol,
    decimals: mintConfig.tokenPrecision,
    amount,
    engineId: mintConfig.engineId,
  });
  txId = result.txId;

} else {
  // Solana (default)
  const { sendSolanaDeposit } = await import("@/lib/client/solana/deposit");
  const wallet = pickWallet();
  const result = await sendSolanaDeposit(wallet, {
    treasury: mintConfig.treasury,
    token: mintConfig.token,
    decimals: mintConfig.decimals,
    amount,
    rpcUrl: mintConfig.rpcUrl,
  });
  txId = result.txId;
}
```

### 7.3 Wallet/account pickers

- **Robinhood:** use the existing EIP-6963 discovery already implemented in
  `lib/auth/wallet-adapters/robinhood.ts`. The `pickWallet()` helper in
  ShopModal may already return the right object — confirm its type.
- **Hive:** the player's Hive account name comes from the session
  (`useGameStore(s => s.wallet)`). No picker UI needed — Keychain discovers the
  account from the browser extension automatically when `requestCustomJson` is called.

### 7.4 Update `GET /api/mint/config`

The mint config route currently returns Solana-specific fields. Make it return
chain-appropriate fields based on `config.blockchain.chain`:

| Field | Solana | Robinhood | Hive |
| --- | --- | --- | --- |
| `treasury` | `TREASURY_ADDRESS` (base58) | `TREASURY_ADDRESS` (0x…) | `TREASURY_ADDRESS` (username) |
| `token` / `tokenAddress` / `tokenSymbol` | SPL mint | ERC-20 address | Hive-Engine symbol |
| `decimals` / `tokenPrecision` | 9 (live from chain) | 18 (config) | 8 (config) |
| `rpcUrl` | `SOLANA_RPC_URL` | `ROBINHOOD_RPC_URL` | not needed (Keychain handles) |
| `engineId` | — | — | `HIVE_ENGINE_ID` |
| `mintCost` | `MINT_COST` | `MINT_COST` | `MINT_COST` |

---

## 8. Testing checklist

For each chain (Robinhood and Hive), verify the following before shipping:

### 8.1 Unit tests — verify.ts

- `NOT_CONFIRMED`: mock the RPC to return null/empty, assert code is `NOT_CONFIRMED`.
- `INVALID — wrong sender`: mock a confirmed tx with `from` ≠ player.
- `INVALID — wrong amount`: mock a confirmed tx with a different token amount.
- `INVALID — wrong recipient`: mock a transfer log with `to` ≠ treasury.
- `valid: true`: mock a fully correct confirmed tx.

### 8.2 Integration test — verify → verifyAndMintHeroes chain-router

- With `NEXT_PUBLIC_CHAIN=robinhood`: confirm `verifyAndMintHeroes` calls the
  Robinhood verifier, not the Solana one.
- With `NEXT_PUBLIC_CHAIN=hive`: same for Hive.

### 8.3 Manual end-to-end (devnet / testnet)

1. Start the appropriate worker: `pnpm run server:robinhood-start` (or hive).
2. Open the game with `NEXT_PUBLIC_CHAIN` set.
3. Open the Shop → MINT. Confirm the browser calls the right signing flow
   (MetaMask-style for Robinhood, Keychain for Hive).
4. After signing, check `transactions_pending` has a row with `type: "mint"`.
5. Wait for the worker to drain. Confirm:
   - `transactions_pending` row is deleted.
   - `transactions_processed` row added with `type: "mint"`.
   - Hero documents created in `heroes` collection.
   - Shop result screen shows the minted hero.
6. Trigger a withdrawal from the Withdraw modal. Confirm:
   - `transactions_pending` row added with `type: "withdrawal"`.
   - Worker sends on-chain. Confirm tx on block explorer.
   - `transactions_processed` row added, coins debited on player document.

### 8.4 Worker operational checks

- Run two worker instances simultaneously → confirm only one settles each job
  (the queue's `signature` unique index prevents double-processing).
- Kill the worker mid-drain. Restart. Confirm it resumes from the pending job.
- Force `maxRetries` exceeded. Confirm the row moves to `status: "dead"` and
  the worker skips it on subsequent drains.

---

## 9. File change summary

| File | Action | Step |
| --- | --- | --- |
| `lib/chain/robinhood/verify.ts` | **Create** | 1 |
| `lib/chain/hive/verify.ts` | **Create** | 2 |
| `lib/chain/verify.ts` | **Create** (chain router) | 3.1 |
| `lib/modules/heroes/repository.server.ts` | **Edit** (swap import) | 3.2 |
| `server/solana-smart-contract/workers/transaction-worker.ts` | **Edit** (accept `sendOnChain` as constructor arg) | 4.3 |
| `server/robinhood-smart-contract/index.ts` | **Create** | 4.4 |
| `server/robinhood-smart-contract/lib/transfers.ts` | **Create** | 4.2 |
| `server/robinhood-smart-contract/lib/logger.ts` | **Create** (copy) | 4.1 |
| `server/robinhood-smart-contract/workers/transaction-worker.ts` | **Create** (re-export / thin wrapper) | 4.3 |
| `server/hive-smart-contract/index.ts` | **Create** | 5.3 |
| `server/hive-smart-contract/lib/transfers.ts` | **Create** | 5.2 |
| `server/hive-smart-contract/lib/logger.ts` | **Create** (copy) | 5.1 |
| `server/hive-smart-contract/workers/transaction-worker.ts` | **Create** (re-export / thin wrapper) | 5 |
| `package.json` | **Edit** (add 2 scripts) | 6 |
| `lib/client/chain.ts` | **Create** | 7.1 |
| `features/game-components/shop/ShopModal.tsx` | **Edit** (chain branch) | 7.2 |
| `app/api/mint/config/route.ts` | **Edit** (chain-aware response) | 7.4 |

**Total: 8 new files + 5 edits to existing files.**

---

## 10. Implementation order

Work in this order to keep the codebase building and testable at each step:

1. `lib/chain/robinhood/verify.ts` — standalone, no deps change.
2. `lib/chain/hive/verify.ts` — standalone, no deps change.
3. `lib/chain/verify.ts` (router) + update `repository.server.ts` import — build check.
4. Refactor `TransactionWorker` constructor to accept `sendOnChain` — update Solana sidecar `index.ts` to pass its adapter.
5. Create Robinhood sidecar directory and files.
6. Create Hive sidecar directory and files.
7. Add `package.json` scripts.
8. `lib/client/chain.ts` + `ShopModal` branch + `/api/mint/config` chain-aware response.
9. Run `pnpm build` — confirm zero type errors.
10. End-to-end test on testnet per §8.3.
