> Corrected configuration averages: 2,504 coins and 68.16 HP per generated chest. Historical earnings/BEP tables below have not been recalculated and must not be used as current projections. Gameplay rules are documented in GAME_SERVICE.md.

# Boom Miner — Economy Simulation V2

> **Supersedes:** `ECONOMY_SIMULATION.md`
> **Date:** 2026-07-21
> **Status:** Implemented — all values below are live in the codebase.

---

## 1. What Changed From V1

| Parameter | V1 (old) | V2 (current) |
|---|---|---|
| Common chest HP | 80 | **20** |
| Common chest coins | 220 | **800** |
| Rare chest coins | 660 | **2,400** |
| Epic chest coins | 2,200 | **8,000** |
| Legendary chest coins | 8,800 | **32,000** |
| Mythic chest coins | 44,000 | **160,000** |
| Common hero bombRange | min 1 / max 1 | **min 1 / max 2** |
| Chests per map | 40–50 | **55–65** |
| Daily chest cap | none | **per-hero per-rarity (new)** |
| Energy recovery | flat 10% / 5 min all rarities | **rarity-scaled fraction / 5 min** |

---

## 2. Simulation Inputs

| Parameter | Value |
|---|---|
| Accounts simulated | 1,000 |
| Heroes minted per account | 10 |
| Mint cost per hero | 500,000 BMCOIN |
| Total BMCOIN burned at mint (1,000 accounts) | 5,000,000,000 BMCOIN |
| Max heroes on map simultaneously | 10 |
| Map size | 41 × 25 tiles (~480 walkable grass tiles) |
| Chests per map (new) | 55–65 (avg 60) |
| Sessions per day — casual player | 4 |
| Sessions per day — active player | 8–10 |
| Sessions per day — 24/7 player | varies by rarity (see energy table) |

---

## 3. Hero Rarity Distribution

### 3a. Mint odds and expected pull per 10 mints

| Rarity | Odds | Expected per 10 mints |
|---|---|---|
| Common | 80.00% | 8.00 |
| Uncommon | 14.00% | 1.40 |
| Rare | 5.00% | 0.50 |
| Epic | 0.995% | 0.10 |
| Legendary | 0.005% | ~0.00 |

Eight of every ten heroes minted will be Common. The economy is designed around this reality.

### 3b. Stat ranges per rarity

| Rarity | Stamina | MaxEnergy | Power | BombRange | BombNum |
|---|---|---|---|---|---|
| Common | 1–3 | 100–300 | 1–3 | **1–2** | 1 |
| Uncommon | 3–6 | 300–600 | 3–6 | 2–3 | 2 |
| Rare | 6–8 | 600–800 | 6–8 | 3–5 | 3 |
| Epic | 8–11 | 800–1,100 | 8–11 | 5–7 | 4 |
| Legendary | 11–16 | 1,100–1,600 | 11–16 | 7–11 | 6 |

Common `bombRange` now rolls 1 or 2 at generation time (previously locked at 1). A range-2 Common hero hits 8 blast tiles per bomb vs 4 before — doubling chest hit probability for lucky pulls.

---

## 4. Energy Recovery (Rarity-Scaled, Same 5-Min Interval)

Same tick interval for all rarities. The recovered fraction differs, making rarer heroes reach full energy faster.

| Rarity | Fraction per 5-min tick | Full tank time | Max sessions / 24 h |
|---|---|---|---|
| Common | 5.00% | 100 min | ~14 |
| Uncommon | 6.25% | 80 min | ~18 |
| Rare | 8.33% | 60 min | ~24 |
| Epic | 10.00% | 50 min | ~28 |
| Legendary | 12.50% | 40 min | ~36 |

Key insight: a 24/7 Common player is capped at ~14 sessions/day by the recovery rate alone, not just the daily chest cap. This prevents automation from being infinitely rewarding for the cheapest heroes.

---

## 5. Chest Distribution (Per Map, Avg 60 Chests)

| Rarity | Weight | Avg per map | HP | Coins | Bombs to break (common power=2) |
|---|---|---|---|---|---|
| Common | 80.0% | 48.0 | 20 | 800 | 10 |
| Rare | 13.0% | 7.8 | 160 | 2,400 | 80 |
| Epic | 5.0% | 3.0 | 320 | 8,000 | 160 |
| Legendary | 1.6% | 1.0 | 640 | 32,000 | 320 |
| Mythic | 0.4% | 0.24 | 1,280 | 160,000 | 640 |

**Weighted averages:**
- Avg coins per chest: **2,504 BMCOIN**
- Avg HP per chest: **68.16**
- Avg bombs to destroy (common power=2): **34.08**
- Chest density on map: 60 / 480 = **12.5%** (up from 9.4%)

Common chests are the workhorse. They are now fast to destroy (HP 20 vs 80 before) and worth 800 coins each. A Common hero can realistically destroy 3–8 per session depending on bombRange roll.

---

## 6. Daily Chest Cap System

The cap scales with every hero owned — on-map or not. Collecting heroes is the meta-game for raising the earnings ceiling.

### 6a. Cap per hero per rarity

| Rarity | Cap per hero / day |
|---|---|
| Common | 12 |
| Uncommon | 18 |
| Rare | 25 |
| Epic | 35 |
| Legendary | 50 |

### 6b. Total daily cap examples

| Hero composition | Daily cap |
|---|---|
| 10× Common | 120 chests |
| 10× Uncommon | 180 chests |
| 10× Rare | 250 chests |
| 10× Legendary | 500 chests |
| 8× Common + 1× Uncommon + 1× Rare | 8×12 + 18 + 25 = **139 chests** |

### 6c. How it works technically

- `dailyChestsCleared` and `dailyChestsResetAt` are stored on the player document.
- Reset is **lazy** — checked at chest-clear time, no cron job needed.
- Cap is computed live from `SUM(DAILY_CHEST_CAP_PER_HERO[rarity] × count)` across all owned heroes.
- When the cap is reached, `damageNode` returns `cappedOut: true` and `coins: 0`. The chest is still destroyed on the map (gameplay unaffected) but no BMCOIN is credited.

---

## 7. Session Analysis (50-Min Full-Tank Drain, 10 Heroes on Map)

### Common hero session (avg stats: stamina 2, power 2, bombRange 1.5)

| Metric | Value |
|---|---|
| maxEnergy | 200 |
| Bombs fired per session | 200 |
| Avg blast tiles hitting chests | 4 × 1.5 × 12.5% = **0.75 hits/bomb** |
| Chest-specific bombs available | 200 × 0.75 = 150 |
| Avg bombs to destroy a chest | 51.2 HP / 2 power = **25.6** |
| Chests cleared (solo, uncapped) | 150 / 25.6 = **~5.9** |
| Coins earned (solo, uncapped) | 5.9 × 1,490 = **~8,800 BMCOIN** |

### Team of 10 Common heroes (50-min session)

| Metric | Value |
|---|---|
| Total bombs fired | 10 × 200 = 2,000 |
| Total chest-aimed bombs | 2,000 × 0.75 = 1,500 |
| Chests cleared (capped at map supply) | 1,500 / 25.6 = 58.6 → **capped at 60** |
| Map clear % | ~97% |
| Coins earned before daily cap | 60 × 1,490 = **89,400 BMCOIN** |
| Daily cap (10 commons) | **120 chests** |
| Sessions to hit daily cap | 120 / 60 = **2 sessions** |

---

## 8. ROI Analysis

### 8a. Casual player (4 sessions/day, 10 Common heroes)

| Metric | Value |
|---|---|
| Chests cleared / session (team) | ~60 (map clear) |
| Sessions before daily cap | 2 |
| Chests after cap kicks in (sessions 3–4) | 0 coins credited |
| Effective chests / day | **120 (cap)** |
| Coins / day | 120 × 1,490 = **178,800 BMCOIN** |
| Mint cost (10 heroes) | 5,000,000 BMCOIN |
| **Days to break even** | 5,000,000 / 178,800 = **~28 days** |

### 8b. Active player (8 sessions/day, 10 Common heroes)

| Metric | Value |
|---|---|
| Effective chests / day (capped at 120) | 120 |
| Coins / day | **178,800 BMCOIN** |
| **Days to break even** | **~28 days** (same — cap is the ceiling) |

The daily cap equalizes casual and active players for Common heroes. The active player's advantage is hitting the cap earlier in the day, not earning more than the cap.

### 8c. 24/7 player (14 sessions/day max, 10 Common heroes)

| Metric | Value |
|---|---|
| Recovery limit | 14 sessions (100 min full tank) |
| Effective chests / day (capped at 120) | 120 |
| Coins / day | **178,800 BMCOIN** |
| **Days to break even** | **~28 days** |

The energy recovery rate and daily cap together make 24/7 automation yield the same daily output as an active player — just reached in fewer real-time hours.

### 8d. Per-rarity BEP at daily cap

| Rarity (10 heroes) | Daily cap | Avg coins/chest | Max coins/day | Days BEP |
|---|---|---|---|---|
| Common | 120 | 1,490 | 178,800 | **~28** |
| Uncommon | 180 | 1,490 | 268,200 | **~19** |
| Rare | 250 | 1,490 | 372,500 | **~13** |
| Epic | 350 | 1,490 | 521,500 | **~10** |
| Legendary | 500 | 1,490 | 745,000 | **~7** |

Legendary heroes break even in ~7 days but they have 0.005% odds — roughly 1 in 20,000 mints. Epic is the practical high-end at ~10 days for a very lucky player.

---

## 9. Network Emission Projections (1,000 Accounts)

All accounts assumed to hit their daily cap.

| Timeframe | Emission |
|---|---|
| Per session (all 1,000 accounts, 1 session each) | 60 chests × 1,490 × 1,000 = **89,400,000 BMCOIN** |
| Daily (all accounts at cap) | 120 × 1,490 × 1,000 = **178,800,000 BMCOIN** |
| Weekly | **1,251,600,000 BMCOIN** |
| Monthly | **5,364,000,000 BMCOIN** |
| Total mint burn (1,000 × 10 × 500K) | **5,000,000,000 BMCOIN** |
| Monthly emission vs mint burn | **107%** |

The monthly emission slightly exceeds the total mint burn at 1,000 accounts, meaning the float turns net-inflationary after roughly **month 1**. This is acceptable if the player base is growing (new mints continuously add to the burn side) but becomes a price-pressure risk on a static player base.

**Recommended future lever:** a graduated coin-per-chest multiplier that decays with the total BMCOIN supply in circulation — essentially a soft emission throttle without changing the cap mechanics.

---

## 10. Hero Collection Meta-Game

The daily cap system creates a collector incentive independent of the 10-hero map limit.

| Heroes owned | Rarity mix | Daily cap | vs 10-hero minimum |
|---|---|---|---|
| 10 | 10× Common | 120 | baseline |
| 20 | 20× Common | 240 | +100% |
| 15 | 10× Common + 5× Rare | 120 + 125 = **245** | +104% |
| 30 | 20× Common + 10× Uncommon | 240 + 180 = **420** | +250% |
| 10 | 10× Legendary | 500 | +317% |

A player who mints 20 Common heroes doubles their daily cap (240 chests) even though only 10 can be on the map. Each additional Common hero adds 12 chests/day to the cap ceiling — worth 12 × 800 = **9,600 BMCOIN/day** in marginal earnings, which amortizes the 500,000 mint cost in **~52 days** per extra hero.

This makes minting feel like productive investment rather than speculative gambling.

---

## 11. Critical Findings and Remaining Risks

### Finding 1 — BEP window is now tight (good)
Common-only players break even in ~28 days. This is within the target 20–90 day window and gives a realistic 1-month payback without feeling either trivially easy or hopeless.

### Finding 2 — Daily cap neutralizes 24/7 bots (good)
A bot running 14 sessions/day on 10 Common heroes earns the same daily BMCOIN as a player doing 2 sessions. The cap removes the incentive to automate beyond hitting the cap early.

### Finding 3 — Rare+ chests are still very hard for Common heroes (watch)
A Common hero with power 2 needs 80 bombs to destroy a Rare chest (HP 160). With 200 total energy per session, a Common hero spends its entire tank on a single Rare chest with 40 bombs left over for nothing. Rare chests are effectively content gated behind Uncommon+ heroes.

### Finding 4 — Monthly emission exceeds total mint float at scale (risk)
At 1,000 accounts all hitting their daily cap, the network emits ~107% of the total mint burn per month. This is sustainable only with continuous new player minting. A token buy-and-burn mechanism funded by mint fees, or a time-decay on coin rewards, is advisable before scaling beyond 2,000 accounts.

### Finding 5 — Mythic chests are nearly unreachable (balance note)
At 0.4% weight on a 60-chest map, avg 0.24 Mythic chests per map. A Common hero cannot crack a Mythic chest (HP 1,280 / power 2 = 640 bombs needed, but only 200 energy). Mythic is exclusively content for Rare+ heroes and adds aspirational value to the map without flooding the economy — this is intentional and healthy.

---

## 12. Proposed Future Levers (Not Yet Implemented)

| Lever | Effect |
|---|---|
| Supply-based coin decay | As total BMCOIN supply grows, reduce coins-per-chest by a small % — soft inflation brake |
| Stage multiplier | Higher stages multiply coins and chest HP — adds long-term progression |
| Hero upgrade system | Spend BMCOIN to increase a hero's power/range — creates a burn sink beyond minting |
| Guild / team cap sharing | Guilds pool daily caps — social mechanic that increases retention |
| Seasonal reset | Reset daily caps and emit bonus chests on weekly/seasonal rotation |

---

*Generated from live codebase constants. Re-run simulation when any of the following files change: `features/types/ChestRarity.ts`, `features/types/HeroRarity.ts`, `lib/constants/game.ts`, `lib/modules/stage-maps/generate.ts`.*
