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

## Later
- [ ] Persist players in MongoDB (currently in-memory mock)
- [ ] XRPL module events
- [ ] Game scenes behind login
- [ ] Add the Solana treasury key + RPC key as secrets before server-signed payouts

## XRPL login
- [x] Xaman (QR + deep link), Joey (WalletConnect), GemWallet
- [ ] Add XAMAN_API_KEY / XAMAN_API_SECRET secrets and VITE_REOWN_PROJECT_ID (blocked: needs your developer accounts)

## Chainframe layout + XRPL-only auth
- [x] Chainframe theme, sidebar shell, landing page, page placeholders
- [x] XRPL-only sign-in via Xaman QR / deep link (email and other wallets off)
- [ ] Add XAMAN_API_KEY / XAMAN_API_SECRET (blocked: needs your Xaman developer account)
- [x] Dashboard replaced by Play (Phaser bomber game, local demo)
- [ ] Build out Inventory, Shop, Marketplace, Leaderboard content

## Bomber homepage + Phaser game
- [x] Boom-Miner art, Phaser scenes and simulation ported
- [x] Homepage with live game backdrop, crew roster, Play demo + Connect wallet
- [x] Play demo button in the sign-in window
- [ ] Save real progress (blocked: waits on the planned backend)
