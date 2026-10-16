import { mulberry32 } from "./rng";
import { buildingsOf, characterOf, type Building } from "./settlement";
import type { Place } from "./world";

/**
 * A settlement seen from above, like a hand-drawn D&D town map: roads
 * meeting at a square, the buildings that matter around it, houses along
 * the roads, trees, fields, maybe a river with a bridge, and a palisade or
 * stone walls for bigger places. Deterministic for a place.
 */

export const PLAN_W = 1000;
export const PLAN_H = 640;

export interface P {
  x: number;
  y: number;
}
/** A road or river: its SVG path and points along it (with the heading, in degrees). */
export interface Line {
  d: string;
  pts: (P & { a: number })[];
}
export interface KeyBuilding extends P {
  b: Building;
  /** Rotation in degrees. */
  rot: number;
  /** Rough radius, for clicking and spacing. */
  r: number;
}
export interface House extends P {
  w: number;
  h: number;
  rot: number;
  chimney: boolean;
  hip: boolean;
  /** An L-shaped house: a wing at one end. */
  wing: boolean;
}
export interface Tree extends P {
  r: number;
  seed: number;
}
export interface Field extends P {
  w: number;
  h: number;
  rot: number;
  /** Crop rows run along (true) or across. */
  along: boolean;
}
export interface Plan {
  centre: P;
  /** The square's radius. */
  square: number;
  roads: Line[];
  river: Line | null;
  bridge: (P & { rot: number }) | null;
  keys: KeyBuilding[];
  houses: House[];
  trees: Tree[];
  fields: Field[];
  wall: { kind: "palisade" | "stone"; rx: number; ry: number } | null;
}

const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 101);
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** A quadratic curve from a to b passing through m (at its middle). */
function curve(a: P, m: P, b: P, steps = 60): Line {
  const q = { x: 2 * m.x - (a.x + b.x) / 2, y: 2 * m.y - (a.y + b.y) / 2 };
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const dx = 2 * u * (q.x - a.x) + 2 * t * (b.x - q.x);
    const dy = 2 * u * (q.y - a.y) + 2 * t * (b.y - q.y);
    return { x: u * u * a.x + 2 * u * t * q.x + t * t * b.x, y: u * u * a.y + 2 * u * t * q.y + t * t * b.y, a: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
  return { d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${q.x.toFixed(1)} ${q.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, pts };
}

const nearest = (line: Line, p: P) => line.pts.reduce((best, q) => (dist(q, p) < dist(best, p) ? q : best), line.pts[0]!);

/** How big each key building is (its radius on the plan). */
const KEY_R: Record<Building, number> = { board: 50, market: 0, tavern: 50, temple: 58, farm: 70, lodge: 46, forge: 44, docks: 54, hall: 60, college: 50, court: 72 };

/** The part of the paper shown: the whole of it for a city, the middle for a village. */
export function viewOf(kind: Place["kind"], centre: P) {
  const k = kind === "city" ? 0.96 : kind === "town" ? 0.8 : 0.66;
  const w = PLAN_W * k;
  const h = PLAN_H * k;
  return { x: Math.max(0, Math.min(PLAN_W - w, centre.x - w / 2)), y: Math.max(0, Math.min(PLAN_H - h, centre.y - h / 2)), w, h };
}

export function planOf(place: Place): Plan {
  const rng = mulberry32(hashOf(place.id + (place.known ?? ""))).rng;
  const r = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const kind = place.kind;
  const big = kind === "city" ? 2 : kind === "town" ? 1 : 0;
  const centre = { x: PLAN_W / 2 + r(-50, 50), y: PLAN_H / 2 + r(-30, 30) };
  const square = [42, 56, 72][big]!;

  // Roads: one through from west to east, one from north to south, and in a city two lanes more.
  const roads: Line[] = [curve({ x: -30, y: centre.y + r(-130, 130) }, centre, { x: PLAN_W + 30, y: centre.y + r(-130, 130) })];
  roads.push(curve({ x: centre.x + r(-160, 160), y: -30 }, centre, { x: centre.x + r(-160, 160), y: PLAN_H + 30 }));
  if (big === 2) {
    roads.push(curve({ x: centre.x - 560, y: centre.y - 380 }, { x: centre.x - 150, y: centre.y + 30 }, { x: centre.x + 140, y: centre.y + 420 }));
    roads.push(curve({ x: centre.x + 520, y: centre.y - 400 }, { x: centre.x + 170, y: centre.y - 10 }, { x: centre.x + 560, y: centre.y + 380 }));
  }

  // A river along the south, where there's a quay (and now and then anyway).
  const own = characterOf(place).building;
  const wet = own === "docks" || rng() < 0.3;
  const river = wet ? curve({ x: -40, y: centre.y + r(170, 230) }, { x: centre.x + r(-100, 100), y: centre.y + r(190, 240) }, { x: PLAN_W + 40, y: centre.y + r(140, 230) }) : null;
  let bridge: Plan["bridge"] = null;
  if (river) {
    const road = roads[1]!;
    const meet = road.pts.reduce((best, p) => (dist(p, nearest(river, p)) < dist(best, nearest(river, best)) ? p : best), road.pts[0]!);
    bridge = { x: meet.x, y: meet.y, rot: nearest(river, meet).a + 90 };
  }

  const wall: Plan["wall"] = big === 2 ? { kind: "stone", rx: 400, ry: 245 } : big === 1 ? { kind: "palisade", rx: 300, ry: 195 } : null;
  const inWall = (p: P, pad = 0) => !wall || ((p.x - centre.x) / (wall.rx - pad)) ** 2 + ((p.y - centre.y) / (wall.ry - pad)) ** 2 < 1;
  const onWall = (p: P, rr: number) => !!wall && Math.abs(Math.hypot((p.x - centre.x) / wall.rx, (p.y - centre.y) / wall.ry) - 1) * Math.min(wall.rx, wall.ry) < rr + 8;

  // What's taken: circles of buildings, and the roads, river and square.
  const taken: (P & { r: number })[] = [{ ...centre, r: square + 6 }];
  const roadGap = (p: P) => Math.min(...roads.map((l) => dist(p, nearest(l, p))));
  const riverGap = (p: P) => (river ? dist(p, nearest(river, p)) : Infinity);
  // What's drawn is the middle of the paper, closer in for smaller places.
  const view = viewOf(kind, centre);
  const inside = (p: P, rr: number) => p.x > view.x + rr + 14 && p.y > view.y + rr + 40 && p.x < view.x + view.w - rr - 14 && p.y < view.y + view.h - rr - 30;
  const free = (p: P, rr: number, road = 14) => inside(p, rr) && roadGap(p) > rr + road && riverGap(p) > rr + 30 && !onWall(p, rr) && taken.every((t) => dist(t, p) > t.r + rr + 4);

  // The buildings that matter, round the square; a farm out at the edge; a quay on the river.
  const keys: KeyBuilding[] = [{ b: "market", ...centre, rot: 0, r: square }];
  const angles = [-135, -45, 135, 45, 180, 0, -90, 90].map((a) => a + r(-15, 15));
  for (const b of buildingsOf(place).filter((x) => x !== "market")) {
    const rr = KEY_R[b];
    let spot: P | null = null;
    if (b === "docks" && river && bridge) {
      for (const side of [-1, 1]) {
        const along = nearest(river, { x: bridge.x + side * 120, y: bridge.y });
        const p = { x: along.x, y: along.y - 34 };
        if (!spot && taken.every((t) => dist(t, p) > t.r + rr) && roadGap(p) > rr) spot = p;
      }
    } else if (b === "farm") {
      for (let i = 0; i < 80 && !spot; i++) {
        const a = rng() * Math.PI * 2;
        const p = { x: centre.x + Math.cos(a) * r(300, 420), y: centre.y + Math.sin(a) * r(190, 260) };
        if (free(p, rr, 10) && !inWall(p, -rr)) spot = p;
      }
    }
    for (let ring = 0; ring < 8 && !spot; ring++) {
      for (const a of angles) {
        const d = square + rr + 28 + ring * 26;
        const p = { x: centre.x + Math.cos((a * Math.PI) / 180) * d * 1.25, y: centre.y + Math.sin((a * Math.PI) / 180) * d };
        if (free(p, rr, 8)) {
          spot = p;
          break;
        }
      }
    }
    // Nowhere clear: the roomiest spot round the square will have to do.
    if (!spot) {
      let best = -Infinity;
      for (let i = 0; i < 200; i++) {
        const a = rng() * Math.PI * 2;
        const d = r(square + rr + 20, 380);
        const p = { x: centre.x + Math.cos(a) * d * 1.3, y: centre.y + Math.sin(a) * d * 0.8 };
        if (!inside(p, rr)) continue;
        const room = Math.min(roadGap(p) - rr, riverGap(p) - rr - 20, onWall(p, rr) ? -50 : Infinity, ...taken.map((t) => dist(t, p) - t.r - rr));
        if (room > best) {
          best = room;
          spot = p;
        }
      }
    }
    if (!spot) continue;
    taken.push({ ...spot, r: rr });
    const facing = nearest(roads[0]!, spot).a;
    keys.push({ b, ...spot, rot: b === "farm" ? r(-20, 20) : facing + r(-6, 6), r: rr });
  }

  // Fields outside, for villages and farms.
  const fields: Field[] = [];
  const fieldCount = own === "farm" ? 5 : [4, 2, 1][big]!;
  for (let i = 0; i < 60 && fields.length < fieldCount; i++) {
    const p = { x: r(60, PLAN_W - 60), y: r(60, PLAN_H - 60) };
    const w = r(90, 150);
    const h = r(60, 100);
    const rr = Math.max(w, h) / 2;
    if (!free(p, rr * 0.8, 6) || inWall(p, -rr) || dist(p, centre) < 260) continue;
    taken.push({ ...p, r: rr * 0.8 });
    fields.push({ ...p, w, h, rot: r(-25, 25), along: rng() < 0.5 });
  }

  // Houses along the roads (and filling the blocks of a city).
  const houses: House[] = [];
  const want = [20, 38, 80][big]!;
  const house = (p: P, a: number) => {
    const w = r(24, big === 2 ? 36 : 40);
    const h = r(16, 24);
    const rr = Math.max(w, h) / 2 + 2;
    if (!free(p, rr, 6) || (wall && !inWall(p, rr + 10) && rng() < 0.85)) return false;
    taken.push({ ...p, r: rr });
    houses.push({ ...p, w, h, rot: a + r(-5, 5), chimney: rng() < 0.55, hip: rng() < 0.4, wing: rng() < 0.25 });
    return true;
  };
  for (let tries = 0; tries < 2000 && houses.length < want; tries++) {
    const line = roads[Math.floor(rng() * roads.length)]!;
    const q = line.pts[Math.floor(rng() * line.pts.length)]!;
    const side = rng() < 0.5 ? -1 : 1;
    const off = r(26, 40) + (big === 2 && rng() < 0.4 ? r(30, 70) : 0);
    const n = ((q.a + 90) * Math.PI) / 180;
    house({ x: q.x + Math.cos(n) * off * side, y: q.y + Math.sin(n) * off * side }, q.a);
  }

  // Trees: copses outside, a few in the streets of a village.
  const trees: Tree[] = [];
  const copses = [9, 7, 5][big]!;
  for (let c = 0; c < copses * 4 && trees.length < copses * 7; c++) {
    const hub = { x: r(20, PLAN_W - 20), y: r(20, PLAN_H - 20) };
    if (wall && inWall(hub, -30)) continue;
    const n = 3 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const p = { x: hub.x + r(-45, 45), y: hub.y + r(-35, 35) };
      const tr = r(8, 14);
      if (p.x < -5 || p.y < -5 || p.x > PLAN_W + 5 || p.y > PLAN_H + 5) continue;
      if (roadGap(p) < tr + 12 || riverGap(p) < tr + 26 || taken.some((t) => dist(t, p) < t.r + tr)) continue;
      trees.push({ ...p, r: tr, seed: Math.floor(rng() * 1e6) });
    }
  }

  return { centre, square, roads, river, bridge, keys, houses, trees, fields, wall };
}
