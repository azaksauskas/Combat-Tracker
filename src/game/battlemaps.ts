import { boardFromAscii } from "./engine";
import { key, makeBoardIndex, type Cell } from "./board";

/**
 * Battle maps like a D&D table's: dungeons of rooms and corridors that narrow
 * and widen, with pillars and a raised dais; caves of winding tunnels, pools
 * and a ledge; and the wilds, with a hill to hold, trees, boulders and a river
 * crossed by a bridge. The heroes start on the left ("P"), the foes on the
 * right ("1"…"9"). Every map is checked: both sides can reach each other.
 */

export type MapKind = "dungeon" | "cave" | "wilds";

export interface BattleMap {
  map: string[];
  heights: string[];
}

const W = 22;
const H = 13;

type Grid = string[][];
const grid = (fill: string): Grid => Array.from({ length: H }, () => Array.from({ length: W }, () => fill));
const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

function carve(g: Grid, x0: number, y0: number, w: number, h: number, ch = ".") {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inside(x, y)) g[y]![x] = ch;
}

/** A corridor from a to b (across, then down), its width changing as it goes. */
function corridor(g: Grid, a: Cell, b: Cell, rng: () => number) {
  let width = 1 + Math.floor(rng() * 2);
  const stepX = Math.sign(b.x - a.x) || 1;
  for (let x = a.x; x !== b.x + stepX; x += stepX) {
    if (rng() < 0.18) width = 1 + Math.floor(rng() * 3);
    carve(g, x, a.y - Math.floor((width - 1) / 2), 1, width);
  }
  const stepY = Math.sign(b.y - a.y) || 1;
  for (let y = a.y; y !== b.y + stepY; y += stepY) {
    if (rng() < 0.18) width = 1 + Math.floor(rng() * 3);
    carve(g, b.x - Math.floor((width - 1) / 2), y, width, 1);
  }
}

function dungeon(rng: () => number): { g: Grid; h: Grid } {
  const g = grid("#");
  const h = grid("0");
  const r = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  // The heroes' room on the left, the foes' hall on the right, one or two rooms between.
  const left = { x: 1, y: r(2, 5), w: r(4, 5), h: r(5, 6) };
  const right = { x: W - 1 - r(6, 8), y: r(1, 3), w: 0, h: r(7, 9) };
  right.w = W - 1 - right.x;
  const rooms = [left];
  const middle = r(1, 2);
  for (let i = 0; i < middle; i++) rooms.push({ x: 7 + i * 4 + r(0, 1), y: r(1, H - 7), w: r(3, 4), h: r(3, 5) });
  rooms.push(right);
  for (const rm of rooms) carve(g, rm.x, rm.y, rm.w, rm.h);
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]!;
    const b = rooms[i]!;
    corridor(g, { x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) }, { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) }, rng);
  }
  // Pillars in the hall, two rows.
  for (let x = right.x + 1; x < right.x + right.w - 1; x += 3) {
    for (const y of [right.y + 1, right.y + right.h - 2]) if (g[y]?.[x] === "." && rng() < 0.8) g[y]![x] = "O";
  }
  // A raised dais at the back of the hall, with steps down at its front.
  const dx = W - 4;
  const dy = right.y + Math.floor(right.h / 2) - 1;
  for (let y = dy; y < dy + 3; y++) for (let x = dx; x < W - 1; x++) if (g[y]?.[x] === ".") h[y]![x] = "1";
  for (let y = dy; y < dy + 3; y++) if (g[y]?.[dx - 1] === ".") h[y]![dx - 1] = "a";
  // Rubble here and there.
  for (let i = 0; i < 6; i++) {
    const x = r(2, W - 3);
    const y = r(1, H - 2);
    if (g[y]![x] === "." && h[y]![x] === "0") g[y]![x] = ",";
  }
  return { g, h };
}

function cave(rng: () => number): { g: Grid; h: Grid } {
  let g = grid("#");
  const h = grid("0");
  // Rough rock: cellular automaton.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y]![x] = rng() < 0.5 ? "#" : ".";
  for (let it = 0; it < 4; it++) {
    const next = grid("#");
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy]![x + dx] === "#") walls++;
        next[y]![x] = walls >= 5 ? "#" : ".";
      }
    g = next;
  }
  // A winding tunnel from one side to the other, now narrow, now wide.
  let y = 3 + Math.floor(rng() * (H - 6));
  let width = 2;
  for (let x = 1; x < W - 1; x++) {
    if (rng() < 0.3) y = Math.max(2, Math.min(H - 3, y + (rng() < 0.5 ? -1 : 1)));
    if (rng() < 0.25) width = 1 + Math.floor(rng() * 3);
    carve(g, x, y - Math.floor((width - 1) / 2), 1, width);
  }
  // Open ground at both ends for the two sides to gather.
  carve(g, 1, Math.max(1, y - 3), 3, 6);
  carve(g, W - 6, 2, 5, H - 4);
  // A second, narrower way round, so there's a choice of path.
  let y2 = y > H / 2 ? 2 : H - 3;
  for (let x = 4; x < W - 5; x++) {
    if (rng() < 0.3) y2 = Math.max(1, Math.min(H - 2, y2 + (rng() < 0.5 ? -1 : 1)));
    carve(g, x, y2, 1, 1);
  }
  // A pool or two.
  for (let i = 0; i < 2; i++) {
    const px = 6 + Math.floor(rng() * (W - 12));
    const py = 2 + Math.floor(rng() * (H - 4));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[py + dy]?.[px + dx] === "." && rng() < 0.75) g[py + dy]![px + dx] = "w";
  }
  // A ledge above the foes' end, reached by one slope.
  const lx = W - 5;
  const ly = 2;
  for (let yy = ly; yy < ly + 3; yy++) for (let x = lx; x < W - 1; x++) if (g[yy]![x] === ".") h[yy]![x] = "1";
  if (g[ly + 3]?.[lx + 1] === ".") h[ly + 3]![lx + 1] = "a";
  return { g, h };
}

function wilds(rng: () => number): { g: Grid; h: Grid } {
  const g = grid(".");
  const h = grid("0");
  // Open ground with a border of trees.
  for (let x = 0; x < W; x++) {
    g[0]![x] = "T";
    g[H - 1]![x] = "T";
  }
  for (let y = 0; y < H; y++) {
    g[y]![0] = "T";
    g[y]![W - 1] = "T";
  }
  // A river across the middle, crossed by a bridge (and a ford upstream).
  const rx = 9 + Math.floor(rng() * 3);
  let bend = 0;
  for (let y = 1; y < H - 1; y++) {
    if (rng() < 0.3) bend = Math.max(-1, Math.min(1, bend + (rng() < 0.5 ? -1 : 1)));
    g[y]![rx + bend] = "W";
    g[y]![rx + bend + 1] = "W";
  }
  const by = 4 + Math.floor(rng() * (H - 8));
  for (let x = rx - 2; x <= rx + 3; x++) if (g[by]![x] === "W") g[by]![x] = ".";
  const fy = by > H / 2 ? 2 : H - 3;
  for (let x = rx - 2; x <= rx + 3; x++) if (g[fy]![x] === "W") g[fy]![x] = "w";
  // A hill on the foes' side: level 1, its top level 2, slopes on the way up.
  const hx = rx + 4 + Math.floor(rng() * 3);
  const hy = 2 + Math.floor(rng() * 3);
  for (let y = hy; y < hy + 6 && y < H - 1; y++) for (let x = hx; x < hx + 5 && x < W - 1; x++) if (g[y]![x] === ".") h[y]![x] = "1";
  for (let y = hy + 2; y < hy + 4; y++) for (let x = hx + 2; x < hx + 4; x++) if (h[y]![x] === "1") h[y]![x] = "2";
  if (h[hy + 3]?.[hx - 1] === "0") h[hy + 3]![hx - 1] = "a";
  if (h[hy + 2]?.[hx + 1] === "1") h[hy + 2]![hx + 1] = "b";
  // Trees, brush and boulders scattered over the rest.
  for (let i = 0; i < 22; i++) {
    const x = 1 + Math.floor(rng() * (W - 2));
    const y = 1 + Math.floor(rng() * (H - 2));
    if (g[y]![x] !== "." || h[y]![x] === "a" || h[y]![x] === "b") continue;
    const t = rng();
    g[y]![x] = t < 0.4 ? "T" : t < 0.75 ? "~" : "O";
  }
  return { g, h };
}

/** The squares each side starts on: the heroes in a column at the left, the foes spread over the right third. */
function placeSides(g: Grid, h: Grid, heroes: number, foes: number, rng: () => number) {
  const floor = (x: number, y: number) => g[y]?.[x] === "." && h[y]?.[x] !== "a" && h[y]?.[x] !== "b";
  const cols = (from: number, to: number, step: number) => {
    const out: Cell[] = [];
    for (let x = from; x !== to; x += step) for (let d = 0; d < H; d++) {
      const y = Math.floor(H / 2) + (d % 2 ? -Math.ceil(d / 2) : Math.ceil(d / 2));
      if (floor(x, y)) out.push({ x, y });
    }
    return out;
  };
  const left = cols(1, W - 1, 1).slice(0, heroes);
  const pool = cols(W - 2, Math.floor(W * 0.62), -1).filter((c) => !left.some((l) => l.x === c.x && l.y === c.y));
  // Shuffle the foes' side so they stand in a loose group, not a line.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const right = pool.slice(0, Math.min(9, foes));
  left.forEach((c) => (g[c.y]![c.x] = "P"));
  right.forEach((c, i) => (g[c.y]![c.x] = String(i + 1)));
  return { left, right };
}

/** Can the two sides reach each other (by the same rules as moving)? */
function connected(map: string[], heights: string[], a: Cell, b: Cell): boolean {
  const board = boardFromAscii(map.map((r) => r.replace(/[P1-9]/g, ".")), heights);
  const idx = makeBoardIndex(board);
  const seen = new Set([key(a)]);
  const queue = [a];
  while (queue.length) {
    const c = queue.shift()!;
    if (c.x === b.x && c.y === b.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= board.width || n.y >= board.height || seen.has(key(n))) continue;
      if (idx.isWall(n) || idx.isDeep(n) || !idx.canStep(c, n)) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return false;
}

/** A battle map of a kind, the same every time for the same random numbers. */
export function generateBattlemap(kind: MapKind, rng: () => number, heroes: number, foes: number): BattleMap {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { g, h } = kind === "dungeon" ? dungeon(rng) : kind === "cave" ? cave(rng) : wilds(rng);
    const { left, right } = placeSides(g, h, Math.max(6, heroes), foes, rng);
    const map = g.map((r) => r.join(""));
    const heights = h.map((r) => r.join(""));
    // Every foe must be reachable from the heroes (and so from each other).
    if (left.length >= Math.min(heroes, 4) && right.length && right.every((f) => connected(map, heights, left[0]!, f))) return trim({ map, heights });
  }
  // Fallback: an open field.
  const map = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 1 && y >= 3 && y < 9 ? "P" : x === W - 2 && y >= 2 && y < 2 + Math.min(9, foes) ? String(y - 1) : ".")).join(""));
  return { map, heights: [] };
}

/** Cut away rows and columns of solid rock, keeping one row of wall round the edge, so the board is as big as it can be. */
function trim({ map, heights }: BattleMap): BattleMap {
  const solid = (ch: string) => ch === "#";
  const rows = map.map((r) => [...r].every(solid));
  const cols = [...map[0]!].map((_, x) => map.every((r) => solid(r[x]!)));
  const first = (xs: boolean[]) => Math.max(0, xs.findIndex((v) => !v) - 1);
  const last = (xs: boolean[]) => Math.min(xs.length - 1, xs.length - [...xs].reverse().findIndex((v) => !v));
  const [y0, y1, x0, x1] = [first(rows), last(rows), first(cols), last(cols)];
  const cut = (rs: string[]) => rs.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
  return { map: cut(map), heights: heights.length ? cut(heights) : heights };
}

/** Where a kind of foe is met. */
export const MAP_FOR_FOE: Record<string, MapKind> = { undead: "dungeon", cultists: "dungeon", vermin: "dungeon", goblins: "cave", gnolls: "wilds", wolves: "wilds", bandits: "wilds" };
