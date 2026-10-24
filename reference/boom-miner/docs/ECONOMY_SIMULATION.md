# Boom Miner — Economy Simulation & Rebalancing Report

**Simulation Date:** 2026-07-21  
**Scenario:** 1,000 accounts × 10 heroes minted each, 50-minute full-tank session  
**All constants sourced directly from the codebase** (`lib/constants/game.ts`, `features/types/HeroRarity.ts`, `features/types/ChestRarity.ts`, `lib/modules/heroes/generate.ts`)

---

## Table of Contents

1. [Simulation Inputs](#1-simulation-inputs)
2. [Hero Rarity System](#2-hero-rarity-system)
3. [Energy & Recovery Mechanics](#3-energy--recovery-mechanics)
4. [Chest Distribution & Loot](#4-chest-distribution--loot)
5. [Map Layout](#5-map-layout)
6. [Session Analysis — 50 Minutes, 10 Heroes](#6-session-analysis--50-minutes-10-heroes)
7. [ROI Analysis](#7-roi-analysis)
8. [Emission Projections](#8-emission-projections)
9. [Critical Findings](#9-critical-findings)
10. [Rebalancing Recommendations](#10-rebalancing-recommendations)
11. [Proposed Rebalanced Numbers](#11-proposed-rebalanced-numbers)

---

## 1. Simulation Inputs

| Parameter | Value |
|---|---|
| Accounts simulated | 1,000 |
| Heroes minted per account | 10 |
| Max heroes on map simultaneously | 10 (`MAX_ON_MAP`) |
| Session window | 50 minutes (full-tank drain to zero) |
| Sessions per day assumed | 3 |
| Mint cost per hero | 500,000 BMCOIN |
| **Total heroes minted** | **10,000** |
| **Total BMCOIN burned at mint** | **5,000,000,000 BMCOIN** |

---

## 2. Hero Rarity System

### Rarity Weights & Expected Drops per 10 Mints

| Rarity | Odds | Expected per 10 mints | Max Energy | Avg Power | Avg BombRange | BombNum |
|---|---|---|---|---|---|---|
| Common | 80.00% | 8.00 | 200 | 2.0 | 1.0 | 1 |
| Uncommon | 14.00% | 1.40 | 450 | 4.5 | 2.5 | 2 |
| Rare | 5.00% | 0.50 | 700 | 7.0 | 4.0 | 3 |
| Epic | 0.995% | 0.10 | 950 | 9.5 | 6.0 | 4 |
| Legendary | 0.005% | ~0 | 1,350 | 13.5 | 9.0 | 6 |

### Stat Ranges per Rarity

| Rarity | Stamina Range | Power Range | BombRange Range |
|---|---|---|---|
| Common | 1 – 3 | 1 – 3 | 1 – 1 |
| Uncommon | 3 – 6 | 3 – 6 | 2 – 3 |
| Rare | 6 – 8 | 6 – 8 | 3 – 5 |
| Epic | 8 – 11 | 8 – 11 | 5 – 7 |
| Legendary | 11 – 16 | 11 – 16 | 7 – 11 |

### Weighted Network Averages (across all mints)

| Stat | Weighted Average |
|---|---|
| Stamina | 1.870 |
| Max Energy | 187.0 |
| Power | 2.145 |
| BombRange | 1.235 |
| BombNum | 1.200 |

> **Key observation:** Because 80% of all mints are Common, the network-wide average is almost entirely dominated by Common hero stats. Uncommon+ heroes are outliers statistically.

---

## 3. Energy & Recovery Mechanics

### Constants

| Constant | Value | Source |
|---|---|---|
| Energy per Stamina point | 100 | `ENERGY_PER_STAMINA` |
| Recovery per tick | 10% of maxEnergy | `RECOVERY_FRACTION_PER_INTERVAL = 0.1` |
| Recovery interval | 5 minutes (300 seconds) | `RECOVERY_INTERVAL_SECONDS = 300` |
| Energy cost per bomb | 1 | `ENERGY_PER_BOMB = 1` |

### Recovery Table

| Stamina | Max Energy | Energy/tick | Ticks to full | Time to full |
|---|---|---|---|---|
| 1 (Common min) | 100 | 10 | 10 | 50 min |
| 2 (Common mid) | 200 | 20 | 10 | 50 min |
| 3 (Common max) | 300 | 30 | 10 | 50 min |
| 4.5 (Uncommon avg) | 450 | 45 | 10 | 50 min |
| 7 (Rare avg) | 700 | 70 | 10 | 50 min |
| 9.5 (Epic avg) | 950 | 95 | 10 | 50 min |
| 13.5 (Legendary avg) | 1,350 | 135 | 10 | 50 min |

> **Key observation:** Every hero regardless of rarity reaches full energy in exactly 50 minutes (10 ticks × 5 min). The 50-minute session window is perfectly calibrated. This mechanic should not be changed.

### Session Bomb Budget

A hero deployed at full energy can fire exactly `maxEnergy` bombs before going offline. This is the **full session budget** — 1 energy = 1 bomb detonation.

---

## 4. Chest Distribution & Loot

### Chest Rarity Table

| Rarity | Odds | Avg per Map (45) | HP | Coins | Bombs to Destroy (avg power 2.1) |
|---|---|---|---|---|---|
| Common | 80.0% | 36.0 | 80 | 220 | 37.2 |
| Rare | 13.0% | 5.9 | 160 | 660 | 74.4 |
| Epic | 5.0% | 2.3 | 320 | 2,200 | 148.8 |
| Legendary | 1.6% | 0.7 | 640 | 8,800 | 297.7 |
| Mythic | 0.4% | 0.2 | 1,280 | 44,000 | 595.3 |

### Weighted Averages

| Metric | Value |
|---|---|
| Average coins per chest | 687.6 BMCOIN |
| Average HP per chest | 118.4 |
| Average bombs to destroy (avg power) | 55.2 |
| Max coins (full map clear, 45 chests) | 30,942 BMCOIN |

---

## 5. Map Layout

### Generation Parameters

| Parameter | Value |
|---|---|
| Map dimensions | 41 × 25 tiles |
| Walkable grass tiles (approx.) | ~480 |
| Chests per map | 40 – 50 (avg 45) |
| Bush fill (after chest placement) | ~60% of remaining grass (~260 bushes) |
| Fixed wall tiles | Indestructible grid pillars |

### Tile Density at 45 Chests

| Tile Type | Count | % of Walkable |
|---|---|---|
| Chests | 45 | 9.4% |
| Bushes | ~260 | 54.2% |
| Open grass | ~175 | 36.4% |

> **Key observation:** At 9.4% chest density, a bomb blast with range 1 (4 tiles) has only a **37.5% chance of hitting any chest tile at all**. Most energy is wasted on bushes and open grass.

---

## 6. Session Analysis — 50 Minutes, 10 Heroes

### Per-Hero Bomb Efficiency

| Metric | Common (avg) | Uncommon (avg) | Rare (avg) | Epic (avg) |
|---|---|---|---|---|
| Full energy tank (bombs) | 200 | 450 | 700 | 950 |
| Blast tiles per bomb (4 × range) | 4.0 | 10.0 | 16.0 | 24.0 |
| Chest hits per bomb | 0.376 | 0.940 | 1.504 | 2.256 |
| Bombs needed to destroy avg chest | 55.2 | 26.4 | 16.9 | 12.5 |
| Chests cleared solo (uncapped) | 1.36 | 16.0 | 62.2 | 171.5 |
| Chests cleared solo (capped at 45) | 1.36 | 16.0 | 45.0 | 45.0 |
| Coins earned solo / session | 936 | 11,002 | 30,942 | 30,942 |

### Team Session (10 Heroes, 50 min)

| Metric | Value |
|---|---|
| Total bombs fired (10 heroes) | 1,870 |
| Weighted chest hits per bomb | 0.436 |
| Team chests cleared (raw) | 14.8 |
| Team chests cleared (map-capped) | 14.8 / 45 |
| Map clear percentage | 33% |
| **Coins earned per account / session** | **10,177 BMCOIN** |

> Note: The team clears only 33% of the map per session because Common heroes (80% of the team) are extremely inefficient at 9.4% chest density with range-1 blasts.

---

## 7. ROI Analysis

### Per-Account ROI

| Metric | Value |
|---|---|
| Mint cost (10 heroes) | 5,000,000 BMCOIN |
| Earnings per session | 10,177 BMCOIN |
| Sessions to break even | 491 |
| **Days to break even (3 sessions/day)** | **164 days** |

### Per-Rarity ROI (solo hero, 3 sessions/day)

| Rarity | Mint Cost | Coins/Session | Sessions BEP | Days BEP |
|---|---|---|---|---|
| Common | 500,000 | 936 | 534 | **178 days** |
| Uncommon | 500,000 | 11,002 | 46 | **15 days** |
| Rare | 500,000 | 30,942 | 17 | **6 days** |
| Epic | 500,000 | 30,942 | 17 | **6 days** |
| Legendary | 500,000 | 30,942 | 17 | **6 days** |

> **Critical finding:** The ROI spread between Common (178 days) and Rare (6 days) is 30×. Since 80% of all mints produce a Common hero, the **dominant player experience is a 178-day payback** — the 164-day team average is misleading because it is heavily inflated by the rare Uncommon/Rare heroes in the mix.

### What a Real 10-Mint Player Experiences

A statistically average 10-mint player receives:
- 8 Common heroes → ~7,488 coins/session combined
- 1 Uncommon hero → ~11,002 coins/session
- 0.5 of a Rare hero → ~15,471 coins/session (averaged)

**Effective total: ~22,435 coins/session (3 sessions/day)**  
**Break-even: ~74 days** with an average roll  
**Break-even: ~178 days** with all-Common rolls (80% probability scenario)

---

## 8. Emission Projections

### Network-Wide (1,000 Accounts)

| Timeframe | Emission |
|---|---|
| Per session | 10,177,000 BMCOIN |
| Per day (3 sessions) | 30,531,000 BMCOIN |
| Per week | 213,717,000 BMCOIN |
| Per month | 915,930,000 BMCOIN |
| Per year | 11,143,695,000 BMCOIN |

### Emission vs. Mint Sink

| Metric | Value |
|---|---|
| Total BMCOIN burned at mint (5B cap) | 5,000,000,000 |
| Monthly emission | 915,930,000 |
| Monthly emission as % of total mint burn | 18.3% |
| Months until emission equals mint burn | 5.5 months |
| Break-even point (emission = mint) | ~Month 6 |

> After month 6, the network enters **net-inflationary territory** — more BMCOIN has been emitted via chest rewards than was burned at mint. At 1,000 active accounts maintaining 3 sessions/day, the total supply increases indefinitely with no additional sink.

---

## 9. Critical Findings

### Finding 1 — Common Heroes Are Effectively Non-Functional

A Common hero (power = 2, bombRange = 1) needs **37–40 bombs to destroy a single Common chest**. With a full energy tank of 200, a Common hero clears **at most 1.36 chests per 50-minute session** in solo play.

At 3 sessions/day, a Common hero earns approximately **2,808 BMCOIN/day**.  
At a mint cost of 500,000 BMCOIN, the break-even is **178 days (6 months)** for the most common outcome.

This creates a guaranteed bad experience for 80% of minting players.

### Finding 2 — Chest Density Is Too Low for Short-Range Heroes

At 9.4% chest density, a range-1 bomb blast (4 tiles) has only a 37.6% chance of striking a chest. The other 62.4% of the time, energy is consumed bombing bushes or open grass — tiles with no reward. For Common heroes with exactly range-1, nearly **two-thirds of their entire session energy is wasted**.

### Finding 3 — Zero Progression Mechanics

There is no way for a Common hero to improve over time. Stats are fixed at mint. A player stuck with 8 Common heroes has no path to better performance except minting more heroes (spending more BMCOIN).

### Finding 4 — Rare+ Heroes Are Overcorrected

Rare, Epic, and Legendary heroes hit the 45-chest map cap on their own. Their limiting factor is the map, not their stats. Any buff to map density or chest HP benefits Rare+ heroes disproportionately.

### Finding 5 — No Long-Term Emission Control

At 1,000 accounts, monthly emission is 915M BMCOIN vs 5B total mint burn. By month 6 the network is inflationary. At 10,000 accounts (realistic growth target) monthly emission becomes 9.15B — **already larger than the entire mint burn in month 1**.

---

## 10. Rebalancing Recommendations

### Priority 1 — Fix Common Hero Viability (HIGH)

**Problem:** Common heroes need 37–40 bombs per chest with power=2.  
**Fix:** Reduce Common chest HP from 80 to 20.

| Metric | Before | After |
|---|---|---|
| Bombs to break Common chest (power 2) | 40 | 10 |
| Chests cleared by Common hero / session | 1.36 | 5.4 |
| Coins / session (Common solo) | 936 | 3,745 |
| Common hero break-even (days) | 178 | 45 |

This alone brings Common hero ROI into a healthy window without changing minting odds.

---

### Priority 2 — Raise Common Hero BombRange Minimum (HIGH)

**Problem:** Range-1 blasts hit only 4 tiles. 62.4% of energy is wasted.  
**Fix:** Raise Common bombRange minimum from 1 to 2.

| Metric | Before | After |
|---|---|---|
| Blast tiles per bomb (Common) | 4 | 8 |
| Chest hits per bomb | 0.376 | 0.752 |
| Chest hit efficiency | 37.6% | 75.2% |

Combined with the HP fix above, Common hero earnings roughly double again.

---

### Priority 3 — Increase Chest Density on Map (MEDIUM)

**Problem:** 45 chests on 480 grass tiles = 9.4% density. Too sparse for short-range heroes.  
**Fix:** Increase chests per map from 40–50 to 60–70.

| Metric | Before | After |
|---|---|---|
| Avg chests per map | 45 | 65 |
| Chest density | 9.4% | 13.5% |
| Common hero chest hits/bomb | 0.376 | 0.542 |

This also means teams of 10 heroes need more sessions to fully clear a map, extending map lifetime and reducing the speed of emission.

---

### Priority 4 — Add Daily Emission Cap (HIGH)

**Problem:** Uncapped emission reaches inflationary territory at ~month 6.  
**Fix:** Cap chest clears at 30 per account per day across all heroes.

| Scenario | Uncapped Daily Emit | Capped Daily Emit |
|---|---|---|
| 1,000 accounts | 30,531,000 | ~20,628,000 |
| 10,000 accounts | 305,310,000 | ~206,280,000 |
| Monthly (10k accounts) | 9.15B | 6.19B |

The cap should reset at midnight UTC and apply to the sum of all heroes' chest clears, not per-hero, to prevent circumvention through deploying many heroes.

---

### Priority 5 — Add a Progression / Upgrade Mechanic (MEDIUM)

**Problem:** Common heroes have no path to improvement. Players who roll 8 Common heroes have no reason to keep playing after week 1.  
**Suggested mechanic:** Allow heroes to gain XP per chest destroyed. After N chests, a hero's Power or BombRange increases by 1 (up to a rarity-gated cap). This keeps players engaged long-term and gives Common heroes a growth trajectory without breaking the rarity curve.

---

### Priority 6 — Introduce a BMCOIN Burn Mechanic Beyond Minting (LOW)

**Problem:** The only current sink is minting. Once minted, emission is one-directional.  
**Suggested sinks:**
- Revive a hero's energy instantly for X BMCOIN (rather than waiting 50 min)
- Upgrade a hero stat for a one-time BMCOIN cost
- Seasonal map boss fights with BMCOIN entry fee and shared jackpot

---

## 11. Proposed Rebalanced Numbers

### Hero Stats (revised)

| Rarity | BombRange Min | BombRange Max | Power Min | Power Max | Stamina (unchanged) |
|---|---|---|---|---|---|
| Common | **2** | **3** | 1 | 3 | 1 – 3 |
| Uncommon | 3 | 5 | 3 | 6 | 3 – 6 |
| Rare | 4 | 6 | 6 | 8 | 6 – 8 |
| Epic | 6 | 8 | 8 | 11 | 8 – 11 |
| Legendary | 8 | 12 | 11 | 16 | 11 – 16 |

### Chest HP (revised)

| Rarity | Current HP | Proposed HP | Notes |
|---|---|---|---|
| Common | 80 | **20** | Core fix for Common hero viability |
| Rare | 160 | **60** | Scaled down proportionally |
| Epic | 320 | **120** | Keeps Rare/Epic differentiation |
| Legendary | 640 | **240** | Still requires dedicated energy |
| Mythic | 1,280 | **480** | High-value target, team effort |

### Map Density (revised)

| Parameter | Current | Proposed |
|---|---|---|
| Chests per map | 40 – 50 | **60 – 70** |
| Avg chests | 45 | 65 |
| Bush fill rate | 60% of remainder | 50% of remainder |

### Revised Session Projections (Common hero, proposed values)

| Metric | Current | Proposed |
|---|---|---|
| Bombs to break Common chest | 40 | 10 |
| Blast tiles per bomb | 4 | 8 |
| Chest hits per bomb | 0.376 | 1.084 |
| Chests cleared / session (solo) | 1.36 | **10.8** |
| Coins / session (solo) | 936 | **7,430** |
| Days to break even (solo) | 178 | **23 days** |

### Revised Network Emission Projections (proposed values, 1,000 accounts)

| Timeframe | Current | Proposed (with 30/day cap) |
|---|---|---|
| Daily | 30,531,000 | ~21,000,000 |
| Monthly | 915,930,000 | ~630,000,000 |
| Months to equal total mint burn | 5.5 | **7.9** |
| Break-even ROI (common hero) | 178 days | **23 days** |

---

## Summary

The current game is **mechanically sound but economically broken for Common heroes**, which represent 80% of all mints. The 50-minute recovery cycle is perfectly designed — it enforces natural session breaks and is not a problem. The problems are:

1. Common chest HP (80) is 4× too high for a power-2 hero
2. Common bombRange (1) makes most energy spent on empty tiles
3. Map chest density (9.4%) is too low for any short-range hero to function
4. No daily emission cap means the token supply inflates past mint burn in month 6
5. No progression path keeps long-term player motivation low

Fixing items 1–3 alone transforms Common hero break-even from **178 days to 23 days**, brings it into a window that feels rewarding without being exploitable, and does not require changing the rarity weights, mint cost, or energy recovery system.
