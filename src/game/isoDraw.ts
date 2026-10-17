import { makeBoardIndex, type Board, type Cell } from "./board";
import { INK, PAPER } from "./inkBoard";
import { mulberry32 } from "./rng";

/**
 * The battle map seen from an angle, drawn in pen and ink like an isometric
 * dungeon on paper: floor slabs float on the page with their sides showing,
 * walls rise only along the back edges (a cut-away, so nobody is hidden),
 * higher ground stands taller, stairs have treads, water ripples, pillars,
 * trees and boulders stand on the floor. Drawn once per battle into a canvas.
 */

export type MapLook = "dungeon" | "cave" | "wilds";

export interface IsoGeom {
  /** Tile width (a cell's diamond is twice as wide as tall). */
  tw: number;
  th: number;
  /** Height of one level, a wall, and a slab's thickness. */
  lh: number;
  wh: number;
  st: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
  level: (c: Cell) => number;
  /** A point on the map (grid units, fractions allowed) at a level → screen. */
  at: (gx: number, gy: number, lvl: number) => { x: number; y: number };
  /** The middle of a cell's floor. */
  centre: (c: Cell) => { x: number; y: number };
  /** The four corners of a cell's floor (top, right, bottom, left), flat for Konva. */
  diamond: (c: Cell, inset?: number) => number[];
  /** Is this square floor (somewhere to stand, or a prop standing on floor)? */
  floor: (c: Cell) => boolean;
  /** The floor square under a point on screen (front squares win), or null. */
  pick: (x: number, y: number) => Cell | null;
}

const PAD = 10;

export function isoGeom(board: Board, tw: number): IsoGeom {
  const th = tw / 2;
  const lh = tw * 0.3;
  const wh = tw * 0.72;
  const st = tw * 0.16;
  const W = board.width;
  const H = board.height;
  const heights = board.heights ?? {};
  const props = board.props ?? {};
  const walls = new Set(board.walls);
  const level = (c: Cell) => heights[`${c.x},${c.y}`] ?? 0;
  const floor = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < W && c.y < H && (!walls.has(`${c.x},${c.y}`) || !!props[`${c.x},${c.y}`]);
  const top = Math.max(0, ...Object.values(heights)) * lh + wh + PAD;
  const ox = H * (tw / 2) + PAD;
  const oy = top;
  const at = (gx: number, gy: number, lvl: number) => ({ x: ox + (gx - gy) * (tw / 2), y: oy + (gx + gy) * (th / 2) - lvl * lh });
  const diamond = (c: Cell, inset = 0) => {
    const l = level(c);
    const i = inset;
    return [at(c.x + i, c.y + i, l), at(c.x + 1 - i, c.y + i, l), at(c.x + 1 - i, c.y + 1 - i, l), at(c.x + i, c.y + 1 - i, l)].flatMap((p) => [p.x, p.y]);
  };
  const order: Cell[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (floor({ x, y })) order.push({ x, y });
  order.sort((a, b) => b.x + b.y - (a.x + a.y));
  const inside = (px: number, py: number, d: number[]) => {
    let hit = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const xi = d[i * 2]!;
      const yi = d[i * 2 + 1]!;
      const xj = d[j * 2]!;
      const yj = d[j * 2 + 1]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return {
    tw,
    th,
    lh,
    wh,
    st,
    ox,
    oy,
    width: (W + H) * (tw / 2) + PAD * 2,
    height: oy + (W + H) * (th / 2) + st + PAD,
    level,
    at,
    centre: (c) => at(c.x + 0.5, c.y + 0.5, level(c)),
    diamond,
    floor,
    pick: (x, y) => order.find((c) => inside(x, y, diamond(c))) ?? null,
  };
}

/** Draw the map once into a canvas. */
export function drawIsoBoard(board: Board, g: IsoGeom, seed = 1, look: MapLook = "dungeon"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  canvas.width = Math.ceil(g.width * dpr);
  canvas.height = Math.ceil(g.height * dpr);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);
  const rng = mulberry32((seed ^ (board.width * 7919 + board.height * 31)) >>> 0).rng;
  const idx = makeBoardIndex(board);
  const props = board.props ?? {};
  const water = new Set(board.water ?? []);
  const deep = new Set(board.deep ?? []);
  const difficult = new Set(board.difficult);
  const W = board.width;
  const H = board.height;
  const k = (x: number, y: number) => `${x},${y}`;
  const floor = (x: number, y: number) => g.floor({ x, y });
  const lvl = (x: number, y: number) => g.level({ x, y });
  const P = (gx: number, gy: number, l: number) => g.at(gx, gy, l);
  const lw = Math.max(0.7, g.tw / 60);

  c.fillStyle = PAPER;
  c.fillRect(0, 0, g.width, g.height);
  c.lineJoin = "round";
  c.lineCap = "round";

  const poly = (pts: { x: number; y: number }[], fill: string, stroke = INK, width = lw * 1.4) => {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, width = lw * 0.7, alpha = 1) => {
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.strokeStyle = INK;
    c.lineWidth = width;
    c.stroke();
    c.globalAlpha = 1;
  };
  const mix = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  /** A vertical face from edge a–b (at level top) down to level bottom; bricks for dungeons, rough rock for caves, earth outdoors. */
  const face = (a: { gx: number; gy: number }, b: { gx: number; gy: number }, top: number, bottom: number, shade: number, brick: boolean) => {
    const a1 = P(a.gx, a.gy, top);
    const b1 = P(b.gx, b.gy, top);
    const b0 = { x: b1.x, y: b1.y + (top - bottom) * g.lh };
    const a0 = { x: a1.x, y: a1.y + (top - bottom) * g.lh };
    poly([a1, b1, b0, a0], PAPER);
    const tall = a0.y - a1.y;
    if (brick) {
      // Courses of bricks, joints staggered.
      const rows = Math.max(1, Math.round(tall / (g.tw * 0.09)));
      for (let r = 1; r < rows; r++) line(mix(a1, a0, r / rows), mix(b1, b0, r / rows), lw * 0.5, 0.8);
      for (let r = 0; r < rows; r++) {
        for (let j = 1; j < 4; j++) {
          const t = (j + (r % 2) * 0.5) / 4;
          if (t >= 1) continue;
          const top2 = mix(mix(a1, b1, t), mix(a0, b0, t), r / rows);
          const bot2 = mix(mix(a1, b1, t), mix(a0, b0, t), (r + 1) / rows);
          line(top2, bot2, lw * 0.5, 0.7);
        }
      }
    } else {
      // Rough rock or earth: a few strata and stipples.
      const rows = Math.max(1, Math.round(tall / (g.tw * 0.14)));
      for (let r = 1; r < rows; r++) {
        const s = mix(a1, a0, r / rows + (rng() - 0.5) * 0.08);
        const e = mix(b1, b0, r / rows + (rng() - 0.5) * 0.08);
        line(mix(s, e, rng() * 0.3), mix(s, e, 0.6 + rng() * 0.4), lw * 0.5, 0.7);
      }
      for (let i = 0; i < 4; i++) {
        const p = mix(mix(a1, b1, rng()), mix(a0, b0, rng()), rng());
        c.fillStyle = INK;
        c.fillRect(p.x, p.y, lw, lw);
      }
    }
    // Shade: hatching across the darker side.
    if (shade > 0) {
      const n = Math.round(6 * shade);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        line(mix(a1, b1, t), mix(a0, b0, Math.min(1, t + 0.15)), lw * 0.4, 0.35);
      }
    }
  };

  const outdoor = look === "wilds";
  const brick = look === "dungeon";
  // Floors in depth order, back to front.
  const cells: Cell[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (floor(x, y)) cells.push({ x, y });
  cells.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

  for (const { x, y } of cells) {
    const h = lvl(x, y);
    const solidBack = (nx: number, ny: number) => !floor(nx, ny) && !outdoor;
    // Back walls (a cut-away: only behind, so nothing in front is hidden).
    if (solidBack(x, y - 1)) face({ gx: x, gy: y }, { gx: x + 1, gy: y }, h + g.wh / g.lh, h, 0, brick);
    if (solidBack(x - 1, y)) face({ gx: x, gy: y + 1 }, { gx: x, gy: y }, h + g.wh / g.lh, h, 0.5, brick);
    if (solidBack(x, y - 1) || solidBack(x - 1, y)) {
      // The wall's top edge, a little heavier.
      if (solidBack(x, y - 1)) line(P(x, y, h + g.wh / g.lh), P(x + 1, y, h + g.wh / g.lh), lw * 1.6);
      if (solidBack(x - 1, y)) line(P(x, y + 1, h + g.wh / g.lh), P(x, y, h + g.wh / g.lh), lw * 1.6);
    }

    // The floor.
    const N = P(x, y, h);
    const E = P(x + 1, y, h);
    const S = P(x + 1, y + 1, h);
    const Wc = P(x, y + 1, h);
    const wet = water.has(k(x, y));
    const isDeep = deep.has(k(x, y));
    poly([N, E, S, Wc], isDeep ? "#c9d4da" : wet ? "#dfe7eb" : PAPER, outdoor && !wet && !isDeep ? "rgba(29,26,22,0.3)" : INK, lw * 0.6);
    if (wet || isDeep) {
      for (let i = 0; i < (isDeep ? 4 : 2); i++) {
        const p = P(x + 0.2 + rng() * 0.6, y + 0.2 + rng() * 0.6, h);
        c.beginPath();
        c.ellipse(p.x, p.y, g.tw * 0.08, g.th * 0.06, 0, Math.PI * 1.1, Math.PI * 1.9);
        c.strokeStyle = INK;
        c.lineWidth = lw * 0.6;
        c.stroke();
      }
    } else if (idx.isStairs({ x, y })) {
      // Treads, across the way up.
      const upX = lvl(x + 1, y) > h || lvl(x - 1, y) > h;
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        if (upX) line(P(x + t, y, h), P(x + t, y + 1, h), lw * 0.9);
        else line(P(x, y + t, h), P(x + 1, y + t, h), lw * 0.9);
      }
    } else if (brick) {
      // Flagstones: the square split in four, now and then a crack.
      line(mix(N, E, 0.5), mix(Wc, S, 0.5), lw * 0.45, 0.55);
      line(mix(N, Wc, 0.5), mix(E, S, 0.5), lw * 0.45, 0.55);
      if (rng() < 0.15) line(P(x + 0.2, y + 0.3, h), P(x + 0.45, y + 0.4, h), lw * 0.4, 0.6);
    } else if (outdoor) {
      for (let i = 0; i < 2; i++) {
        const p = P(x + 0.15 + rng() * 0.7, y + 0.15 + rng() * 0.7, h);
        const s = g.tw * 0.05;
        line({ x: p.x - s * 0.6, y: p.y - s }, p, lw * 0.5, 0.6);
        line({ x: p.x, y: p.y - s * 1.2 }, p, lw * 0.5, 0.6);
        line({ x: p.x + s * 0.6, y: p.y - s }, p, lw * 0.5, 0.6);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const p = P(x + rng(), y + rng(), h);
        c.fillStyle = INK;
        c.fillRect(p.x, p.y, lw * 0.9, lw * 0.9);
      }
    }
    if (difficult.has(k(x, y)) && !wet && !isDeep) {
      // Rubble or brush.
      for (let i = 0; i < 3; i++) {
        const p = P(x + 0.2 + rng() * 0.6, y + 0.2 + rng() * 0.6, h);
        c.beginPath();
        c.ellipse(p.x, p.y, g.tw * 0.045, g.th * 0.05, 0, 0, Math.PI * 2);
        c.fillStyle = PAPER;
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = lw * 0.6;
        c.stroke();
      }
    }

    // The front sides: down to lower ground, or the slab's own thickness at an edge.
    const sideTo = (nx: number, ny: number) => (floor(nx, ny) ? lvl(nx, ny) : Math.min(0, h) - g.st / g.lh);
    const right = sideTo(x + 1, y);
    if (right < h) face({ gx: x + 1, gy: y }, { gx: x + 1, gy: y + 1 }, h, right, 0.15, brick || !floor(x + 1, y) ? brick : false);
    const left = sideTo(x, y + 1);
    if (left < h) face({ gx: x + 1, gy: y + 1 }, { gx: x, gy: y + 1 }, h, left, 0.6, brick);

    // What stands on it.
    const prop = props[k(x, y)];
    if (prop) {
      const m = P(x + 0.5, y + 0.5, h);
      c.beginPath();
      c.ellipse(m.x + g.tw * 0.04, m.y + g.th * 0.04, g.tw * 0.24, g.th * 0.24, 0, 0, Math.PI * 2);
      c.fillStyle = "rgba(29,26,22,0.16)";
      c.fill();
      if (prop === "pillar" && !outdoor) {
        const r = 0.22;
        const tall = (g.wh * 1.1) / g.lh;
        face({ gx: x + 0.5 + r, gy: y + 0.5 - r }, { gx: x + 0.5 + r, gy: y + 0.5 + r }, h + tall, h, 0.15, brick);
        face({ gx: x + 0.5 + r, gy: y + 0.5 + r }, { gx: x + 0.5 - r, gy: y + 0.5 + r }, h + tall, h, 0.6, brick);
        poly([P(x + 0.5 - r, y + 0.5 - r, h + tall), P(x + 0.5 + r, y + 0.5 - r, h + tall), P(x + 0.5 + r, y + 0.5 + r, h + tall), P(x + 0.5 - r, y + 0.5 + r, h + tall)], PAPER);
      } else if (prop === "tree") {
        const trunkTop = { x: m.x, y: m.y - g.tw * 0.45 };
        line(m, trunkTop, lw * 2.2);
        const r = g.tw * 0.3;
        const cy = m.y - g.tw * 0.62;
        c.beginPath();
        const n = 9;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr = r * (0.85 + rng() * 0.25);
          const px = m.x + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * 0.9;
          if (i === 0) c.moveTo(px, py);
          else c.quadraticCurveTo(m.x + Math.cos(a - Math.PI / n) * rr * 1.25, cy + Math.sin(a - Math.PI / n) * rr * 1.15, px, py);
        }
        c.closePath();
        c.fillStyle = PAPER;
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = lw * 1.2;
        c.stroke();
        for (let i = 0; i < 4; i++) {
          const a = rng() * Math.PI;
          const px = m.x + Math.cos(a) * r * 0.5;
          const py = cy + Math.sin(a) * r * 0.5;
          line({ x: px - 2, y: py }, { x: px + 2, y: py + 2 }, lw * 0.5, 0.6);
        }
      } else {
        const r = g.tw * 0.22;
        const pts = Array.from({ length: 7 }, (_, i) => {
          const a = Math.PI + (i / 6) * Math.PI;
          return { x: m.x + Math.cos(a) * r * (0.8 + rng() * 0.3), y: m.y + Math.sin(a) * r * (0.9 + rng() * 0.4) };
        });
        poly([...pts, { x: m.x + r, y: m.y + r * 0.15 }, { x: m.x - r, y: m.y + r * 0.15 }], PAPER);
        line({ x: m.x - r * 0.3, y: m.y - r * 0.6 }, { x: m.x + r * 0.1, y: m.y - r * 0.1 }, lw * 0.6, 0.7);
      }
    }
  }
  return canvas;
}
