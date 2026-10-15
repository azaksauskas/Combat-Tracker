/**
 * Grid geometry for the game: one cell = 5 ft. Movement uses the 2024
 * default that a diagonal step also costs 5 ft (10 ft in difficult terrain).
 */

export interface Cell {
  x: number;
  y: number;
}

export interface Board {
  width: number;
  height: number;
  /** "x,y" keys of impassable cells that also block line of sight. */
  walls: string[];
  /** "x,y" keys of difficult terrain (each step into it costs +5 ft). */
  difficult: string[];
  /** Raised ground: "x,y" → level (missing: 0). Levels meet at a cliff you can't climb; stairs and slopes join them. */
  heights?: Record<string, number>;
  /** "x,y" keys of stairs and slopes: a step to or from one may change level. */
  stairs?: string[];
  /** "x,y" keys of water (also difficult terrain), for drawing. */
  water?: string[];
  /** "x,y" keys of deep water: no wading through, but you see (and shoot) across it. */
  deep?: string[];
  /** How the walls look when drawn: pillars ("O"), trees ("T"), or plain wall. */
  props?: Record<string, "pillar" | "tree" | "rock">;
}

export const FEET_PER_CELL = 5;
export const key = (c: Cell) => `${c.x},${c.y}`;
export const fromKey = (k: string): Cell => {
  const [x, y] = k.split(",").map(Number);
  return { x: x!, y: y! };
};
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** Distance in feet (Chebyshev: diagonals count as 5 ft). */
export const distanceFt = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * FEET_PER_CELL;

export const inBounds = (b: Board, c: Cell) => c.x >= 0 && c.y >= 0 && c.x < b.width && c.y < b.height;

export function makeBoardIndex(b: Board) {
  const walls = new Set(b.walls);
  const difficult = new Set(b.difficult);
  const stairs = new Set(b.stairs ?? []);
  const deep = new Set(b.deep ?? []);
  const heights = b.heights ?? {};
  const height = (c: Cell) => heights[key(c)] ?? 0;
  const isStairs = (c: Cell) => stairs.has(key(c));
  return {
    isWall: (c: Cell) => walls.has(key(c)),
    isDifficult: (c: Cell) => difficult.has(key(c)),
    isDeep: (c: Cell) => deep.has(key(c)),
    height,
    isStairs,
    /** A step between two neighbours: on the same level, or by stairs; never up or down a cliff. */
    canStep: (a: Cell, b: Cell) => height(a) === height(b) || isStairs(a) || isStairs(b),
  };
}

const STEPS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export interface PathOptions {
  /** Cells that can't be entered or passed through (walls are always blocked). */
  blocked: (c: Cell) => boolean;
  /** Cells that can be passed through but not ended in (allies). */
  noStop?: (c: Cell) => boolean;
  /** Extra cost multiplier, e.g. crawling while Prone doubles cost. */
  costMultiplier?: number;
}

export interface Reach {
  /** cell key → cheapest cost in feet. */
  cost: Map<string, number>;
  /** cell key → previous cell key on the cheapest path. */
  prev: Map<string, string>;
}

/** Dijkstra over the grid up to `budget` feet. */
export function explore(board: Board, start: Cell, budget: number, opts: PathOptions): Reach {
  const idx = makeBoardIndex(board);
  const mult = opts.costMultiplier ?? 1;
  const cost = new Map<string, number>([[key(start), 0]]);
  const prev = new Map<string, string>();
  const frontier: [number, Cell][] = [[0, start]];
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [c, cell] = frontier.shift()!;
    if (c > (cost.get(key(cell)) ?? Infinity)) continue;
    for (const s of STEPS) {
      const next = { x: cell.x + s.x, y: cell.y + s.y };
      if (!inBounds(board, next) || idx.isWall(next) || idx.isDeep(next) || opts.blocked(next) || !idx.canStep(cell, next)) continue;
      // No squeezing diagonally between two walls / past a wall corner.
      if (s.x && s.y && (idx.isWall({ x: cell.x + s.x, y: cell.y }) || idx.isWall({ x: cell.x, y: cell.y + s.y }))) continue;
      const step = (idx.isDifficult(next) ? 2 : 1) * FEET_PER_CELL * mult;
      const nc = c + step;
      if (nc > budget || nc >= (cost.get(key(next)) ?? Infinity)) continue;
      cost.set(key(next), nc);
      prev.set(key(next), key(cell));
      frontier.push([nc, next]);
    }
  }
  return { cost, prev };
}

/** Cells you can end a move in, with their cost. */
export function reachableCells(board: Board, start: Cell, budget: number, opts: PathOptions): Map<string, number> {
  const { cost } = explore(board, start, budget, opts);
  const out = new Map<string, number>();
  for (const [k, c] of cost) if (!opts.noStop?.(fromKey(k)) || k === key(start)) out.set(k, c);
  return out;
}

/** Cheapest path (excluding the start cell) or null if out of budget / unreachable. */
export function findPath(board: Board, from: Cell, to: Cell, budget: number, opts: PathOptions): { path: Cell[]; cost: number } | null {
  if (opts.noStop?.(to)) return null;
  const { cost, prev } = explore(board, from, budget, opts);
  const total = cost.get(key(to));
  if (total === undefined) return null;
  const path: Cell[] = [];
  for (let k: string | undefined = key(to); k && k !== key(from); k = prev.get(k)) path.unshift(fromKey(k));
  return { path, cost: total };
}

/**
 * True if a straight line between the two cells' centres avoids walls.
 * A line that grazes a wall corner counts as clear if it would be clear when
 * nudged to either side, so you can see (and strike) diagonally past a
 * corner even though you can't step past it.
 */
export function lineOfSight(board: Board, a: Cell, b: Cell): boolean {
  const idx = makeBoardIndex(board);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const clear = (nudge: number) => {
    const ox = (-dy / len) * nudge;
    const oy = (dx / len) * nudge;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 8;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const c = { x: Math.round(a.x + dx * t + ox), y: Math.round(a.y + dy * t + oy) };
      if (sameCell(c, a) || sameCell(c, b)) continue;
      if (idx.isWall(c)) return false;
    }
    return true;
  };
  return clear(0.01) || clear(-0.01);
}

/** Cover a target has against an attacker: none, half (+2 AC), three-quarters (+5 AC) or total. */
export type Cover = 0 | 2 | 5 | "total";

/**
 * The grid rule for cover, kept friendly: from the corner of the attacker's
 * square that sees best, trace a line to each corner of the target's square.
 * Lines blocked by walls: 1–2 half cover, 3–4 three-quarters; total cover only
 * when there's no line of sight at all. A creature in the way (on the line
 * between the squares' centres) gives half cover.
 */
export function coverBetween(board: Board, a: Cell, t: Cell, creatures: Cell[] = []): Cover {
  if (sameCell(a, t)) return 0;
  const idx = makeBoardIndex(board);
  const inset = 0.06;
  const corners = (c: Cell) => [
    { x: c.x + inset, y: c.y + inset },
    { x: c.x + 1 - inset, y: c.y + inset },
    { x: c.x + inset, y: c.y + 1 - inset },
    { x: c.x + 1 - inset, y: c.y + 1 - inset },
  ];
  const blocked = (p: { x: number; y: number }, q: { x: number; y: number }, isBlocker: (c: Cell) => boolean) => {
    const steps = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) * 12);
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const c = { x: Math.floor(p.x + (q.x - p.x) * f), y: Math.floor(p.y + (q.y - p.y) * f) };
      if (sameCell(c, a) || sameCell(c, t)) continue;
      if (isBlocker(c)) return true;
    }
    return false;
  };
  const wall = (c: Cell) => idx.isWall(c);
  let best = 4;
  for (const from of corners(a)) {
    const n = corners(t).filter((to) => blocked(from, to, wall)).length;
    best = Math.min(best, n);
    if (best === 0) break;
  }
  if (!lineOfSight(board, a, t)) return "total";
  let cover: Cover = best === 0 ? 0 : best <= 2 ? 2 : 5;
  if (cover === 0 && creatures.length) {
    const centre = (c: Cell) => ({ x: c.x + 0.5, y: c.y + 0.5 });
    if (blocked(centre(a), centre(t), (c) => creatures.some((x) => sameCell(x, c)))) cover = 2;
  }
  return cover;
}

/**
 * Starting squares for a side: the map's own, then (when there are more
 * creatures than marked squares) the nearest free squares around them, never
 * a wall or a square someone else stands on.
 */
export function startCells(board: Board, base: Cell[], n: number, avoid: Cell[] = []): Cell[] {
  const idx = makeBoardIndex(board);
  const taken = new Set(avoid.map(key));
  const out: Cell[] = [];
  const add = (c: Cell) => {
    if (out.length >= n || !inBounds(board, c) || idx.isWall(c) || idx.isDeep(c) || taken.has(key(c))) return;
    taken.add(key(c));
    out.push(c);
  };
  base.forEach(add);
  // Spread out from the marked squares, ring by ring.
  const queue = base.length ? [...base] : [{ x: 0, y: Math.floor(board.height / 2) }];
  const seen = new Set(queue.map(key));
  while (out.length < n && queue.length) {
    const c = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [-1, -1], [1, 1], [1, -1]] as const) {
      const next = { x: c.x + dx, y: c.y + dy };
      if (!inBounds(board, next) || seen.has(key(next)) || idx.isWall(next) || idx.isDeep(next)) continue;
      seen.add(key(next));
      add(next);
      queue.push(next);
    }
  }
  return out;
}
