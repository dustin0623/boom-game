# PeakD publishing notes

`001-introducing-chainframe.md` is the first-post draft. The accompanying images live in `../blogposts-images/` and use relative paths so the article previews locally.

`002-chainframe-invite-challenge.md` is the local event announcement draft. It shares the existing cover; it has not been published by this update. The fixed event runs from **19 October 2026, 08:00 Singapore (00:00 UTC; 1792368000)** until **2 November 2026, 08:00 Singapore (00:00 UTC; 1793577600)**, end exclusive. The registration offer applies only once its application/worker update is deployed; earlier completed registrations receive no backfill. Verify readiness and the deployed bonus before publishing this offer.

Before publishing:

1. Use the article's first heading as the PeakD title; omit that heading from the body if it would duplicate the editor's title.
2. Upload each referenced image through PeakD, then replace its relative Markdown image URL with the returned hosted URL. Local repository paths will not render on PeakD.
3. Add the verified public game URL to the closing invitation. No production URL or launch date has been invented; localhost is only the capture environment.
4. Confirm the deployed game matches the described registration fee, starting award, Shop prices, referral policy, image-only stats sharing, marketplace settlement, Help restriction and current implementation limitations. The local draft was updated on 18 October 2026 to distinguish player Luck from the separate social-action base chance. The owner reports the game and introduction have already launched; repository edits do not update the published PeakD article.
5. Suggested tags: `hive`, `gaming`, `chainframe`, `hash`, `development`. Review the final preview and select an appropriate community before posting.

The post is a local draft. Creating it does not publish to PeakD or authorize game payments.

Sources checked: `../GAME_MECHANICS.md`, `../GAME_ARCHITECTURE.md`, the public Wiki component, game constants and the current social-action implementation. Pricing, mining, raid and equipment caveats follow the implemented rules rather than promotional descriptions on the landing page.

## Luck correction — 18 October 2026

Player Luck is the staking-plus-equipment bonus; Sabotage and Help separately add a 25% base success chance. The local article now states this distinction. Existing captures below retain their original 16 October provenance and illustrate earlier interface state. The owner requested proceeding with the fix without recapturing published images; no screenshots were replaced or fabricated for this correction.

## Invite Challenge cover provenance — 19 October 2026

The second post reuses `001-chainframe-cover.png`, the existing generated artwork documented below. Its alt text describes the centered wordmark and mining-server corridor. No screenshot, gameplay outcome, reward balance or Discord ranking was fabricated or replaced. Upload this cover through PeakD and replace the relative image URL with the hosted URL. Human-readable UTC/Singapore dates replace Discord-only timestamp widgets; the Markdown has no live countdown.

## Image manifest

All images are in `../blogposts-images/`. The screenshots were captured from the actual authenticated game at `http://localhost:3000` on 16 October 2026 and cropped to the relevant components. They were not fabricated or populated with mock data. Capture used navigation, scrolling and opening/closing display dialogs; no game action, payment, referral attribution or wallet signature was submitted. Localhost appears in the referral link and share-card hostname because these are authentic development screenshots; the article identifies that context rather than inventing a public game address.

| Filename | Origin / subject | Use |
| --- | --- | --- |
| `001-chainframe-cover.png` | New generated centered CHAINFRAME wordmark over a dark mining-server corridor | Article cover; replaces the previous busy cover in this folder only |
| `001-dashboard-vault.png` | Dashboard vault and claim controls | Mining section |
| `001-permanent-stats.png` | Dashboard Hash Rate, Hack Power and Security cards | Upgrades |
| `001-equipment.png` | Inventory equipment cards | Equipment section |
| `001-inventory-items.png` | Inventory chest and consumable stacks | Purchase/opening distinction |
| `001-raids.png` | Dashboard raid target table | Raids section |
| `001-social-actions.png` | Player dialog showing the own-sabotage Help restriction | Social section |
| `001-shop.png` | Three Shop product cards | Shop section |
| `001-marketplace.png` | Marketplace Browse/My listings tabs, filters, HIVE balance and actual empty state | Marketplace section |
| `001-referrals.png` | Referrals dialog with recorded totals, currency-specific earnings and copyable link | Referral system section |
| `001-share-stats.png` | Updated Profile Share stats dialog with preview and Download image only | Stats sharing section |
| `001-mining-rig.png` | Dashboard's six empty equipment slots | Supplementary image |
| `001-hash-token.png` | Existing `public/brand/hash-token.png`, resized for posting | Supplementary token artwork |

The local marketplace had no listings during capture, so its screenshot and caption show that empty state honestly. The Inventory screenshots provide actual equipment examples; no sale or listing was invented. Screenshots illustrate interface state; they do not verify live settlement or resolve the implementation differences documented in the guides.

## Cover generation

The new cover was created with the built-in `image_gen` tool. Its only main text is CHAINFRAME, centered over a dark cyberpunk mining-server corridor. The application assets under `public/brand/` were not changed. The complete final prompt and source artifact are recorded in [001-cover-generation.md](001-cover-generation.md).
