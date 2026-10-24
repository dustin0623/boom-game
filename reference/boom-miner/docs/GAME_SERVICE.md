# Authoritative game service

The Socket.IO service owns the simulation. Phaser renders committed maps, heroes,
bombs and effects, and interpolates transient movement. Mining stops on detected
disconnect or pause. No offline mining is simulated; resting heroes recover by
server timestamps.

## Run

Install the locked dependencies, then run `pnpm server:websocket-start` and
`pnpm dev` in separate terminals with the same `MONGODB_URI` and `JWT_SECRET`.
Set `NEXT_PUBLIC_WS_URL` to the service URL. The default service port is 4000.
MongoDB may be a standalone server; the game service does not require transactions.
The browser and service must both use protocol 2. Deploy them together.

Game checkpoints are initialized lazily under an authority lease. Optionally run
`pnpm game:migrate` with the service stopped to initialize existing players in
advance. This operation preserves maps, destroyed nodes, balances, energy and
daily counters. Run it again safely; busy players are skipped.

## State and persistence

`features/game` contains the framework-independent rules and simulation.
The service has one mutable game state and one serialized queue per player.
Authority renews every five seconds independently of bombs. The game state,
revision, operation receipts, lease fence, player balance, stage and daily
progress are stored in the same `players` document. A revision- and lease-checked
single-document update atomically commits game state and rewards, so standalone
MongoDB can safely persist gameplay without multi-document transactions.
Marketplace ownership/listing changes take a short-lived mutation lock on the
same player document, preventing a live game lease from racing those changes.
`heroes` retains the roster and receives projections of energy and deployment
state; projections are reconciled from `players.game` when the player reconnects.
Existing `stage_maps` documents are read once to migrate legacy game state.

Normal movement frames do not write to MongoDB. A crash can rewind transient
movement to its last checkpoint, but cannot revoke a confirmed reward, damage,
energy cost or stage transition. On database or authority failure, gameplay freezes
and the client requests a fresh snapshot before resuming.

`players.game.state` holds the complete authoritative map, run/map IDs, monotonic
revision, gameplay time, seeded random state, active bombs, hero runtime state,
and movement checkpoints. The same document holds up to 256 recent operation
receipts and the authority lease. Coins and daily counters remain on the player
document and are updated in the same atomic write. `stage_maps` and `game_events`
are legacy read sources, not required for ongoing gameplay. There is no periodic
absolute balance overwrite and no browser-authorized damage path.

The cap resets at UTC midnight and sums owned hero rarity allowances. Capped chests
still disappear and permit progression, while awarding zero coins. Each bomb costs
one energy, including an empty blast. Recall stops new planting; existing bombs
resolve before resting recovery begins. Stage changes wait for outstanding bombs.

## Protocol

`game:command` accepts deploy, recall and pause intentions with stable request IDs.
`game:result` returns their durable outcomes. `game:snapshot` initializes or restores
the full state; `game:sync` acknowledges application before simulation resumes.
`game:update` carries committed node/hero changes and effects; `game:motion` carries
transient positions. Revision gaps cause a resync. `game:error` distinguishes
recoverable failures from terminal authentication/version/tab-replacement errors.

Snapshots never replay historical reward effects. New map IDs replace the complete
rendered map. The demo runs the same simulation locally with isolated data and
never updates the real balance or sends gameplay commands.

## Verification

Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`.
To include database and real Socket.IO integration tests, set `TEST_MONGODB_URI`
to a dedicated database named `boom_game_test*`; a standalone MongoDB instance is
sufficient. Those tests clear and drop only their explicitly named test
databases. Never use an application database.

`pnpm game:load` requires a dedicated `boom_game_test_load*` database. Defaults are
100 sessions, ten heroes per session, and 900 seconds, followed by 65 seconds to
verify retained sessions are released. Optional `LOAD_SESSIONS` and `LOAD_SECONDS`
change the test size. The script writes `.cache/game-load-report.json` with commit
latency, message volume, queue samples, heap samples, errors and cleanup counts.
Load-test heroes have large energy tanks to keep all sessions active throughout
the soak; this does not change production hero definitions.

The service exposes `/health` with database readiness, active game count, commit
timing totals, persistence failures, authority failures and resynchronizations.

Settlement is unchanged. The frontend's existing settlement notifier only requests
a serialized game snapshot refresh. Colyseus remains a later comparison against
the working service; no second transport implementation is included.
