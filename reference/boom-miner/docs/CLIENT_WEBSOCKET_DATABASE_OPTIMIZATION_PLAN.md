> Runtime architecture sections in this document describe the retired client-driven implementation. See [GAME_SERVICE.md](./GAME_SERVICE.md) for the current authoritative service, protocol and verification instructions.

# Client, WebSocket & Database Sync — Implementation Fix Plan

> **Goal:** Make gameplay smooth and durable across Phaser, Socket.IO, the WebSocket session engine, and MongoDB. A chest confirmed as destroyed must never reappear after refresh, rewards and hero energy must be applied exactly once, reconnects must safely replay unacknowledged actions, and multiple WebSocket instances must not create divergent player sessions.
>
> **Important:** Do not add an encrypted client history logger. The browser cannot securely hold an encryption key, and encryption does not prevent a modified client from sending fabricated messages. Use TLS (`wss://`), server-authoritative validation, idempotent event processing, and a durable server-side event journal instead.

---

## 1. Current Architecture

### Client

- `phaser/scenes/TreasureScene.ts`
  - Runs heroes, bombs, explosions, local map mutations, and optimistic presentation.
- `phaser/sync/WSSyncManager.ts`
  - Sends bomb detonation events and handles ACK/reject/session state messages.
- `phaser/managers/AIManager.ts`
  - Selects targets and requests paths for each hero independently.
- `phaser/systems/Pathfinding.ts`
  - Uses EasyStar paths plus additional searches performed by `AIManager`.

### WebSocket server

- `server/game-websocket-engine/socket/handlers.ts`
  - Authenticates sessions, serializes wallet mutations, validates detonations, emits ACKs, and triggers persistence.
- `server/game-websocket-engine/session/SessionStore.ts`
  - Holds authoritative in-memory sessions for one process.
- `server/game-websocket-engine/session/FlushScheduler.ts`
  - Periodically persists dirty sessions and retries some version conflicts.
- `server/game-websocket-engine/index.ts`
  - Owns Socket.IO setup, session lifecycle, and shutdown behavior.

### Domain and persistence

- `features/events/bomb-detonate/action.ts`
  - Applies a validated bomb action to server state.
- `features/mine-action/persist.ts`
  - Persists map, coins, and hero energy using map-version compare-and-swap behavior.
- `features/mine-action/build-state.ts`
  - Reconstructs canonical gameplay state from MongoDB.

---

## 2. Non-Negotiable Invariants

Every implementation must preserve these rules:

1. The server, not Phaser, decides whether a bomb detonation is valid.
2. A gameplay action is identified by `(wallet, sessionId, seq)`.
3. Processing the same action more than once produces the same final state as processing it once.
4. A durable ACK means the accepted event cannot be lost by refresh, reconnect, process restart, or instance replacement.
5. Coins, hero energy, node HP, and destroyed chests commit together logically.
6. A persistence conflict must replay the action against fresh canonical state; it must not overwrite newer state with a stale snapshot.
7. Failed persistence leaves the session dirty and observable.
8. Demo heroes never emit gameplay events and never mutate server or database state.
9. A client may display pending feedback, but only server ACK/state is authoritative.
10. No database conflict or persistence failure may be silently ignored.

---

## 3. Priority 0 — Correctness Fixes

These changes must be completed before performance tuning.

### Issue 1 — Preserve the real canonical flush baseline

**Files:**

- `features/mine-action/build-state.ts`
- `server/game-websocket-engine/session/SessionStore.ts`
- `server/game-websocket-engine/socket/handlers.ts`
- `server/game-websocket-engine/session/FlushScheduler.ts`

**Problem:**

`lastFlushedState` must represent the exact state loaded from or successfully committed to MongoDB. Manufacturing a baseline with `mapVersion: 0` is unsafe when an existing player map already has a later version. It can cause permanent conflicts or incorrect retries.

**Fix:**

1. During session creation, preserve two separate values:
   - `state`: the mutable in-memory state.
   - `lastFlushedState`: a deep clone of the exact DB state returned by `buildMineState()`.
2. Never initialize a live persisted session with `lastFlushedState: null`.
3. Reserve `null` only for a genuinely new, not-yet-persisted map, represented explicitly with an `isNew` flag.
4. Remove any fallback that resets or fabricates `mapVersion`.
5. After a successful commit, update `lastFlushedState` from `committedState`, not from the attempted snapshot.

**Acceptance criteria:**

- Refreshing an existing stage never starts persistence from version zero.
- A session loaded at version `N` uses version `N` as its first CAS baseline.
- Tests cover existing maps, new maps, and reconnects.

---

### Issue 2 — Never retry a conflict with a stale absolute snapshot

**Files:**

- `server/game-websocket-engine/socket/handlers.ts`
- `server/game-websocket-engine/session/FlushScheduler.ts`
- `features/events/bomb-detonate/action.ts`
- `features/mine-action/persist.ts`

**Problem:**

After a CAS conflict, loading fresh DB state and writing the old `nextState` can overwrite newer node damage, coins, energy, or map versions. Conflict recovery must reapply the original action to fresh state.

**Fix:**

1. Retain the validated action envelope, not only `prevState` and `nextState`:

```ts
type GameEventEnvelope = {
  wallet: string;
  sessionId: string;
  seq: number;
  type: "bomb.detonate";
  heroId: string;
  nodeKeys: string[];
  createdAt: number;
};
```

2. On CAS conflict:
   - Reload canonical state using `buildMineState(wallet)`.
   - Check whether the event was already committed.
   - If not, call `bombDetonate({ state: freshState, action, createdAt })` again.
   - Persist the newly computed result using the fresh map version.
3. Never force the old `nextState` over a newer canonical state.
4. Limit retries and surface a durable failure metric after the retry budget is exhausted.

**Acceptance criteria:**

- Two rapid detonations touching different chests both survive refresh.
- Two rapid detonations touching the same chest cannot double-credit rewards.
- A conflict cannot lower coins, restore node HP, or regress hero energy.

---

### Issue 3 — Add end-to-end event idempotency

**Files:**

- `phaser/sync/WSSyncManager.ts`
- `server/game-websocket-engine/socket/handlers.ts`
- `server/game-websocket-engine/session/SessionStore.ts`
- New server persistence module, for example:
  - `server/game-websocket-engine/events/GameEventJournal.ts`
- New database model/index as appropriate.

**Problem:**

The client sends `seq`, but the server does not persist and deduplicate `(wallet, sessionId, seq)`. Socket retries, reconnect replay, duplicate listeners, or multiple tabs may process one detonation more than once.

**Fix:**

1. Generate a stable `sessionId` for each authenticated gameplay session.
2. Add `sessionId` to gameplay payloads and ACKs.
3. Create a durable server event journal with a unique compound index:

```text
(wallet, sessionId, seq) UNIQUE
```

4. Before applying an event:
   - If a committed record exists, return its stored ACK result without applying it again.
   - If no record exists, validate, append, apply, and store the resulting ACK.
5. Keep a bounded in-memory recent-sequence cache only as an optimization; MongoDB remains the durable dedupe source.
6. Define sequence handling:
   - duplicate sequence: return previous result;
   - sequence too old: return previous result or explicit stale response;
   - unreasonable future sequence: reject;
   - new authenticated session: reset sequence namespace through `sessionId`.

**Acceptance criteria:**

- Sending one detonation payload ten times grants one reward and consumes one energy.
- Replaying pending events after reconnect is safe.
- Restarting the WebSocket server does not remove deduplication.

---

## 4. Priority 1 — Durable Event Pipeline

### Issue 4 — Add a server-side write-ahead event journal

**Do not implement this as an encrypted client log.**

**Purpose:**

An accepted gameplay event should be durably recorded before the client receives a durable ACK. The journal closes the loss window caused by process crashes between in-memory mutation and snapshot persistence.

**Recommended event lifecycle:**

```text
CLIENT SEND
  -> authenticate and schema-validate
  -> serialize per wallet
  -> check idempotency key
  -> validate against authoritative state
  -> append event journal record durably
  -> update authoritative in-memory state
  -> emit durable ACK
  -> asynchronously compact state into map/hero/balance snapshots
  -> mark journal record compacted
```

**Journal fields:**

```ts
type StoredGameEvent = {
  wallet: string;
  sessionId: string;
  seq: number;
  type: "bomb.detonate";
  payload: {
    heroId: string;
    nodeKeys: string[];
  };
  result: {
    coinsTotal: number;
    stage: number;
    heroEnergy: number;
    destroyedKeys: string[];
    stageComplete: boolean;
    mapVersion: number;
  };
  status: "committed" | "compacted" | "failed";
  createdAt: Date;
  compactedAt?: Date;
};
```

**Security:**

- Use TLS for transport.
- Validate wallet/session ownership server-side.
- Validate node keys, hero ownership, energy, rate limits, and map state server-side.
- If audit tamper-evidence is required, add a server-only HMAC/hash chain. Never expose the secret to the client.

**Acceptance criteria:**

- Killing the WebSocket process immediately after ACK cannot restore an acknowledged chest.
- Journal replay reconstructs all un-compacted state.
- Compaction is idempotent.

---

### Issue 5 — Add a client pending-event queue

**File:** `phaser/sync/WSSyncManager.ts`

**Problem:**

Events sent during a disconnect or immediately before connection loss can disappear from the client flow. The client needs an explicit pending lifecycle.

**Fix:**

1. Maintain an in-memory map keyed by `seq`:

```ts
type PendingDetonation = {
  payload: BombDetonatePayload;
  status: "queued" | "sent";
  attempts: number;
  lastSentAt: number;
};
```

2. Queue before calling `socket.emit()`.
3. Remove only on matching ACK or terminal reject.
4. On reconnect and successful session sync, resend every unacknowledged event in sequence order.
5. Use bounded exponential backoff and a maximum queue size.
6. Do not use `localStorage` for authoritative persistence. If surviving a browser reload is required later, use a scoped IndexedDB queue containing only event envelopes; the server still validates and deduplicates everything.
7. Expose pending/syncing status to the HUD without treating pending rewards as confirmed.

**Acceptance criteria:**

- Disconnecting immediately after bomb detonation and reconnecting processes the event exactly once.
- ACKs remove only their matching pending event.
- An old ACK from another `sessionId` is ignored.

---

### Issue 6 — Define ACK semantics clearly

Use separate event names or an explicit ACK status:

```ts
type BombDetonateAckPayload = {
  sessionId: string;
  seq: number;
  durability: "journaled" | "snapshotted";
  // authoritative result fields
};
```

**Recommended behavior:**

- `journaled`: safe from process loss; client may treat the event as confirmed.
- `snapshotted`: optional later notification indicating compaction completed.

Do not send a successful ACK merely because in-memory state changed.

---

## 5. Priority 2 — Database Efficiency and Atomicity

### Issue 7 — Persist deltas instead of rewriting full state

**Files:**

- `features/mine-action/persist.ts`
- Database repositories/models used by map, hero, and balance state.

**Problem:**

Writing the complete `nodes` object and every deployed hero amplifies database traffic and increases conflict probability.

**Fix:**

For each accepted detonation, compute a mutation delta:

```ts
type MineMutationDelta = {
  expectedMapVersion: number;
  nextMapVersion: number;
  nodeUpdates: Record<string, { hp: number; destroyed: boolean }>;
  coinDelta: number;
  heroId: string;
  energyDelta: number;
  destroyedCountDelta: number;
};
```

Persist only changed node paths plus counters and the affected hero. Use a MongoDB transaction if these values live in separate documents/collections. If transactions are unavailable, redesign the document boundary so one atomic update owns map rewards and progress.

**Acceptance criteria:**

- A bomb touching five nodes updates five node paths, one hero, and counters—not the whole map and roster.
- Coins and destroyed state cannot commit independently.
- CAS uses one monotonically increasing authoritative version.

---

### Issue 8 — Make stage advancement a single state transition

**Problem:**

Stage completion combines final reward persistence, map replacement, revision reset, and client reload. Partial success can leave the client and DB on different stages.

**Fix:**

1. Represent stage advance as a dedicated idempotent event.
2. Commit final destruction/reward and the next-stage identity atomically.
3. Use a `stageTransitionId` to deduplicate retries.
4. Do not accept old-stage detonation events after transition.
5. Return the new stage/version in the authoritative ACK/session state.

---

### Issue 9 — Add journal retention and compaction

1. Compact journal records in sequence order per wallet.
2. Store a durable `lastCompactedSeq` per session.
3. Delete/archive compacted records only after snapshot verification.
4. Keep enough retention for incident investigation.
5. Add a repair command that replays journal events into a fresh snapshot and compares results.

---

## 6. Priority 3 — Multi-Instance WebSocket Correctness

### Issue 10 — Replace process-local authority or enforce affinity

**Problem:**

`SessionStore` is process-local. A reconnect may land on another WebSocket instance and load stale MongoDB state while the previous instance still has dirty changes.

**Choose one supported architecture:**

### Option A — Sticky sessions plus shared Socket.IO adapter

- Enable load-balancer affinity by authenticated wallet/session.
- Add a supported Socket.IO adapter for cross-instance room/event coordination.
- Keep durable event journal in MongoDB.
- Never rely on affinity alone for durability.

### Option B — Durable shared session authority

- Keep only transient rendering state in process memory.
- Store ordered events and leases in a shared backend.
- Use a per-wallet lease/lock with fencing tokens so only one instance mutates a wallet at a time.

**Required safeguards:**

- Include `instanceId` and fencing token in diagnostics.
- Reject writes from a stale lease holder.
- Release/expire leases safely on disconnect or crash.

---

### Issue 11 — Improve disconnect, eviction, and shutdown

1. On socket disconnect, keep the session for a short reconnect grace period.
2. Do not evict dirty sessions.
3. Flush or journal all accepted events before eviction.
4. During shutdown:
   - stop accepting new gameplay events;
   - await active wallet mutation chains;
   - ensure all journal appends complete;
   - run final compaction where possible;
   - close database and Socket.IO connections.
5. Add timeouts and report incomplete shutdown state.

---

## 7. Priority 4 — AI and Pathfinding Performance

This is separate from persistence correctness and should be optimized only after the synchronization pipeline is reliable.

### Issue 12 — Cache shared danger calculations

**Files:**

- `phaser/managers/AIManager.ts`
- `phaser/managers/BombManager.ts`

**Problem:**

Each hero recomputes danger tiles from all bombs. With many heroes, identical work is repeated in the same frame.

**Fix:**

1. Compute one danger map per bomb-state revision, not per hero.
2. Increment a bomb revision only when bombs spawn, move, chain, or detonate.
3. Share the immutable danger set with all heroes until the revision changes.

---

### Issue 13 — Replace expensive queue operations

Avoid `Array.shift()` in BFS loops because it repeatedly moves array contents. Use an index cursor:

```ts
const queue: Node[] = [start];
let cursor = 0;
while (cursor < queue.length) {
  const node = queue[cursor++];
}
```

Apply this to breakable searches, escape searches, and any map flood fills.

---

### Issue 14 — Share target-distance fields

**Problem:**

Every hero independently searches for reachable breakables and then requests another path.

**Fix:**

1. Build a multi-source distance/flow field from all viable breakables.
2. Recompute only when:
   - a node becomes destroyed/walkable;
   - a bomb changes the danger map;
   - a target reservation changes materially.
3. Let heroes follow the field while preserving target reservations to avoid crowding.
4. Fall back to individual A* only for local escape and unusual blocked states.

---

### Issue 15 — Stagger AI decisions

1. Movement interpolation may run every frame.
2. Search/target decisions should run at a lower fixed frequency.
3. Spread heroes across decision buckets so all heroes do not request paths in one frame.
4. Cancel stale path requests when map revision or target changes.
5. Add a maximum path-calculation budget per frame.

---

### Issue 16 — Prevent target congestion

1. Reserve breakable targets by hero ID with expiration.
2. Penalize occupied neighboring bomb positions.
3. Release reservations on path failure, sleep, recall, detonation, or target destruction.
4. Prefer spatially distributed targets rather than always selecting the nearest global target.

---

## 8. Validation and Observability

### Required metrics

Track at minimum:

- gameplay events received, accepted, rejected, duplicated, and replayed;
- latest client sent sequence, server committed sequence, and compacted sequence;
- pending client queue depth and oldest pending age;
- mutation-chain depth and latency per wallet;
- journal append latency and failure count;
- snapshot/compaction latency and failure count;
- CAS conflicts and retry outcomes;
- dirty-session count and oldest dirty age;
- in-memory versus DB map version;
- reconnects and instance changes;
- path requests per second, cache hit rate, and pathfinding time per frame.

### Required structured logs

Every gameplay-related log should include:

```text
walletHash, sessionId, seq, stage, mapVersion, instanceId, eventType
```

Do not log wallet secrets, auth tokens, full sensitive payloads, or database credentials.

### Required alerts

Alert when:

- acknowledged sequence exceeds durable journal sequence;
- dirty-session age exceeds the normal flush window;
- CAS conflicts exceed a threshold;
- journal or compaction retries are exhausted;
- the same wallet has active mutation authority on multiple instances;
- DB map version is behind the latest journaled event;
- pathfinding exceeds the frame budget.

---

## 9. Test Plan

### Unit tests

1. Duplicate `(wallet, sessionId, seq)` returns the original ACK.
2. Exactly one coin reward and one energy deduction occur for duplicate delivery.
3. Conflict replay applies an event to fresh state instead of writing stale `nextState`.
4. Existing-map flush uses its real loaded `mapVersion`.
5. Failed persistence leaves the session dirty.
6. Stage transition is idempotent.
7. Demo events never reach the socket layer.

### Integration tests

1. Destroy a chest, receive ACK, refresh immediately: chest remains destroyed and reward remains correct.
2. Destroy multiple chests within one second: all remain destroyed after refresh.
3. Disconnect after emit but before ACK: reconnect replay processes once.
4. Disconnect after ACK but before snapshot compaction: journal replay preserves state.
5. Restart WebSocket instance after ACK: new instance reconstructs the same state.
6. Force a CAS conflict between two sessions: no node, coin, or energy regression.
7. Complete a stage during reconnect: client loads exactly one next stage.

### Load tests

1. Multiple heroes detonating bombs concurrently for one wallet.
2. Many wallets with periodic reconnects.
3. Database latency and transient write failures.
4. Multiple WebSocket instances with instance replacement.
5. Measure p50/p95/p99 ACK latency, journal latency, compaction latency, and conflict rate.

### AI performance tests

1. Run 1, 10, 25, and maximum supported heroes.
2. Measure pathfinding time per frame and total path requests.
3. Verify shared danger-map cache invalidation.
4. Confirm no hero freezes or repeatedly selects an unreachable target.
5. Confirm FPS remains stable during simultaneous explosions and map changes.

---

## 10. Recommended Implementation Order

### Phase 1 — Correctness

1. Fix canonical `lastFlushedState` initialization.
2. Remove fabricated map-version baselines.
3. Replace stale-snapshot conflict retry with action replay.
4. Add regression tests for rapid detonations and refresh.

### Phase 2 — Exactly-once behavior

1. Add `sessionId` and stable sequence semantics.
2. Add unique durable event journal index.
3. Implement server idempotency.
4. Add client pending-event replay.

### Phase 3 — Durable ACK and compaction

1. Append validated events durably before ACK.
2. Move snapshot updates into an idempotent compactor.
3. Add `lastCompactedSeq` and journal cleanup.
4. Make stage transitions journaled and idempotent.

### Phase 4 — Scale and efficiency

1. Persist node/hero/reward deltas instead of complete state.
2. Add multi-instance ownership/adapter strategy.
3. Harden shutdown and eviction.
4. Add metrics, dashboards, and alerts.

### Phase 5 — Client smoothness

1. Cache danger maps.
2. Replace BFS `shift()` queues.
3. Add shared distance/flow fields.
4. Stagger AI decisions and enforce frame budgets.
5. Profile in the browser under maximum hero load.

---

## 11. Completion Checklist

- [ ] `lastFlushedState` always equals a real loaded or committed DB state.
- [ ] No code fabricates `mapVersion: 0` for an existing map.
- [ ] Conflicts replay actions against fresh canonical state.
- [ ] Every event has `(wallet, sessionId, seq)` identity.
- [ ] Duplicate delivery cannot duplicate rewards or energy costs.
- [ ] Durable event journal is written before confirmed ACK.
- [ ] Client queues and safely replays unacknowledged events.
- [ ] Snapshot compaction is idempotent and observable.
- [ ] Stage advancement is atomic/idempotent.
- [ ] Multi-instance ownership is defined and enforced.
- [ ] Dirty sessions cannot be silently evicted.
- [ ] Persistence writes deltas rather than complete state where practical.
- [ ] Shared danger/path data removes repeated per-hero work.
- [ ] Required unit, integration, reconnect, crash, conflict, and load tests pass.
- [ ] Production metrics show no acknowledged-but-undurable events.

---

## 12. Prompt for the Implementing Agent

Use the following prompt after reviewing this document:

> Read `/docs/CLIENT_WEBSOCKET_DATABASE_OPTIMIZATION_PLAN.md` and inspect every referenced client, WebSocket, session, event, persistence, model, and test file before changing code. Implement one phase at a time in the documented order. Preserve server authority and demo isolation. Do not add client-side encryption or trust client-provided rewards, damage, energy, or destroyed state. Add schema/index changes through the project's existing database patterns, make each event idempotent using `(wallet, sessionId, seq)`, replay conflicts against fresh canonical state instead of writing stale snapshots, and write durable journal records before confirmed ACKs. Run focused tests after each phase, then run the complete test suite and production build. Report files changed, migration/index requirements, test results, and any remaining risks before continuing to the next phase.
