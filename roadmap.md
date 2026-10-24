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
