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
  return {
    isWall: (c: Cell) => walls.has(key(c)),
    isDifficult: (c: Cell) => difficult.has(key(c)),
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
      if (!inBounds(board, next) || idx.isWall(next) || opts.blocked(next)) continue;
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

/** True if no wall cell lies on the line between the two cells' centres. */
export function lineOfSight(board: Board, a: Cell, b: Cell): boolean {
  const idx = makeBoardIndex(board);
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 4;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
    if (sameCell(c, a) || sameCell(c, b)) continue;
    if (idx.isWall(c)) return false;
  }
  return true;
}
