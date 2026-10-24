# Roadmap

## Solana chain module
- [x] login event (Phantom, Solflare, Backpack, MetaMask)
- [x] get-token-balance (SOL + SPL)
- [x] get-transaction
- [x] transfer-token (wallet + server treasury signer)
- [x] validate-payment
- [x] Provider-agnostic mainnet RPC (Helius key or any RPC URL)

## Transaction worker
- [x] Pending/processed transaction modules + poller, tests discoverable, docs updated
- [x] Unified processor + dev in-app worker + transaction status lookup

## Chainframe layout + XRPL-only auth
- [x] Chainframe theme, sidebar shell, landing page, page placeholders
- [x] XRPL-only sign-in via Xaman QR / deep link (email and other wallets off)
- [x] Xaman API_KEY / API_SECRET secrets configured
- [x] Dashboard replaced by Play (Phaser bomber game)

## Game backend (Lovable Cloud)
- [x] Players persisted in the cloud database (Xaman wallet + session token)
- [x] Game persistence: seeded map, destroyed blocks, coins, stage sync with server-side validation
- [x] Shop: chest purchases with balance guard
- [x] Inventory: chest opening hatches bombers onto the roster
- [x] Wallet window: deposit info, withdrawal queue, transaction history
- [x] Atomic database transactions for purchase / chest open / withdrawal
- [x] Demo mode removed; Play/Shop/Inventory gated behind sign-in

## Later
- [ ] Payout worker that sends queued withdrawals on-chain (needs treasury wallet + secret)
- [ ] Deposit detection (watch treasury address, credit by destination tag)
- [ ] Marketplace (pure wallet-signed transactions)
- [ ] Leaderboard content
- [ ] XRPL module events
