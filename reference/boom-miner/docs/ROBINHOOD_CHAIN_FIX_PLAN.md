# Robinhood Chain — Smart Contract Fix Plan

Solana and Hive are complete. This document covers every issue that must be
resolved before Robinhood Chain can go live. Each item maps to exact file
locations, the literal lines that are wrong, and the precise change required.

---

## Issue 1 — `verify.ts`: RPC error on attempt 0 kills all retries (HIGH)

**File:** `lib/chain/robinhood/verify.ts`

**What is wrong:**

```ts
try {
  receipt = await provider.getTransactionReceipt(txHash);
} catch (err) {
  // RPC error — treat as transient (retryable).
  return {                          // <-- returns immediately
    valid: false,
    code: "NOT_CONFIRMED",
    ...
  };
}
```

The `catch` block returns on the first thrown error. A single transient RPC
hiccup on attempt 0 exits the loop and discards all remaining retries
(`maxTries` defaults to 12, worker passes 2). Any network blip or momentary
node timeout produces a permanent `NOT_CONFIRMED` result that the worker
increments toward the dead-letter ceiling on every poll cycle — a valid
mint dies after `workerMaxRetries` (30) attempts, never having actually
checked on-chain more than once.

**Fix:** Change `return` to `continue` inside the catch block so the error
is treated as a null receipt and the poll loop retries after `DELAY_MS`.
Add a counter so if ALL attempts throw (complete RPC outage), the function
still returns `NOT_CONFIRMED` at the end rather than hanging.

```ts
} catch (err) {
  // RPC error — treat as transient. Retry on next iteration.
  if (attempt < MAX_TRIES - 1) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    continue;
  }
  return {
    valid: false,
    code: "NOT_CONFIRMED",
    reason: err instanceof Error ? err.message : String(err),
  };
}
```

---

## Issue 2 — `verify.ts`: Strict equality rejects valid over-payments (HIGH)

**File:** `lib/chain/robinhood/verify.ts`

**What is wrong:**

```ts
if (totalReceived !== expectedRaw) {
  return {
    valid: false,
    code: "INVALID",
    reason: `Treasury received ${totalReceived} base units, expected ${expectedRaw}`,
  };
}
```

`!==` (strict equality on `bigint`) rejects any transfer where the player
sent even 1 base unit more than `expectedRaw`. This happens with smart wallet
contracts, fee-on-transfer token wrappers, or batching contracts that round up.
The result is code `"INVALID"` (terminal) — no refund, no retry, the mint is
dead-lettered and the player's tokens are in the treasury with no recourse.

**Fix:** Change to `<` so underpayments are rejected but exact payments and
over-payments are both accepted.

```ts
if (totalReceived < expectedRaw) {
  return {
    valid: false,
    code: "INVALID",
    reason: `Treasury received ${totalReceived} base units, expected at least ${expectedRaw}`,
  };
}
```

---

## Issue 3 — `rpc.ts`: Stale singleton provider and wallet, no reconnect (MEDIUM)

**File:** `lib/chain/robinhood/rpc.ts`

**What is wrong:**

```ts
let _provider: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (!_provider) {
    _provider = new JsonRpcProvider(rh.rpcUrl, rh.chainId, { staticNetwork: true });
  }
  return _provider;
}

let _wallet: Wallet | null = null;

export function getTreasuryWallet(): Wallet {
  if (!_wallet) {
    _wallet = new Wallet(normalisePk(config.blockchain.treasuryKey), getProvider());
  }
  return _wallet;
}
```

Both singletons are created once and never reset. If the RPC node drops,
returns errors, or the underlying WebSocket disconnects, neither is ever
recreated. The wallet also caches the treasury nonce internally via ethers —
if an external transaction (e.g. a manual top-up from Blockscout) advances
the on-chain nonce while the process is live, every subsequent transfer will
fail with `nonce too low` until the process restarts.

**Fix:** Add a `resetProvider()` export called on error in `transfer.ts` and
`verify.ts`. For the wallet nonce issue, pass `{ nonce: "pending" }` in every
`token.transfer()` call so ethers fetches the live pending nonce from the node
rather than using its internal counter.

```ts
export function resetProvider(): void {
  _provider = null;
  _wallet   = null;
}
```

In `transfer.ts` and `verify.ts`, call `resetProvider()` inside the catch
block before re-throwing so the next attempt gets a fresh connection.

---

## Issue 4 — `rpc.ts`: `TOKEN_DECIMALS` frozen at import time from env var (MEDIUM)

**File:** `lib/chain/robinhood/rpc.ts`

**What is wrong:**

```ts
export const TOKEN_DECIMALS = rh.decimals;  // = Number(process.env.ROBINHOOD_TOKEN_DECIMALS ?? 18)
```

This is evaluated once at module load. Consequences:
1. If `ROBINHOOD_TOKEN_DECIMALS` is not set (common in staging), `decimals`
   is 18 — possibly wrong for the deployed token.
2. The value never updates if the env var changes (requires process restart).
3. The Solana path fetches decimals live from chain every time via
   `getMintDecimals()` — Robinhood is inconsistent by comparison.

**Fix:** Export an async `getTokenDecimals()` that fetches once from the
contract and caches the result. Use it in both `verify.ts` and `transfer.ts`
instead of the constant. The cache is invalidated alongside `resetProvider()`.

```ts
let _decimals: number | null = null;

export async function getTokenDecimals(): Promise<number> {
  if (_decimals !== null) return _decimals;
  const token = new Contract(rh.tokenAddress, ERC20_ABI, getProvider());
  _decimals = Number(await token.decimals());
  return _decimals;
}

export function resetProvider(): void {
  _provider  = null;
  _wallet    = null;
  _decimals  = null;   // also reset so it re-fetches on next use
}
```

---

## Issue 5 — `config.ts`: `Number()` on empty env var silently produces `NaN` (MEDIUM)

**File:** `lib/config/config.ts`

**What is wrong:**

```ts
robinhood: {
  chainId:  Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663),
  decimals: Number(process.env.ROBINHOOD_TOKEN_DECIMALS ?? 18),
}
```

`Number("")` returns `NaN`. If either env var is set but empty
(`ROBINHOOD_CHAIN_ID=`), `NaN` flows into:
- `new JsonRpcProvider(url, NaN, ...)` — provider silently misconfigures
  and may sign transactions for the wrong network.
- `parseUnits(amount, NaN)` — throws an unhelpful ethers internal error.

**Fix:** Add a `requirePositiveInt` helper that throws a descriptive error at
startup rather than silently propagating `NaN`.

```ts
function requirePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Config error: ${name}="${raw}" is not a valid positive integer`);
  }
  return n;
}

robinhood: {
  chainId:  requirePositiveInt("ROBINHOOD_CHAIN_ID",      process.env.ROBINHOOD_CHAIN_ID,      4663),
  decimals: requirePositiveInt("ROBINHOOD_TOKEN_DECIMALS", process.env.ROBINHOOD_TOKEN_DECIMALS, 18),
}
```

---

## Issue 6 — `transfer.ts`: No nonce isolation between token transfer and memo tx (MEDIUM)

**File:** `lib/chain/robinhood/transfer.ts`

**What is wrong:**

```ts
const tx = await token.transfer(recipientWallet, rawAmount);
const receipt = await tx.wait(1);
// ...
const memoTx = await treasury.sendTransaction({
  to: recipientWallet,
  value: 0n,
  data: encodeMemoHex(memo),
});
```

Both calls use ethers' auto-nonce. The `await tx.wait(1)` between them means
the nonce for the memo tx is fetched only after the first tx confirms — this
is correct for sequential single-process use. However, under any concurrency
(two withdrawal workers, or a Robinhood-to-Solana operator mistake running
two processes against the same key), the auto-nonce can produce collisions.

Also, there is no `gasLimit` override on either call. If the RPC is under
load and the gas estimation call times out, the whole `token.transfer()` throws
before a tx hash is emitted — the worker catches this, increments retries, and
may eventually dead-letter a valid withdrawal.

**Fix:** Add explicit `gasLimit` on both calls using a hardcoded safe ceiling
(ERC-20 transfers use ~65,000 gas; memo 0-value tx ~21,000). This eliminates
the gas estimation RPC call entirely.

```ts
const tx = await token.transfer(recipientWallet, rawAmount, {
  gasLimit: 100_000n,   // safe ceiling for ERC-20 transfer
});
```

```ts
const memoTx = await treasury.sendTransaction({
  to: recipientWallet,
  value: 0n,
  data: encodeMemoHex(memo),
  gasLimit: 50_000n,    // safe ceiling for data-carrying 0-value tx
});
```

---

## Issue 7 — `WithdrawModal.tsx`: Hardcoded Solscan URL and "Solana" copy on all chains (MEDIUM)

**File:** `features/game-components/settings/WithdrawModal.tsx`

**What is wrong:**

```tsx
<a href={`https://solscan.io/tx/${settledSig}`} ...>
  {shortSig(settledSig)}
</a>

<p ...>
  Tokens are sent to your connected wallet by the treasury. Settlement is
  processed off-chain and confirmed on Solana.
</p>
```

Both the explorer link and the explanatory paragraph are hardcoded to Solana.
When `NEXT_PUBLIC_CHAIN=robinhood`, `settledSig` is an EVM tx hash. Clicking
the link opens Solscan which cannot find an EVM tx — the player sees a 404.
`ROBINHOOD_EXPLORER_URL` is already defined in `lib/auth/wallet-adapters/robinhood.ts`
as `https://robinhoodchain.blockscout.com` — it just is not used here.

**Fix:** Read `NEXT_PUBLIC_CHAIN` and derive the explorer base URL and the
copy string at runtime.

```ts
const chain = process.env.NEXT_PUBLIC_CHAIN ?? "solana";

const EXPLORER_BASE: Record<string, string> = {
  solana:    "https://solscan.io/tx/",
  robinhood: "https://robinhoodchain.blockscout.com/tx/",
  hive:      "https://hiveblocks.com/tx/",
};

const CHAIN_LABEL: Record<string, string> = {
  solana:    "Solana",
  robinhood: "Robinhood Chain",
  hive:      "Hive",
};

const explorerUrl = (EXPLORER_BASE[chain] ?? EXPLORER_BASE.solana) + settledSig;
const chainLabel  = CHAIN_LABEL[chain] ?? "the blockchain";
```

Then use `explorerUrl` in the `href` and `chainLabel` in the paragraph copy.

---

## Issue 8 — `server/game-smart-contract/lib/transfers.ts`: Top-level `await` requires ESM (LOW)

**File:** `server/game-smart-contract/lib/transfers.ts`

**What is wrong:**

```ts
export const sendOnChain: SendOnChainFn = await buildSendOnChain();
```

Top-level `await` only works in native ESM modules. If the TypeScript compiler
outputs CommonJS (e.g. `"module": "CommonJS"` in `tsconfig.json`), this line
throws `SyntaxError: await is only valid in async functions` at startup.

**Action:** Verify `tsconfig.json` (or the server-specific tsconfig if one
exists) has `"module": "NodeNext"` or `"ESNext"`. If it does, this is safe
as-is. If it targets CommonJS, refactor to a lazy-initialisation pattern:

```ts
let _sendOnChain: SendOnChainFn | null = null;

export async function getSendOnChain(): Promise<SendOnChainFn> {
  if (!_sendOnChain) _sendOnChain = await buildSendOnChain();
  return _sendOnChain;
}
```

And update the one call site in `TransactionWorker` to `await getSendOnChain()`.

---

## Implementation Order

Fix in this sequence to unblock testing as fast as possible:

| Priority | Issue | File | Risk if skipped |
|----------|-------|------|-----------------|
| 1 | Issue 1 — catch returns on attempt 0 | `verify.ts` | Valid mints dead-lettered on any RPC hiccup |
| 2 | Issue 2 — strict equality rejects over-payments | `verify.ts` | Valid mints permanently rejected, funds trapped |
| 3 | Issue 5 — `NaN` from empty env var | `config.ts` | Silent misconfiguration at startup, wrong network |
| 4 | Issue 3 — stale singletons, no reconnect | `rpc.ts` | Frozen provider after RPC error, requires restart |
| 5 | Issue 4 — decimals frozen at import time | `rpc.ts` | Wrong `parseUnits` if env var is unset |
| 6 | Issue 6 — no `gasLimit` on transfers | `transfer.ts` | Gas estimation timeout dead-letters valid withdrawal |
| 7 | Issue 7 — hardcoded Solscan + "Solana" copy | `WithdrawModal.tsx` | Player sees 404 on explorer link |
| 8 | Issue 8 — top-level `await` ESM check | `transfers.ts` | Startup crash on CJS compile target |

Issues 1 and 2 are in the same file (`verify.ts`) and should be fixed in the
same commit. Issues 3, 4, and the `resetProvider` they share are in `rpc.ts`
and should also be a single commit. Issue 5 is a one-liner in `config.ts`.
Issues 6 and 7 are independent and can be done in any order.

---

## Files Changed

```
lib/chain/robinhood/verify.ts      — Issues 1, 2
lib/chain/robinhood/rpc.ts         — Issues 3, 4
lib/chain/robinhood/transfer.ts    — Issues 3 (resetProvider call), 6
lib/config/config.ts               — Issue 5
features/game-components/settings/WithdrawModal.tsx — Issue 7
server/game-smart-contract/lib/transfers.ts         — Issue 8 (verify only)
```
