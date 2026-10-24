# OUTRIM — Game Design Document

Version: 1.0 — proposed relaunch design  
Prepared: 19 October 2026  
Status: implementation planning baseline; Solana economy and settlement decisions require release sign-off  
Working tagline: **Mine. Salvage. Outlast.**

## 1. Document purpose and authority

This document specifies the Outrim theme, player experience, systems, content direction and delivery plan for relaunching the existing game on Solana. Outrim is the selected working name. Name, domain, social handle and trademark availability have not been verified.

The intended launch is a browser-based, asynchronous mining and salvage game with competitive raids, modular equipment, player trading and wallet authentication. It adapts the existing gameplay rather than assuming a new real-time space simulation.

This is a proposed design, not a description of deployed Outrim functionality. The repository currently implements **Chainframe on Hive, with MongoDB-authoritative gameplay and a separate off-chain worker**. No Solana wallet integration, program, token mint, network deployment or asset migration is established by this document. Writing this GDD authorizes none of those operations.

Document precedence:

1. [GAME_ARCHITECTURE.md](GAME_ARCHITECTURE.md) describes current implementation ownership, authentication, persistence and processing.
2. [GAME_MECHANICS.md](GAME_MECHANICS.md) describes current formulas, values and known differences.
3. This GDD defines the proposed Outrim experience and identifies deliberate decisions needed for relaunch.
4. Approved implementation changes must update the two current guides and relevant tests. A theme label never changes a formula or settlement contract by itself.

Design status vocabulary:

| Status | Meaning |
| --- | --- |
| Theme target | Proposed Outrim names, art, narrative and presentation to implement |
| Retained baseline | Existing behavior to preserve unless a separately approved change replaces it |
| Launch blocker | A decision or verified implementation required before the Solana release |
| Future concept | Outside the launch scope; must never appear as available functionality |

## 2. Product definition

### 2.1 High concept

Build a mining rig on the forgotten edge of settled space. Extract resources into an exposed hold, secure your haul, recover machinery from salvage caches, and choose when to raid rivals or support other operators. Trade valuable modules at the Outpost Exchange and grow from a fragile installation into a respected frontier operation.

### 2.2 Player promise

“Every visit gives me a meaningful choice: secure what I have, improve my rig, or risk it for a bigger haul.”

### 2.3 Audience and format

- Players who enjoy incremental progression, equipment builds and asynchronous competition.
- Wallet users who value clear ownership and settlement states without needing to understand infrastructure to play.
- Short sessions on mobile and desktop, with deeper inventory and market sessions when desired.
- Solo operators interacting through raids, support, trade and invitations. “Crews” are narrative language at launch; there is no guild system.

Suggested session targets are 2–5 minutes for routine management and 10–20 minutes for equipment or trading. These are UX targets, not tested retention claims.

### 2.4 Design pillars

| Pillar | Product consequence |
| --- | --- |
| A working frontier | Machinery looks repaired and functional; the rig and its output dominate the interface |
| Visible risk | Exposed resources, free hold capacity, raid requirements and failure costs are visible before commitment |
| Useful salvage | Equipment has readable roles; dismantling unwanted gear supports upgrades |
| Social friction | Raids, disruption and assistance create interaction without adding real-time combat |
| Honest progress | Projections, submissions, completed outcomes and paid transfers remain distinct |
| Manageable depth | The first visit explains one useful action; advanced formulas remain available in the Field Manual |

### 2.5 Scope boundaries

Launch includes the existing mining, securing, permanent upgrade, equipment, cache, social-action, market, referral, ranking and history loops after approved Solana adaptation.

Launch excludes piloted ships, free movement, star maps with travel mechanics, PvE expeditions, guild management, territory ownership, crafting recipes, new rarity tiers, daily quests, seasons, prizes, subscriptions, land sales, NFT conversion and automatic compounding. Artwork may show a frontier setting but must not suggest those systems are playable.

## 3. World and narrative

### 3.1 Setting

The Outrim is a remote industrial belt beyond reliable central supply. Extraction stations, broken freighters and abandoned colonies remain from a failed expansion. Independent operators keep old rigs working by recovering compatible parts, trading scarce supplies and defending exposed stockpiles.

The player runs one installation. The interface is its operations console. Progress is measured through machinery, resources, reputation and operator experience, not a scripted campaign.

### 3.2 Narrative rules

- Technology is understandable: drills, power buses, shielding, antennas and control systems.
- Scarcity is expressed through worn surfaces and repairs, not constant disaster messaging.
- Rival operators are competitors, not inherently villains.
- Assistance is practical field support; disruption is interference with rig systems.
- Raids are remote breaches of exposed holds. They do not permanently destroy equipped gear or seize secured balances.
- Lore describes existing actions. “Recover salvage” never implies an unimplemented exploration reward.

### 3.3 Places and institutions

| Name | Function in the fiction | Launch implementation |
| --- | --- | --- |
| The Outrim | The surrounding frontier | Setting only |
| Your Rig | Player-operated installation | Dashboard and equipment identity |
| Supply Depot | Source of purchased stock | Existing Shop |
| Outpost Exchange | Operator equipment market | Existing marketplace after transport redesign |
| Operations Ledger | Recorded activity | Existing history views |
| Field Manual | Operator reference | Public Wiki |

Do not create faction reputations, faction shops or location-specific modifiers from these names.

## 4. Terminology and theme conversion

### 4.1 Resource model

The proposed in-world name for the main gameplay resource is **Alloy**. It represents standardized recovered industrial feedstock used to improve installations. The secondary, nontransferable upgrade material is **Sparks**. “Alloy” is a display name in this design, not an approved token symbol, Solana mint or conversion promise.

If an external token is approved, its actual asset name, symbol, mint address, decimals and network must be displayed explicitly wherever money moves. Never replace an exact currency with a fictional resource label in a payment confirmation.

| Current concept | Outrim display target | Meaning preserved |
| --- | --- | --- |
| Chainframe | Outrim | Product brand |
| Player | Operator | Authenticated player |
| HASH gameplay balance | Alloy | Spendable main resource; external representation undecided |
| SPARKS | Sparks | Internal equipment-upgrade material |
| Vault | Exposed Hold | Unsecured mined resources, subject to capacity and raids |
| Claim | Secure Haul | Move the entire available hold into spendable balance |
| Vault stake | Expand Hold | Permanent resource commitment increasing capacity; no unstake promise |
| Hash Rate | Extraction | Mining performance |
| Hack Power | Breach | Raid eligibility offense |
| Security | Armor | Raid eligibility defense |
| Luck | Fortune | Bonus to disruption/assistance success |
| Firewall | Countermeasures | Raid block probability |
| Exploit | Precision | Raid critical probability |
| Notoriety | Renown | Existing raid-earned progression and capacity input |
| XP / level | Operator XP / Operator Level | Cumulative experience progression |
| Equipment Chest | Salvage Cache | Purchased stack opened for one rolled module |
| Sabotage Device | Disruptor | Single-use targeted interference item |
| Help Kit | Repair Kit | Single-use counter to active interference |
| Raid | Raid | Attempt to take exposed resources |
| Salvage equipment | Dismantle | Consume a module for Sparks |
| Forge / upgrade equipment | Tune Module | Spend Sparks to improve existing rolled stats |
| Referrals | Operator Network | Invitations and separately recorded rewards |
| Leaderboard | Operator Rankings | Existing combined ranking model |
| Histories | Operations Ledger | Session-scoped recorded-log browser |

These are presentation mappings. Internal action names, IDs, historical fields and persisted evidence remain unchanged during theme-only work. The future Solana protocol needs an explicit specification; do not rename transport fields by search-and-replace.

### 4.2 Equipment slots

| Current slot | Outrim slot | Art silhouette | Guaranteed first stat retained |
| --- | --- | --- | --- |
| ASIC Miner | Extraction Head | Drill assembly or industrial cutter | Extraction |
| Motherboard | Control Core | Rugged processor enclosure | None |
| Power Supply | Reactor | Compact power unit with guarded coils | None |
| Cooling System | Thermal Array | Fins, coolant pipes and radiators | Armor |
| Network Module | Signal Array | Antennas and signal hardware | Breach |
| Firmware Chip | Logic Module | Sealed programmable cartridge | None |

One module per slot. Slot identity and rolled statistics remain mechanically meaningful. Do not introduce reactor fuel, heat meters, energy costs or module durability because the art suggests them.

## 5. Core loops and player journey

### 5.1 Moment-to-moment loop

1. Review extraction, exposed hold, capacity and active interference.
2. Choose whether to Secure Haul now or leave resources exposed.
3. Spend secured Alloy on permanent upgrades, hold expansion or supplies.
4. Open owned Salvage Caches, compare modules and equip useful finds.
5. Dismantle unwanted modules and tune a build with Sparks.
6. Evaluate rivals for a raid, disruption or assistance.
7. Review the confirmed result and repeat.

Trading and invitations sit beside this loop. Neither is required to understand the first secure-haul action.

### 5.2 First session

| Step | Experience | Completion condition |
| --- | --- | --- |
| Discover | Public landing page explains mining, exposed resources and risk | Player understands the premise before wallet connection |
| Authenticate | Connect wallet and sign a readable ownership challenge | Verified server session; connection alone is insufficient |
| Browse | View authenticated market and rankings before registration | No paid membership implied |
| Register | Review network, exact fee, reward and inviter | Verified registration outcome and refreshed player state |
| Orient | Explain exposed versus secured resources and Extraction | Player can locate hold and main upgrade |
| Improve | Suggest an affordable action using the authoritative balance | No forced purchase or optimistic credit |
| Learn risk | Explain hold exposure, capacity and raid consequences | Clear acknowledgement before first raid |
| Continue | Offer inventory, rival and market guidance | Tutorial is dismissible and never signs automatically |

The existing registration award is 10 main-resource units. Retaining an equivalent new-player grant is the proposed baseline; any external value or token backing is a launch decision. The historical October–November 2026 Chainframe starter-pack campaign and its contest are not automatically repeated for Outrim.

### 5.3 Progression horizons

- Early: understand securing, buy initial Extraction upgrades, discover the six module slots.
- Mid: choose between mining, offense and defense investments; tune useful modules; trade unwanted finds.
- Long: optimize equipment, manage larger exposed holdings, build Renown and compete in rankings.

These are player goals rather than new level gates. No retention timer, reward calendar or additional unlock system is implied.

## 6. Mining, holdings and permanent upgrades

### 6.1 Balance separation

Show three distinct values: secured gameplay Alloy, exposed hold Alloy and external wallet assets. Hold capacity limits unclaimed resources. Sparks are separate from all three. An external wallet transfer does not become gameplay funds until verified settlement.

Mining is asynchronous accounting. The browser may estimate growth, but only the authoritative backend settles resources. An animated drill never credits a balance.

### 6.2 Retained numerical baseline

The following values use existing gameplay units and are candidates for direct retention. Renaming HASH to Alloy in this table is a design mapping, not a historical balance conversion.

```text
holdCapacity = round(1 + max(0, committedExpansion))
effectiveExtraction(H) = max(0, H)                       when H <= 333
                       = 333 + (H - 333) * 0.5         otherwise
resourcePerSecond = (effectiveExtraction(H) + 1)^2 / 172800 * decay
upgradeCost(L, k) = sum(max(1, (L + i)^2), i = 0..k-1)
```

At starting Extraction 1, full activity multiplier and no effects, production is approximately 2 units/day. The initial one-unit hold fills in approximately 12 hours. Full holds accept no overflow credit.

Permanent upgrade examples: level 1→2 costs 1; 1→3 costs 5; 1→4 costs 14. Retain bulk upgrade range 1–10,000 unless a gameplay decision changes it.

### 6.3 Securing and hold expansion

- Secure Haul moves the entire available hold to spendable gameplay balance and consumes one secure charge.
- It clears active stat interference under the existing claim rule.
- Secure charges cap at five and regenerate one every four hours under the existing clock behavior.
- Expand Hold spends secured resource permanently. Display the resulting rounded capacity before signing.
- Do not describe expansion as yield-bearing staking, refundable storage rent or withdrawable collateral.

### 6.4 Inactivity

Retain the implemented decay calculation: full rate through day 14; afterward `max(0.9 ^ floor((days - 14) / 7), 0.25)`, with the first reduction at day 21. Explain eligible activity accurately using actual timestamp writers. Do not promise that every purchase or equipment upgrade refreshes activity.

Target UI: Extraction level, current estimated output, hold amount/capacity, decay status and secure-charge availability. Estimated full-hold times are estimates and must handle affected output and unavailable snapshots.

## 7. Equipment, caches and workshop

### 7.1 Module acquisition and ownership

Buying a Salvage Cache adds to an owned stack. Opening consumes exactly one owned cache and creates one individual rolled module, with no second purchase charge. Show owned stock and opening as separate actions.

Individual modules retain unique identity, rolled stats, ownership, level, slot and marketplace restrictions. Stackable caches and consumables stay separate from unique equipment. Owning a gameplay module does not imply owning an NFT.

### 7.2 Rarity and rolls

Retain fixed cache rarity odds:

| Rarity | Probability | Distinct rolled stats |
| --- | --- | --- |
| Common | 70% | 1 |
| Uncommon | 20% | 2 |
| Rare | 8% | 3 |
| Epic | 1.8% | 4 or 5 with equal probability |
| Legendary | 0.2% | 6 |

Fortune does not affect current cache rarity or opening rolls. Show base odds before purchase and opening. Paid random rewards require a launch eligibility/policy review for the intended regions; do not assume token payment removes that requirement.

Retain current rarity-scaled stat ranges and Breach/Armor ×10 scaling. Refer to the implemented tables in [GAME_MECHANICS.md](GAME_MECHANICS.md#5-equipment-forging-and-salvage) and the shared catalog rather than maintaining a second runtime catalog here.

### 7.3 Tuning and dismantling

```text
moduleValue = 0.5*Breach + 0.5*Armor + 5*Extraction
            + 5*Countermeasures + 5*Precision + 10*Fortune
tuneCost = moduleValue * 0.0498 * currentModuleLevel Sparks
nextRolledStat = round(currentRolledStat * 1.05, 4 decimals)
```

Retain sequential tuning, 1–100 requested levels, and actual value-gain XP. Dismantling grants current module value in Sparks and the corresponding XP. It permanently consumes eligible unequipped, unlisted equipment. Confirmation must name the module and exact reward and explain irreversibility.

Compare equipped and candidate stats side by side. Do not present the aggregate salvage-value score as DPS or an independent combat stat.

### 7.4 Reward presentation

Opening animation begins only around the confirmed result; suspense cannot manufacture a roll. Reveal actual rarity, slot, stats and available actions after authoritative inventory refresh. Switching tabs or consuming the final cache must not interrupt confirmation or the reward reveal. Reduced-motion users receive the same information without animation.

## 8. Raids, defense and Renown

### 8.1 Raid intent

Raids trade exposed-hold risk for potential stolen resources and Renown. Secured balances, Sparks and equipment are outside the current theft scope.

Retain eligibility: affected attacker Breach must be strictly greater than affected defender Armor. Eligible success chance is `100 - clamp(defender Countermeasures, 0, 100)` percent. Precision controls critical probability only for raids.

### 8.2 Outcomes

- Success rolls 10–50% exposure. A critical doubles exposure, capped at 100%.
- Defender exposure and attacker free space retain fractional resources, rounded down to six-decimal vault precision and displayed up to four trimmed decimals.
- Defender removal can exceed attacker credit when the attacker lacks space; excess is destroyed.
- Attacker Renown uses actual credited resources, not total removed.
- Failure destroys a rolled share of the attacker's exposed hold, rounded down to six decimals. Defender receives that amount as Renown, not as Alloy.
- A resolved win may credit zero when loot is below settlement precision or attacker capacity is full. State the recorded result honestly.
- Landed raids give the target 60 seconds of protection under existing behavior.
- Target stat effects clear under existing raid processing. Attacker effects do not automatically clear.

### 8.3 Preflight and result UX

Before signing show target, relevant attack/defense totals, estimated success chance, available raid charge, current exposed risk and free hold capacity. Do not promise an exact stolen amount or authoritative outcome from a stale target card.

Baseline server raid capacity is eight with four-hour regeneration. The current UI inactivity-adjusted cap differs; resolving that inconsistency is a launch blocker, not an approved balance change.

Results distinguish ineligible/rejected, blocked, failed and successful raids. A completed failed raid is a valid processed outcome. In recorded history, outgoing raids are green and incoming raids red; text separately communicates the outcome.

## 9. Disruption and assistance

Disruptors and Repair Kits are owned stackable supplies targeting Extraction, Breach or Armor. Each valid attempt consumes one item. No self-targeting.

Retained social success chance is `clamp(25 + total Fortune, 0, 100)` percent. Successful attempts roll 10–50% strength, with no social critical. A valid failed roll consumes the item and records failure without changing effects. Invalid eligibility consumes nothing.

Disruption does not require Breach to exceed Armor. One active disruption per target stat is allowed. Repair Kits counter active disruption on the selected stat; they are not independent buffs above normal output.

Effects have no timed expiry. Assistance reduces remaining strength; the affected operator's securing action or a qualifying raid clears effects. Do not show a fabricated expiration countdown.

An operator cannot repair any stat on a target while their own remaining disruption persists anywhere on that target. Fully cleared/countered interference releases the restriction. Keep existing ten-per-minute social limits unless explicitly changed.

UI must show affected stat, original/remaining strength, repair eligibility and rejection reason. Action cards say “attempt” where success is probabilistic. No immediate Alloy, XP or Renown reward is implied for assisting.

## 10. Economy, store and trading

### 10.1 Resource flows

| Resource | Sources | Uses / removal |
| --- | --- | --- |
| Gameplay Alloy | Secured mining, raid credit later secured, approved new-player grant, verified deposits if enabled, internal referral rewards | Permanent upgrades, hold expansion, supplies, withdrawals if enabled |
| Exposed Alloy | Accounted mining and successful raid credit | Securing, theft, failed-raid loss, overflow exclusion |
| Sparks | Dismantled modules | Module tuning |
| External payment asset | Player wallet holdings | Approved registration, store and market payments |
| XP | Existing upgrade, dismantle and raid awards | Cumulative progression; never spent |
| Renown | Actual raid credit and failed-attacker defense reward | Capacity/stat inputs; never treated as transferable currency |

Economic reporting must distinguish generation, transfers, spending and destruction. Securing is an internal balance movement even though current claim counters are used as the shop's emission measure.

### 10.2 Supply Depot

One matched product grid: Salvage Cache, Disruptor, Repair Kit. Each card contains purpose, owned quantity, quantity controls, exact quote, supported payment options and submission state. Buying never opens a cache.

Retain the gameplay-currency pricing shape pending economy approval:

```text
excess = max(0, completedDayEmissionHighWaterMark - 100000)
cacheUnitPrice = max(1, roundHalfUp(100 + excess * 0.01))
consumableUnitPrice = max(1, roundHalfUp(1 + excess * 0.0001))
bulkTotal = roundedUnitPrice * quantity
```

The price tier ratchets upward from completed UTC-day claims, not current potential output. It has no personal multiplier. Reject stale expected quotes before spending and reject unsafe totals. Keep the authoritative pricing owner and shared pure calculations.

Existing Hive prices are 75 HIVE registration, 10 HIVE/cache and 0.1 HIVE/consumable. These are **historical/current implementation references only**, not Solana prices. No HIVE→SOL exchange formula is proposed. Establish new external fees deliberately, with a documented volatility and quote-expiry policy.

Proposed consistent launch purchase limit is 1–25 units per product. Chests already use that range; consumable metadata and validation currently disagree. Harmonizing the consumable limit requires approved code/schema/test changes before release.

### 10.3 Outpost Exchange

Retain manual positive-price listings for eligible unequipped, unlisted, unsalvaged modules. Never fabricate suggested prices from the gameplay resource. Browse and My Listings share clear slot, rarity and price filters. Display exact payment asset and total; unsupported assets fail closed.

Retain the 5% market fee as a candidate baseline. Exact base-unit rounding, minimum price, settlement accounts, custody and seller payout behavior must be defined for Solana. HIVE milli-unit rounding cannot be reused blindly for SOL or a token with different decimals.

Buyer completion requires verified payment and finalized ownership according to the approved settlement design. Reserved modules cannot be equipped, dismantled or sold twice. A completed sale is independent of a later retained platform-fee delivery obligation. Unknown payouts must not trigger another payment or automatic ownership reversal.

### 10.4 Deposits and withdrawals

Launch blocker: decide whether external transfers of the gameplay resource exist at all. Do not show Deposit/Withdraw until asset backing, custody, supply authority, precision, solvency and exact settlement are implemented and tested.

If retained, show available internal balance, exact external asset, fee, destination and rolling limit. Current capacity is `floor(10 + 0.10 * max(0, Renown))` whole resource units per rolling 24-hour window. This is a baseline candidate, not a promise of token liquidity.

Current Hive withdrawals may transfer treasury tokens or issue the full amount after verified token-state checks. That issuance policy does not establish a Solana minting policy. Program/mint authority and supply constraints need a separate decision. Never describe withdrawals as guaranteed income or fixed-value redemption.

### 10.5 Operator Network

Retain first eligible invitation assignment and a candidate 5% referral share on first successful paid registration and each paid Depot purchase, calculated from the actual total in the currency paid. Opening caches, marketplace trades, login and the starting grant earn no referral reward.

Internal-resource rewards stay internal-resource rewards. External rewards stay in their original payment asset; no conversion. Define per-asset base-unit flooring for Solana. A pending external reward does not undo or delay a completed buyer purchase. Never change saved attribution after registration or replace an existing inviter.

Referral links use the actual application origin; do not invent an Outrim domain. Wallet-address identity, display names and invitation presentation require new specifications because Solana addresses are not Hive account names.

### 10.6 Monetization boundaries

Revenue candidates are the approved entry fee, paid supplies and market fees already represented by the baseline. Do not add surprise signing fees disguised as game charges, paid odds boosts, guaranteed rarity, yield promises or exclusive statistical bonuses without a new design review. Wallet network costs are separate from game prices.

## 11. Progression, rankings and customization

Retain `OperatorLevel = floor(sqrt(max(0, XP) / 1000)) + 1`. Reaching level N requires `(max(1, N) - 1)^2 * 1000` cumulative XP.

Baseline XP: permanent stat spending gives 10 XP per resource spent; dismantling gives 100 XP per Spark value; tuning gives rounded XP from salvage-value gain; authoritative successful raids currently give 10 XP. Secure Haul, cache purchase/opening, hold expansion and social actions do not gain a new XP award from the reskin.

Operator customization uses existing avatar, banner and background choices adapted to the theme: pressure suits, rig insignia, habitat interiors and frontier vistas. They remain cosmetic. Do not imply tradable/NFT ownership. Resolve stored-level versus XP-derived unlock authorization before claiming level unlocks work consistently.

Operator Rankings retain independent normalization: 30% Renown, 30% current extraction output, 40% cumulative XP. A zero maximum contributes zero without redistribution. Use unrounded scores for competition ranks and a deterministic approved identity tie-break. Show the first 100, 25 per page, plus the authenticated operator's full-population rank. Display level, Extraction level, Renown and XP; hide score breakdowns.

Rankings confer no prizes, tokens, season rewards or automatic invitations. Keep the existing 60-second completed-ranking cache and avoid a ticking rank display.

## 12. Screens and information architecture

Proposed launch navigation labels map to existing pages. This table does not introduce endpoints or rename routes.

| Screen | Primary content | Primary actions |
| --- | --- | --- |
| Landing | Premise, screenshots, risk explanation, wallet entry, Field Manual | Connect, learn |
| Rig | Secured balance, hold, Extraction, permanent stats, active effects | Secure Haul, upgrade, Expand Hold |
| Inventory | Items default tab; Modules tab with existing filters | Open, use, equip, tune, dismantle |
| Rivals | Existing target roster, vault exposure and combat inputs | Raid, disrupt, assist |
| Supply Depot | Three stock products and authoritative quotes | Buy stock |
| Outpost Exchange | Browse/My Listings, external balance, filters | Buy, list, cancel |
| Operator Rankings | Top 100 and own rank | Page through results |
| Operator Network | Confirmed inviter, link, counts, asset-separated rewards | Refresh, share actual link |
| Field Manual | Public, server-rendered player guide | Section navigation |
| Account / Ledger | Wallet, cosmetics and categorized recorded logs | Inspect activity, sign out |
| Game Activity | Submitted and Stats, starting on Stats | Inspect unresolved actions and analytics |

### 12.1 Access rules

Landing and Field Manual remain public. Exchange and Rankings require a verified wallet session but allow unregistered browsing. Other gameplay retains registration and data-readiness gates. Registration is explicit and dismissible on browsing pages; public pages do not force it open.

### 12.2 Dashboard composition

Order: identity/status → secured balances and exposed hold → Extraction/secure action → permanent stats → active effects → equipment summary. Keep the most time-sensitive choice visible on mobile. Large scenery must not push resources and actions below the first useful screen.

### 12.3 Inventory and workshop

Items shows only owned stacks; Modules preserves filter/sort state across tabs. Mobile filters collapse. Confirmation coordination and reward reveals remain mounted outside tab content. A manual combined refresh publishes both snapshots together; stale inventory is labeled and cannot authorize new submissions.

### 12.4 Activity and records

Submitted is current-session broadcast metadata, not confirmed history. Its badge includes delayed/unknown submissions. Closing preserves the selected Activity tab; only a new local submission opens Submitted.

Operations Ledger defaults to securing/claims, with no personal All selection. Each category shows at most the latest 100 recorded logs, without Load More. Personal market activity and global sales remain separate authenticated reads. Entry, focus, category changes and manual Refresh may read; no extra recurring refresh is introduced.

Stats distinguishes current potential output from actual recorded activity and completed-day pricing excess. Initial history loading does not replay completion messages.

## 13. Interaction, feedback and writing

### 13.1 Action lifecycle

| State | Player-facing meaning | Allowed feedback |
| --- | --- | --- |
| Ready | Valid current inputs | Review and sign |
| Awaiting signature | Wallet approval requested | Explain exact action/payment |
| Submitted | Broadcast acknowledged | Close form, show Submitted entry |
| Confirming | Backend/finality outcome pending | Neutral progress; no balance credit |
| Completed | Authoritative receipt and required refresh resolved | Actual recorded result |
| Rejected | Definitive invalid/failed operation | Clear reason and actual side effects, if any |
| Delayed / unknown | Execution cannot yet be established | Preserve uncertainty; no automatic resubmission |

Keep the current personal-history coordinator as the sole completion/refresh/toast owner during reskin work. A Solana replacement must explicitly preserve that single-owner property. Do not add browser chain watchers or competing confirmation timers as cosmetic work.

### 13.2 Copy examples

- Landing: “Build a rig beyond the supply lines. Secure your haul. Take your chances.”
- Empty hold: “Your hold is empty. Extraction will replenish it while capacity remains.”
- Full hold: “Hold full. Secure your haul or expand capacity to keep collecting.”
- Cache purchase: “Buy stock here. Open owned caches in Inventory.”
- Unknown outcome: “Confirmation is delayed. Check Activity before submitting again.”
- Raid failure: “Raid failed. Your hold lost {recordedAmount} Alloy.”
- Repair restriction: “Clear your remaining disruption on this operator before assisting.”

Template fields require actual recorded evidence. Missing amount, quantity or currency is omitted with neutral wording. Refunds, compensated withdrawals and queued requests are informational and distinct from completed purchases or paid withdrawals. Rich text and plain text must agree.

### 13.3 Accessibility and responsive behavior

Provide keyboard access, visible focus, labeled controls and sensible dialog focus return. Use WCAG AA contrast targets and touch targets of at least 44 CSS pixels. Rarity, raid direction and action state require text or icons as well as color. Respect reduced motion; never require hovering to learn costs or probabilities. Tables must remain readable on small screens without hiding required financial information.

## 14. Art direction and asset brief

### 14.1 Visual identity

Industrial space frontier: worn steel, repair patches, exposed fasteners, practical warning marks and restrained holographic overlays. Equipment should look heavy and maintainable. Avoid pristine luxury fleets, fantasy crystals and visual noise that competes with numeric decisions.

Proposed palette:

| Role | Color | Usage |
| --- | --- | --- |
| Deep space | `#080D18` | App background |
| Panel steel | `#151F2C` | Cards and console surfaces |
| Raised steel | `#253346` | Borders and elevated controls |
| Worklight amber | `#F4B860` | Brand emphasis and primary actions |
| Signal violet | `#A694F9` | Technology highlights, restrained |
| Readout white | `#EAF0F6` | Main text |
| Utility green | `#68D5A0` | Positive states / outgoing raid direction |
| Alert red | `#F17B82` | Destructive actions / incoming raid direction |

Colors are design candidates; verify actual contrast in rendered components. Use rarity names beside colored frames. Body text uses a readable sans serif; numbers may use tabular figures. Display lettering can evoke industrial labeling without reducing small-text legibility.

### 14.2 Required asset inventory

| Asset set | Launch requirement |
| --- | --- |
| Brand | Wordmark, compact emblem, light/dark treatments, favicon and app icons |
| Social | Share preview and operator-stat card treatment; no invented domains |
| Landing | One strong frontier rig scene with mobile-safe crops |
| Resources | Alloy and Sparks icons, visually distinct from external payment assets |
| Equipment | Six slot silhouettes; rarity framing; all currently used catalog entries audited |
| Stock | Salvage Cache closed/open states, Disruptor, Repair Kit |
| Operators | Existing cosmetic catalog rethemed while preserving unlock identities |
| Interface | Navigation, charge, protection, disruption and status icons |
| Empty/error | Empty inventory, unavailable data, no listings and delayed confirmation |

Maintain a source/export manifest with dimensions, format, alpha behavior, usage rights and destination. Prefer vectors for simple UI icons and compressed raster art for scenery. Never place text essential to gameplay inside generated artwork.

### 14.3 Animation and audio

Use subtle drill motion, status lights and short module-reveal transitions. Disable background motion when hidden and honor reduced motion. Animations cannot imply resource credit, change odds or block confirmation. Launch audio is optional and muted by default if introduced; gameplay never relies on sound. No audio production is required to ship the core reskin.

## 15. Solana relaunch specification and decision gates

### 15.1 Recommended starting architecture

Retain MongoDB-authoritative gameplay, existing feature/repository ownership and a separately hosted authoritative processor as the planning baseline. Replace Hive-specific transport only through an approved Solana design. This preserves a familiar gameplay model; it does not make the game fully on-chain.

Do not keep parallel Hive/Solana gameplay clients or add a generic multi-chain registry as a shortcut. A fully on-chain simulation would be a separate scope with new program design, account sizing, concurrency, security and cost analysis.

This section defines required outcomes rather than claiming current Solana SDK or RPC behavior. Before implementation, verify the chosen wallet, RPC and program APIs against their current official documentation.

### 15.2 Blocking decisions

| Decision | Planning position | Required release artifact |
| --- | --- | --- |
| Network and deployments | Development/testing before any public live-money release | Named environments and explicit deployment identifiers |
| Wallet support | Wallet-based ownership; supported wallets not selected | Compatibility matrix and tested connect/sign/reconnect flows |
| Operator identity | Wallet address is authority; display handle is optional design | Address validation, display/targeting rules and collision policy |
| Login | Fresh challenge, domain/network binding, expiry and single use | Versioned message format and replay/cross-wallet tests |
| Gameplay authorization | Every accepted action authenticated and replay-protected | Signed payload, nonce, scope and operation-identity specification |
| Payment asset | Unselected; SOL versus a specific token requires approval | Asset identity, decimals, integer arithmetic and account routing |
| Registration/store prices | No numerical conversion from HIVE | Approved price table and quote/expiry policy |
| Gameplay token | Alloy display name only | Internal-only or external-token decision; mint/custody/supply policy if external |
| Equipment custody | Database gear retained by default | Explicit NFT decision only if scope changes |
| Settlement | Exact-evidence verification with broadcast-once safeguards | Finality, instruction parsing, balance evidence and reconciliation spec |
| Randomness | Preserve deterministic retries; assess fairness separately | Threat model, seed lifecycle and any approved verifiable-randomness design |
| Fees and rent | Exact player-visible charges | Network cost responsibility and account-creation handling |
| Failure handling | Unknown stays unresolved until evidence | Expiry, dropped/forked execution and safe resubmission specification |
| Existing players | No migration assumed | Explicit fresh-start or separately reviewed migration policy |

### 15.3 Financial and state invariants

- Use integer base units for external assets; never floating-point payment comparisons.
- Verify the expected network, authenticated payer, recipient, asset identity, amount, application reference and exact instruction identity.
- A transaction signature alone means submission, not settled gameplay or payout.
- Reject replayed actions and payments without granting stock, balances or rewards twice.
- Persist payout intent before broadcasting. Changed destination, amount, asset or routing cannot silently replace saved intent.
- Unknown broadcasts cannot be automatically resent, refunded, credited or converted.
- Preserve reservation evidence until durable terminal outcomes; archive private transfer evidence before job cleanup.
- Primary registration/stock completion stays independent of secondary referral payment status.
- Private keys, raw signing material, seeds and operational errors never enter browser DTOs or logs.
- Builds do not connect to the operational database. Automated validation does not send real payments.

### 15.4 Authentication and UI implications

Connecting a Solana wallet does not prove a server session. Require verified signature ownership and a session bound to the intended wallet. Logout, replacement and same-wallet reconnection invalidate old asynchronous responses and selection state. Do not interpret addresses using Hive username validation.

New signatures require a readiness check. Read-only browsing and already-submitted confirmation remain available during processor downtime. Login signatures must be clearly distinguished from payment/action signatures.

### 15.5 Old-chain and old-brand handling

Do not rewrite Hive transactions, memos, logs, registration evidence, pending obligations or balances to appear Solana-native. Do not imply that prior assets bridge automatically. Resolve/review legacy obligations through their original evidence and operational process.

Fresh launch is a planning default, not permission to erase data. Any player import, snapshot, claim, airdrop or compensation program requires a separate approved design. Preserve existing unresolved records and historical SDK reproduction evidence. Operational database names, lease IDs, accounts and secrets are outside theme-only changes.

## 16. Implementation plan and ownership

### Phase A — Design lock

Approve terminology, theme, launch scope, economy, custody, identity and fresh-start policy. Inventory every visible Chainframe/Hive/HASH reference and distinguish current UI from immutable evidence. Produce screen wireframes and a versioned Solana protocol/settlement decision record.

Exit: no unresolved monetary, asset-ownership or authentication assumptions in the implementation brief.

### Phase B — Theme implementation

Update presentation copy, approved artwork, navigation labels, catalog display names, metadata and Field Manual. Keep existing internal IDs and mechanics intact. Extend the shared log-presentation owner rather than duplicating notification rules. Verify mobile, accessibility and recorded-outcome consistency.

Exit: the current game can be reviewed in the Outrim theme without silently changing settlement or gameplay. If still using Hive during development, label that environment accurately.

### Phase C — Solana foundation

Implement approved authentication, signed-action transport, payment verification, RPC integration, readiness and processor lifecycle within established boundaries. Keep GET reads repository-based and writes in feature owners. Browser graphs cannot reach credentials or server persistence.

Exit: synthetic/local or approved test-network scenarios prove exact evidence, replay rejection, session replacement, uncertain execution and durable recovery. No production payments are needed for automated checks.

### Phase D — Gameplay and economy parity

Adapt registration, stock grants, opening, social actions, raids, deposits/withdrawals if enabled, referrals and marketplace. Settle the known-difference register below. Update architecture/mechanics guides alongside actual changes.

Exit: authoritative outcomes match approved formulas and every advertised action has a verified end-to-end flow.

### Phase E — Release rehearsal and launch

Review legacy jobs, rehearse coordinated application/processor deployment, verify dependency reproducibility, verify readiness and reconcile controlled test scenarios. Refresh assets and require fresh authentication where session/protocol identity changes. Confirm no legacy service can process new-environment submissions.

Exit: release checklist signed off by product, engineering and operations. This document itself does not authorize deployment or live payments.

### Ownership map

| Work | Existing owner to extend |
| --- | --- |
| Screens and copy | `components/`, `app/` rendering and existing focused client components |
| Wallet/session lifecycle | `features/events/frontend/`, hooks and authentication primitives |
| Shared gameplay rules | `features/types/game/`, existing constants and pure helpers |
| Authoritative gameplay writes | Existing flat `features/events/backend/` workflow owners |
| Processing and financial recovery | Existing worker feature ownership; new transport design must respect boundaries |
| Collection persistence | Seven existing `lib/modules/` repositories |
| Read DTOs and APIs | Existing GET repositories and pure `lib/api/dto/` mappings |
| Recorded messages | `lib/utils/logs/presentation.ts` |
| Production identity/protocol | Explicit future cutover decision; current Hive configuration remains authoritative today |

Do not introduce a generic service layer, compatibility barrels, extra runtime collection or new polling owner to facilitate the theme rewrite.

## 17. Known-difference register

Review [GAME_MECHANICS.md section 13](GAME_MECHANICS.md#13-current-implementation-differences-to-resolve) before implementing. A discrepancy needs an explicit rule decision, client/server changes, tests and documentation; this GDD does not choose every resolution.

| Area | Required disposition before claiming consistent Outrim behavior |
| --- | --- |
| Raid charges | Choose and enforce one cap/regen policy across UI and server |
| Activity decay | Specify exactly which actions refresh activity; align copy and timestamp writers |
| Level / cosmetics | Align cumulative-XP display with authoritative unlock checks |
| Raid XP | Choose documented 10 versus shared 100 and make one authoritative rule |
| Stat upgrades | Decide whether only three UI stats or all six protocol stats are upgradeable |
| Consumable quantity | Approve and enforce one limit across metadata, quotes and worker validation |
| Defender mining | Decide whether ordinary raids settle elapsed mining before exposure calculation |
| Effect projections | Preserve estimates or provide approved history needed for matching projections |
| External asset identity | Remove hardcoded old-chain asset/precision assumptions through explicit redesign |
| Statistics and audit logs | Verify actual writers; do not expose counters as guarantees without evidence |
| Equipment cutover | Preserve deployed historical boundaries; no retroactive recomputation |
| Promotional grants | Do not carry dated Chainframe campaigns into Outrim without a new approved offer |

## 18. Verification and release acceptance

### 18.1 Functional acceptance matrix

| Flow | Required evidence |
| --- | --- |
| Authentication | Expiry, one-use challenge, wrong-wallet rejection, session replacement and replay tests |
| Registration | Fee verification, exactly-once registration/grant, invalid-payment handling, interrupted-write parking |
| Mining and securing | Capacity/decay/effect boundaries, exact secure amount, charge limits, no projection credit |
| Upgrades | Exact bulk cost, safe arithmetic, equipment-aware totals and settled prior intervals |
| Cache stock/opening | Purchase adds stock; opening consumes one; no second payment; retry does not reroll/grant twice |
| Inventory | Combined snapshots, stale-submit blocking, last-cache reveal survives tab changes |
| Tuning/dismantling | Correct costs/value/XP; equipped/listed restrictions; unknown writes not replayed |
| Raids | Strict eligibility, block/critical rules, capacity destruction, zero-credit wins and failed-raid risk |
| Social actions | Correct odds/consumption, own-disruption repair restriction, no expiry timer |
| Marketplace | Exact payment, reservation concurrency, seller payout/ownership evidence, independent fee recovery |
| Referrals | Immutable eligible inviter, asset-separated amount, exactly-once reward, buyer completion independence |
| Transfers if enabled | Asset/precision verification, rolling capacity, uncertain-send parking, backed supply policy |
| Activity | One confirmation owner, no hydration toast replay, accurate delayed/queued/paid distinctions |
| Access/privacy | Authenticated market/rankings, public manual, no private metadata, session-safe late responses |

### 18.2 Engineering checks

For runtime changes run the project checks:

```sh
pnpm test
pnpm typecheck
pnpm exec eslint app components features hooks lib server tests
pnpm build
```

Verify architectural boundaries and test discovery, including the unsuppressed historical Hive native-signing gate while that integration remains in the repository. Run isolated standalone MongoDB integration tests using generated test database names. Never clean or reconfigure the operational database to make tests pass.

Add Solana-specific verification only after its approved design and dependencies exist. For live-money release, authorized manual wallet/payment/settlement checks, dependency verification, threat review and operational rehearsal are required. Automated tests alone do not establish production readiness.

For this documentation-only proposal, validate local links, referenced ownership and relevant architecture tests. A static GDD review does not verify gameplay or Solana integration.

### 18.3 Product acceptance

- All major screens use the approved Outrim vocabulary consistently.
- No visible payment substitutes a fictional resource name for the actual asset.
- No HIVE amount is presented as a SOL price.
- No unsupported exploration, guild, NFT, bridging or yield feature is advertised.
- Public manual matches implemented release behavior and explains estimates.
- Keyboard/mobile flows expose complete prices, odds, risk and uncertainty.
- Artwork uses approved sources and exports; metadata and share cards use actual configured origins.
- No legacy job or historical receipt is rewritten to complete the rebrand.

## 19. Measurement and live operations

Define reporting before release, using existing records where possible. New telemetry, identifiers or endpoints need separate implementation review; this section does not authorize collection changes.

| Question | Candidate measure |
| --- | --- |
| Do players understand setup? | Authenticated-to-registered conversion and first confirmed useful action |
| Do they return? | Day 1/7/30 retention with clearly defined cohorts |
| Is mining understandable? | Secure frequency, hold-full intervals where observable, upgrade progression |
| Is PvP healthy? | Raid participation, win/loss/zero-credit distribution and resource destruction |
| Are modules useful? | Equip, tune, dismantle and sale distributions by slot/rarity |
| Is the economy stable? | Actual issuance, securing, spending, deposits, withdrawals and outstanding obligations by asset |
| Is settlement reliable? | Submission-to-completion distribution, unresolved age and parked jobs |

Do not invent metric targets without baseline data. Diagnose onboarding and reliability before adding reward inflation. Support should ask for public operation identity and safe context, never private keys or seed phrases. Recovery remains exact-evidence operator work; no customer-service button may blindly resend funds.

## 20. Future concepts and final handoff

Possible later expansions include opt-in crew organizations, PvE salvage expeditions, cosmetic rig scenes, research branches and explicit seasonal competitions. Each needs its own rules, economic model, persistence review and acceptance tests. They are excluded from launch commitments.

The implementation handoff consists of this GDD, approved terminology/art references, screen wireframes, signed-off economy and Solana decision records, an updated discrepancy register, relevant tests and a release rehearsal record. Until those decisions are completed, Outrim is a defined creative direction with an implementation plan, not a production-ready Solana game.
