# Demo Heroes — Implementation Plan

> **Goal:** When a player logs in and has zero heroes (`roster.length === 0`), spawn 10
> locally-simulated demo heroes on the map that play the full game loop — move, bomb, explode
> chests, collect loot. The demo runs entirely inside the Phaser scene; nothing is emitted over
> the socket and nothing touches the database. The moment the player mints their first hero
> (or already has one on login) the demo never starts. The player can dismiss it at any time
> by clicking "MINT A HERO".

---

## 1. Condition & Lifecycle

| Condition | Behaviour |
|-----------|-----------|
| `roster.length === 0` on `TreasureScene.create()` | Demo starts immediately |
| Player mints first hero during demo (socket pushes `SESSION_STATE`) | Demo tears down, `reconcileHeroes()` takes over |
| `roster.length >= 1` on any `TreasureScene.create()` (login, stage advance) | Demo never starts |
| Player manually closes the HUD banner | Demo continues but banner is hidden |

No server call is needed to determine the condition — `roster` is hydrated from
`GET /api/bootstrap` before the scene starts.

---

## 2. New Files

```
phaser/demo/DemoManager.ts       ← orchestrates all 10 demo heroes
phaser/demo/DemoAI.ts            ← local AIManager variant — no socket emissions
components/game/DemoBanner.tsx   ← "DEMO MODE — MINT A HERO TO PLAY FOR REAL" HUD banner
```

---

## 3. `DemoManager` (`phaser/demo/DemoManager.ts`)

Owns the full lifecycle of the demo session inside a scene.

### Constructor

```ts
constructor(
  scene: Phaser.Scene,
  map: MapManager,
  pathfinding: Pathfinding,
  bombs: BombManager,
  explosions: ExplosionManager,
  loot: LootManager,
  heroes: HeroManager,
)
```

Receives the same managers already instantiated in `TreasureScene.create()`. Does NOT
create its own managers — shares them so demo heroes coexist on the real map grid.

### `start(): void`

- Calls `makeHero()` 10 times with a spread of rarities:
  - 3 Common, 2 Uncommon, 2 Rare, 2 Epic, 1 Legendary
  - `owner` is set to `"__demo__"` so they are never confused with real heroes
- Spawns each via `heroes.spawn(cfg)` — reuses the real sprite/animation system
- Sets `this.active = true`

The hero config passed to `heroes.spawn()` is identical to a real hero except the `id`
uses a `demo-` prefix (e.g. `"demo-0"` … `"demo-9"`).

### `update(time: number, deltaSec: number): void`

Called from `TreasureScene.update()` when `this.active`. Iterates each demo hero and
calls `DemoAI.update(hero, time, deltaSec, stepAlong)` — the same signature as
`AIManager.update()`.

Key difference from real heroes: bomb detonation inside `DemoAI.doPlantBomb` calls
`bombs.spawn()` and `explosions.detonate()` locally **but skips**:
- `useGameStore.getState().consumeBombEnergy()`
- `useGameStore.getState().addOptimisticCoins()`
- `map.notifyBombDetonate()`  (no WS emit)

Demo heroes therefore never affect the player's coin balance, energy, or server state.

### `stop(): void`

- Removes all demo heroes via `heroes.remove(h)` for each `demo-*` id
- Sets `this.active = false`
- Calls `useGameStore.getState().setDemoMode(false)`

### `get isActive(): boolean`

Returns `this.active`.

---

## 4. `DemoAI` (`phaser/demo/DemoAI.ts`)

A thin subclass (or copy-paste fork, depending on preference) of `AIManager` with one
override:

```ts
protected doPlantBomb(hero: Hero, now: number): void {
  // identical to AIManager.doPlantBomb except:
  // 1. bombs.spawn() is called normally (visual only)
  // 2. NO consumeBombEnergy()
  // 3. NO addOptimisticCoins()
  // 4. NO map.notifyBombDetonate()
}
```

Everything else — `doSearch`, `doRoam`, `findNearestReachableBreakable`,
`findEscapeTile`, `requestPath` — is inherited or duplicated unchanged.

**Why a separate class instead of a flag on AIManager?**
`AIManager` methods call `this.bombs`, `this.loot` etc. directly. Adding `if
(isDemo)` guards throughout would couple demo logic into the real AI path. A separate
`DemoAI` class keeps the real `AIManager` clean and makes the demo trivially deletable
later.

---

## 5. `DemoBanner` (`components/game/DemoBanner.tsx`)

A React component rendered inside `Hud.tsx` (below `ConnectionOverlay`).

```tsx
function DemoBanner() {
  const demoMode = useGameStore((s) => s.demoMode);
  const [dismissed, setDismissed] = useState(false);
  if (!demoMode || dismissed) return null;

  return (
    <div /* fixed center-top overlay strip */>
      <span>DEMO MODE — Mint a hero to play for real</span>
      <button onClick={() => { /* open ShopModal */ }}>MINT A HERO</button>
      <button onClick={() => setDismissed(true)}>✕</button>
    </div>
  );
}
```

Styling: same pixel-font system as the rest of the HUD. Background `#1a0a00`,
border `1px dashed rgba(250,204,21,0.4)`, text amber/gold. Fixed to the top of the
game canvas (inside the inner wood frame), never blocking the map.

"MINT A HERO" fires `window.dispatchEvent(new CustomEvent("bm-modal-shop-open"))`,
identical to the menu's existing "SHOP" shortcut.

---

## 6. Store Changes (`features/store/gameStore.ts`)

Add two fields:

```ts
/** True while demo heroes are running on the map. */
demoMode: boolean;
setDemoMode: (v: boolean) => void;
```

Initial value: `false`. Set to `true` by `DemoManager.start()`, back to `false` by
`DemoManager.stop()`.

No other store mutations needed — demo heroes are never added to `roster` and never
affect `coins`, `pendingCoins`, or `mapHeroes`.

---

## 7. `TreasureScene` Changes (`phaser/scenes/TreasureScene.ts`)

### Additions

```ts
private demo: DemoManager | null = null;
```

### In `create()`

After `this.reconcileHeroes()`:

```ts
const roster = useGameStore.getState().roster;
if (roster.length === 0) {
  this.demo = new DemoManager(
    this,
    this.map,
    this.pathfinding,
    this.bombs,
    this.explosions,
    this.loot,
    this.heroes,
  );
  this.demo.start();
  useGameStore.getState().setDemoMode(true);
}
```

### In `update()`

After the real AI loop:

```ts
if (this.demo?.isActive) {
  this.demo.update(time, deltaSec);
}
```

### Demo teardown on first hero acquired

Inside the existing `SESSION_STATE` handler in `WSSyncManager` (or via a `subscribe`
on the store in `TreasureScene.create()`):

```ts
// TreasureScene.create() — after demo start
this.demoUnsub = useGameStore.subscribe(
  (s) => s.roster.length,
  (len) => {
    if (len > 0 && this.demo?.isActive) {
      this.demo.stop();
      this.demo = null;
      this.demoUnsub?.();
    }
  },
);
```

On `SHUTDOWN` event, also call `this.demo?.stop()` and `this.demoUnsub?.()`.

---

## 8. Energy on Demo Heroes

Demo heroes have a real `energy` value set at `maxEnergy` on spawn. `DemoAI` does NOT
call `consumeBombEnergy()`, so demo heroes never run out of energy and never sleep. This
is intentional — the demo should always look alive and busy.

Similarly, `useGameStore.getState().tickEnergy()` is called in `TreasureScene.update()`
but only affects heroes in `roster`. Since demo heroes are never in the roster, they
are unaffected.

---

## 9. Stage Advance During Demo

The map's chest-clear detector in `TreasureScene.update()` fires when
`map.chestCount() === 0`. Demo heroes can clear all chests, which would trigger a stage
advance while the player is watching. To prevent this:

```ts
// In TreasureScene.update(), guard stage-advance check:
if (
  !this.stageCleared &&
  !this.demo?.isActive &&          // <-- new guard
  this.map.isStageLoaded() &&
  this.map.chestCount() === 0 &&
  this.bombs.getBombs().length === 0
) { ... }
```

If the demo clears all chests the stage just shows an empty map — the demo heroes
will roam but stop bombing since `AIManager.doSearch` returns no breakables, which
falls back to `doRoam`. This is acceptable. Alternatively, the `DemoManager` can
detect `map.chestCount() === 0` and regenerate the map grid locally (opt-in future
enhancement, not required for MVP).

---

## 10. File Change Summary

| File | Change |
|------|--------|
| `phaser/demo/DemoManager.ts` | **New** — lifecycle controller for demo session |
| `phaser/demo/DemoAI.ts` | **New** — AIManager fork, no WS emissions |
| `components/game/DemoBanner.tsx` | **New** — HUD banner with MINT CTA |
| `features/store/gameStore.ts` | Add `demoMode` + `setDemoMode` |
| `phaser/scenes/TreasureScene.ts` | Instantiate `DemoManager`, wire update + roster subscription |
| `features/game-components/hud/Hud.tsx` | Render `<DemoBanner />` |

Total: 3 new files, 3 edited files. No server-side changes. No database changes.

---

## 11. Implementation Order

1. `features/store/gameStore.ts` — add `demoMode` / `setDemoMode` (no deps)
2. `phaser/demo/DemoAI.ts` — fork of `AIManager`, remove WS calls
3. `phaser/demo/DemoManager.ts` — depends on `DemoAI` + existing managers
4. `phaser/scenes/TreasureScene.ts` — wire `DemoManager` into `create` / `update` / `SHUTDOWN`
5. `components/game/DemoBanner.tsx` — pure React, depends on `demoMode` store field
6. `features/game-components/hud/Hud.tsx` — render `<DemoBanner />`

---

## 12. What the Player Sees

1. Player logs in for the first time (zero heroes).
2. Game scene loads normally. The map hydrates from the server.
3. 10 heroes immediately appear, spread across the map, and begin the full gameplay
   loop: searching for chests, pathing to them, planting bombs, escaping, collecting.
   Explosions and loot animations all play.
4. A gold-bordered banner at the top of the game reads:
   **"DEMO MODE — Mint a hero to play for real"** with a "MINT A HERO" button and an
   "X" close button.
5. Player clicks "MINT A HERO" → Shop modal opens. They complete a mint.
6. Server pushes `SESSION_STATE` with 1 hero. The store's `roster.length` becomes 1.
7. All 10 demo heroes are removed instantly. The real hero spawns. Banner disappears.
   Full game resumes normally.
