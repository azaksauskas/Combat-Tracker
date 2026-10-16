import type { Faction } from "../domain/faction";
import { mulberry32 } from "./rng";
import { num } from "./tuning";

/**
 * The world the company travels (Battle Brothers style): the home camp,
 * settlements to visit, roads between them, forests, hills and marsh that
 * slow the march, the factions' lairs, adventure sites, and bands roaming the
 * land. Generated from a seed, so every player has their own land and it
 * never changes under them. Pure functions; world-store runs the clock.
 */

export const WORLD_W = 1000;
export const WORLD_H = 640;

export interface Pt {
  x: number;
  y: number;
}

export type Terrain = "plains" | "road" | "forest" | "hills" | "marsh" | "water";

export const TERRAIN: Record<Terrain, { name: string; speed: number; color: string }> = {
  plains: { name: "Plains", speed: 1, color: "#c8d79a" },
  road: { name: "Road", speed: 1.5, color: "#b89a6a" },
  forest: { name: "Forest", speed: 0.6, color: "#6f9a5b" },
  hills: { name: "Hills", speed: 0.7, color: "#b6a37a" },
  marsh: { name: "Marsh", speed: 0.5, color: "#8fa58c" },
  water: { name: "Lake", speed: 0.3, color: "#7fb0d6" },
};

/** A patch of terrain: an irregular blob. */
export interface Patch {
  id: string;
  terrain: Exclude<Terrain, "plains" | "road">;
  x: number;
  y: number;
  r: number;
  /** Radius wobble around the circle (for drawing and for "is it inside"). */
  bumps: number[];
}

export type PlaceKind = "home" | "village" | "town" | "city" | "lair" | "site";

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  x: number;
  y: number;
  /** Lairs: the faction; sites: the adventure. */
  ref?: string;
  /** Settlements: what they're known for. */
  known?: string;
}

export interface World {
  seed: number;
  places: Place[];
  patches: Patch[];
  /** Roads as polylines between places. */
  roads: Pt[][];
}

const SETTLEMENT_NAMES = ["Millbrook", "Ironford", "Highwall", "Ashby", "Wrenfield", "Stonebridge", "Greywater", "Thornwick", "Oakmere", "Kingsbarrow"];
const KNOWN_FOR: Record<"village" | "town" | "city", string[]> = {
  village: ["farms and cheap bread", "hunters and furs", "a holy well"],
  town: ["a busy forge", "the river market", "a mercenary hall"],
  city: ["the temple of the Dawn", "a college of mages", "the duke's court"],
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Generate the land (deterministic for a seed). */
export function generateWorld(seed: number, homeName: string, factions: Faction[], sites: { id: string; title: string }[]): World {
  const rng = mulberry32(seed >>> 0).rng;
  const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const home: Place = { id: "home", kind: "home", name: homeName || "Home", x: WORLD_W / 2 + rand(-60, 60), y: WORLD_H / 2 + rand(-40, 40) };
  const places: Place[] = [home];
  // Settlements in a loose ring around home, kept apart.
  const kinds: ("village" | "town" | "city")[] = ["village", "village", "town", "town", "city"];
  const names = [...SETTLEMENT_NAMES].sort(() => rng() - 0.5);
  kinds.forEach((kind, i) => {
    let best: Pt = { x: 0, y: 0 };
    for (let tries = 0; tries < 30; tries++) {
      const a = (i / kinds.length) * Math.PI * 2 + rand(-0.4, 0.4);
      const r = kind === "city" ? rand(260, 300) : kind === "town" ? rand(190, 260) : rand(120, 190);
      const p = { x: home.x + Math.cos(a) * r * 1.35, y: home.y + Math.sin(a) * r * 0.85 };
      if (p.x < 50 || p.x > WORLD_W - 50 || p.y < 40 || p.y > WORLD_H - 40) continue;
      best = p;
      if (places.every((q) => dist(q, p) > 120)) break;
    }
    places.push({ id: `s${i}`, kind, name: names[i]!, ...best, known: KNOWN_FOR[kind][Math.floor(rng() * 3)] });
  });
  // Lairs out in the wilds: the more renown a faction needs, the further.
  factions.forEach((f, i) => {
    const a = rand(0, Math.PI * 2);
    const r = 220 + 45 * Math.max(0, f.minRenown - 1) + rand(0, 40);
    const p = { x: Math.min(WORLD_W - 30, Math.max(30, home.x + Math.cos(a) * r * 1.4)), y: Math.min(WORLD_H - 30, Math.max(30, home.y + Math.sin(a) * r * 0.8)) };
    places.push({ id: `lair-${f.id}`, kind: "lair", name: f.name, ref: f.id, ...p });
    void i;
  });
  // Adventure sites: ruins and caves a day or two out.
  sites.forEach((s) => {
    const a = rand(0, Math.PI * 2);
    const r = rand(140, 230);
    places.push({ id: `site-${s.id}`, kind: "site", name: s.title, ref: s.id, x: Math.min(WORLD_W - 30, Math.max(30, home.x + Math.cos(a) * r * 1.3)), y: Math.min(WORLD_H - 30, Math.max(30, home.y + Math.sin(a) * r * 0.85)) });
  });
  // Terrain patches, kept off the settlements.
  const patches: Patch[] = [];
  const add = (terrain: Patch["terrain"], count: number, rMin: number, rMax: number) => {
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const p = { x: rand(40, WORLD_W - 40), y: rand(30, WORLD_H - 30) };
        const r = rand(rMin, rMax);
        if (places.some((q) => q.kind !== "lair" && q.kind !== "site" && dist(q, p) < r + 25)) continue;
        patches.push({ id: `${terrain}${i}`, terrain, ...p, r, bumps: Array.from({ length: 10 }, () => rand(0.8, 1.15)) });
        break;
      }
    }
  };
  add("forest", 9, 40, 85);
  add("hills", 4, 40, 70);
  add("marsh", 2, 35, 55);
  add("water", 1, 35, 55);
  // Roads: each settlement to its nearest already-connected neighbour (a tree from home).
  const settled = places.filter((p) => p.kind === "home" || p.kind === "village" || p.kind === "town" || p.kind === "city");
  const linked = [home];
  const roads: Pt[][] = [];
  for (const p of [...settled.slice(1)].sort((a, b) => dist(a, home) - dist(b, home))) {
    const from = linked.reduce((best, q) => (dist(q, p) < dist(best, p) ? q : best), home);
    const mid = { x: (from.x + p.x) / 2 + rand(-25, 25), y: (from.y + p.y) / 2 + rand(-20, 20) };
    roads.push([{ x: from.x, y: from.y }, mid, { x: p.x, y: p.y }]);
    linked.push(p);
  }
  return { seed, places, patches, roads };
}

/** Is a point inside a patch (with its bumpy edge)? */
export function inPatch(p: Pt, patch: Patch): boolean {
  const d = dist(p, patch);
  const a = Math.atan2(p.y - patch.y, p.x - patch.x);
  const i = Math.floor((((a / (Math.PI * 2)) % 1) + 1) % 1 * patch.bumps.length);
  return d <= patch.r * patch.bumps[i]!;
}

/** Distance from a point to a segment. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function onRoad(w: World, p: Pt): boolean {
  return w.roads.some((r) => r.slice(1).some((b, i) => toSegment(p, r[i]!, b) < 10));
}

export function terrainAt(w: World, p: Pt): Terrain {
  if (onRoad(w, p)) return "road";
  const patch = w.patches.find((x) => inPatch(p, x));
  return patch?.terrain ?? "plains";
}

/** World units the company covers in a game hour on open ground. */
export const marchSpeed = () => num("world.marchSpeed");

/** Move toward a destination for some game hours; terrain sets the pace. */
export function march(w: World, from: Pt, to: Pt, hours: number): { pos: Pt; arrived: boolean } {
  let pos = { ...from };
  let left = hours;
  // Small steps, so the pace follows the ground underfoot.
  while (left > 1e-6) {
    const step = Math.min(left, 0.1);
    const speed = marchSpeed() * TERRAIN[terrainAt(w, pos)].speed;
    const d = dist(pos, to);
    const go = speed * step;
    if (go >= d) return { pos: { ...to }, arrived: true };
    pos = { x: pos.x + ((to.x - pos.x) / d) * go, y: pos.y + ((to.y - pos.y) / d) * go };
    left -= step;
  }
  return { pos, arrived: dist(pos, to) < 0.5 };
}

/** About how many game hours a march takes (sampling the ground on the way). */
export function travelHours(w: World, from: Pt, to: Pt): number {
  const d = dist(from, to);
  if (d < 1) return 0;
  const n = Math.max(4, Math.ceil(d / 10));
  let hours = 0;
  for (let i = 0; i < n; i++) {
    const p = { x: from.x + ((to.x - from.x) * (i + 0.5)) / n, y: from.y + ((to.y - from.y) * (i + 0.5)) / n };
    hours += d / n / (marchSpeed() * TERRAIN[terrainAt(w, p)].speed);
  }
  return hours;
}

// --- Bands roaming the land -------------------------------------------------------------

export interface Band {
  id: string;
  /** A foe from patrol.ts (wolves, bandits…). */
  foe: string;
  name: string;
  x: number;
  y: number;
  /** Where it's wandering to. */
  goal: Pt;
  /** The lair it came from, if any. */
  from?: string;
  /** The contract that set the company on it, if any. */
  contract?: string;
  /** Its ground: it wanders near here and won't chase far from it. */
  home?: Pt;
}

/** Which foes a faction sends out. */
export const FACTION_FOE: Record<string, string> = { "red-fang": "goblins", "river-road": "bandits", "restless-dead": "undead", "hollow-eye": "cultists", "gnoll-pack": "gnolls" };
const WILD_FOES = ["wolves", "wolves", "bandits", "vermin"];
export const BAND_NAME: Record<string, string> = { wolves: "Wolf pack", bandits: "Bandits", goblins: "Goblin raiders", undead: "The restless dead", vermin: "Giant rats", cultists: "Cultists", gnolls: "Gnoll war party" };

/** A new band: from a lair (the faction's foes) or from the wilds (wolves in the forest…). */
export function spawnBand(w: World, rng: () => number, id: string, renown: number, factions: Faction[]): Band {
  const lairs = w.places.filter((p) => p.kind === "lair" && (factions.find((f) => f.id === p.ref)?.minRenown ?? 1) <= renown + 1);
  const fromLair = lairs.length && rng() < 0.6 ? lairs[Math.floor(rng() * lairs.length)]! : null;
  const foe = fromLair ? (FACTION_FOE[fromLair.ref ?? ""] ?? "bandits") : WILD_FOES[Math.floor(rng() * WILD_FOES.length)]!;
  const start = fromLair ?? (() => {
    const forests = w.patches.filter((p) => p.terrain === "forest");
    const f = forests[Math.floor(rng() * forests.length)];
    return f ? { x: f.x, y: f.y } : { x: rng() * WORLD_W, y: rng() * WORLD_H };
  })();
  const home = { x: start.x, y: start.y };
  const band: Band = { id, foe, name: BAND_NAME[foe] ?? "Raiders", x: start.x, y: start.y, goal: home, home, ...(fromLair ? { from: fromLair.id } : {}) };
  return { ...band, goal: wanderGoal(w, band, rng) };
}

/**
 * Where a band wanders next: somewhere on its own ground. Bandits keep to the
 * roads near their haunt (that's where travellers are); beasts and the rest
 * roam round their home.
 */
function wanderGoal(w: World, b: Band, rng: () => number): Pt {
  const home = b.home ?? { x: b.x, y: b.y };
  const range = num("world.bandRange");
  if (b.foe === "bandits" && w.roads.length) {
    const near = w.roads.flatMap((r) => [0.25, 0.5, 0.75].map((t) => ({ x: r[0]!.x + (r[2]!.x - r[0]!.x) * t, y: r[0]!.y + (r[2]!.y - r[0]!.y) * t }))).filter((p) => dist(p, home) < range);
    if (near.length) return near[Math.floor(rng() * near.length)]!;
  }
  const a = rng() * Math.PI * 2;
  const r = rng() * range;
  return { x: Math.min(WORLD_W - 20, Math.max(20, home.x + Math.cos(a) * r)), y: Math.min(WORLD_H - 20, Math.max(20, home.y + Math.sin(a) * r)) };
}

/** Bands wander; one that sees the company comes for it. Settlements and home are safe ground. */
export function moveBands(w: World, bands: Band[], company: Pt, hours: number, rng: () => number): Band[] {
  const aggro = num("world.bandSight");
  const speed = num("world.bandSpeed");
  const safe = w.places.filter((p) => p.kind !== "lair" && p.kind !== "site");
  const sheltered = safe.some((p) => dist(p, company) < 28);
  const leash = num("world.bandRange") * 1.5;
  return bands.map((b) => {
    const home = b.home ?? { x: b.x, y: b.y };
    // It gives chase only on its own ground; past that it gives up and heads home.
    const chasing = !sheltered && dist(b, company) < aggro && dist(home, company) < leash;
    const strayed = !chasing && dist(b, home) > leash;
    // A band a contract is about stays in its camp until it sees the company.
    const target = chasing ? company : strayed ? home : b.contract ? home : b.goal;
    const step = march(w, b, target, hours * (speed / marchSpeed()));
    const goal = !chasing && !strayed && step.arrived ? wanderGoal(w, { ...b, home }, rng) : b.goal;
    // Bands keep clear of settlements.
    const near = safe.find((p) => dist(p, step.pos) < 30);
    const pos = near ? { x: near.x + ((step.pos.x - near.x) / Math.max(1, dist(near, step.pos))) * 30, y: near.y + ((step.pos.y - near.y) / Math.max(1, dist(near, step.pos))) * 30 } : step.pos;
    return { ...b, ...pos, goal };
  });
}

/** The band the company ran into, if any. */
export const bandAt = (bands: Band[], company: Pt) => bands.find((b) => dist(b, company) < num("world.contactRange"));

/** What the company can see around it. */
export const inSight = (p: Pt, company: Pt) => dist(p, company) < num("world.sight");

export { dist };

// --- The map draws itself as the company explores ---------------------------------------

export const EXPLORE_CELL = 20;
export const EXPLORE_COLS = Math.ceil(WORLD_W / EXPLORE_CELL);
export const EXPLORE_ROWS = Math.ceil(WORLD_H / EXPLORE_CELL);

/** Which cells of the map have been seen: one character per cell ("1" seen), row by row. */
export const blankExplored = () => "0".repeat(EXPLORE_COLS * EXPLORE_ROWS);

/** Mark the cells within sight of a point as seen. */
export function explore(explored: string, p: Pt, radius: number): string {
  const cells = (explored.length === EXPLORE_COLS * EXPLORE_ROWS ? explored : blankExplored()).split("");
  const r = Math.ceil(radius / EXPLORE_CELL);
  const cx = Math.floor(p.x / EXPLORE_CELL);
  const cy = Math.floor(p.y / EXPLORE_CELL);
  let changed = false;
  for (let y = Math.max(0, cy - r); y <= Math.min(EXPLORE_ROWS - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(EXPLORE_COLS - 1, cx + r); x++) {
      const centre = { x: (x + 0.5) * EXPLORE_CELL, y: (y + 0.5) * EXPLORE_CELL };
      const i = y * EXPLORE_COLS + x;
      if (cells[i] !== "1" && dist(centre, p) <= radius) {
        cells[i] = "1";
        changed = true;
      }
    }
  }
  return changed ? cells.join("") : explored;
}

export const isExplored = (explored: string, p: Pt) => explored[Math.floor(p.y / EXPLORE_CELL) * EXPLORE_COLS + Math.floor(p.x / EXPLORE_CELL)] === "1";
