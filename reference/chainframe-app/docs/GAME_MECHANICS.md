# Chainframe game mechanics

Equipment upgrades require enough SPARKS for the entire signed level count before the first level is purchased. Affordability uses each successive level's existing cost and four-decimal stat rounding, preserving the formula and per-level XP/logs. An unaffordable request upgrades no equipment, spends no SPARKS and finishes as an ordinary rejection, not reconciliation. A debit or equipment write with an uncertain acknowledgment still requires review under the existing write guards; historical stuck actions are preserved.

This guide records rules and formulas from the current implementation, not a proposed redesign. Server feature events and repositories determine settled outcomes; UI descriptions and reference-game formulas are not substitutes for them. Read [GAME_ARCHITECTURE.md](GAME_ARCHITECTURE.md) for transport, persistence, authentication and worker ownership.

Chainframe game actions use Custom JSON/SDK application ID `chainframe-game` and payload version `1`, configured in [the shared Hive client](../lib/chains/modules/hive/client.ts). [The game contract](../lib/utils/game/action-protocol.ts) owns payload schemas and builders; signer authority is checked against the actual Hive operation. The prelaunch rename changes the transport ID, not action metadata, gameplay, prices or rewards. Earlier game IDs are unsupported.

Login challenges and Keychain display messages use Chainframe. Login signs a single-line, versioned challenge containing the account, random nonce, expiry and server HMAC; verification checks the exact signed message and retains the existing five-minute expiry and single-use nonce. The verifier also accepts valid, unexpired challenges issued in the previous multiline format during rollout. Browser keys are `chainframe-auth` and `chainframe.token`; there is no automatic restoration from old keys. Referral links use the current mounted application's origin with an encoded `join` parameter. Share your stats shows a card preview and a Download image action, saving `<username>-chainframe-stats.png`; it has no X post composer, copy-post control or social-site launch action. HASH/SPARKS, Soul Studio attribution and configured social/account destinations remain unchanged. Artwork uses the CHAINFRAME wordmark and the existing HASH coin identity; see [asset prompts](ASSET_PROMPTS.md#chainframe-brand-artwork).

New payout/refund memo labels use Chainframe for withdrawals, marketplace seller payouts/buyer refunds and registration/shop refunds. Incoming payment envelopes, amounts, routing, authority, fees and exact verification remain unchanged. Never rewrite earlier memos or intents: a memo mismatch parks settlement without rebroadcast. The existing `cryptocore` database/default and `hiveStreamCheckpoint` lease ID intentionally remain persistence identifiers. Review outstanding work with the old worker before the coordinated application/worker restart, then refresh assets, reload clients, authenticate again and verify readiness. No historical balances, logs, receipts or 10 HASH registration awards are converted.

The implementation differences in section 13 are part of this review. They must not be interpreted as new approved rules or silently fixed during unrelated work.


### Equipment totals and the mechanics cutover

Shared stat rules derive Hash Rate from its permanent level, Hack Power/Security from level ×10, Luck from its existing staking table, Firewall from its existing 1% base and staking table, and Exploit from its existing Notoriety table. Add each validated equipped item's rolled bonuses once. Player Luck remains clamped to 0–100%. Sabotage and Help separately calculate `clamp(25 + player Luck, 0, 100)` percent success chance; the 25% never belongs to general player stats. Apply remaining sabotage strength to the entire relevant total, never to permanent levels. The POWER / SPARKS card score remains salvage value.

Gameplay reads referenced equipment, requiring matching owner, slot, equipped status and availability. Missing or inconsistent evidence fails explicitly. Stored `stats` is derived data, not independent authority. Profile, raid targets, projections, mining scores and potential-output analytics share these inputs; batch reads stay within the existing collections. The level-only global minerate counter and pricing formulas remain unchanged.

Mining applies the softcap once and keeps effect-history segmentation. Before gear changes or permanent Hash Rate upgrades, settle the previous interval. `EQUIPMENT_STATS_EFFECTIVE_AT` is the shared UTC cutover: old level-only mining before it, equipment-inclusive mining afterward. The checked-in candidate is **2026-10-17T03:30:00.000Z**. Set it to the agreed first deployment time before release; once deployed it is immutable across rebuilds and restarts. Previously credited balances and receipts are never rewritten.

Raid eligibility requires affected total Hack Power **strictly greater** than affected total Security. Ineligible submissions consume no raid charge and clear no effects. Eligible success chance is `100 − clamp(total defender Firewall, 0, 100)` percent. Only attacker Exploit controls raid critical chance; a critical doubles the existing 10–50% stolen exposure, capped at 100%. Existing risk, capacity, destruction, protection, charges and rewards remain in force.

Sabotage and Help first use `clamp(25 + actor total Luck, 0, 100)` as their percentage success chance, then roll 10–50% strength on success, without criticals. The worker's private saved action seed makes the draws deterministic. A valid failed roll consumes exactly one item, records `success: false` and `itemConsumed: true`, and changes no effects. It is a processed action, not a rejected submission. Invalid eligibility consumes nothing; existing guarded-write rejection restoration and unknown-write parking remain. Failed attempts count toward social limits. Existing effects retain their recorded strength/critical evidence until normally cleared.

Sabotage does not require exceeding target Security. The target list includes stronger players; “beatable only” affects raid presentation only. The own-sabotage Help restriction still covers every stat of a target.

## 1. Player lifecycle and resources

Recorded-activity messages distinguish purchases, refunds, withdrawal requests and paid outcomes. Shop notifications name the purchased stack and quantity; HASH uses the recorded charge and HIVE uses the recorded hiveAmount, without current-price recalculation. Missing evidence is omitted rather than shown as zero or an assumed currency; genuine recorded zeros remain visible. Registration shows its recorded HIVE fee and startingHash award only. Refunds, withdrawal compensation and queued withdrawals are informational; a queued request is not a payout. Toasts and Recent history share these messages with Histories, whose raid colors still describe direction independently from outcome. Receipt-only messages remain generic when details are unavailable. This changes presentation only, not balances, settlement, historical records or confirmation behavior.

Hive Keychain authentication proves control of the wallet. Paid registration is a separate one-time **75 HIVE** transfer to the treasury with registration intent. After verification, the guarded registration transition also adds **10 liquid HASH** to the existing balance atomically; a 3.5 HASH balance becomes 13.5. This applies only to new registrations, not previously registered records. The worker adds the player's starting level-based minerate once. Duplicate processing and competing registrations cannot grant another starting balance or minerate contribution. A different duplicate registration payment or incorrect verified fee follows the existing refund path. Pending broadcasts, refunds and invalid evidence award nothing. Interrupted later settlement effects retain the proven registration/reward and park for review, without automatic recredit or compensation.

Sign-in accepts valid Hive account names containing digits, hyphens and dots, such as `player123`, `player-one` and `player.one`. Input is trimmed and lowercased, without removing valid punctuation. Names total 3–16 characters; each dot-separated label is at least three characters, begins with a letter and ends with a letter or digit. Underscores and other special characters are invalid. The same rules apply to authentication and gameplay target names; a valid name still requires a verified Keychain Posting signature to sign in.

New records default to level 1, XP 0, liquid HASH 0, SPARKS 0, vault 0, vault stake 0, Notoriety 0, five claim charges and eight raid charges. All six stored stat levels start at 1. Authentication alone does not grant playable funds or complete registration. Challenge-only shells receive first-touch/referral initialization on authenticated profile retrieval.

REGISTRATION_STARTING_HASH defines the 10 HASH starting award. It grants no XP, referral reward, vault funds or SPARKS and is neither a deposit nor mining/claim emission. Registration logs and receipts retain the HIVE fee as amount and separately record the actual startingHash award. History shows that recorded value only, and the existing personal-history confirmation refresh supplies the spendable balance without optimistic client credit or another toast owner. No historical records are repriced or backfilled; application and worker must deploy together.

| Resource             | Earned / received through                                                        | Used for                                                           |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Liquid in-game HASH  | Claims, verified token deposits and referral rewards                             | Stat upgrades, staking, HASH shop purchases and withdrawals        |
| Unclaimed vault HASH | Mining and successful raid proceeds                                              | Claims; exposed to raids and failed-raid risk                      |
| SPARKS               | Equipment salvage                                                                | Equipment upgrades                                                 |
| Notoriety            | Actual successful-raid credit, failed-raid defender reward                       | Withdrawal capacity and the UI/shared Exploit table                |
| XP                   | Stat upgrades, equipment upgrade value gain, salvage and successful server raids | Displayed player level; cosmetics use their existing unlock policy |
| Claim / raid charges | Time-based regeneration                                                          | Limit action frequency                                             |

On-chain HASH and in-game liquid HASH are separate balances. A transfer must settle before it credits game funds. New marketplace purchases use native HIVE sent to the market account, separate from in-game HASH. SPARKS have no external transfer flow. Staking has no implemented unstake action. There is no dedicated HASH burn action.

### Limited-time registration starter pack

From **19 October 2026, 08:00 Singapore (00:00 UTC)** inclusive until **2 November 2026, 08:00 Singapore (00:00 UTC)** exclusive, qualifying new registrations completed after this offer is deployed receive **4 unopened Equipment Chests, 10 Sabotage Devices and 10 Help Kits**, in addition to the existing **10 HASH** award. Registration remains **75 HIVE**. Use the verified irreversible registration payment block time, not login time, browser time or settlement time. Eligible payments remain eligible when processing completes after the deadline. Previously completed registrations receive no retrospective credit.

Items add to existing Inventory → Items stacks; chests retain normal opening rules and fixed rarity odds. The package is not a Shop purchase and generates no additional referral reward. A registration decision is saved before effects and actual grants are recorded before success. Interrupted/unknown multi-document writes park without regrant or compensation; the registration/10 HASH write remains atomic on its own. Recorded history describes only actual awards. Discord participation and rankings do not gate the package; the separate invite contest awards 75/45/30 HIVE after staff verification, without automated application payouts.

## 2. Stats and upgrades

Stats, balances, vault values and percentage bonuses display up to four decimals, trimming trailing zeros (100, 1.2, 0.1632). Mining rates normally display up to five decimals; positive rates too small to be visible use additional precision. HIVE prices/payment totals display up to three decimals. Levels, quantities and charge counts stay integers. Formatting never rounds stored gameplay values.

| Stat        | Intended/shared role                 | Current ownership                                                                                        |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `hashRate` | Mining output | Permanent level plus equipped bonuses, affected by sabotage and the mining softcap |
| `hackPower` | Raid eligibility | Level ×10 plus equipped bonuses, scaled by active effects |
| `security` | Raid eligibility defense | Level ×10 plus equipped bonuses, scaled by active effects |
| `luck` | Bonus to Sabotage / Help success | Vault-staking table bonus + equipped Luck, clamped to 0–100%; social actions separately add a 25% base success chance |
| `firewall` | Raid block chance | 1% base + existing staking table + equipped Firewall |
| `exploit` | Raid-only critical chance | Existing Notoriety table plus actual equipped bonuses |

The dashboard offers permanent upgrades for Hash Rate, Hack Power and Security. Each upgrade charges the current level before incrementing it:

```text
single upgrade at level L = max(1, L²) HASH
bulk cost from level L for k levels = sum(max(1, (L + i)²), i = 0..k-1)
```

Level 1 to 2 costs 1 HASH and awards 10 XP; level 2 to 3 costs 4 HASH. Level 1 to 3 costs 1 + 4 = 5 HASH, level 1 to 4 costs 14 HASH, and level 5 to 7 costs 61 HASH. Bulk stat upgrades accept 1–10,000 levels. They debit once, update the level and award `round(cost × 10)` XP. Hash Rate upgrades on registered players add one combined level delta to global minerate in the ordered database operation.

The protocol accepts all six stat names, although the UI offers only three. Do not assume derived-stat upgrade rejection exists; see section 13.

This formula applies to upgrades processed by the updated worker. Completed balances, XP, logs and receipts are not repriced. Deploy the application and worker together. Equipment upgrades and shop prices retain their existing rules.

Sources: [stat helpers](../features/types/game/stats.ts), [stat upgrade event](../features/events/backend/upgrade-stat/action.ts), [game constants](../lib/config/constants/game.ts).

## 3. Vault, mining and inactivity

```text
capacity = round(1 + max(0, vaultStaked))
effectiveHashRate(H) = max(0, H), when H <= 333
                    = 333 + (H - 333) × 0.5, otherwise
HASH per second = (effectiveHashRate(H) + 1)² / 172800 × decay
```

At starting Hash Rate 1 and full decay multiplier, mining is approximately 0.000023148 HASH/second, or 2 HASH/day before the capacity cap. With no stake, capacity is 1 HASH and fills in about 12 hours. A full vault stops accepting additional mined HASH; there is no overflow credit.

Staking a positive amount spends liquid HASH and increases `vaultStaked` permanently. Capacity is rounded, so fractional stake does not guarantee an equal fractional capacity increase. Staking awards no XP and records activity.

Idle decay reads `lastSinkAt`:

```text
days = max(0, (now - lastSinkAt) / 86400000)
decay = 1, through day 14
      = max(0.9 ^ floor((days - 14) / 7), 0.25), afterward
```

The first weekly reduction occurs at day 21 under this formula. Missing `lastSinkAt` means full rate. Current writes to this timestamp and omissions are listed in section 13; comments describing only upgrades/chests as sinks are incomplete.

Server ticks bring vault accounting to the captured action time, cap/round it to six decimals, advance `lastTickAt` and update mining milestones. A Hash Rate effect splits elapsed mining at sabotage/help application times so the affected portions use their historical strength. Decay is evaluated at the tick's end time rather than integrated across every weekly boundary.

The shared pure `vaultAtTime` calculation supplies both server ticks and opponent estimates, using resolved equipment stats and the same effect/cutover intervals. Estimation alone never persists vaults, timestamps or milestones.

The client projects growth from its authoritative snapshot using the shared clock. Projection is a display estimate and never changes balances, inventory, milestones or persisted player state. Ordinary profile GETs do not themselves settle a mining tick; gameplay dispatch settles before relevant actions.

Sources: [mining formulas](../features/types/game/mining.ts), [server tick](../features/events/backend/tick-player/action.ts), [client projection](../lib/utils/game/mining-projection.ts).

### Current global mining statistics

Stats shows registered-player count, global HASH/second and its HASH/day equivalent. It sums each registered player's current authoritative rate, including softcap, decay and active Hash Rate Sabotage/Help, independently of vault fullness. It follows the worker's existing level-only input. HASH/day is labelled at current rates, not as actual emission accumulated today; the globalMinerate level counter is not HASH/second. No mining-history logs or chart are added.

Daily charts use existing correlated logs and successful receipts: first paid registrations, claimed HASH, actual stolen credits, Equipment Chests opened, salvage SPARKS, recorded stat-upgrade HASH, equipment-upgrade SPARKS, completed raids, HIVE market purchases and settled HASH deposits/withdrawals. Rejected, unresolved, refunded and uncorrelated work does not count. Bulk stat levels and individual equipment steps remain distinct; historical costs are never recalculated.

Graphs use UTC execution dates, include today as partial, and offer 7/30/90 days. Current registered-player counts and completed registration events are distinct measures. Shop pricing still uses its existing claimed-HASH completed-day counter and ratchet. Opening Stats creates no gameplay or financial effects.

Sources: [statistics API](../app/api/game/stats/route.ts), [aggregate mapping](../lib/api/dto/game-stats.ts), [current mining calculation](../features/types/game/mining.ts).

## 4. Claims and charges

A claim regenerates/checks charges, settles elapsed mining, rejects an empty vault, then moves the entire vault into liquid HASH and consumes one claim charge. It clears the player's stat effects and records the exact claimed amount in a correlated log. Claimed HASH increments total claims and the UTC daily emission counter. Claim feedback reads that log amount rather than inventing an amount from generic receipt success.

Claim capacity is five charges. Shared charge calculation adds one every four hours and anchors the clock when full to prevent an instant refund after spending. Raid capacity is eight in the authoritative reservation path and uses the same four-hour interval.

The UI/shared helper reduces its displayed raid maximum by one every five idle days, to a minimum of one. The server currently reserves against a fixed maximum of eight; this discrepancy is documented rather than treated as an enforced penalty.

Source: [claim event](../features/events/backend/claim-vault/action.ts), [charge formulas](../features/types/game/charges.ts).

## 5. Equipment, forging and salvage

One item can occupy each of six slots: ASIC Miner, Motherboard, Power Supply, Cooling System, Network Module and Firmware Chip. Equipping verifies ownership/availability and replaces the prior equipped item in that slot; the player stores its item reference. Listed or salvaged items are unavailable. Unequipping clears the matching reference.

New chest equipment starts at item level 1. Rarity controls the number of distinct rolled stats and their value scale:

| Rarity    | Index / stat count               | Unscaled per-stat roll |
| --------- | -------------------------------- | ---------------------- |
| Common    | 1                                | 0.1–1                  |
| Uncommon  | 2                                | 0.2–2                  |
| Rare      | 3                                | 0.3–3                  |
| Epic      | One shared 50/50 index of 4 or 5 | 0.4–4 or 0.5–5         |
| Legendary | 6                                | 0.6–6                  |

Hack Power and Security rolls are multiplied by ten; rolls are rounded to one decimal. An item never repeats a stat. ASIC guarantees Hash Rate, Network Module guarantees Hack Power, and Cooling System guarantees Security as the first roll. Other slots have no guaranteed signature stat.

Server equipment rolls use namespaced deterministic RNG inputs with private server seed material for rarity, slot and stats. Preserve that seed across processing retries; a client-selected nonce does not independently determine loot.

```text
salvageValue = 0.5×hackPower + 0.5×security + 5×hashRate
             + 5×firewall + 5×exploit + 10×luck
forge cost = salvageValue × 0.0498 × current item level, in SPARKS
each successful forge level = each rolled stat × 1.05, rounded to 4 decimals
```

Equipment upgrade broadcasts accept 1–100 levels. The worker executes levels sequentially in the enclosing database operation. An interrupted upgrade can leave earlier writes applied and is parked for review; it is never automatically replayed. XP is `round(max(0, newSalvageValue - oldSalvageValue) × 100)` per level, based on value gained rather than SPARKS spent.

Salvage marks an unequipped/unlisted owned item salvaged/unowned, credits its current salvage value in SPARKS and awards `round(value × 100)` XP. It is not reversible through a gameplay action.

Sources: [authoritative equipment minting](../features/events/backend/equipment/chest.ts), [item formulas](../features/types/game/items.ts), [item repository](../lib/modules/equipments/server.repository.ts).

## 6. Shop and dynamic pricing

Shop displays Equipment Chest, Sabotage Device and Help Kit in one shared product grid, without separate category headings or pricing-stat cards. Cards retain quantity controls, owned counts and HASH/HIVE purchase options, with matching responsive sizing and bottom-aligned actions. Chest Info/Back shows base odds; the explanation below the grid directs players to open owned chests in Inventory. Game activity Stats shows the existing quote response's pricing excess above its completed-day threshold, using recorded claims rather than current potential mining output. The row has no graph; unavailable quotes remain unavailable and stale values are labelled. This presentation does not change emission recording, ratcheting, prices or charges.

Only the `equipment` Equipment Chest is sold and accepted by the current purchase contract. All five equipment rarities remain active loot outcomes.

| Product         | HASH price                                                  | HIVE price                            |
| --------------- | ----------------------------------------------------------- | ------------------------------------- |
| Equipment Chest | 100 + excess emission × 0.01, rounded half-up to whole HASH | Fixed 10 HIVE/unit; 1–25 per purchase |
| Sabotage Device | 1 + excess emission × 0.0001, rounded half-up to whole HASH | Fixed 0.1 HIVE/unit                   |
| Help Kit        | 1 + excess emission × 0.0001, rounded half-up to whole HASH | Fixed 0.1 HIVE/unit                   |

HASH purchases are signed game actions spending in-game liquid HASH. HIVE purchases use native transfers with shop_purchase metadata. Both credit owned inventory stacks; buying a chest does not mint equipment. Inventory opens one owned chest at a time without another HASH/HIVE charge. Prices and owned counts come from authenticated reads; expected HASH prices only guard against stale quotes. Neither path relies on payment acknowledgement POSTs. Unique gear lives in equipments and stack quantities in items, independently of player persistence.

### Emission and minerate formulas

Emission is HASH claimed during a UTC day, not all mining or token deposits. Pricing uses a monotonic high-water mark of completed-day emission:

```text
excess = max(0, pricedEmission - 100000)
emissionMultiplier = 1 + excess × 0.01 / 100
chestPrice = max(1, roundHalfUp(100 + excess × 0.01))
consumablePrice = max(1, roundHalfUp(1 + excess × 0.0001))
```

HASH unit prices round half-up to the nearest whole number with a minimum of one and arithmetic-noise handling at boundaries. Each formula rounds directly; consumables are never derived from an already-rounded chest. All wallets share the emission tier. At 101,000 emission: chest 110 HASH, consumable 1 HASH; at 105,000: chest 150 HASH, consumable 2 HASH. There is no personal multiplier. Quotes and authoritative spending use the same formulas.

HASH bulk totals multiply rounded integer unit prices by quantity, rejecting unsafe totals before spending. Expected HASH quotes must be positive safe integers; stale quotes are rejected before debit. HASH shortfalls round upward to four trimmed decimals while affordability uses the actual balance. Fixed HIVE prices remain 10 per chest and 0.1 per consumable, independent of emission. HIVE totals use integer milli-HIVE and retain three-decimal transfer serialization (0.1 is sent as 0.100); display trims zeros.

The emission feature ratchets completed days with atomic maxima, caches outside game execution by UTC day, and limits catch-up to the configured 31-day window. Current-day claims do not immediately change the day's price tier.

Global minerate is the sum of **registered players' `statLevels.hashRate` values**, not HASH/second. Registration adds the initial contribution once; registered Hash Rate upgrades add the new-minus-old level value. Gear, effects, ticks, decay and other stat upgrades never change this aggregate. Missing stored total is zero; the retained shop statistic reports a floor of one without storing it. Global and player minerate fields are informational and do not influence prices. Shop shows purchase quotes without pricing-stat cards; Game activity Stats shows pricing excess.

The transport schema allows up to 100 consumables in HASH action metadata; the HIVE amount helper enforces a maximum of 25. The purchase-event Zod schema also declares 25 but is not invoked by the current action dispatcher. See section 13 before relying on one universal limit.

Sources: [pricing formulas and HIVE amount helpers](../lib/utils/game/pricing.ts), [emission workflow](../features/events/backend/shop-pricing/emission.server.ts).

## 7. Chest odds and referrals

The Equipment Chest's configured base ladder is:

| Common | Uncommon | Rare | Epic | Legendary |
| ------ | -------- | ---- | ---- | --------- |
| 70%    | 20%      | 8%   | 1.8% | 0.2%      |

Rarity uses the fixed ladder with no Luck adjustment: Common 70%, Uncommon 20%, Rare 8%, Epic 1.8%, Legendary 0.2%. Player levels, vault stake and gear do not affect rarity.

Luck is not read when an owned chest is opened. Buying and opening use separate signed actions: purchase_chest buys 1–25 units; open_chest accepts itemId/nonce and consumes exactly one. Protocol ID/version remain unchanged; the former paid-opening metadata is rejected. Purchases record quantities and charges; only actual opening logs count as minted equipment or opened chests.

First-touch profile retrieval accepts an existing non-self referrer and assigns it once. REFERRAL_REWARD_BPS is 500: the first successful paid registration and every Shop purchase (chests, Sabotage Devices and Help Kits) reward 5% of the actual total in the currency paid. HASH purchases use integer hundredth-HASH calculations and atomically credit the referrer's liquid HASH and HASH-only referralEarned counter. HIVE purchases never create HASH rewards. HIVE uses integer milli-HIVE, flooring the reward once on the entire payment and discarding smaller remainders. Registration at 75 HIVE pays 3.75 HIVE; 150 HASH pays 7.5 HASH; 1 HASH pays 0.05 HASH; 10 HIVE pays 0.5 HIVE; 0.1 HIVE pays 0.005 HIVE. Bulk rewards use the total, without whole-HASH or per-chest rounding.

The referrer must already exist and cannot be the buyer; no registered-referrer requirement or recipient profile creation is added. Open `/?join=<inviter>` and sign in (or restore the authenticated session) before registration payment. The link may attach to an existing initialized account only while it is unregistered, has no referrer/registration transaction and has no registration job or receipt. The inviter is assigned once, normalized to its Hive username, and only the assignment winner increments the referral count. Other links never replace an existing referrer or change paid/pending registration attribution. The dialog displays the server-confirmed referrer before payment. No automatic historical attribution or reward backfill occurs.

Missing attribution, duplicate registration fees, rejected payments and refunds create no payable reward. Login, opening owned chests and marketplace activity create no referral reward; the marketplace fee and player's 10 starting HASH are unchanged.

New registration/Shop jobs require referralPolicyVersion 1. Exact incoming verification captures immutable private attribution, payment basis, operation identity and treasury sender before fulfillment. The player's successful log/receipt and ordinary write markers finish before the separate HIVE payout. A pending or parked referral never reverses registration/stock, refunds a completed purchase or delays the player's confirmation. Payouts use the existing broadcast-once treasury protections; uncertain/missing-ID/failed transfers or changed evidence require review and never rebroadcast automatically. Only a verified payout creates a keyed HIVE earnings log. Referrals shows HASH credited in-game and HIVE paid to the Hive wallet separately; pending rewards count as neither paid HIVE nor HASH. Rewards remain outside claims, mining emission, deposits and withdrawals. No historical rewards or unsupported old jobs are converted or backfilled.

Sources: [opening and minting](../features/events/backend/equipment/chest.ts), [stock purchases and referrals](../features/events/backend/purchase-item/action.ts), [profile initialization](../features/events/backend/player-lifecycle/initialize.ts).

Native payout release status (2026-10-22): published SDK 1.2.1 corrected the native signing defect reproduced in 1.2.0. The application now pins 1.2.2 exactly; its eight-case independent signing gate passes using synthetic credentials and intercepted RPC. This patch fixes abort-listener cleanup without changing gameplay, the application finality wait or canonical reread. HIVE and HBD remain the public payment symbols, with no application currency conversion or alternate payment signer. This does not claim a live payout was performed. Previously parked referral obligations remain unpaid until exact irreversible transfer verification; an SDK upgrade never resends them automatically. Registration/stock and the 10 starting HASH remain confirmed independently. See [SDK reproduction, verification and operator recovery](HIVE_SDK_PAYOUT_REPRODUCTION.md) for the release gate and preserved-intent procedure. No additional reward, backfill or compensation is introduced.

SDK installation policy: application and worker use the same exact verified published npm release from the committed package manifest and lockfile. Vercel installs dependencies normally; installed SDK files are never edited or committed, and the persistent worker is hosted separately. Current SDK 1.2.2 uses the existing worker finality wait and canonical reread. Request deadlines and an SDK irreversible-stream mode are not implemented here, so this rollback does not resolve prolonged network waits. Dependency changes never reset or resend uncertain financial work.

## 8. Raids and Notoriety

Raid targets are real player records, not generated rivals. The read endpoint excludes the caller, selects up to 100 by stored vault descending and includes stronger players for social actions. Each returned vault estimates unclaimed HASH including elapsed mining at one server timestamp; an opponent does not need to log in. The UI labels these as Estimated vault and sorts estimated values within the selected batch. Existing ten-second, focus/visibility, manual and post-confirmation refreshes replace these snapshots; values do not animate between reads. The GET performs no mining writes. This candidate list is not settlement authorization or guaranteed loot.

The worker rejects missing players, self-raids and insufficient effective Hack Power before effects, then settles mining for both participants sequentially at the captured action time and rereads them. It reserves one raid charge atomically and clears the target's stat effects only after accounting for their historical mining impact. Loot uses the defender's settled vault; attacker capacity and failed-raid risk use the attacker's settled vault. The attacker's own effects remain until the attacker claims or is raided. Protection blocks a target for 60 seconds after a landed raid. A claim, raid or other action between viewing and execution can change the actual amount; estimates are never submitted as authority. Historical outcomes are not recalculated or compensated.

The authoritative chance currently is:

```text
eligible = affected total Hack Power > affected total Security
chance = eligible ? 1 - clamp(defender total Firewall, 0, 100) / 100 : 0
```

Temporary Hack Power/Security effects scale the full corresponding totals. A private persisted execution seed is mixed with actor/target/action identity; UI chance estimates do not control the result.

On a successful roll:

1. Roll base exposure uniformly from 10% to 50%.
2. Critical probability is `clamp(totalExploit, 0, 100) / 100`; a critical doubles exposure up to 100%.
3. Preserve fractional HASH: round the exposed share and attacker free space down to six decimal places, matching vault accounting precision. Display up to four trimmed decimals.
4. Remove the taken amount from the defender; credit only available attacker vault space. Excess is destroyed.
5. Attacker Notoriety equals the amount actually credited, not total removed. Server win XP is **10**.

A failed roll burns the attacker vault × base exposure, rounded down to six decimals, from the attacker. That amount becomes defender Notoriety, not defender HASH. Protection blocks produce no transfer/reward. For example, a 2 HASH vault at 40% exposure loses 0.8 HASH; with 0.25 HASH attacker free space, 0.25 is credited and 0.55 destroyed. Empty vaults, full attacker vaults or loot below six-decimal precision can still produce a resolved win with zero credit. Existing raid records are not recalculated or compensated.

Stat-specific social effects do not award supporter Notoriety from raids.

Sources: [raid workflow](../features/events/backend/raid/action.ts), [server chance/outcomes](../features/events/backend/raid/calculations.server.ts), [exposure/transfer formulas](../features/types/game/exposure.ts).

## 9. Sabotage and Help

Inventory defaults to Items: owned chests and consumables share matching cards, and zero-quantity stacks are hidden. Equipment has its own tab with search, slot/rarity/equipped-status filters, equipped-first sorting and existing equipment actions. Buy chests in Shop, then use Open one on the Items tab. Switching tabs or consuming the last chest does not interrupt Submitted tracking or the confirmed reward reveal; rewards still require authoritative inventory refresh. Refresh reads both inventory snapshots together, with unavailable/stale quantities explicitly identified rather than shown as zero. These layout changes do not change rolls, prices or item use. Dashboard shows Active effects immediately after Permanent stats, reading the same authoritative public effect state. Effects have no timed expiry: Help reduces strength, while claims or raids clear them.

Sabotage Devices and Help Kits are stacks in items, separate from equipment and player documents. Each application consumes one owned unit and selects Hash Rate, Hack Power or Security. Self-targeting is rejected. Sabotage rejects protected targets and an already active effect on the same stat; Help requires a still-active sabotage on that stat.

```text
base strength = uniform 0.10..0.50
success chance = clamp(25 + staking Luck bonus + gear Luck, 0, 100) / 100
new social criticals = false
remaining strength = clamp(original sabotage - sum(help strengths), 0, 1)
effective stat = nonnegative base × (1 - remaining strength)
```

Different stats may each have an effect, but one stat cannot have multiple simultaneous active sabotages. Fully countered effects can be replaced. Help history records when each contribution occurred so mining can account for elapsed intervals. Effects have no timer; the target's claim or raid resets all stat effects.

Help is blocked on every stat of a target while any sabotage applied by the helper still has remaining strength. A partial counter keeps this restriction; all of that helper's effects must be fully countered or cleared before they can help again. Other players remain eligible. The backend checks stored effects before consuming a Help Kit, rejecting with `own_sabotage` without consuming inventory or creating a successful Help log. The target response supplies viewer-specific eligibility; missing eligibility disables Help and offers manual target refresh. Stale browser data cannot bypass backend enforcement.

Applying effects grants no immediate HASH, XP or Notoriety. Inventory consumption and guarded effect writes prevent duplicate application, restoring units only after definitively rejected guarded writes; unknown outcomes remain parked without inventory restoration. Social action limits are ten per caller per minute, enforced through the processing feature's log checks plus existing local concurrency/rate guards.

Public effect DTOs expose remaining/original strength, critical and helped flags without application account/item details. Local feedback does not alter authoritative effect state.

Sources: [effect rules](../features/types/game/stat-effects.ts), [sabotage event](../features/events/backend/social-actions/sabotage.ts), [help event](../features/events/backend/social-actions/help.ts).

## 10. Marketplace, deposits and withdrawals

### Marketplace

Browse includes all available listings, including your own; My listings shows only your wallet's listings. Both share name, slot, rarity and maximum HIVE price filters and directional sorting. Mobile filters expand on demand. The header shows native HIVE wallet balance; unavailable reads never imply a zero balance. Purchase/cancel actions retain their existing registration, readiness and confirmation rules. Personal marketplace activity and global sales are in avatar → Histories, not inline on Marketplace.

Marketplace is authenticated browsing, also available before registration. Purchases require confirmed registration in the frontend and worker. After exact payment verification, an unregistered or missing buyer cannot reserve an item and receives a full verified market-account refund. Terminal rejection follows confirmation; uncertain refunds remain parked. Already-reserved purchases continue their existing recovery without retroactive eligibility rejection.

Owners manually list unequipped, unsalvaged equipment at positive HIVE prices in increments of 0.001 using market_list with required currency: "HIVE"; market_cancel removes an available listing. Authenticated browsing returns HIVE listings only. Purchase sends native HIVE to the configured market account using the unchanged market_purchase memo and item identity. The listing form starts empty; there is no HASH-derived price suggestion.

Settlement verifies native sender, market recipient, exact amount, memo/item identity, operation index and irreversibility, then atomically reserves the exact seller, HIVE currency, price, listing timestamp and available item. Fee calculation uses integer milli-HIVE: feeMilli = floor(priceMilli × 500 / 10,000), sellerMilli = priceMilli − feeMilli, with overflow-safe intermediates. A new 0.100 HIVE trade pays the seller 0.095 and forwards the recorded 0.005 fee from the market account to treasury. Seller ownership remains until a verified market-account payout. Reserved items stay unavailable and reject mutation. Recovery reuses proven payout and guarded ownership/effects. Unavailable listings receive full verified buyer refunds; definitive seller failure requires confirmed refund before releasing a reservation. Unknown broadcasts remain parked without rebroadcast.

For new marketplace jobs, fee routing is captured privately and remains immutable. Buyer purchase completion is independent of fee delivery: after verified seller payment and the ordinary purchase receipt, the item reservation is released so the buyer can use or resell it. The fee then uses the existing SDK native HIVE transfer path, signed by the market account, with its own broadcast-once intent and irreversible confirmation. Only that sale's recorded fee is sent; unrelated market funds are never swept. Zero-rounded fees send nothing. If market and treasury are the same account, the fee is already held in treasury and no self-transfer is made.

A pending, failed or uncertain fee never refunds a completed purchase, reverses ownership, repays the seller or produces a buyer-facing failed-purchase notification. The fee obligation stays on the existing parent job for recovery, while the successful purchase remains confirmed and is excluded from the buyer's pending list. Missing or changed routing parks instead of redirecting funds. Final transfer evidence is archived before parent cleanup. Supported old jobs retain their previous fee-retaining behavior; no historical fee forwarding or backfill is performed. Review outstanding jobs before coordinated application/worker deployment; automated tests never send live payments.

### Deposits

The wallet payment flow currently accepts positive safe-integer amounts, serializes three decimals and transfers HASH with deposit metadata. Settlement verifies the exact amount and credits liquid game HASH once. Deposited tokens stay in treasury and replenish liquidity for later withdrawals. Deposit does not mint equipment or grant XP.

### Withdrawals

`request_withdrawal` requires Active authority and a positive whole-HASH amount. It first persists an immutable prepared payout job, then atomically debits HASH, reserves capacity and records the operation identity on the player. Only proven reservations activate payouts. Repeated identities do not spend twice; interrupted activation/request receipts recover from the durable job and reservation:

```text
capacity = floor(10 + max(0, notoriety) × 0.10) HASH
```

The repository uses a rolling 24-hour reset window established when the prior window expires, not a UTC-midnight reset. The worker sends HASH to the player's Hive account and records a separate financial receipt/log. The Custom JSON request receipt confirms queuing; it is not itself proof that the treasury payout settled.

New withdrawals use one full-amount payout selected from verified treasury token state. If treasury liquid HASH covers the withdrawal, the worker transfers existing tokens. Otherwise it issues the full amount directly to the withdrawing Hive account, leaving any partial treasury balance untouched. For a 10 HASH withdrawal, treasury balances of 10 or more transfer 10; balances of 3 or zero issue 10. There is no partial transfer plus partial mint. Minting requires treasury issuer authority, matching token precision and enough remaining maximum supply. Missing prerequisites or unavailable/malformed token-state reads park the withdrawal before broadcasting instead of assuming an empty treasury.

The selected transfer-or-issue intent is immutable once saved. Deposits and later balance changes cannot change it. Both operations use the existing published SDK 1.2.2 and exact withdrawal memo envelope. Issuance confirmation independently verifies its exact irreversible canonical Hive operation and successful matching Engine issuance evidence; a returned transaction ID alone does not mean tokens were issued. Existing supported jobs remain transfer-only without migration or historical rewrites.

Outgoing transfers are submitted after broadcast and become confirmed only after exact matching irreversible execution; HASH additionally requires successful Hive Engine execution. Pending execution does not consume failure retries. Definitive withdrawal failure restores reserved HASH once, releasing capacity only in the matching withdrawal window. Unknown broadcasts, missing IDs and RPC failures never trigger refunds or rebroadcasts. Withdrawal/market keyed effects recover proven steps; unsupported financial evidence and unrelated interrupted effects remain parked. No burn, unstake or arbitrary asset-withdrawal action is introduced.

These same confirmation and compensation protections apply to newly issued withdrawal payouts. A definitively failed transfer restores in-game HASH rather than falling back to a mint; the player may submit another withdrawal after restoration. Errors alongside possible execution remain uncertain. Final receipts retain private operation evidence before cleanup; the public queued-versus-paid activity flow and personal-history confirmation owner are unchanged. Deploy application and worker together after reviewing outstanding jobs and verifying issuer configuration/readiness. Automated validation never broadcasts live payments.

New signing/payment requests require an uncached worker-readiness preflight and the current wallet session. An unavailable banner offers a manual retry; existing confirmations and browsing continue. Readiness can change after preflight and cannot prevent independent Hive broadcasts.

Market signing uses HIVE_MARKET_ACCOUNT/HIVE_MARKET_ACTIVE_KEY; NEXT_PUBLIC_HIVE_MARKET_ACCOUNT is the browser recipient. Outgoing intents retain private account alias/sender evidence; changed configuration parks work rather than changing sender. Unsupported currencies, workflow versions and missing signing evidence are parked for review; they are never inferred or converted. Marketplace history requires explicit HIVE currency. Historical prices/receipts are not converted or rewritten. Stop the old worker, deploy application and worker together, rebuild public configuration and reload clients. Verify account readiness and controlled purchase/payout/refund settlement before publication; automated tests never broadcast.

The existing wallet balance endpoint optionally accepts asset=HIVE (symbol HIVE, precision 3) and bypasses Engine reads; omission retains HASH and unsupported assets return 400.

## 11. XP, cosmetics and milestones

Shared display progression uses cumulative XP:

```text
level = floor(sqrt(max(0, XP) / 1000)) + 1
XP needed to reach level N = (max(1, N) - 1)² × 1000
```

Stat spending grants 10 XP/HASH. Salvage grants 100 XP/SPARK credited. Forge grants 100 XP per SPARK of salvage-value gain, rounded per upgrade. The authoritative raid event grants 10 XP, despite a separate shared constant specifying 100. Claims, chest purchases, stakes, consumable applications and deposits have no explicit XP awards.

Cosmetics come from [shared game templates](../features/types/game/templates.ts), not item collections. Default avatar/banner/background IDs are 0/100/200. Soulbound defaults are always available; other entries require their configured level (generated in four-level steps, capped at 100). `equip_cosmetic` verifies kind/unlock and persists the selected template ID.

The UI derives level from XP, but server cosmetic permission checks the stored player `level`; current XP writes do not update that field. Treat higher-level cosmetics as an implementation gap until reconciled.

Milestones include total claimed/mined, raid counts/wins, stolen HASH and a field called `bestHashRate`. Current tick code updates that last field from the vault amount; its label does not guarantee a hash-rate measurement.

## 12. Player-visible action completion

The avatar menu's Histories modal browses recorded activity by category, defaulting to Claims. There is no personal All selection; every selection shows its latest 100 logs without Load more. Raids share one selection: outgoing raids are green and incoming raids red, including losses; descriptions separately state the outcome. Outgoing wins show actual attacker credit, while incoming wins show the amount removed from the defender, which can include destroyed excess. Equipment minting records actual owned-chest openings, independently of how the chest was purchased. Withdrawals distinguish queued requests, paid payouts and compensated reservations. Personal marketplace activity includes refunds; the separate global-sales selection shows HIVE sales across all players. This read-only view adds no confirmation, gameplay effects or receipt-only rejected submissions; Recent history and Submitted retain their existing roles.

Supported signed actions are claim, vault stake, stat/equipment upgrade, raid, sabotage, help, equip/unequip, salvage, chest/consumable HASH purchase, market list/cancel, cosmetic equip and withdrawal request. Each has a strict schema, action nonce and operation signing requirement.

The Game activity popover has Submitted and Stats tabs in the Recent history layout, starting on Stats. The Activity button shows the exact unresolved current-session submission count, including delayed and unknown outcomes, and hides the badge at zero. The browser has no blockchain Live feed, connection indicator or observer retry/health timer. Submitted holds this session’s locally broadcast actions/payments, recorded before backend documents exist. Forms close and Submitted opens after a known submission. Matching receipts, required logs and successful refresh remove resolved rows; Recent history retains completed outcomes. Missing IDs and delayed processing remain uncertain without rebroadcast. The list is cleared on reload, logout, switching and reconnecting; it creates no MongoDB records. Withdrawal request completion means queued, not paid. Registration remains gated until authoritative confirmation, while its submitted payment is accessible in the global panel.

Keychain success means submitted, not a settled reward. Removing browser observation leaves the backend Hive stream, payment verification and worker-readiness checks unchanged. Personal history polls every five seconds, publishes receipts and correlated logs, refreshes authoritative data and owns completion toasts. Successful receipt processing can resolve a raid loss; read its outcome message.

Initial history hydration does not replay old toasts. Delayed confirmation, missing transaction ID, hidden-page timeout accounting and session replacement preserve uncertainty without automatic resubmission. Three visible minutes ends a dialog's wait but does not reject the transaction or stop later personal-history settlement feedback.

## 13. Current implementation differences to resolve

These were found during source review. This documentation update does not change them.

| Area                 | Current difference                                                                                                                                                                                                                             | Source to review before changing behavior                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Raid charge decay    | Shared/UI cap decays with inactivity; authoritative reservation is passed a fixed maximum of eight. Regen clock anchoring also differs between paths.                                                                                          | Charge helpers, raid event and player repository                                                                    |
| Sink timestamp       | Claim, stake, stat upgrade, registration and HIVE shop grants refresh `lastSinkAt`. HASH chest/consumable paths and equipment upgrades do not explicitly touch it, despite sink comments.                                                      | Player repository, mint/purchase/upgrade events and HIVE shop settlement                                            |
| Level / XP           | XP increments do not maintain stored player level. Cosmetic authorization uses stored level while UI derives level. Raid server award is 10, versus shared constant 100.                                                                       | Player repository, level helpers, cosmetic event and server raid helper                                             |
| Stat upgrade surface | UI offers three stats; protocol/dispatcher also allow Luck, Firewall and Exploit upgrades.                                                                                                                                                     | Action protocol, stat helpers and upgrade event                                                                     |
| Consumable limits    | HASH action metadata permits 100; purchase Zod schema/HIVE pricing cap at 25. Dispatcher calls the purchase function without applying that event schema.                                                                                       | Action protocol, purchase event and HIVE amount helper                                                              |
| Effect projection    | Public effect DTOs omit application/help timestamps; the browser uses current strength for the whole unpersisted interval, while server mining uses historical segments.                                                                       | Profile DTO, projection and stat-effect helpers                                                                     |
| Configurable token   | Deposit/market clients currently hardcode HASH/three decimals while the server token/precision are configurable.                                                                                                                               | Client payment features and server configuration                                                                    |
| Audit guarantees     | Consumable purchase catches its specific log failure and may rely on the processor's generic fallback log. Counter names/comments may describe tracking that has no active writer.                                                             | Purchase event, processor and game-stats writers                                                                    |

Changing any of these requires an explicit gameplay decision, matching client/server changes and relevant tests. Reference implementations can explain an intended formula but do not override this game's existing settlement code.

## 14. Leaderboard and page access

Homepage and Wiki remain public. Marketplace and Leaderboard require verified wallet authentication and permit browsing before paid registration. Other game pages retain registration gates. Purchasing requires confirmed registration; worker readiness blocks new signing but never read-only rankings.

Leaderboard ordering uses one combined score out of 100: 30 points for Notoriety, 30 for Mining and 40 for Progression. Each contribution is player value divided by the highest value in that category across all registered players, multiplied by its allocation. Notoriety uses its stored value; Mining uses currentMiningPerSecond independently with decay/effects/softcap and no fullness penalty; Progression uses total XP. A zero maximum contributes zero without redistributing points. For 50% of leading Notoriety, 80% of leading mining and 60% of leading XP, the score is 15 + 24 + 24 = 63. The overall leader receives 100 only by leading all three positive categories. Scores may change when another player's category maximum grows.

Scores award nothing and change no stored gameplay values. Full-precision combined scores determine order and shared competition ranks (1, 1, 3), with Hive usernames ordering exact ties. The table displays Minerate as the stored Hash Rate level, Notoriety with up to four trimmed decimals and Experience as total XP. The player-level badge sits to the right of the username. Score values and breakdowns are hidden; mining scoring still uses authoritative current HASH/second rather than the displayed mining level. Only the first 100 are displayed, 25 per page, with your rank calculated across all registered records. XP-derived display levels do not change stored-level authorization.

Rankings are current/all-time measures, not weekly earned points or historical peaks. Updates may reuse a finished 60-second cache. No mining history, season, prize, score mutation or additional poller is introduced.

Sources: [leaderboard API](../app/api/game/leaderboard/route.ts), [ranking mapping](../lib/api/dto/leaderboard.ts).


### Interrupted raids and delayed actions

An interrupted raid can leave some effects applied. It is not treated as a no-effect rejection. The worker retains the operation and holds later gameplay involving its attacker/defender while unrelated players continue. Interacting with a held account can also delay the caller and that caller's later actions. New paid fulfillment involving held accounts waits without automatic refund; incoming payments remain recorded and reserved financial obligations keep their existing recovery rules. New raid outcome logs remain private until a terminal receipt exists, then publish through the existing history flow; deferred work creates no success or rejection feedback. No completion is shown until ordinary authoritative logs/receipts arrive.

New raids record an immutable outcome and atomic per-player effect evidence. Supported recovery finishes missing steps at the original action time with the original seed, then finalizes keyed logs/counters/receipt; it neither repeats charges/transfers nor automatically compensates an uncertain write. Charge regeneration, protection, effect clearing, success odds, capacity, six-decimal HASH amounts, destruction, Notoriety and XP remain unchanged. Existing unsupported interrupted raids require historical evidence and manual review; no migration or automatic repair is provided.

Raid targets must be registered. Authentication shells are excluded from the target list before its 100-player cap, and directly signed raids against unregistered targets are rejected before any raid effects. Stronger registered players remain visible for social actions. Existing saved settlement outcomes are not rewritten.
