# Boom Miner Is Almost Here — Here's Everything You Need to Know

After around two months of development, Boom Miner is finally ready to launch.

This post covers the game from top to bottom — what it is, how it works, the hero system, the economy, and how to get started before the game officially opens.

If you haven't seen the developer introduction yet, check out PhantomScript's post over at [@phantomscript](https://peakd.com/@phantomscript).

---

## ⛏️ What Is Boom Miner?

Boom Miner is a **pixel-art idle mining game** built on Hive.

Players collect heroes that automatically explore maps, plant bombs, destroy obstacles, and uncover treasure chests filled with **$BMCOIN**.

Deploy your heroes, let them clear maps, collect rewards, and grow your mining operation — no constant input required once your crew is on the map.

The game runs entirely in the browser. No download, no client, no install.

---

## 🦸 Heroes

Heroes are the heart of Boom Miner. Without heroes, there is no mining.

There are **10 hero characters** — Ricky, Rocky, Rascal, Red Horn, Ducky, Bolt, Pinky, Mossy, Ghosty, and Timmy. Which character you get is random at mint, and each one walks the map in full pixel-art animation.

Every hero also rolls five attributes inside its rarity band the moment it hatches from the Incubator. No two heroes are identical.

### Rarity Tiers

There are five rarity tiers with the following mint probabilities:

| Rarity    | Mint Chance |
|-----------|-------------|
| Common    | 80%         |
| Uncommon  | 14%         |
| Rare      | 5%          |
| Epic      | 0.995%      |
| Legendary | 0.005%      |

Legendary is a **1-in-20,000 roll**. Higher rarity means better attribute ranges, faster energy regeneration, and a higher daily chest cap.

### Hero Attributes

| Rarity    | Power  | Speed  | Stamina | Bombs | Blast Range |
|-----------|--------|--------|---------|-------|-------------|
| Common    | 1–3    | 1–3    | 1–3     | 1     | 1–2         |
| Uncommon  | 3–6    | 3–6    | 3–6     | 2     | 2–3         |
| Rare      | 6–8    | 6–8    | 6–8     | 3     | 3–5         |
| Epic      | 8–11   | 8–11   | 8–11    | 4     | 5–7         |
| Legendary | 11–16  | 11–16  | 11–16   | 6     | 7–11        |

- **Power** — HP damage dealt to every tile in the blast per detonation. A Power 5 hero removes 5 HP from each node it hits.
- **Speed** — How fast the hero moves across the map toward targets.
- **Stamina** — Sets max energy (Stamina × 100). Stamina 8 = 800 max energy.
- **Bombs** — How many bombs can be live on the map at the same time.
- **Blast Range** — Explosion radius in tiles from the detonation center.

---

## ⚡ Energy System

Heroes don't work forever. Every bomb detonation costs **1 energy**.

When a hero hits 0 energy it is automatically recalled from the map. While resting off the map, energy regenerates on a server-side **5-minute tick**. Recovery rate scales with rarity:

| Rarity    | Max Energy  | Regen Rate       | Full Tank From Empty |
|-----------|-------------|------------------|----------------------|
| Common    | 100–300     | 5% per 5 min     | ~100 min             |
| Uncommon  | 300–600     | 6.25% per 5 min  | ~80 min              |
| Rare      | 600–800     | 8.33% per 5 min  | ~60 min              |
| Epic      | 800–1,100   | 10% per 5 min    | ~50 min              |
| Legendary | 1,100–1,600 | 12.5% per 5 min  | ~40 min              |

A hero is always in one of four states:

- **WORKING** — deployed on the map, actively mining
- **RESTING** — off the map, energy recovering on the server tick
- **READY** — off the map, energy full, waiting to re-deploy
- **SLEEPING** — energy hit 0, auto-recalled, must rest before returning

Managing your roster's rest cycles is the key to maximizing your daily output.

---

## 📦 Daily Chest Cap

Each hero in your roster contributes to your account's rolling daily chest cap:

| Rarity    | Chests Per Hero Per Day |
|-----------|-------------------------|
| Common    | 12                      |
| Uncommon  | 18                      |
| Rare      | 25                      |
| Epic      | 35                      |
| Legendary | 50                      |

A few examples:

- 10× Common = **120 chests/day**
- 10× Legendary = **500 chests/day**
- 5× Common + 3× Uncommon + 2× Rare = 60 + 54 + 50 = **164 chests/day**

Growing your roster with higher-rarity heroes is the fastest way to increase your daily earnings ceiling.

---

## 💎 Treasure Chests

Chests are the primary source of $BMCOIN. They are hidden behind bushes and walls on every procedurally generated map. The rarer the chest, the more HP it has — and the bigger the payout when it's destroyed.

| Rarity    | Spawn Chance | HP    | $BMCOIN Reward |
|-----------|--------------|-------|----------------|
| Common    | 80%          | 20    | 800            |
| Rare      | 13%          | 160   | 2,400          |
| Epic      | 5%           | 320   | 8,000          |
| Legendary | 1.6%         | 640   | 32,000         |
| Mythic    | 0.4%         | 1,280 | 160,000        |

A Mythic chest pays out **200× more** than a Common and requires **64× as many bomb hits** to crack open. High-Power heroes are the only way to mine Mythic and Legendary chests efficiently.

---

## 🗺️ Stages and Map Generation

Every stage is a procedurally generated **41 × 25 tile grid**.

How each map is built:

1. A random **55 to 65 chests** are placed first, weighted by the spawn table above
2. Remaining tiles fill at approximately **60% bush density**
3. Perimeter walls and even-column pillars form the fixed maze skeleton
4. Tiles at positions (1,1), (2,1) and (1,2) are always kept clear — the hero spawn corner is guaranteed walkable so no hero is ever trapped at stage start

Once every chest on the map has been destroyed, the stage is complete. A fresh seeded map generates automatically and all deployed heroes transition into the next stage without interruption.

---

## 🎮 How to Play

### Step 1 — Mint a Crew

Pay **500,000 $BMCOIN** per hero in the Incubator. Rarity and all five attributes are rolled at mint — fully random, no guaranteed tiers. Your request is queued and verified on-chain; heroes appear in your roster once the transaction settles. You can mint 1 to 10 heroes per transaction.

### Step 2 — Deploy to the Map

Send up to **10 heroes** to WORK from your roster. Each deployed hero auto-pathfinds toward chests, plants bombs when in range, and clears its own blast radius. No player input is needed once heroes are on the map.

### Step 3 — Crack Chests, Earn $BMCOIN

Each detonation costs 1 energy and deals Power HP damage to every tile in the blast. Chests pay out $BMCOIN by rarity when destroyed. Clear every chest on a stage to automatically advance to the next map.

### Step 4 — Rest and Repeat

At 0 energy a hero is auto-recalled to your roster. While RESTING it regenerates energy on the server's 5-minute tick. Rotate your crew, manage rest cycles, and keep the operation running around the clock.

---

## 💰 $BMCOIN Presale

Before the official launch, Boom Miner is holding its **first and only public $BMCOIN presale**.

**Total available:** 2,500,000,000 $BMCOIN  
**Price:** 1 $BMCOIN = 0.00005 SWAP.HIVE  
**Duration:** One month

Once the presale ends, any unsold $BMCOIN moves to the game treasury. There are no further public token sales planned — future heroes are primarily minted using tokens earned through gameplay.

Based on the presale allocation, players can collectively mint up to **5,000 heroes** during the initial distribution. These will be the first generation of miners in Boom Miner.

---

## 🌍 A Community-Driven Economy

Long-term, the goal is an economy shaped by its players rather than token sales.

After the presale closes, players will be able to:

- Earn $BMCOIN through gameplay
- Mint new heroes using tokens earned in-game
- Trade heroes with other players through the marketplace

The marketplace is on the roadmap. Details will be shared in future updates.

---

## 📅 What's Next

Launching the game is only step one. Updates will continue covering:

- Gameplay improvements and balance changes
- Marketplace launch
- New hero content
- Community events and suggestions

Follow the game account here on Hive to stay up to date as Boom Miner continues to grow.

---

## 🔗 Links

**Play:** https://www.boom-miner.online  
**Discord:** https://discord.gg/g3uKGeVxy  
**Game Account:** https://peakd.com/@boom.miner  
**Developer:** https://peakd.com/@phantomscript

---

*#hive #hivegaming #gamedev #play2earn #phaser #web3gaming #boomminer #blockchain*
