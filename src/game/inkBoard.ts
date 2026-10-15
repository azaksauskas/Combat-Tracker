import { makeBoardIndex, type Board } from "./board";
import { mulberry32 } from "./rng";

/**
 * A battle map drawn in pen and ink, like a hand-drawn dungeon: paper floor
 * with a faint grid, walls as heavy outlines with hatching and stippled
 * pebbles beyond them, a shadow along the inside of every wall, pillars,
 * trees and boulders, brush, rubble, water with ripples, cliffs with hatch
 * ticks on the lower side, stairs as treads, and darker ground the higher it
 * stands. Drawn once into a canvas for a board and a square size.
 */

export const INK = "#1d1a16";
export const PAPER = "#f6f1e6";
const GRID = "rgba(29,26,22,0.16)";
const WATER = "#cfe0e8";
const DEEP = "#a9c7d6";

export function drawInkBoard(board: Board, cell: number, seed = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  canvas.width = Math.ceil(board.width * cell * dpr);
  canvas.height = Math.ceil(board.height * cell * dpr);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);
  const rng = mulberry32((seed ^ (board.width * 7919 + board.height)) >>> 0).rng;
  const idx = makeBoardIndex(board);
  const W = board.width;
  const H = board.height;
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const props = board.props ?? {};
  // A "solid" square: a wall that isn't a lone pillar, tree or boulder.
  const solid = (x: number, y: number) => !inB(x, y) || (idx.isWall({ x, y }) && !props[`${x},${y}`]);
  const floorAt = (x: number, y: number) => inB(x, y) && !solid(x, y);
  const water = new Set(board.water ?? []);
  const deep = new Set(board.deep ?? []);
  const px = (v: number) => v * cell;
  const jitter = (n: number) => (rng() - 0.5) * n;

  c.fillStyle = PAPER;
  c.fillRect(0, 0, W * cell, H * cell);

  // --- Beyond the walls: hatching and pebbles near the floor, blank paper further out.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floorAt(x + dx, y + dy)) near = true;
      if (!near) continue;
      c.strokeStyle = INK;
      c.lineWidth = Math.max(0.6, cell / 60);
      c.globalAlpha = 0.55;
      const strokes = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < strokes; i++) {
        const sx = px(x) + rng() * cell;
        const sy = px(y) + rng() * cell;
        const len = cell * (0.18 + rng() * 0.2);
        const a = Math.PI * 0.75 + jitter(0.5);
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
        c.stroke();
      }
      c.globalAlpha = 0.8;
      c.fillStyle = INK;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(px(x) + rng() * cell, px(y) + rng() * cell, Math.max(0.6, cell / 70) * (0.6 + rng()), 0, Math.PI * 2);
        c.fill();
      }
      // A pebble or two.
      if (rng() < 0.45) {
        c.globalAlpha = 1;
        c.fillStyle = PAPER;
        c.lineWidth = Math.max(0.8, cell / 50);
        pebble(c, px(x) + rng() * cell, px(y) + rng() * cell, cell * (0.06 + rng() * 0.06), rng);
      }
      c.globalAlpha = 1;
    }
  }

  // --- The floor: water, raised ground, brush and rubble.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!floorAt(x, y)) continue;
      const k = `${x},${y}`;
      const h = idx.height({ x, y });
      if (h > 0) {
        c.fillStyle = `rgba(29,26,22,${0.035 * Math.ceil(h)})`;
        c.fillRect(px(x), px(y), cell, cell);
      }
      if (deep.has(k) || water.has(k)) {
        c.fillStyle = deep.has(k) ? DEEP : WATER;
        c.fillRect(px(x), px(y), cell, cell);
        c.strokeStyle = INK;
        c.globalAlpha = 0.45;
        c.lineWidth = Math.max(0.6, cell / 70);
        for (let i = 0; i < (deep.has(k) ? 3 : 2); i++) {
          const wy = px(y) + cell * (0.25 + 0.25 * i) + jitter(cell * 0.08);
          const wx = px(x) + cell * 0.15 + jitter(cell * 0.1);
          c.beginPath();
          c.moveTo(wx, wy);
          c.quadraticCurveTo(wx + cell * 0.18, wy - cell * 0.08, wx + cell * 0.35, wy);
          c.quadraticCurveTo(wx + cell * 0.52, wy + cell * 0.08, wx + cell * 0.7, wy);
          c.stroke();
        }
        c.globalAlpha = 1;
      } else if (idx.isDifficult({ x, y })) {
        c.strokeStyle = INK;
        c.fillStyle = PAPER;
        c.lineWidth = Math.max(0.6, cell / 60);
        c.globalAlpha = 0.75;
        // Brush: tufts of grass; rubble: a scatter of small stones.
        if (rng() < 0.5) {
          for (let i = 0; i < 3; i++) tuft(c, px(x) + cell * (0.2 + rng() * 0.6), px(y) + cell * (0.3 + rng() * 0.6), cell * 0.16);
        } else {
          for (let i = 0; i < 5; i++) pebble(c, px(x) + cell * (0.15 + rng() * 0.7), px(y) + cell * (0.15 + rng() * 0.7), cell * (0.04 + rng() * 0.05), rng);
        }
        c.globalAlpha = 1;
      }
      // Stairs: treads across the square, rising toward the higher side.
      if (idx.isStairs({ x, y })) {
        const up = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => inB(x + dx!, y + dy!) && idx.height({ x: x + dx!, y: y + dy! }) > h) ?? [1, 0];
        c.strokeStyle = INK;
        c.lineWidth = Math.max(0.8, cell / 45);
        for (let i = 1; i < 5; i++) {
          const t = i / 5;
          c.beginPath();
          if (up[0]) {
            const lx = px(x) + cell * t;
            c.moveTo(lx, px(y) + cell * 0.08);
            c.lineTo(lx, px(y) + cell * 0.92);
          } else {
            const ly = px(y) + cell * t;
            c.moveTo(px(x) + cell * 0.08, ly);
            c.lineTo(px(x) + cell * 0.92, ly);
          }
          c.stroke();
        }
      }
    }
  }

  // --- The grid, faint.
  c.strokeStyle = GRID;
  c.lineWidth = 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floorAt(x, y)) continue;
      c.strokeRect(px(x) + 0.5, px(y) + 0.5, cell, cell);
    }

  // --- Shadows along the inside of the walls, then the walls' heavy outline.
  const edges: { x1: number; y1: number; x2: number; y2: number; nx: number; ny: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floorAt(x, y)) continue;
      if (solid(x, y - 1)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y, nx: 0, ny: 1 });
      if (solid(x, y + 1)) edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1, nx: 0, ny: -1 });
      if (solid(x - 1, y)) edges.push({ x1: x, y1: y, x2: x, y2: y + 1, nx: 1, ny: 0 });
      if (solid(x + 1, y)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, nx: -1, ny: 0 });
    }
  for (const e of edges) {
    const sx = Math.min(px(e.x1), px(e.x2));
    const sy = Math.min(px(e.y1), px(e.y2));
    const w = e.nx ? cell * 0.22 : Math.abs(px(e.x2) - px(e.x1));
    const h = e.ny ? cell * 0.22 : Math.abs(px(e.y2) - px(e.y1));
    const g = c.createLinearGradient(px(e.x1), px(e.y1), px(e.x1) + e.nx * cell * 0.22, px(e.y1) + e.ny * cell * 0.22);
    g.addColorStop(0, "rgba(29,26,22,0.22)");
    g.addColorStop(1, "rgba(29,26,22,0)");
    c.fillStyle = g;
    c.fillRect(e.nx < 0 ? sx - w : sx, e.ny < 0 ? sy - h : sy, w, h);
  }
  c.strokeStyle = INK;
  c.lineCap = "round";
  c.lineWidth = Math.max(2, cell / 12);
  for (const e of edges) {
    c.beginPath();
    c.moveTo(px(e.x1) + jitter(1), px(e.y1) + jitter(1));
    c.lineTo(px(e.x2) + jitter(1), px(e.y2) + jitter(1));
    c.stroke();
  }

  // --- Cliffs: where two levels meet without stairs, a heavy line with ticks down the slope.
  c.lineWidth = Math.max(1.5, cell / 18);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floorAt(x, y)) continue;
      const here = { x, y };
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const there = { x: x + dx, y: y + dy };
        if (!floorAt(there.x, there.y) || idx.canStep(here, there)) continue;
        const hiHere = idx.height(here) > idx.height(there);
        const x1 = px(x + dx);
        const y1 = px(y + dy);
        const x2 = dx ? x1 : x1 + cell;
        const y2 = dy ? y1 : y1 + cell;
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
        // Ticks hang on the lower side.
        const dir = hiHere ? 1 : -1;
        c.save();
        c.lineWidth = Math.max(0.7, cell / 50);
        for (let i = 0; i < 4; i++) {
          const t = (i + 0.5) / 4;
          const bx = x1 + (x2 - x1) * t;
          const by = y1 + (y2 - y1) * t;
          c.beginPath();
          c.moveTo(bx, by);
          c.lineTo(bx + dx * dir * cell * 0.18, by + dy * dir * cell * 0.18);
          c.stroke();
        }
        c.restore();
      }
    }

  // --- Pillars, trees and boulders.
  for (const [k, kind] of Object.entries(props)) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    const cx = px(x) + cell / 2;
    const cy = px(y) + cell / 2;
    c.lineWidth = Math.max(1.4, cell / 26);
    c.strokeStyle = INK;
    if (kind === "pillar") {
      c.fillStyle = "rgba(29,26,22,0.25)";
      c.beginPath();
      c.arc(cx + cell * 0.08, cy + cell * 0.08, cell * 0.32, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = PAPER;
      c.beginPath();
      c.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, cell * 0.08, 0, Math.PI * 2);
      c.stroke();
    } else if (kind === "tree") {
      c.fillStyle = "rgba(29,26,22,0.18)";
      c.beginPath();
      c.arc(cx + cell * 0.07, cy + cell * 0.07, cell * 0.42, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = PAPER;
      c.beginPath();
      const bumps = 9;
      for (let i = 0; i <= bumps; i++) {
        const a = (i / bumps) * Math.PI * 2;
        const r = cell * (0.36 + (i % 2) * 0.06);
        const bx = cx + Math.cos(a) * r;
        const by = cy + Math.sin(a) * r;
        if (i === 0) c.moveTo(bx, by);
        else c.quadraticCurveTo(cx + Math.cos(a - Math.PI / bumps) * cell * 0.5, cy + Math.sin(a - Math.PI / bumps) * cell * 0.5, bx, by);
      }
      c.fill();
      c.stroke();
      c.lineWidth = Math.max(0.6, cell / 60);
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(cx + jitter(cell * 0.3), cy + jitter(cell * 0.3), cell * 0.08, 0.2, Math.PI - 0.2);
        c.stroke();
      }
    } else {
      c.fillStyle = PAPER;
      pebble(c, cx, cy, cell * 0.34, rng);
      c.lineWidth = Math.max(0.6, cell / 60);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(cx + cell * (0.02 + i * 0.07), cy - cell * 0.1);
        c.lineTo(cx + cell * (0.1 + i * 0.07), cy + cell * 0.18);
        c.stroke();
      }
    }
  }

  // A frame round the whole map.
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.strokeRect(1, 1, W * cell - 2, H * cell - 2);
  return canvas;
}

function pebble(c: CanvasRenderingContext2D, x: number, y: number, r: number, rng: () => number) {
  c.beginPath();
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + rng() * 0.4);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
  c.stroke();
}

function tuft(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x - s * 0.5, y);
  c.lineTo(x - s * 0.7, y - s);
  c.moveTo(x, y);
  c.lineTo(x, y - s * 1.2);
  c.moveTo(x + s * 0.5, y);
  c.lineTo(x + s * 0.7, y - s);
  c.stroke();
}

