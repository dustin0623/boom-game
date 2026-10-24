> This is a historical design document. Its runtime and collection descriptions are superseded: current game state and authority leases live in `players.game`, and the service supports standalone MongoDB. See [GAME_SERVICE.md](./GAME_SERVICE.md) for the current authoritative service, protocol and verification instructions.

# WebSocket Session Architecture V2

## Background

This document replaces `CLIENT_WEBSOCKET_DATABASE_OPTIMIZATION_PLAN.md`.

During a review session, the original plan was found to introduce unnecessary
complexity: `game_event_journal` and `game_event_compaction_progress` were
added to solve a durability gap, but the real source of truth is the server's
in-memory `SessionStore` — not a write-ahead log. The journal was growing at
~43 documents per single test session, which would become unmanageable at
scale.

The architecture described here removes both of those collections and replaces
the entire journal/compaction subsystem with a simpler, more reliable model
that has the same durability guarantees without the write amplification.

---

## Core Principle

> The client sends only IDs and actions — never values. The server owns
> all simulation math. The database is written to, never read from, during
> active gameplay.

Because no value ever originates from the client, there is nothing to tamper
with. A malicious WebSocket message can at worst send a valid hero ID the
player actually owns to a valid tile. The server will look up the real stats
from its in-memory roster and produce the real outcome.

---

## Collections — Final List

| Collection              | Purpose                                              | Keep? |
|-------------------------|------------------------------------------------------|-------|
| `players`               | Account, wallet address, coin balance                | YES   |
| `heroes`                | Hero ownership, rarity, stats, energy, onMap flag    | YES   |
| `stage_maps`            | Persisted map state: node HP, chest state, version   | YES   |
| `game_wallet_leases`    | Distributed lock — one session per wallet at a time  | YES   |
| `transactions_pending`  | Outbound blockchain withdrawals awaiting signing     | YES   |
| `transactions_processed`| Completed blockchain transaction history             | YES   |
| `game_event_journal`    | Dedup log — replaced by in-memory `lastSeq`          | REMOVE|
| `game_event_compaction_progress` | Journal compaction pointer — no longer needed | REMOVE|

### Why `game_wallet_leases` stays

It is the single mechanism that prevents two browser tabs (or two devices)
from running the same wallet's session concurrently. Without it, both sessions
would flush conflicting state and one would silently overwrite the other. The
lease uses a fencing token (monotonically incrementing integer) so that any
write from a stale or zombie session is rejected at the DB layer even if it
somehow races the new session's first write.

---

## Session Lifecycle

```
CONNECT
  │
  ├── 1. Acquire wallet lease (game_wallet_leases)
  │       └── Reject if another valid lease exists
  │
  ├── 2. Load session data from DB (ONE-TIME READ)
  │       ├── players   → coin balance
  │       ├── heroes    → full roster for this wallet (stats + energy)
  │       └── stage_maps → current map state (node HP, chest state)
  │
  ├── 3. Hydrate SessionStore entry
  │       ├── state     : MineState (live working copy)
  │       ├── heroRoster: Map<heroId, IHero>  (full pool, read-only reference)
  │       ├── onMapHeroes: Set<heroId>         (mutable — changes on deploy/undeploy)
  │       ├── lastSeq   : number               (dedup counter, replaces journal)
  │       ├── dirty     : false
  │       └── revision  : 0
  │
  └── 4. Begin gameplay loop
```

---

## In-Memory State During Gameplay

After session start, the database is **not touched** until a flush fires.
All simulation happens against the in-memory `SessionEntry`.

### Fields the server tracks in memory

```
heroRoster      Map<heroId, IHero>     Full stat pool loaded at connect.
                                        Never mutated. Reference only.

onMapHeroes     Set<heroId>            Currently deployed heroes.
                                        Mutated by deploy/undeploy events.

heroEnergy      Map<heroId, number>    Current energy per hero.
                                        Decremented on action. Loaded from
                                        the roster at connect. Persisted on
                                        flush and on undeploy.

state           MineState              Node HP, chest HP, coin balance,
                                        map version. Mutated on every accepted
                                        game event.

lastSeq         number                 Last accepted client sequence number.
                                        Used for dedup — if client retries an
                                        event with the same seq, server ignores
                                        it. No DB write required.

dirty           boolean                True when state has changed since
                                        the last flush.

revision        number                 Incremented on every accepted mutation.
                                        Guards against flushing a stale copy.
```

---

## Event Handling Rules

All events follow the same shape from the client:

```ts
{ seq: number, heroId: string, action: string, ...tileCoords }
```

The server never trusts any value from the client payload. The only
safe fields to read from the client are:
- `seq` — used only for dedup against `lastSeq`
- `heroId` — validated against `heroRoster` (must exist, must be owned by this wallet)
- action type and tile coordinates — validated against current `state`

---

## Hero Deploy

```
client → server: { seq, heroId }

server:
  1. Check heroId exists in heroRoster (reject if not owned)
  2. Check heroId not already in onMapHeroes (reject if already deployed)
  3. Check hero energy > 0 (reject if exhausted)
  4. Add heroId to onMapHeroes
  5. Mark dirty, increment revision
  6. ACK to client with current hero energy value

DB write: none — will be included in next periodic flush
```

---

## Hero Undeploy

Undeploy is a discrete player decision. Energy state must be durable
immediately — if the player closes the tab after undeploying, the
periodic flush may never fire.

```
client → server: { seq, heroId }

server:
  1. Check heroId exists in onMapHeroes (reject if not deployed)
  2. Remove heroId from onMapHeroes
  3. Mark dirty, increment revision
  4. IMMEDIATE targeted DB write for this hero only:
       heroes.updateOne({ heroId }, {
         $set: {
           energy: heroEnergy.get(heroId),
           onMap: false,
         }
       })
  5. ACK to client

DB write: immediate, targeted, synchronous before ACK
```

### Why immediate and not batched with the periodic flush

If the player undeploys and closes the tab in the same second, the periodic
flush (every 5s) has not fired yet. The hero's energy would revert to whatever
was last persisted, effectively giving the player free energy recovery. The
immediate write removes this gap entirely.

---

## Chest Destroy and Coin Reward

```
server (on bomb detonate resolving a chest tile):
  1. Verify detonation is valid (bomb position, blast radius, tile state)
  2. Deduct chest HP in state
  3. If chest HP <= 0:
       a. Mark chest as destroyed in state
       b. Calculate coin reward (server-side only, based on chest rarity in state)
       c. Increment state.coins
  4. Mark dirty, increment revision
  5. ACK to client with new coin total

DB write: included in next periodic flush (coins live in state → players collection)
```

---

## Flush Strategy

### Periodic flush (every 5 seconds)

Fires for all `dirty` sessions. Writes:
- `stage_maps` — full node/chest state, map version
- `players` — coin balance
- `heroes` — energy and `onMap` flag for all heroes in `heroRoster`
  (including undeployed ones — ensures resting heroes' energy is current)

### Disconnect flush

Fires immediately on disconnect before the room enters retention.

```
on disconnect:
  1. Attempt flushOne(entry)
  2. On success: arm eviction timer (15 min grace for reconnect)
  3. On failure:
       a. Call flusher.scheduleRetry(wallet)
       b. Arm eviction timer — but eviction guard checks dirty=true
          and extends retention rather than evicting
       c. FlushScheduler retry queue retries with backoff:
          5s → 10s → 20s → 30s (holds at 30s)
       d. On retry success: dirty=false, next eviction check passes
       e. On extended timeout with still-dirty state: log error, evict
          anyway to prevent memory leak (data loss accepted at this point
          — connection was already gone for 30+ minutes)
```

### Undeploy flush

Immediate targeted write as described above. Independent of the periodic flush.
Does not reset the dirty flag — the periodic flush still runs normally for the
rest of the state.

---

## Deduplication — Replacing the Journal

The `game_event_journal` was used to deduplicate bomb detonation retries when
the ACK was lost over an unstable connection.

Replacement: a single `lastSeq: number` field in `SessionEntry`.

```
on any client event:
  if event.seq <= entry.lastSeq:
    // Already processed — resend previous ACK, do nothing else
    return socket.emit(ACK_EVENT, lastAckPayload)
  entry.lastSeq = event.seq
  // ... process normally
```

This is zero-cost: no DB write, no document created, no collection to compact.
`lastSeq` is reset to 0 on reconnect (the client resets its own seq counter on
reconnect as well). Because retries only happen within a single connection
lifetime, the in-memory counter is sufficient.

---

## Phases

---

### Phase 1 — Remove Journal Infrastructure ✅ COMPLETE

**Goal:** delete the journal and compaction subsystem and replace with
in-memory `lastSeq`.

**Completed:**

- `server/game-websocket-engine/events/GameEventJournal.ts` — DELETED
- `server/game-websocket-engine/events/GameEventCompactor.ts` — DELETED
- `server/game-websocket-engine/events/GameEventJournal.test.ts` — DELETED
- `server/game-websocket-engine/events/GameEventCompactor.test.ts` — DELETED
- `server/game-websocket-engine/events/model.server.ts` — DELETED (only used by journal/compactor)
- `server/game-websocket-engine/events/types.server.ts` — DELETED (only used by journal/compactor)

- `server/game-websocket-engine/session/SessionStore.ts`
  — Added `lastSeq: number` to `SessionEntry`
  — Added `lastAckPayload: BombDetonateAckPayload | null` to `SessionEntry`

- `server/game-websocket-engine/socket/handlers.ts`
  — Removed imports of `commitDetonationEvent`, `findCommittedEvent`,
    `validateSequence`, `GameEventCompactor`
  — Removed `compactor` parameter from `registerHandlers` signature
  — Added `lastSeq: 0` and `lastAckPayload: null` to `store.set()` on connect
  — Replaced entire `bomb:detonate` body:
      * In-memory dedup via `lastSeq` — duplicate seq resends cached ACK
      * Future seq gap check (MAX_FUTURE_SEQ_GAP = 1000)
      * Removed `commitDetonationEvent` call — no DB write per detonation
      * Removed `compactor.compactWallet` call
      * `durability` field in ACK changed from `"journaled"` to `"in-memory"`
      * Stage-complete now flushes immediately then rebuilds from DB
      * `lastSeq` and `lastAckPayload` reset to 0/null on stage advance

- `server/game-websocket-engine/index.ts`
  — Removed `GameEventCompactor` import
  — Removed `compactor` construction and `compactor.recover()` call
  — Removed `compactor` from `registerHandlers(...)` call
  — Removed `compactor.drain()` from shutdown sequence

**Database — manual action required:**
  — Drop `game_event_journal` collection from MongoDB Atlas
  — Drop `game_event_compaction_progress` collection from MongoDB Atlas

**Test:**
  — Simulate a lost ACK by dropping a detonation response mid-flight
  — Confirm retry (same seq) resends cached ACK — no double coins, no double blast
  — Confirm a new seq after the retry is accepted normally

---

### Phase 2 — Hero Roster In-Memory Pool ✅ COMPLETE

**Goal:** confirm that hero stats are never re-read from DB during a session.
Add the `heroRoster` and `heroEnergy` structures to `SessionEntry` and verify
all existing hero-related handlers read from them rather than querying the DB.

**Completed:**

- `server/game-websocket-engine/session/SessionStore.ts`
  — Added `import type { IHero }` from hero types
  — Added `heroRoster: Map<string, IHero>` to `SessionEntry`
  — Added `heroEnergy: Map<string, number>` to `SessionEntry`

- `server/game-websocket-engine/socket/handlers.ts`
  — Connect: changed `buildMineState` to `Promise.all([buildMineState, getHeroesByWallet])`
    so both load in parallel in a single DB round-trip
  — Built `heroRoster` and `heroEnergy` Maps from `dbHeroes` before `store.set()`
  — On reconnect: carried forward `existing.heroRoster` and `existing.heroEnergy`
    instead of the fresh DB snapshot so mid-session energy deductions are preserved
  — Added `heroRoster` and `heroEnergy` to `store.set()` call
  — `hero:deploy` handler: replaced `getHeroesByWallet` DB call with
    `Array.from(entry.heroRoster.values())` — zero DB reads per event
  — Deploy handler now mirrors live `heroEnergy` values into the roster array
    before passing to `heroDeploy`/`heroUndeploy` so energy checks use the
    latest in-memory value, not the last-flushed DB value
  — Deploy handler keeps `heroEnergy` map in sync when a hero is deployed
    (`heroEnergy.set(heroId, liveEnergy)`)
  — ACK energy value now uses `liveEnergy` (in-memory) not `hero.currentEnergy` (DB)
  — `player:sync` handler: refreshes `heroRoster` entries from DB after
    mint/withdrawal, but only adds to `heroEnergy` for new heroes — existing
    in-memory energy values are preserved to avoid overwriting unflushed deductions

**Test:**
  — Deploy three heroes, record energy values
  — Shut off DB connection mid-session (simulate outage)
  — Confirm mine:hit, bomb:detonate events still process correctly
  — Confirm heroes can still be undeployed (immediate write will fail,
    should retry — tests retry queue from Phase 1)

---

### Phase 3 — Immediate Undeploy Write

**Goal:** make hero undeploy write the hero's current energy and `onMap=false`
to the DB immediately and synchronously before ACKing the client.

**Files to change:**

- `server/game-websocket-engine/socket/handlers.ts`
  — In `hero:undeploy` handler: after updating `onMapHeroes` and
    `heroEnergy`, call `setHeroOnMap(heroId, false, currentEnergy)` (or
    equivalent repository method) and `await` it before emitting ACK
  — If the DB write fails: emit a reject to the client so the client
    knows the undeploy did not persist and can retry
  — Do NOT set `dirty = false` after this write — the periodic flush
    still needs to run for the rest of state

- `lib/modules/heroes/repository.server.ts`
  — Confirm `setHeroOnMap` accepts an energy parameter, or add an
    `updateHeroEnergy(heroId, energy)` helper if needed

**Test:**
  — Deploy a hero, use energy, then undeploy
  — Kill the WebSocket connection immediately after undeploy ACK
  — Reconnect — confirm hero energy in DB matches the value at undeploy time

---

### Phase 4 — Flush Retry Queue (already partially done)

**Goal:** verify the retry queue added to `FlushScheduler` handles all
dirty-session failure scenarios correctly and remove the silent error-swallow
from the disconnect handler.

**Files already changed (verify correctness):**

- `server/game-websocket-engine/session/FlushScheduler.ts`
  — `retryQueue`, `scheduleRetry()`, `tickRetryQueue()` already added

- `server/game-websocket-engine/socket/handlers.ts`
  — Disconnect handler already calls `flusher.scheduleRetry(wallet)`
    on failure
  — Eviction timer already extends retention when `dirty=true`

**Remaining work:**

- Add a test that simulates a DB write failure on disconnect and confirms:
  1. The session stays in memory (dirty=true, evictTimer extended)
  2. The retry queue fires at the correct backoff intervals
  3. On simulated DB recovery, the flush succeeds and the room is
     then correctly evicted after the next clean eviction check

- Add a metric or log counter for retry attempts so operational dashboards
  can alert if retries are consistently failing (signals DB connectivity issue)

---

### Phase 5 — Coins and Stage Map Flush Consolidation

**Goal:** ensure that after Phase 1–4 are complete, all flush paths write
a consistent, consolidated snapshot — no partial writes where `stage_maps`
is updated but `players` coins are not (or vice versa).

**Files to change:**

- `server/game-websocket-engine/session/FlushScheduler.ts`
  — `flushOne()` should write `stage_maps`, `players`, and hero energy
    in a single logical batch (can be parallel `Promise.all` — they are
    different collections so there is no transaction needed, but all three
    must succeed before `dirty` is set to false)
  — If any one of the three writes fails, keep `dirty=true` and call
    `scheduleRetry(wallet)` — do not partially commit

- Verify flush covers:
  — `stage_maps.nodes` + `stage_maps.chests` + `stage_maps.version`
  — `players.coins`
  — `heroes.energy` + `heroes.onMap` for all heroes in the roster
    (not just on-map ones — resting heroes regenerate energy server-side
    and need their energy persisted too)

**Test:**
  — Destroy a chest (coins increment in memory)
  — Trigger a flush
  — Confirm both `stage_maps` chest state and `players` coins are updated
    atomically (both updated or neither)

---

## What This Does Not Change

- `game_wallet_leases` — unchanged. Still required for single-session enforcement.
- `transactions_pending` / `transactions_processed` — unchanged. Blockchain
  withdrawal flow is separate from the gameplay session.
- `WalletAuthority.ts` — unchanged. Lease acquisition, renewal, and fencing
  token logic stays as-is.
- Client-side WebSocket event shape — clients still send `{ seq, heroId, action, ...coords }`.
  The only client-visible change is that undeploy now always waits for server
  ACK before the client-side state updates (it should already be doing this).
- Energy regen — `RegenScheduler` and its server-clock-only regen tick are
  unchanged. Regen deltas are calculated server-side and included in the next
  flush automatically since heroes are in the roster.
