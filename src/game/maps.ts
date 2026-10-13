import { SRD_MONSTERS } from "../content/srd";
import { MAP_LIMITS, MAX_STARTS, type MapMonster, type SkirmishMap } from "../domain/skirmish-map";
import type { Combatant } from "../domain/types";
import { autoplay } from "./ai";
import { fromKey, key, reachableCells, type Board, type Cell } from "./board";
import { createGame, type UnitSetup } from "./engine";
import { XP_BY_CR } from "./party";
import type { ContentEntry } from "../content/srd";
import { setupFor, type Scenario } from "./scenarios";

/**
 * Pure logic behind the map editor: painting, resizing, checks, encounter
 * difficulty, turning a map into a playable skirmish, and AI trial runs.
 */

export type Tool =
  | { kind: "wall" }
  | { kind: "difficult" }
  | { kind: "erase" }
  | { kind: "start" }
  | { kind: "monster"; source: MapMonster["source"]; ref: string };

export function blankMap(id: string, name = "New map"): SkirmishMap {
  const width = 16;
  const height = 10;
  return { id, name, blurb: "", width, height, walls: [], difficult: [], starts: [1, 2, 3, 4].map((y) => `0,${y + 2}`), monsters: [] };
}

const without = (list: string[], k: string) => list.filter((x) => x !== k);

/** Applies one tool to one square. Returns the same map when nothing changes. */
export function paint(map: SkirmishMap, cell: Cell, tool: Tool, newId: () => string): SkirmishMap {
  if (cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) return map;
  const k = key(cell);
  const clear = { walls: without(map.walls, k), difficult: without(map.difficult, k), starts: without(map.starts, k), monsters: map.monsters.filter((m) => m.cell !== k) };
  switch (tool.kind) {
    case "erase":
      return { ...map, ...clear };
    case "wall":
      if (map.walls.includes(k)) return map;
      return { ...map, ...clear, walls: [...clear.walls, k] };
    case "difficult":
      // Difficult terrain sits under creatures and starts; it only replaces walls.
      if (map.difficult.includes(k)) return map;
      return { ...map, walls: clear.walls, difficult: [...map.difficult, k] };
    case "start":
      if (map.starts.includes(k)) return map;
      if (map.starts.length >= MAX_STARTS) return map;
      return { ...map, walls: clear.walls, monsters: clear.monsters, starts: [...map.starts, k] };
    case "monster": {
      const here = map.monsters.find((m) => m.cell === k);
      if (here && here.source === tool.source && here.ref === tool.ref) return map;
      return { ...map, walls: clear.walls, starts: clear.starts, monsters: [...clear.monsters, { id: newId(), cell: k, source: tool.source, ref: tool.ref }] };
    }
  }
}

/** Changes the size; anything outside the new edges is dropped. */
export function resize(map: SkirmishMap, width: number, height: number): SkirmishMap {
  width = Math.min(MAP_LIMITS.maxWidth, Math.max(MAP_LIMITS.minWidth, Math.round(width)));
  height = Math.min(MAP_LIMITS.maxHeight, Math.max(MAP_LIMITS.minHeight, Math.round(height)));
  const inside = (k: string) => {
    const c = fromKey(k);
    return c.x < width && c.y < height;
  };
  return {
    ...map,
    width,
    height,
    walls: map.walls.filter(inside),
    difficult: map.difficult.filter(inside),
    starts: map.starts.filter(inside),
    monsters: map.monsters.filter((m) => inside(m.cell)),
  };
}

/** Draws a wall around the edge of the map. */
export function outline(map: SkirmishMap): SkirmishMap {
  let out = map;
  for (let x = 0; x < map.width; x++)
    for (let y = 0; y < map.height; y++)
      if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) {
        const k = `${x},${y}`;
        if (!out.starts.includes(k) && !out.monsters.some((m) => m.cell === k)) out = paint(out, { x, y }, { kind: "wall" }, () => "");
      }
  return out;
}

// --- Monsters -----------------------------------------------------------------------

export interface MonsterInfo {
  name: string;
  cr: string | null;
  build: () => Omit<UnitSetup, "id" | "side" | "pos">;
}

/** What a map's monster stands for, or null if it no longer exists (deleted roster entry). */
export function monsterInfo(m: Pick<MapMonster, "source" | "ref">, roster: Combatant[]): MonsterInfo | null {
  if (m.source === "srd") {
    const e = SRD_MONSTERS.find((x) => x.key === m.ref);
    if (!e) return null;
    const c = e.build();
    return { name: e.label, cr: c.stats?.cr ?? null, build: () => unitBase(e.build()) };
  }
  const c = roster.find((x) => x.id === m.ref);
  if (!c?.stats) return null;
  return { name: c.name, cr: c.stats.cr, build: () => unitBase(c) };
}

function unitBase(c: Pick<Combatant, "name" | "image" | "ac" | "hpMax" | "speed"> & { stats?: Combatant["stats"] }): Omit<UnitSetup, "id" | "side" | "pos"> {
  return { name: c.name, image: c.image, stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed };
}

// --- Checks -------------------------------------------------------------------------

export interface MapIssue {
  level: "error" | "warning";
  text: string;
}

export function toBoard(map: SkirmishMap): Board {
  return { width: map.width, height: map.height, walls: [...map.walls], difficult: [...map.difficult] };
}

export function checkMap(map: SkirmishMap, roster: Combatant[]): MapIssue[] {
  const issues: MapIssue[] = [];
  if (map.starts.length === 0) issues.push({ level: "error", text: "Place at least one hero start square" });
  if (map.monsters.length === 0) issues.push({ level: "error", text: "Place at least one monster" });
  if (map.monsters.length > 12) issues.push({ level: "warning", text: `${map.monsters.length} monsters: big fights get slow` });
  const missing = map.monsters.filter((m) => !monsterInfo(m, roster));
  if (missing.length) issues.push({ level: "error", text: `${missing.length} monster${missing.length === 1 ? " is" : "s are"} no longer in your roster` });
  if (map.starts.length && map.starts.length < MAX_STARTS) issues.push({ level: "warning", text: `Only ${map.starts.length} start square${map.starts.length === 1 ? "" : "s"}: the rest of the party won't take part` });
  // Can the two sides reach each other?
  if (map.starts.length && map.monsters.length) {
    const reach = reachableCells(toBoard(map), fromKey(map.starts[0]!), 10_000, { blocked: () => false });
    const sealed = map.monsters.filter((m) => !reach.has(m.cell));
    if (sealed.length) issues.push({ level: "warning", text: `${sealed.length} monster${sealed.length === 1 ? " is" : "s are"} walled off from the heroes` });
  }
  return issues;
}

// --- Difficulty (2024 XP budget per character) ----------------------------------------

const BUDGET: Record<number, [number, number, number]> = { 1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100] };

export interface Difficulty {
  xp: number;
  label: "Trivial" | "Low" | "Moderate" | "High" | "Deadly";
  budget: [number, number, number];
}

export function difficulty(crs: (string | null)[], partyLevels: number[]): Difficulty {
  const xp = crs.reduce((n, cr) => n + (XP_BY_CR[cr ?? ""] ?? 0), 0);
  const budget = partyLevels.reduce<[number, number, number]>(
    (b, lvl) => {
      const row = BUDGET[Math.min(5, Math.max(1, lvl))]!;
      return [b[0] + row[0], b[1] + row[1], b[2] + row[2]];
    },
    [0, 0, 0],
  );
  const label = xp < budget[0] * 0.5 ? "Trivial" : xp <= budget[0] ? "Low" : xp <= budget[1] ? "Moderate" : xp <= budget[2] ? "High" : "Deadly";
  return { xp, label, budget };
}

// --- Playing a map ------------------------------------------------------------------

/** The map as a playable skirmish. Its id is "map:<id>". */
export function mapScenario(map: SkirmishMap, roster: Combatant[]): Scenario & { custom: UnitSetup[] } {
  const rows = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => {
      const k = `${x},${y}`;
      return map.walls.includes(k) ? "#" : map.difficult.includes(k) ? "~" : ".";
    }),
  );
  // Start squares in the order they were placed (scenarioSetup reads "P" in reading order).
  const starts = map.starts.map(fromKey);
  const seen = new Map<string, number>();
  const custom = map.monsters.flatMap((m, i): UnitSetup[] => {
    const info = monsterInfo(m, roster);
    if (!info) return [];
    const n = (seen.get(info.name) ?? 0) + 1;
    seen.set(info.name, n);
    const base = info.build();
    return [{ ...base, name: n > 1 ? `${base.name} ${n}` : base.name, id: `m${i}`, side: "enemy", pos: fromKey(m.cell) }];
  });
  return { id: `map:${map.id}`, name: map.name, blurb: map.blurb || `${custom.length} monsters on your own map.`, map: rows.map((r) => r.join("")), monsters: [], custom, starts };
}

/** Plays the map many times with the AI on both sides. */
export function trialRuns(map: SkirmishMap, roster: Combatant[], party: ContentEntry[], runs: number, firstSeed = 1) {
  const sc = mapScenario(map, roster);
  const { board, units } = setupFor(sc, party);
  let wins = 0;
  let rounds = 0;
  let fallen = 0;
  for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
    const end = autoplay(createGame(board, units, seed).state);
    if (end.outcome === "victory") wins++;
    rounds += end.round;
    fallen += end.units.filter((u) => u.side === "party" && (u.dead || u.hp <= 0)).length;
  }
  return { runs, winRate: wins / runs, avgRounds: rounds / runs, avgDown: fallen / runs };
}

/** A built-in scenario as an editable map (for "Copy"). */
export function scenarioToMap(sc: Scenario, id: string): SkirmishMap {
  const walls: string[] = [];
  const difficult: string[] = [];
  const starts: string[] = [];
  const numbered: { n: string; k: string }[] = [];
  sc.map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const k = `${x},${y}`;
      if (ch === "#") walls.push(k);
      else if (ch === "~") difficult.push(k);
      else if (ch === "P") starts.push(k);
      else if (/[1-9]/.test(ch)) numbered.push({ n: ch, k });
    }),
  );
  numbered.sort((a, b) => a.n.localeCompare(b.n));
  const monsters = sc.monsters.flatMap((ref, i) => (numbered[i] ? [{ id: `${id}-m${i}`, cell: numbered[i]!.k, source: "srd" as const, ref }] : []));
  return {
    id,
    name: `${sc.name} (copy)`,
    blurb: sc.blurb,
    width: Math.max(...sc.map.map((r) => r.length)),
    height: sc.map.length,
    walls,
    difficult,
    starts: starts.slice(0, MAX_STARTS),
    monsters,
  };
}
