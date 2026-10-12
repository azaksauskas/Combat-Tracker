import { nanoid } from "nanoid";
import { CELL, MAP_SIZE, type Point } from "./grid";
import type { Combatant, CombatDoc, Encounter, LibraryDoc } from "./types";

/**
 * Pure combat rules. Every function either returns a value or mutates the
 * draft it is given (Immer-style), and none of them touch the DOM, React or
 * the network — so the same rules can drive a future game client or server.
 */

export const newId = () => nanoid(10);

export const rollD20 = (rng: () => number = Math.random) => Math.floor(rng() * 20) + 1;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Goblin 3" -> "Goblin". */
export const baseName = (name: string) => name.trim().replace(/\s\d+$/, "");

/** Returns `base`, or `base N` if that name is already taken. */
export function uniqueName(base: string, existing: readonly string[]): string {
  const clean = baseName(base) || "Unnamed";
  const re = new RegExp(`^${escapeRegExp(clean)}(?:\\s(\\d+))?$`);
  let max = 0;
  for (const name of existing) {
    const m = re.exec(name.trim());
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1);
  }
  return max === 0 ? clean : `${clean} ${max + 1}`;
}

/** Inserts after everyone with an equal or higher initiative (stable for ties). */
export function insertByInitiative(list: Combatant[], c: Combatant) {
  let i = 0;
  while (i < list.length && list[i]!.initiative >= c.initiative) i++;
  list.splice(i, 0, c);
}

export function sortByInitiative(list: Combatant[]) {
  list.sort((a, b) => b.initiative - a.initiative);
}

export function moveCombatant(list: Combatant[], fromId: string, toId: string) {
  const from = list.findIndex((c) => c.id === fromId);
  const to = list.findIndex((c) => c.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item!);
}

/** Nearest grid step to `p` (spiralling outwards) that no other token occupies. */
export function findFreeSpot(occupied: readonly Point[], p: Point): Point {
  const free = (q: Point) =>
    q.x >= 0 && q.y >= 0 && q.x <= MAP_SIZE && q.y <= MAP_SIZE &&
    !occupied.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < CELL * 0.75);
  for (let ring = 0; ring < 20; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const q = { x: p.x + dx * CELL, y: p.y + dy * CELL };
        if (free(q)) return q;
      }
    }
  }
  return p;
}

export type CombatantInput = Omit<Combatant, "id" | "conditions" | "x" | "y"> &
  Partial<Pick<Combatant, "conditions" | "x" | "y">>;

/**
 * Prepares a stat block for the initiative order: fresh id, unique display
 * name, rolled initiative for monsters without one, and a map position.
 */
export function spawnCombatant(
  doc: CombatDoc,
  template: CombatantInput,
  opts: { position?: { x: number; y: number }; rollInitiative?: boolean; rng?: () => number } = {},
): Combatant {
  const spot = findFreeSpot(doc.combatants, opts.position ?? { x: template.x ?? 1000, y: template.y ?? 1000 });
  const c: Combatant = {
    ...structuredClone(template),
    id: newId(),
    name: uniqueName(template.name, doc.combatants.map((x) => x.name)),
    conditions: [...(template.conditions ?? [])],
    ...spot,
  };
  if (opts.rollInitiative) c.initiative = rollD20(opts.rng);
  insertByInitiative(doc.combatants, c);
  return c;
}

export function removeCombatant(doc: CombatDoc, id: string) {
  const idx = doc.combatants.findIndex((c) => c.id === id);
  if (idx < 0) return;
  if (doc.activeId === id) {
    const next = doc.combatants[idx + 1] ?? doc.combatants[0];
    doc.activeId = next && next.id !== id ? next.id : null;
  }
  doc.combatants.splice(idx, 1);
}

const find = (doc: CombatDoc, id: string) => doc.combatants.find((c) => c.id === id);

/** 5e damage: temporary hit points are lost first, HP never drops below 0. */
export function applyDamage(doc: CombatDoc, id: string, amount: number) {
  const c = find(doc, id);
  if (!c || !(amount > 0)) return;
  const absorbed = Math.min(c.hpTemp, amount);
  c.hpTemp -= absorbed;
  c.hpCurrent = Math.max(0, c.hpCurrent - (amount - absorbed));
}

export function applyHealing(doc: CombatDoc, id: string, amount: number) {
  const c = find(doc, id);
  if (!c || !(amount > 0)) return;
  c.hpCurrent = Math.min(c.hpMax, c.hpCurrent + amount);
}

/** 5e temp HP doesn't stack: keep the higher value. */
export function grantTempHp(doc: CombatDoc, id: string, amount: number) {
  const c = find(doc, id);
  if (!c || !(amount > 0)) return;
  c.hpTemp = Math.max(c.hpTemp, amount);
}

export function addCondition(doc: CombatDoc, id: string, condition: string) {
  const c = find(doc, id);
  const value = condition.trim();
  if (c && value && !c.conditions.includes(value)) c.conditions.push(value);
}

export function removeCondition(doc: CombatDoc, id: string, condition: string) {
  const c = find(doc, id);
  if (c) c.conditions = c.conditions.filter((x) => x !== condition);
}

export function setActive(doc: CombatDoc, id: string | null) {
  doc.activeId = id;
  if (id && doc.round < 1) doc.round = 1;
}

/** Advances to the next combatant; wrapping around starts a new round. */
export function nextTurn(doc: CombatDoc) {
  const list = doc.combatants;
  if (list.length === 0) return;
  const idx = list.findIndex((c) => c.id === doc.activeId);
  if (idx < 0) {
    doc.activeId = list[0]!.id;
    doc.round = Math.max(1, doc.round);
    return;
  }
  if (idx === list.length - 1) doc.round = Math.max(1, doc.round) + 1;
  doc.activeId = list[(idx + 1) % list.length]!.id;
}

export function previousTurn(doc: CombatDoc) {
  const list = doc.combatants;
  if (list.length === 0) return;
  const idx = list.findIndex((c) => c.id === doc.activeId);
  if (idx < 0) return;
  if (idx === 0) {
    if (doc.round <= 1) return;
    doc.round -= 1;
  }
  doc.activeId = list[(idx - 1 + list.length) % list.length]!.id;
}

export function endCombat(doc: CombatDoc) {
  doc.activeId = null;
  doc.round = 0;
}

/** Snapshot the current fight; new stat blocks are also added to the roster. */
export function saveEncounter(library: LibraryDoc, combat: CombatDoc, name: string): Encounter {
  const encounter: Encounter = {
    id: newId(),
    name,
    combatants: structuredClone(combat.combatants),
  };
  library.encounters.push(encounter);
  for (const c of combat.combatants) {
    const base = baseName(c.name);
    if (!library.roster.some((r) => r.name === base || r.name === c.name)) {
      library.roster.push({ ...structuredClone(c), id: newId(), name: base, conditions: [] });
    }
  }
  return encounter;
}

export function loadEncounter(combat: CombatDoc, encounter: Encounter) {
  combat.combatants = structuredClone(encounter.combatants).map((c) => ({ ...c, id: newId() }));
  combat.activeId = null;
  combat.round = 0;
}

/**
 * Adds a copy of a stat block to a saved encounter. `template` must be plain
 * data (not an Immer draft): structuredClone throws on drafts.
 */
export function addToEncounter(library: LibraryDoc, encounterId: string, template: Combatant) {
  const enc = library.encounters.find((e) => e.id === encounterId);
  if (!enc) return;
  enc.combatants.push({
    ...structuredClone(template),
    id: newId(),
    name: uniqueName(template.name, enc.combatants.map((c) => c.name)),
    conditions: [],
  });
}

export type HpChange = { kind: "damage" | "heal" | "temp"; amount: number };

/**
 * Quick HP entry: "7" or "-7" deals damage, "+5" heals, "t5" grants
 * temporary HP. Returns null for anything else.
 */
export function parseHpInput(input: string): HpChange | null {
  const m = /^\s*([-+]|t\s*)?\s*(\d+)\s*$/i.exec(input);
  if (!m) return null;
  const amount = Number(m[2]);
  if (!(amount > 0)) return null;
  const sign = (m[1] ?? "").trim().toLowerCase();
  return { kind: sign === "+" ? "heal" : sign === "t" ? "temp" : "damage", amount };
}

/** Health band a player is allowed to see for an enemy. */
export function healthStatus(c: Combatant): "healthy" | "bloodied" | "down" {
  if (c.hpCurrent <= 0) return "down";
  if (c.hpMax > 0 && c.hpCurrent <= c.hpMax / 2) return "bloodied";
  return "healthy";
}

const PLAYER_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#eab308", "#ec4899", "#06b6d4"];
const MONSTER_COLORS = ["#ef4444", "#e11d48", "#ea580c", "#b45309", "#991b1b"];

/** Distinct ring colour per duplicate ("Goblin 1/2/3") so tokens are tellable apart. */
export function tokenColor(c: Combatant, all: readonly Combatant[]): string {
  const base = baseName(c.name);
  const index = all.filter((x) => baseName(x.name) === base).findIndex((x) => x.id === c.id);
  const palette = c.isMonster ? MONSTER_COLORS : PLAYER_COLORS;
  return palette[Math.max(0, index) % palette.length]!;
}

export const initials = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
