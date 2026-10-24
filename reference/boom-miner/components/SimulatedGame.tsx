"use client";

import { useEffect, useRef } from "react";

/* -------------------------------------------------------------------------
   Pure-canvas simulated gameplay background.

   Sprite facts (from features/types/HeroRarity.ts — source of truth):
     characters/*.png  : 48×80  = 3 walk-frames × 4 direction-rows  (16×20 each)
                         row 0 = down, 1 = left, 2 = right, 3 = up
     boom.png          : 64×16  = 4 explosion-frames × 1 row        (16×16 each)
     bush.png          : 16×16  = single decoration tile
     chests/chest_*.png: 18×16  = single frame (draw centred, clipped to 16px)

   Tile movement:
     Heroes move tile-by-tile along a strict grid. When they finish moving
     into a tile they pick the next tile. This guarantees they never clip
     through walls or bush obstacles.
   ------------------------------------------------------------------------- */

// ---- layout ----------------------------------------------------------------
const TILE = 48;          // on-screen px per game tile
const COLS = 24;
const ROWS = 14;

// ---- sprite source sizes (pixels in the PNG) --------------------------------
const SPRITE_W    = 16;
const SPRITE_H    = 20;   // frames are 16×20, NOT 16×16 — confirmed from HeroRarity.ts
const WALK_FRAMES = 3;    // frames per direction row
const DIR_ROW     = { down: 0, left: 1, right: 2, up: 3 } as const;

const BOOM_FRAME_W = 16;
const BOOM_FRAME_H = 16;
const BOOM_FRAMES  = 4;

const CHEST_SRC_W  = 18;  // actual PNG width
const CHEST_SRC_H  = 16;

// ---- game constants --------------------------------------------------------
const WALK_SPEED_MS   = 220;   // ms to traverse one tile
const WALK_FRAME_MS   = WALK_SPEED_MS / WALK_FRAMES;
const BOMB_FUSE_MS    = 2400;
const BLAST_RADIUS    = 2;
const BLAST_DURATION  = 700;
const HERO_COUNT      = 4;

// ---- palettes & colors ------------------------------------------------------
const FLOOR_COLORS = ["#1a1208", "#1d1509", "#1f160a", "#16100a"];
const WALL_DARK    = "#0c0c0c";
const WALL_DETAIL  = "rgba(255,255,255,0.04)";
const BOMB_FILL    = "#2a2a2a";
const BLAST_GOLD   = "rgba(250,204,21,";

// ---- hero roster -----------------------------------------------------------
const HERO_KEYS = [
  "ricky","rocky","rascal","redhorn","ducky",
  "bolt","pinky","mossy","ghosty","timmy",
] as const;

const CHEST_KEYS = [
  "chest_common","chest_uncommon","chest_rare","chest_epic","chest_legendary",
] as const;

type Dir = keyof typeof DIR_ROW;

// ---- helpers ---------------------------------------------------------------
function rand(min: number, max: number) { return min + Math.random() * (max - min); }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function sample<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/** Indestructible wall posts sit on even col + even row (classic Bomberman grid) */
function isWallPost(col: number, row: number) {
  return col % 2 === 0 && row % 2 === 0;
}

/** BFS to find a walkable path from (sx,sy) to (tx,ty). Returns null if unreachable. */
function bfs(
  sx: number, sy: number,
  tx: number, ty: number,
  blocked: Set<string>,
): Dir[] | null {
  if (sx === tx && sy === ty) return [];
  type Node = { x: number; y: number; path: Dir[] };
  const queue: Node[] = [{ x: sx, y: sy, path: [] }];
  const visited = new Set<string>([`${sx},${sy}`]);
  const DIRS: Dir[] = ["up","down","left","right"];
  const DELTA: Record<Dir, [number,number]> = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };

  while (queue.length) {
    const { x, y, path } = queue.shift()!;
    for (const d of DIRS) {
      const [dx, dy] = DELTA[d];
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (visited.has(key)) continue;
      if (blocked.has(key)) continue;
      const newPath = [...path, d];
      if (nx === tx && ny === ty) return newPath;
      visited.add(key);
      queue.push({ x: nx, y: ny, path: newPath });
    }
  }
  return null;
}

// ---- types -----------------------------------------------------------------
interface HeroState {
  /** current tile (integer) */
  col: number;
  row: number;
  /** tile we're walking toward (same as col/row when idle) */
  targetCol: number;
  targetRow: number;
  /** 0..1 progress toward the target tile */
  progress: number;
  dir: Dir;
  walkFrame: number;
  frameAccMs: number;
  imgKey: string;
  /** path steps queued */
  path: Dir[];
  /** when to re-plan */
  replanAt: number;
  /** last bomb plant timestamp */
  bombedAt: number;
}

interface Bomb {
  col: number;
  row: number;
  plantedAt: number;
}

interface Blast {
  cells: Array<[number, number]>;
  createdAt: number;
}

// ---- main component --------------------------------------------------------
export default function SimulatedGame({ opacity = 0.22 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // load images
    const imgs: Record<string, HTMLImageElement> = {};
    let loaded = 0;
    const toLoad = [
      ...HERO_KEYS.map(k => ({ key: k, src: `/assets/characters/${k}.png` })),
      ...CHEST_KEYS.map(k => ({ key: k, src: `/assets/chests/${k}.png` })),
      { key: "boom", src: "/assets/boom.png" },
      { key: "bush", src: "/assets/bush.png" },
    ];

    let animId = 0;
    let heroes: HeroState[] = [];
    let bombs:  Bomb[]      = [];
    let blasts: Blast[]     = [];

    // static decoration positions (bushes + chests)
    let decorations: Array<{ col: number; row: number; key: string }> = [];

    // queue of decorations waiting to respawn after being destroyed
    let respawnQueue: Array<{ key: string; at: number }> = [];
    const RESPAWN_DELAY_MS = 3500;

    function buildStaticMap(): Set<string> {
      const s = new Set<string>();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (isWallPost(c, r)) s.add(`${c},${r}`);
      for (const d of decorations) s.add(`${d.col},${d.row}`);
      return s;
    }

    function heroBlocked(): Set<string> {
      const s = buildStaticMap();
      for (const b of bombs) s.add(`${b.col},${b.row}`);
      return s;
    }

    function spawnDecorations(occupied: Set<string>) {
      decorations = [];
      const floorCells: Array<[number,number]> = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (!isWallPost(c, r) && !occupied.has(`${c},${r}`)) floorCells.push([c, r]);

      // ~18% of floor tiles get decorations
      const targets = floorCells.sort(() => Math.random() - 0.5).slice(0, Math.floor(floorCells.length * 0.18));
      for (const [c, r] of targets) {
        const roll = Math.random();
        const key = roll < 0.6 ? "bush"
                  : roll < 0.7 ? "chest_common"
                  : roll < 0.8 ? "chest_uncommon"
                  : roll < 0.9 ? "chest_rare"
                  : roll < 0.96 ? "chest_epic"
                  : "chest_legendary";
        decorations.push({ col: c, row: r, key });
      }
    }

    function pickFreeCell(blocked: Set<string>): [number,number] | null {
      const free: Array<[number,number]> = [];
      for (let r = 1; r < ROWS - 1; r++)
        for (let c = 1; c < COLS - 1; c++)
          if (!blocked.has(`${c},${r}`)) free.push([c, r]);
      if (!free.length) return null;
      return sample(free);
    }

    function planPath(h: HeroState, blocked: Set<string>) {
      // pick a random destination that is reachable
      for (let attempt = 0; attempt < 12; attempt++) {
        const cell = pickFreeCell(blocked);
        if (!cell) break;
        const [tc, tr] = cell;
        // exclude own tile
        if (tc === h.col && tr === h.row) continue;
        const path = bfs(h.col, h.row, tc, tr, blocked);
        if (path && path.length > 0) {
          h.path = path;
          h.replanAt = performance.now() + rand(3000, 6000);
          return;
        }
      }
      // fallback: stay put for a bit
      h.path = [];
      h.replanAt = performance.now() + 800;
    }

    function startSim() {
      const occupied = new Set<string>();
      spawnDecorations(occupied);
      const blocked = buildStaticMap();

      heroes = [];
      const heroKeys = [...HERO_KEYS].sort(() => Math.random() - 0.5).slice(0, HERO_COUNT);
      for (const key of heroKeys) {
        const cell = pickFreeCell(blocked);
        if (!cell) continue;
        const [c, r] = cell;
        blocked.add(`${c},${r}`);
        const h: HeroState = {
          col: c, row: r,
          targetCol: c, targetRow: r,
          progress: 1,
          dir: sample(["down","left","right","up"]),
          walkFrame: 0,
          frameAccMs: 0,
          imgKey: key,
          path: [],
          replanAt: 0,
          bombedAt: 0,
        };
        planPath(h, blocked);
        heroes.push(h);
      }

      let last = performance.now();
      function loop(now: number) {
        animId = requestAnimationFrame(loop);
        const dt = Math.min(now - last, 80);
        last = now;
        update(now, dt);
        draw(now);
      }
      requestAnimationFrame(loop);
    }

    const DELTA_COL: Record<Dir, number> = { up:0, down:0, left:-1, right:1 };
    const DELTA_ROW: Record<Dir, number> = { up:-1, down:1, left:0, right:0 };

    function update(now: number, dtMs: number) {
      const staticBlocked = buildStaticMap();

      for (const h of heroes) {
        // --- advance along current step ---
        if (h.progress < 1) {
          h.progress = Math.min(1, h.progress + dtMs / WALK_SPEED_MS);

          // update walk frame
          h.frameAccMs += dtMs;
          if (h.frameAccMs >= WALK_FRAME_MS) {
            h.frameAccMs -= WALK_FRAME_MS;
            h.walkFrame = (h.walkFrame + 1) % WALK_FRAMES;
          }

          if (h.progress >= 1) {
            // arrived at target tile
            h.col = h.targetCol;
            h.row = h.targetRow;
            h.progress = 1;
          }
        }

        // --- pick next step from path ---
        if (h.progress >= 1) {
          // maybe replan
          if (h.path.length === 0 || now >= h.replanAt) {
            const blocked = heroBlocked();
            planPath(h, blocked);
          }

          if (h.path.length > 0) {
            const nextDir = h.path[0];
            const nc = h.col + DELTA_COL[nextDir];
            const nr = h.row + DELTA_ROW[nextDir];
            const key = `${nc},${nr}`;

            // verify the next tile is still walkable (bomb might have been placed)
            if (!staticBlocked.has(key) && nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
              h.path.shift();
              h.dir = nextDir;
              h.targetCol = nc;
              h.targetRow = nr;
              h.progress = 0;
              h.walkFrame = 0;
              h.frameAccMs = 0;
            } else {
              // path blocked — replan next frame
              h.path = [];
              h.replanAt = 0;
            }
          } else {
            // idle — still do walk-frame idle (frame 0)
            h.walkFrame = 0;
          }

          // plant bomb occasionally
          if (now - h.bombedAt > rand(3800, 7000)) {
            h.bombedAt = now;
            if (!staticBlocked.has(`${h.col},${h.row}`) &&
                !bombs.find(b => b.col === h.col && b.row === h.row)) {
              bombs.push({ col: h.col, row: h.row, plantedAt: now });
            }
          }
        }
      }

      // detonate ready bombs
      const alive: Bomb[] = [];
      for (const b of bombs) {
        if (now - b.plantedAt >= BOMB_FUSE_MS) {
          const cells: Array<[number,number]> = [[b.col, b.row]];
          for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
            for (let r = 1; r <= BLAST_RADIUS; r++) {
              const cc = b.col + dc * r;
              const cr = b.row + dr * r;
              if (cc < 0 || cc >= COLS || cr < 0 || cr >= ROWS || isWallPost(cc, cr)) break;
              cells.push([cc, cr]);
            }
          }
          blasts.push({ cells, createdAt: now });

          // remove decorations caught in blast and queue them to respawn later
          const blastSet = new Set(cells.map(([c,r]) => `${c},${r}`));
          const destroyed = decorations.filter(d => blastSet.has(`${d.col},${d.row}`));
          decorations = decorations.filter(d => !blastSet.has(`${d.col},${d.row}`));
          for (const d of destroyed) {
            respawnQueue.push({ key: d.key, at: now + RESPAWN_DELAY_MS + rand(0, 1500) });
          }
        } else {
          alive.push(b);
        }
      }
      bombs = alive;
      blasts = blasts.filter(bl => now - bl.createdAt < BLAST_DURATION);

      // respawn destroyed decorations at a new free floor tile
      if (respawnQueue.length > 0) {
        const blocked = buildStaticMap();
        // also block tiles occupied by heroes so they don't spawn on top of them
        for (const h of heroes) blocked.add(`${h.col},${h.row}`);

        const stillPending: typeof respawnQueue = [];
        for (const entry of respawnQueue) {
          if (now < entry.at) { stillPending.push(entry); continue; }
          const cell = pickFreeCell(blocked);
          if (cell) {
            const [c, r] = cell;
            decorations.push({ col: c, row: r, key: entry.key });
            blocked.add(`${c},${r}`);
          }
          // if no free cell found just drop it — board is full enough
        }
        respawnQueue = stillPending;
      }
    }

    function draw(now: number) {
      const W = COLS * TILE;
      const H = ROWS * TILE;
      ctx.clearRect(0, 0, W, H);

      // --- floor ---
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (isWallPost(c, r)) {
            ctx.fillStyle = WALL_DARK;
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
            ctx.fillStyle = WALL_DETAIL;
            ctx.fillRect(c * TILE + 5, r * TILE + 5, TILE - 10, TILE - 10);
          } else {
            ctx.fillStyle = FLOOR_COLORS[(c + r) % FLOOR_COLORS.length];
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          }
          ctx.strokeStyle = "rgba(0,0,0,0.28)";
          ctx.lineWidth   = 1;
          ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
        }
      }

      // --- decorations (bushes & chests) ---
      for (const d of decorations) {
        const img = imgs[d.key];
        if (!img) continue;
        const px = d.col * TILE;
        const py = d.row * TILE;
        if (d.key === "bush") {
          // bush: 16×16 → stretch to full tile
          ctx.drawImage(img, 0, 0, 16, 16, px, py, TILE, TILE);
        } else {
          // chests: 18×16 source — draw centred, slightly above floor
          const drawW = TILE * 0.9;
          const drawH = TILE * 0.8;
          ctx.drawImage(
            img,
            0, 0, CHEST_SRC_W, CHEST_SRC_H,
            px + (TILE - drawW) / 2,
            py + TILE - drawH - 2,
            drawW, drawH,
          );
        }
      }

      // --- blast highlights ---
      for (const bl of blasts) {
        const t     = (now - bl.createdAt) / BLAST_DURATION; // 0..1
        const alpha = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        ctx.fillStyle = BLAST_GOLD + (alpha * 0.8).toFixed(2) + ")";
        for (const [c, r] of bl.cells) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);

        const boomImg = imgs["boom"];
        if (boomImg) {
          const fi = Math.min(Math.floor(t * BOOM_FRAMES), BOOM_FRAMES - 1);
          for (const [c, r] of bl.cells) {
            ctx.drawImage(
              boomImg,
              fi * BOOM_FRAME_W, 0, BOOM_FRAME_W, BOOM_FRAME_H,
              c * TILE, r * TILE, TILE, TILE,
            );
          }
        }
      }

      // --- bombs ---
      for (const b of bombs) {
        const age   = (now - b.plantedAt) / BOMB_FUSE_MS;
        const pulse = 0.5 + 0.5 * Math.sin(now / 110);
        const cx    = b.col * TILE + TILE / 2;
        const cy    = b.row * TILE + TILE / 2;
        const rad   = TILE * 0.3;

        ctx.fillStyle = BOMB_FILL;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();

        // fuse spark
        ctx.shadowColor = `rgba(255,${Math.floor(80 + age * 100)},0,${pulse})`;
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = `rgba(255,${Math.floor(80 + age * 100)},0,0.9)`;
        ctx.beginPath();
        ctx.arc(cx, cy - rad * 0.8, TILE * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.shadowColor = "transparent";
      }

      // --- heroes (y-sorted so lower heroes render on top) ---
      const sorted = [...heroes].sort((a, b) => {
        const ay = a.progress < 1 ? a.row + (a.targetRow - a.row) * a.progress : a.row;
        const by = b.progress < 1 ? b.row + (b.targetRow - b.row) * b.progress : b.row;
        return ay - by;
      });

      for (const h of sorted) {
        const img = imgs[h.imgKey];
        if (!img) continue;

        // interpolated draw position
        const drawCol = h.progress < 1
          ? h.col + (h.targetCol - h.col) * h.progress
          : h.col;
        const drawRow = h.progress < 1
          ? h.row + (h.targetRow - h.row) * h.progress
          : h.row;

        const row = DIR_ROW[h.dir];
        const sx  = h.walkFrame * SPRITE_W;
        const sy  = row * SPRITE_H;

        // draw hero: 16×20 source → scale to tile width, preserve aspect ratio
        // SPRITE_W:SPRITE_H = 16:20 = 4:5, so drawH = drawW * (20/16)
        const drawW = TILE * 1.05;
        const drawH = drawW * (SPRITE_H / SPRITE_W);   // 16:20 ratio = 1.25
        const px    = drawCol * TILE + (TILE - drawW) / 2;
        const py    = drawRow * TILE + TILE - drawH;   // feet aligned to tile bottom

        ctx.drawImage(img, sx, sy, SPRITE_W, SPRITE_H, px, py, drawW, drawH);
      }
    }

    // load all images, then start
    for (const { key, src } of toLoad) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        imgs[key] = img;
        loaded++;
        if (loaded === toLoad.length) startSim();
      };
      img.onerror = () => {
        loaded++;
        if (loaded === toLoad.length) startSim();
      };
    }

    return () => { if (animId) cancelAnimationFrame(animId); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={COLS * TILE}
      height={ROWS * TILE}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        minWidth: "100%",
        minHeight: "100%",
        width: "auto",
        height: "auto",
        opacity,
        imageRendering: "pixelated",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
