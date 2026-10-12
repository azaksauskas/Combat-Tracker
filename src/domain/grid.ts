import type { GridType } from "./types";

/** World units: one grid cell = 5 ft = CELL px. */
export const CELL = 50;
export const MAP_SIZE = 3000;

/** Pointy-top hex with the same width as a square cell. */
export const HEX_W = CELL;
export const HEX_R = HEX_W / Math.sqrt(3);
export const HEX_ROW = HEX_R * 1.5;

export interface Point {
  x: number;
  y: number;
}

export function hexCenter(col: number, row: number): Point {
  return { x: col * HEX_W + (row & 1 ? HEX_W / 2 : 0) + HEX_W / 2, y: row * HEX_ROW + HEX_R };
}

/** Corners of a pointy-top hex centred on p. */
export function hexCorners(p: Point, r = HEX_R): Point[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
  });
}

function nearestHex(p: Point): Point {
  const row = Math.round((p.y - HEX_R) / HEX_ROW);
  let best = hexCenter(0, 0);
  let bestD = Infinity;
  for (let r = row - 1; r <= row + 1; r++) {
    const offset = r & 1 ? HEX_W / 2 : 0;
    const col = Math.round((p.x - offset - HEX_W / 2) / HEX_W);
    for (let c = col - 1; c <= col + 1; c++) {
      const h = hexCenter(c, r);
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
  }
  return best;
}

/**
 * Snaps a token centre to the grid. Odd-sized square tokens sit in a cell
 * centre, even-sized ones on a grid intersection, so they fill whole cells.
 */
export function snapToGrid(p: Point, grid: GridType, sizeInCells = 1): Point {
  if (grid === "hex") return nearestHex(p);
  const cells = Math.max(1, Math.round(sizeInCells));
  const offset = cells % 2 === 1 ? CELL / 2 : 0;
  return {
    x: Math.round((p.x - offset) / CELL) * CELL + offset,
    y: Math.round((p.y - offset) / CELL) * CELL + offset,
  };
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Shortest distance from p to the segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when p is within `threshold` of the polyline given as flat [x,y,...]. */
export function hitsPolyline(p: Point, points: readonly number[], threshold: number): boolean {
  if (points.length === 2) return Math.hypot(p.x - points[0]!, p.y - points[1]!) <= threshold;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const a = { x: points[i]!, y: points[i + 1]! };
    const b = { x: points[i + 2]!, y: points[i + 3]! };
    if (distanceToSegment(p, a, b) <= threshold) return true;
  }
  return false;
}

/** Distance in feet between two points, using 5e's "every square is 5 ft". */
export function distanceFeet(a: Point, b: Point, grid: GridType): number {
  if (grid === "hex") return Math.round(Math.hypot(a.x - b.x, a.y - b.y) / HEX_W) * 5;
  const dx = Math.round(Math.abs(a.x - b.x) / CELL);
  const dy = Math.round(Math.abs(a.y - b.y) / CELL);
  return Math.max(dx, dy) * 5;
}
