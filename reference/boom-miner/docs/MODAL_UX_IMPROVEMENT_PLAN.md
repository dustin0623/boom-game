# Modal & Flow UX Improvement Plan

Findings from a full walkthrough of every modal and flow state in `/test-modals`
and `/app/game`. Each item maps to exact file paths, the specific lines or
patterns that are wrong, and the precise change required. Issues are grouped
by impact.

---

## Priority 1 — Functional / Blocking UX

---

### Issue 1 — `WithdrawModal`: "Done" state leaves input armed for a second withdrawal (HIGH)

**File:** `features/game-components/settings/WithdrawModal.tsx`

**What is wrong:**

After a successful withdrawal (`phase === "done"`), the modal shows the
settlement signature but leaves the amount input populated with the previous
value and the primary CTA still labeled "WITHDRAW". A player who celebrates
and hits the button again triggers a second withdrawal request for the same
amount — the server will process it because the session/nonce has not been
invalidated.

The current done-state footer:
```tsx
// ActionDock in phase "done"
<button ... onClick={onClose}>CLOSE</button>
```

The issue is that `phase` is not reset to `"idle"` when the modal is
*reopened*, only when it mounts fresh. The amount state also persists across
reopens because the modal stays mounted in the DOM and `show` is toggled.

**Fix:**

1. When `phase` reaches `"done"`, call `setAmount("")` immediately so the
   field is blank if the player navigates away and returns.
2. Add a `useEffect` that resets `phase → "idle"`, `amount → ""`, and
   `settledSig → null` whenever `show` transitions from `false → true`.
   Skip this when `debugInitial` is set (test-modals guard already in place).
3. In the done-state `ActionDock`, render two buttons:
   - "CLOSE" (primary, closes modal)
   - "WITHDRAW MORE" (secondary, calls `setPhase("idle"); setAmount(""); setSettledSig(null)`)

---

### Issue 2 — `WithdrawModal`: Error banner is invisible at 8px, far from the CTA (HIGH)

**File:** `features/game-components/settings/WithdrawModal.tsx`

**What is wrong:**

```tsx
// current error rendering inside ActionDock info prop
<span className="text-red-400" style={{ fontFamily: PIXEL_HEAD, fontSize: 8 }}>
  {error}
</span>
```

The `ActionDock` info slot renders at the very bottom of the modal, 8px
`Press Start 2P` — which is approximately 1.5 characters tall on screen.
The player presses WITHDRAW, nothing visible happens, and the reason is
printed in a font so small it requires leaning into the monitor.

**Fix:**

Render a full-width error banner inside the modal body (above the ActionDock),
not inside the info slot. Use the same pattern as the `ModalShell` panel tier
but with a red/dark background, matching the existing `StageValidationOverlay`
error pattern. Keep the info slot for the character/identity label.

```tsx
{error && phase === "error" && (
  <div
    className="mx-4 mb-3 px-3 py-2 rounded border border-red-800 bg-red-950/60"
    style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#fca5a5" }}
  >
    {error}
  </div>
)}
```

Remove `error` from the `ActionDock info` prop entirely.

---

### Issue 3 — `ShopModal`: Error persists across pack-size changes (HIGH)

**File:** `features/game-components/shop/ShopModal.tsx`

**What is wrong:**

```tsx
// qty selector buttons
<button onClick={() => setQty(1)}>x1</button>
<button onClick={() => setQty(5)}>x5</button>
<button onClick={() => setQty(10)}>x10</button>
```

None of these calls `setMintError(null)`. When a mint fails (e.g. wallet
rejected), the error message persists visibly while the player picks a
different pack size before retrying. The error text now describes a different
transaction than the one they are about to attempt, which is confusing.

**Fix:**

Call `setMintError(null); setPhase("idle")` inside each qty setter:
```tsx
const handleSetQty = (q: 1 | 5 | 10) => {
  setQty(q);
  setMintError(null);
  setPhase((p) => (p === "error" ? "idle" : p));
};
```

Replace inline `setQty(…)` calls with `handleSetQty(…)`.

---

## Priority 2 — Legibility / Comprehension

---

### Issue 4 — `HeroesModal`: Attribute values have no scale context (MEDIUM)

**File:** `features/game-components/heroes/HeroesModal.tsx`

**What is wrong:**

```tsx
{([ ["Power", selected.attributes.power], ... ] as [string, number][])
  .map(([label, val]) => (
    <div ...>
      <span ...>{label}</span>
      <span ...>{val}</span>    // bare number, e.g. "10"
    </div>
  ))}
```

Attributes (Power, Speed, Stamina, Bombs, Range) are displayed as bare
integers. The player has no idea whether `10` is low, mid, or max. The energy
bar already solves this visually for HP — the same treatment should apply to
stats.

The game stores `maxPower` etc. as separate fields on `RosterHero` (confirmed
in `gameStore.ts`: `RosterHero.attributeMaxes`). If that field is absent the
max can be inferred from the hero rarity tier (e.g. `legendary` → 20, `epic`
→ 16, `rare` → 12, `uncommon` → 8, `common` → 6).

**Fix:**

Replace the bare number with a small inline filled bar + the number, matching
the EnergyBar style. Extract a generic `StatBar` component alongside
`EnergyBar`:

```tsx
function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between" style={{ fontFamily: PIXEL_HEAD, fontSize: 7 }}>
        <span className="text-white/50 uppercase tracking-wide">{label}</span>
        <span className="text-white" style={{ fontFamily: PIXEL_BODY, fontSize: 14 }}>{value}</span>
      </div>
      <div className="h-1.5 bg-black/50 rounded overflow-hidden border border-black/40">
        <div className="h-full bg-yellow-400/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

Use in the attributes grid replacing the current `<div className="grid grid-cols-2 gap-1.5">` block with two `<StatBar>` columns.

---

### Issue 5 — `ShopModal`: Cost is only in footer; no recap near the CTA (MEDIUM)

**File:** `features/game-components/shop/ShopModal.tsx`

**What is wrong:**

The cost of the selected pack is shown in small text in the footer area
(`TOTAL: 1,500,000 $BMCOIN`). The MINT button itself contains no price
information. On mobile or low-res displays the footer is cut off by the
ActionDock overlay, meaning a player can be unaware of the price until
after the wallet approval dialog fires.

**Fix:**

Embed the cost directly in the MINT button label:
```tsx
// Before
<button ...>MINT x{qty}</button>

// After
<button ...>MINT x{qty} · {totalCost.toLocaleString()} $BMCOIN</button>
```

The `totalCost` variable already exists in `ShopModal` scope. Use
`VT323` at 14px for the cost portion so it reads as supporting text,
not the primary label:

```tsx
<button ...>
  <span style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}>
    MINT x{qty}
  </span>
  <span style={{ fontFamily: PIXEL_BODY, fontSize: 14, opacity: 0.8, marginLeft: 6 }}>
    {totalCost.toLocaleString()} $BMCOIN
  </span>
</button>
```

---

### Issue 6 — `HeroesModal`: Empty state does not dismiss the detail pane (MEDIUM)

**File:** `features/game-components/heroes/HeroesModal.tsx`

**What is wrong:**

When `roster.length === 0`, the left column shows:
```tsx
<p ...>No heroes yet — visit SHOP.</p>
```

But the right column still renders the `selected ? <detail /> : <p>Select a hero.</p>`
branch, showing a dead "Select a hero." message in the empty space. The two
messages compete visually and neither leads anywhere actionable.

**Fix:**

When `roster.length === 0`, replace the entire two-column body with a
centered empty state that:
1. Shows the pixel art "chest" or mine-cart icon (or `HeroSprite` with a
   placeholder type).
2. States "YOUR ROSTER IS EMPTY" as a heading.
3. Has a styled CTA button "VISIT SHOP" that calls `onClose` and opens the
   shop (pass an `onOpenShop?: () => void` prop, same pattern as other modals
   that cross-open).

```tsx
if (roster.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-6">
      <HeroSprite type="warrior" size={64} static />
      <p style={{ fontFamily: PIXEL_HEAD, fontSize: 9, color: "#fff", textAlign: "center" }}>
        YOUR ROSTER IS EMPTY
      </p>
      <p style={{ fontFamily: PIXEL_BODY, fontSize: 16, color: "#777", textAlign: "center" }}>
        Visit the Shop to mint your first hero.
      </p>
      {onOpenShop && (
        <button
          type="button"
          onClick={() => { onClose(); onOpenShop(); }}
          className="wood-frame-light wood-panel-inner px-6 py-2.5 text-white hover:brightness-110 transition-all"
          style={{ fontFamily: PIXEL_HEAD, fontSize: 9, letterSpacing: 2 }}
        >
          VISIT SHOP
        </button>
      )}
    </div>
  );
}
```

Requires adding `onOpenShop?: () => void` to the `HeroesModal` `Props`
interface and wiring it from `GameModals.tsx` where both modals are mounted.

---

## Priority 3 — Polish / Engagement

---

### Issue 7 — `WithdrawModal`: Pending state has no progress affordance (MEDIUM-LOW)

**File:** `features/game-components/settings/WithdrawModal.tsx`

**What is wrong:**

```tsx
// current pending-state ActionDock
<ActionDock info={<span>... PENDING ...</span>}>
  {/* no CTA — intentionally disabled */}
</ActionDock>
```

The pending state shows a single yellow `•` pulse dot and the word PENDING.
Withdrawals poll for up to 60 seconds. A player who waits 20 seconds with
zero feedback is very likely to close the modal and re-attempt, which
generates duplicate requests on the server.

**Fix:**

1. Add the same animated triple-dot `<PulseIndicator>` used in the
   `ShopModal` minting phase (it already exists as a shared atom in
   `components/ui/modal`).
2. Add a secondary informational line:
   ```tsx
   <span style={{ fontFamily: PIXEL_BODY, fontSize: 14, color: "#777" }}>
     Settlement usually takes 10–30 seconds.
     You can close this — it processes in the background.
   </span>
   ```
3. Show a non-functional "CLOSE" button labeled "CLOSE (PROCESSING)" so the
   player knows they can dismiss safely. Clicking it calls `onClose()` without
   aborting the server-side job.

---

### Issue 8 — `LeaderboardModal`: No "you" row / no current-player context (MEDIUM-LOW)

**File:** `features/game-components/leaderboard/LeaderboardModal.tsx`

**What is wrong:**

```tsx
{MOCK_ENTRIES.map((entry) => (
  <div key={entry.rank} ...>
    {entry.rank}  {entry.name}  {entry.stage}  {entry.coins}
  </div>
))}
```

The leaderboard shows other players but never the current user's rank. The
player has no anchor — they cannot tell where they stand relative to the board
without manually scanning for their own username. This is a standard
engagement pattern across every competitive game.

**Fix:**

1. Read `useGameStore(s => s.playerName)` (or the wallet address truncated).
2. If the current player appears in the board data, highlight their row with
   the same amber tint used for top-3 but with a blue accent and an "YOU"
   badge:
   ```tsx
   background: isCurrentPlayer ? "rgba(56,189,248,0.10)" : ...
   border: isCurrentPlayer ? "2px solid rgba(56,189,248,0.4)" : ...
   ```
3. If the current player is NOT in the top N, pin a synthetic "your rank"
   row at the bottom of the list separated by an ellipsis row:
   ```tsx
   { rank: "…", name: "—",        stage: "—",         coins: "—" }
   { rank: playerRank, name: playerName, stage: playerStage, coins: playerCoins, isCurrentPlayer: true }
   ```
4. The API needs to return `{ entries: LeaderboardEntry[], currentPlayer: LeaderboardEntry }`.
   Until that is implemented, pull `coins` and `stage` from the gameStore and
   use a placeholder rank.

---

### Issue 9 — `SettingsModal`: Reconnecting message gives no guidance after 15s (LOW)

**File:** `features/game-components/settings/SettingsModal.tsx`

**What is wrong:**

The "Offline / Disconnected — reconnecting..." state is static. It provides
no count of attempts made, no estimated wait, and no fallback action. A
player who sits on this screen for 30+ seconds has no idea whether to wait,
refresh, or contact support.

**Fix:**

Track a `reconnectSeconds` counter with `useEffect` + `setInterval` that
increments every second while `status === "disconnected"`. After 15 seconds,
surface a secondary message:

```tsx
{reconnectSeconds > 15 && (
  <p style={{ fontFamily: PIXEL_BODY, fontSize: 14, color: "#f87171" }}>
    Taking longer than expected. Try refreshing the page.
  </p>
)}
```

After 30 seconds, add a "REFRESH PAGE" button that calls
`window.location.reload()`.

---

### Issue 10 — `WithdrawModal` / `ShopModal`: Number inputs accept `e`, `-`, `.` (LOW)

**Files:**
- `features/game-components/settings/WithdrawModal.tsx`
- `features/game-components/shop/ShopModal.tsx` (if it has a custom amount input)

**What is wrong:**

```tsx
<input type="number" ... />
```

HTML `<input type="number">` allows `e` (scientific notation), `-` (negative),
and `.` (decimal) to be typed even when only positive integers are valid. The
values are filtered on submit/validation, but the player can type `1e5` or
`-.` and see it pass momentarily, which is confusing for a pixel-art game UI.

**Fix:**

Add an `onKeyDown` filter:
```tsx
onKeyDown={(e) => {
  if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
}}
```

Also add `min="1"` and `step="1"` attributes to reinforce integer-only
semantics for assistive technology.

---

### Issue 11 — `FullPageLoader`: Progress bar has no accessible announcement (LOW)

**File:** `features/game-components/shell/FullPageLoader.tsx`

**What is wrong:**

```tsx
<div style={{ width: `${pct}%`, ... }} />
<div ...>{pct}%</div>
<div ...>{fileKey || "\u00a0"}</div>
```

The progress percentage and file-loading status are rendered as plain
`div`s with no ARIA roles. Screen readers will not announce the loading
progress at all, which is a violation of WCAG 4.1.3 (Status Messages).

**Fix:**

Wrap the progress region in a `role="status"` / `aria-live="polite"` element:
```tsx
<div role="status" aria-live="polite" aria-label={`Loading ${pct}%`}>
  <div className="sr-only">{`Loading game assets: ${pct}% — ${fileKey}`}</div>
  {/* existing visual bar */}
</div>
```

Add `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, and
`aria-valuemax="100"` on the bar track element itself.

---

## Implementation Order

| Priority | Issue | File(s) | Impact if skipped |
|----------|-------|---------|-------------------|
| 1 | Issue 1 — Withdraw done state re-arms | `WithdrawModal.tsx` | Duplicate withdrawals |
| 2 | Issue 2 — Error banner invisible | `WithdrawModal.tsx` | Players never see failure reason |
| 3 | Issue 3 — Shop error persists on qty change | `ShopModal.tsx` | Confusing stale error state |
| 4 | Issue 4 — Attribute stat bars | `HeroesModal.tsx` | No quality signal on minted heroes |
| 5 | Issue 5 — Cost in mint button | `ShopModal.tsx` | Accidental large spends |
| 6 | Issue 6 — Empty roster state | `HeroesModal.tsx` | Dead UI, no onboarding path |
| 7 | Issue 7 — Withdraw pending progress | `WithdrawModal.tsx` | Duplicate withdrawal attempts |
| 8 | Issue 8 — Leaderboard "you" row | `LeaderboardModal.tsx` | Zero engagement anchor |
| 9 | Issue 9 — Settings reconnect guidance | `SettingsModal.tsx` | Silent infinite spinner |
| 10 | Issue 10 — Input keydown filter | `WithdrawModal.tsx`, `ShopModal.tsx` | Allows `e`/`-`/`.` input |
| 11 | Issue 11 — FullPageLoader ARIA | `FullPageLoader.tsx` | Accessibility violation |

Issues 1 and 2 are in the same file and should be one commit. Issues 4 and 6
are both in `HeroesModal.tsx` — do them together. Issue 6 requires a
cross-modal prop wire in `GameModals.tsx`.

---

## Files Changed

```
features/game-components/settings/WithdrawModal.tsx   — Issues 1, 2, 7, 10
features/game-components/shop/ShopModal.tsx           — Issues 3, 5, 10
features/game-components/heroes/HeroesModal.tsx       — Issues 4, 6
features/game-components/leaderboard/LeaderboardModal.tsx — Issue 8
features/game-components/settings/SettingsModal.tsx   — Issue 9
features/game-components/shell/FullPageLoader.tsx     — Issue 11
features/game-components/GameModals.tsx               — Issue 6 (prop wire)
```
