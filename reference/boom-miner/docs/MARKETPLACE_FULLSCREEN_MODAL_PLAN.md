# Marketplace Full-Screen Modal — Implementation Plan

## Goal
Convert the marketplace from a standalone `/marketplace` page into a fullscreen game modal,
wired to the real transaction system (tokens → treasury via `transactions_pending`). Add a
`marketplace_logs` collection that stores purchase results and references the
`transactions_processed` row so players can see their buy history.

---

## Architecture Overview

```
GameShell (MARKET button)
  → bm-modal-marketplace-open DOM event
    → GameModals.tsx
      → MarketplaceModal (new fullscreen modal)
          ↓ POST /api/marketplace/purchase/build-tx   (server builds unsigned tx)
          ↓ player wallet signs + broadcasts on-chain (browser)
          ↓ POST /api/marketplace/purchase { heroId, txId }
            ↓ enqueueMarketplacePurchase() → transactions_pending
              ↓ worker:
                  1. verifyDepositFromPlayer(txId, buyer, price)
                  2. transfer hero ownerWallet in DB
                  3. sendOnChain(sellerWallet, sellerNet) via TREASURY_KEY
                  4. insertMarketplaceLog() → marketplace_logs
                  5. completeJob()
```

---

## Files to Create

### 1. `lib/modules/marketplace-logs/types.server.ts`
```ts
export interface IMarketplaceLog {
  _id:                    string;
  buyerWallet:            string;
  sellerWallet:           string;
  heroId:                 string;          // ref: heroes._id
  heroName:               string;
  heroRarity:             string;
  price:                  number;          // total coins paid by buyer
  fee:                    number;          // treasury cut (5% of price)
  sellerNet:              number;          // price - fee, credited to seller
  processedTransactionId: string;          // ref: transactions_processed._id
  txHash:                 string;          // denormalized for fast lookup
  settledAt:              number;          // unix ms
}
```

### 2. `lib/modules/marketplace-logs/model.server.ts`
- Mongoose model, collection name: `marketplace_logs`
- Indexes: `{ buyerWallet: 1, settledAt: -1 }` (buyer history, newest-first)
- Indexes: `{ processedTransactionId: 1 }` (FK lookup)
- Timestamps: false (settledAt is stored manually as unix ms)

### 3. `lib/modules/marketplace-logs/repository.server.ts`
```ts
insertMarketplaceLog(input: Omit<IMarketplaceLog, "_id">): Promise<IMarketplaceLog>
getMarketplaceLogs(wallet: string, limit: number, cursor?: number): Promise<IMarketplaceLog[]>
// cursor = settledAt of last item (for keyset pagination, settledAt < cursor)
```

### 4. `lib/modules/marketplace-purchase/settle.server.ts`
Settlement handler imported by the transactions-pending worker.
Steps:
1. `verifyDepositFromPlayer(txId, buyerWallet, price)` — confirm buyer sent `price` tokens to treasury on-chain
2. Idempotency guard: `claimProcessedTransaction(txId)` — if already claimed, return ok (worker crashed recovery)
3. Re-validate hero: `market.listed === true` and `ownerWallet === sellerWallet` (race guard)
4. `HeroModel.updateOne`: set `ownerWallet = buyerWallet`, `market.listed = false`
5. `sendOnChain(sellerWallet, sellerNet)` — treasury sends `price × 0.95` to seller via `TREASURY_KEY`
6. `insertMarketplaceLog({ ..., txHash, payoutTxHash, settledAt: Date.now() })`
Treasury retains 5% passively (received 100% from buyer, sent out 95% to seller).

### 5. `features/game-components/marketplace/MarketplaceScreen.tsx`
Ported from `reference/robinhood-farm/features/game-components/marketplace/MarketplaceScreen.tsx`.
- Full-screen `ModalShell` with `tier="fullscreen"`
- Tab rail: All / Common / Uncommon / Rare / Epic / Legendary
- Hero card grid (left panel) + detail drawer (right panel, opens on card click)
- "My Purchases" tab showing paginated `marketplace_logs`
- Uses project modal primitives: `ModalShell`, `ModalTitleBar`, `ActionDock`, `SectionLabel`
- Purely presentational — all data passed as props from `MarketplaceModal`

### 6. `features/game-components/marketplace/MarketplaceModal.tsx`
Ported from `reference/robinhood-farm/features/game-components/marketplace/MarketplaceModal.tsx`.
- SWR fetches: `GET /api/marketplace/listings`, `GET /api/marketplace/analytics`,
  `GET /api/marketplace/logs`
- Reads `coins` from `useGameStore((s) => s.coins + s.pendingCoins)`
- `handleBuy(heroId)` → `POST /api/marketplace/purchase` → 202
- After purchase: polls `GET /api/transactions?type=marketplace_purchase` until settled,
  then fires `player:sync` WS event (re-uses existing `useSettlementNotifier` pattern),
  mutates SWR caches so HUD and Logs tab refresh without a page reload

---

## Files to Create — API Routes

### 7. `app/api/marketplace/listings/route.ts`
`GET /api/marketplace/listings`
- Auth required
- Queries `HeroModel` where `market.listed === true`
- Params: `sort=newest|price-asc|price-desc`, `rarity`, `limit` (default 40), `page`
- Response: `{ listings: HeroListing[], total: number }`

### 8. `app/api/marketplace/analytics/route.ts`
`GET /api/marketplace/analytics`
- No auth required (public stats)
- Aggregates from `marketplace_logs`:
  - `totalVolumeAllTime` — sum of all `price` values
  - `recentTradesCount` — count of logs in the last 30 days
  - `activeListingCount` — count from `HeroModel` where `market.listed === true`

### 9. `app/api/marketplace/purchase/build-tx/route.ts` (NEW)
`POST /api/marketplace/purchase/build-tx`
- Auth via `getWallet(req)`
- Body: `{ heroId: string; buyerWallet: string }`
- Builds unsigned Token-2022 transfer transaction: `buyerWallet → TREASURY_ADDRESS` for `hero.market.price` tokens
- Returns `{ transaction: base64, decimals, price, heroId, heroName, sellerWallet }`
- Mirrors `/api/mint/build-tx` pattern exactly

### 9b. `app/api/marketplace/purchase/route.ts`
`POST /api/marketplace/purchase`
1. Auth via `getWallet(req)`
2. Body: `{ heroId: string; txId: string }` — txId is the confirmed on-chain signature
3. Load hero — check `market.listed`, buyer ≠ seller, price > 0
4. `enqueueMarketplacePurchase({ buyerWallet, sellerWallet, heroId, heroName, heroRarity, price, txId })` (adds to `transactions_pending`)
5. Response: `202 { jobId, heroId, txId, message: "Purchase queued for settlement" }`


### 10. `app/api/marketplace/logs/route.ts`
`GET /api/marketplace/logs?limit=20&cursor=<settledAt>`
- Auth required
- Returns `getMarketplaceLogs(wallet, limit, cursor)` — buyer's paginated purchase history
  with each log row including `heroName`, `heroRarity`, `price`, `fee`, `settledAt`

---

## Files to Modify

### 11. `lib/modules/transactions-pending/types.server.ts`
Add `"marketplace_purchase"` to `TransactionType` union.

### 12. `lib/modules/transactions-pending/model.server.ts`
- Add `"marketplace_purchase"` to the `type` enum values
- Add optional schema fields: `heroId: { type: ObjectId, ref: "Hero" }`, `purchasePrice: Number`

### 13. `lib/modules/transactions-pending/repository.server.ts`
Add:
```ts
enqueueMarketplacePurchase(input: {
  buyerWallet: string;
  heroId:      string;
  price:       number;
}): Promise<ITransactionPending>
```

### 14. `lib/modules/transactions-processed/types.server.ts`
Add `"marketplace_purchase"` to `ProcessedTransactionType` union.
Add metadata variant:
```ts
| {
    type:          "marketplace_purchase";
    heroId:        string;
    heroName:      string;
    sellerWallet:  string;
    price:         number;
    fee:           number;
  }
```

### 15. `lib/modules/transactions-processed/model.server.ts`
Add `"marketplace_purchase"` to the `type` enum values.

### 16. `features/game-components/GameModals.tsx`
- Add `"marketplace"` to `ModalKey` union
- Add `"marketplace"` to `MODAL_KEYS` array
- Import `MarketplaceModal`
- Render `<MarketplaceModal show={active === "marketplace"} onClose={close} />`

### 17. `features/game-components/shell/GameShell.tsx`
- Change `onMarket` handler from `router.push("/marketplace")` to:
  ```ts
  () => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("bm-modal-marketplace-open")); }
  ```
- Remove `useRouter` import if `router` is no longer used elsewhere in the file

---

## Worker Extension

The transactions-pending worker (entrypoint to be located) currently handles `withdrawal`
and `mint`. Add a branch for `marketplace_purchase` that calls `settleMarketplacePurchase`
from `lib/modules/marketplace-purchase/settle.server.ts`.

```ts
// inside worker drain loop
case "marketplace_purchase":
  await settleMarketplacePurchase(job);
  break;
```

---

## Data Flow Summary

```
BUY click
  → POST /api/marketplace/purchase/build-tx  →  { transaction: base64, price }
  → player wallet signs + broadcasts on-chain (buyer → TREASURY_ADDRESS)
  → POST /api/marketplace/purchase { heroId, txId }  →  202 { jobId }
  → row inserted: transactions_pending { type: "marketplace_purchase", signature: txId, heroId, purchasePrice, sellerWallet, … }

Worker drain loop picks up job:
  → settleMarketplacePurchase(job, sendOnChain)
    → verifyDepositFromPlayer(txId, buyer, price)        — confirm on-chain
    → claimProcessedTransaction(txId)                    — idempotency gate
    → HeroModel.updateOne → ownerWallet = buyerWallet    — transfer hero
    → sendOnChain(sellerWallet, price × 0.95, txId)      — treasury pays seller
    → insertMarketplaceLog(...)                          — write audit record
    → completeJob(jobId)

Client polls GET /api/transactions (existing poller):
  → settled entry appears (type: "marketplace_purchase")
    → useSettlementNotifier fires player:sync WS event
    → SWR mutate on /api/marketplace/logs → "My Purchases" tab refreshes
    → SWR mutate on /api/marketplace/listings → purchased hero removed from grid
```

---

## Treasury / Fee Model

| Party    | Flow                         |
|----------|------------------------------|
| Buyer    | Sends `price` tokens on-chain to `TREASURY_ADDRESS` |
| Seller   | Receives `price × 0.95` tokens sent from treasury via `TREASURY_KEY` |
| Treasury | Retains `price × 0.05` passively (received 100%, sent out 95%) |

The treasury wallet (`TREASURY_ADDRESS`) receives the full payment from the buyer.
The worker then sends `sellerNet = price × 0.95` back out to the seller using `TREASURY_KEY`.
The remaining 5% stays in the treasury. No in-game coins are involved — all amounts are
on-chain tokens using the same `CONTRACT_ADDRESS` and chain as the mint flow.

---

## Files NOT Created

- No `listings` collection — listing data lives on `HeroModel.market` (field already exists)
- No standalone `marketplace_purchase` Mongoose collection — handled by existing
  `transactions_pending` → `transactions_processed` pipeline + new `marketplace_logs`
- No on-chain watcher changes — the worker reuses the existing `verifyDepositFromPlayer` + `sendOnChain` infrastructure from the mint/withdrawal flows

---

## Key File Reference

| Action | File |
|--------|------|
| CREATE | `lib/modules/marketplace-logs/types.server.ts` |
| CREATE | `lib/modules/marketplace-logs/model.server.ts` |
| CREATE | `lib/modules/marketplace-logs/repository.server.ts` |
| CREATE | `lib/modules/marketplace-purchase/settle.server.ts` |
| CREATE | `features/game-components/marketplace/MarketplaceScreen.tsx` |
| CREATE | `features/game-components/marketplace/MarketplaceModal.tsx` |
| CREATE | `app/api/marketplace/listings/route.ts` |
| CREATE | `app/api/marketplace/analytics/route.ts` |
| CREATE | `app/api/marketplace/purchase/build-tx/route.ts` |
| CREATE | `app/api/marketplace/purchase/route.ts` |
| CREATE | `app/api/marketplace/logs/route.ts` |
| MODIFY | `lib/modules/transactions-pending/types.server.ts` |
| MODIFY | `lib/modules/transactions-pending/model.server.ts` |
| MODIFY | `lib/modules/transactions-pending/repository.server.ts` |
| MODIFY | `lib/modules/transactions-processed/types.server.ts` |
| MODIFY | `lib/modules/transactions-processed/model.server.ts` |
| MODIFY | `features/game-components/GameModals.tsx` |
| MODIFY | `features/game-components/shell/GameShell.tsx` |
