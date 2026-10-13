import { MAX_TOWN_LOG, type Building, type BuildingType, type Settler, type Town, type TownEvent } from "../domain/town";
import { mulberry32 } from "./rng";

/**
 * Towns and the world clock. Pure: every function takes a town and returns a
 * new one, and randomness comes from the seed stored in the town, so a
 * catch-up after a long absence gives the same result wherever it runs.
 *
 * Time: while the player is in the game, 1 real minute = 1 game hour. While
 * they're away the world runs at real speed (1 real hour = 1 game hour), and
 * catching up is capped at 30 game days.
 */

export const ONLINE_MS_PER_HOUR = 60_000;
export const OFFLINE_MS_PER_HOUR = 3_600_000;
export const MAX_CATCH_UP_HOURS = 30 * 24;
/** Daily production and events happen at this hour (morning). */
export const DAWN = 6;

// --- Renown --------------------------------------------------------------------------

export const RENOWN = [
  { level: 1, title: "Unknown", reach: "a village name at most", maxBuildings: 4 },
  { level: 2, title: "Known in the valley", reach: "people come looking for you", maxBuildings: 7 },
  { level: 3, title: "Known across the region", reach: "rivals take notice", maxBuildings: 11 },
] as const;
export const renownOf = (level: number) => RENOWN[Math.min(RENOWN.length, Math.max(1, level)) - 1]!;

// --- Buildings ------------------------------------------------------------------------

export interface BuildingDef {
  name: string;
  icon: string;
  description: string;
  cost: { gold: number; materials: number };
  /** Game hours to build. */
  hours: number;
  /** Needs a settler to work it. */
  staffed: boolean;
  /** Beds for settlers. */
  beds?: number;
  /** At most this many in a town. */
  max?: number;
  /** Not available yet (comes in a later milestone). */
  locked?: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hall: { name: "Town hall", icon: "🏛", description: "The heart of the town. Beds for 2; gathers 1 food and 1 materials a day.", cost: { gold: 0, materials: 0 }, hours: 0, staffed: false, beds: 2, max: 1 },
  house: { name: "House", icon: "🏠", description: "Beds for 3 more settlers.", cost: { gold: 15, materials: 10 }, hours: 8, staffed: false, beds: 3 },
  farm: { name: "Farm", icon: "🌾", description: "4 food a day. Each settler eats 1.", cost: { gold: 10, materials: 6 }, hours: 10, staffed: true },
  lumber: { name: "Lumber camp", icon: "🪓", description: "3 materials a day for building.", cost: { gold: 10, materials: 0 }, hours: 8, staffed: true },
  market: { name: "Market", icon: "⚖", description: "2 gold a day, plus 1 for every two settlers. Caravans pay better.", cost: { gold: 25, materials: 15 }, hours: 16, staffed: true, max: 1 },
  tavern: { name: "Tavern", icon: "🍺", description: "2 gold a day, and travellers looking for a home stop by far more often.", cost: { gold: 30, materials: 15 }, hours: 16, staffed: true, max: 1 },
  apothecary: { name: "Apothecary", icon: "⚗", description: "Brews a Potion of Healing every 3 days. Your next adventure takes them along.", cost: { gold: 40, materials: 10 }, hours: 20, staffed: true, max: 1 },
  watchtower: { name: "Watchtower", icon: "🗼", description: "Halves the chance of thieves.", cost: { gold: 20, materials: 20 }, hours: 16, staffed: true, max: 2 },
  smithy: { name: "Smithy", icon: "⚒", description: "Weapon and armour mods.", cost: { gold: 50, materials: 25 }, hours: 24, staffed: true, max: 1, locked: "Crafting comes in the next update (M9)." },
};

export const isBuilt = (b: Building) => b.readyAt === undefined;
export const built = (t: Town) => t.buildings.filter(isBuilt);
export const beds = (t: Town) => built(t).reduce((n, b) => n + (BUILDINGS[b.type].beds ?? 0), 0);

/** Which built buildings have a worker: settlers take jobs in the order buildings went up. */
export function staffing(t: Town): Map<string, boolean> {
  let free = t.settlers.length;
  const out = new Map<string, boolean>();
  for (const b of built(t)) {
    if (!BUILDINGS[b.type].staffed) continue;
    out.set(b.id, free > 0);
    if (free > 0) free--;
  }
  return out;
}
const working = (t: Town, type: BuildingType) => {
  const staff = staffing(t);
  return built(t).filter((b) => b.type === type && staff.get(b.id)).length;
};

/** Why this building can't be started now, or null if it can. */
export function cantBuild(t: Town, type: BuildingType, renown: number): string | null {
  const def = BUILDINGS[type];
  if (def.locked) return def.locked;
  if (type === "hall") return "Every town has one hall";
  const count = t.buildings.filter((b) => b.type === type).length;
  if (def.max !== undefined && count >= def.max) return `At most ${def.max}`;
  const r = renownOf(renown);
  if (t.buildings.length >= r.maxBuildings) return `A hero ${r.title.toLowerCase()} can have ${r.maxBuildings} buildings; more renown, more room`;
  if (t.buildings.some((b) => !isBuilt(b))) return "Builders are busy: one project at a time";
  if (t.gold < def.cost.gold) return `Needs ${def.cost.gold} gold`;
  if (t.materials < def.cost.materials) return `Needs ${def.cost.materials} materials`;
  return null;
}

// --- Founding and the clock -------------------------------------------------------------

export function foundTown(name: string, now: number, seed: number, gold = 30): Town {
  return {
    name: name.trim() || "New town",
    hours: DAWN,
    at: now,
    simulated: DAWN,
    gold,
    food: 6,
    materials: 10,
    stash: {},
    buildings: [{ id: "hall", type: "hall" }],
    settlers: [],
    log: [{ at: DAWN, text: `${name.trim() || "The town"} is founded.`, tone: "good" }],
    open: true,
    seed,
  };
}

export const day = (hours: number) => Math.floor(hours / 24) + 1;
export const clockText = (hours: number) => `Day ${day(hours)}, ${String(Math.floor(hours % 24)).padStart(2, "0")}:00`;
export function durationText(hours: number): string {
  const h = Math.floor(hours);
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return [d ? `${d} day${d === 1 ? "" : "s"}` : "", rest || !d ? `${rest} hour${rest === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
}

export interface SimContext {
  /** The owner's renown, and the renown of players living here. */
  renown: number;
  residents: number[];
  /** The owner is away living in someone else's town. */
  ownerAway?: boolean;
}

export const power = (t: Town, ctx: SimContext) => t.settlers.length + 2 * built(t).length + 5 * ctx.renown + 5 * ctx.residents.reduce((n, r) => n + r, 0);

/** Moves the clock forward and lives through every whole hour on the way. */
export function advance(town: Town, hours: number, now: number, ctx: SimContext): { town: Town; events: TownEvent[] } {
  const target = town.hours + Math.max(0, hours);
  let t: Town = { ...town, hours: target, at: now };
  const events: TownEvent[] = [];
  const seeded = mulberry32(t.seed);
  for (let h = Math.floor(town.simulated) + 1; h <= Math.floor(target); h++) {
    t = hour(t, h, seeded.rng, ctx, events);
    t.simulated = h;
  }
  t.seed = seeded.seed();
  if (events.length) t.log = [...t.log, ...events].slice(-MAX_TOWN_LOG);
  return { town: t, events };
}

/** Brings the town up to now after time away (real speed, capped). */
export function catchUp(town: Town, now: number, ctx: SimContext) {
  const away = Math.min(MAX_CATCH_UP_HOURS, Math.max(0, (now - town.at) / OFFLINE_MS_PER_HOUR));
  return { ...advance(town, away, now, ctx), hours: away };
}

const NAMES = ["Aldo", "Bryn", "Cora", "Dunstan", "Elsie", "Fenn", "Greta", "Hollis", "Ida", "Jory", "Kestrel", "Lute", "Mabry", "Nell", "Osric", "Pell", "Quinn", "Rosa", "Sten", "Tilda", "Ulric", "Vesna", "Wren", "Yorick"];
const TRADES = ["farmer", "woodcutter", "carpenter", "brewer", "herbalist", "hunter", "trader", "mason", "weaver", "guard"];
const pick = <T,>(xs: readonly T[], rng: () => number) => xs[Math.floor(rng() * xs.length)]!;
const roll = (n: number, sides: number, rng: () => number) => Array.from({ length: n }, () => Math.floor(rng() * sides) + 1).reduce((a, b) => a + b, 0);

function hour(t: Town, h: number, rng: () => number, ctx: SimContext, events: TownEvent[]): Town {
  const say = (text: string, tone: TownEvent["tone"] = "info") => events.push({ at: h, text, tone });
  // Construction finishes on the hour.
  if (t.buildings.some((b) => b.readyAt !== undefined && b.readyAt <= h)) {
    t = {
      ...t,
      buildings: t.buildings.map((b) => {
        if (b.readyAt === undefined || b.readyAt > h) return b;
        say(`${BUILDINGS[b.type].name} finished.`, "good");
        return { id: b.id, type: b.type };
      }),
    };
  }
  if (h % 24 !== DAWN) return t;

  // --- A new day: production, mouths to feed, then whatever the day brings.
  let { gold, food, materials } = t;
  const stash = { ...t.stash };
  food += 1 + 4 * working(t, "farm");
  materials += 1 + 3 * working(t, "lumber");
  const markets = working(t, "market");
  gold += markets * (2 + Math.floor(t.settlers.length / 2)) + 2 * working(t, "tavern");
  if (working(t, "apothecary") && day(h) % 3 === 0) {
    stash["potion-healing"] = (stash["potion-healing"] ?? 0) + 1;
    say("The apothecary brewed a Potion of Healing.", "good");
  }
  let settlers: Settler[] = t.settlers;
  food -= settlers.length;
  if (food < 0) {
    food = 0;
    const leaver = settlers.at(-1);
    if (leaver) {
      settlers = settlers.slice(0, -1);
      say(`Food ran out. ${leaver.name} the ${leaver.trade || "settler"} left to find a better life.`, "bad");
    }
  }
  t = { ...t, gold, food, materials, stash, settlers };

  // Events.
  const p = power(t, ctx);
  const watch = working(t, "watchtower");
  const thiefChance = (0.06 + p / 400) * (watch ? 0.5 : 1) * (ctx.ownerAway ? 1.5 : 1);
  if (t.gold >= 10 && rng() < thiefChance) {
    const lost = Math.max(1, Math.round(t.gold * (0.1 + rng() * 0.15)));
    t = { ...t, gold: t.gold - lost };
    say(`Thieves broke into the treasury and made off with ${lost} gold.${watch ? "" : " A watchtower would help."}`, "bad");
  }
  const travellerChance = working(t, "tavern") ? 0.3 : 0.1;
  if (t.settlers.length < beds(t) && rng() < travellerChance) {
    const name = pick(NAMES.filter((n) => !t.settlers.some((s) => s.name === n)).concat("Ash"), rng);
    const trade = pick(TRADES, rng);
    t = { ...t, settlers: [...t.settlers, { id: `s${h}`, name, trade, from: working(t, "tavern") ? "Heard about the town at the tavern" : "Wandered in from the road", arrivedAt: h }] };
    say(`${name}, a ${trade}, arrived and asked to stay.`, "good");
  } else if (t.settlers.length >= beds(t) && rng() < 0.05) {
    say("A traveller asked for a bed, but every bed is taken. Build a house.", "info");
  }
  if (rng() < 0.08) {
    const paid = roll(1, 10, rng) + (markets ? 10 : 2);
    t = { ...t, gold: t.gold + paid };
    say(`A merchant caravan passed through${markets ? " and traded at the market" : ""}: +${paid} gold.`, "good");
  }
  if (rng() < 0.05 && t.materials > 0) {
    const lost = Math.min(t.materials, roll(1, 6, rng));
    t = { ...t, materials: t.materials - lost };
    say(`A storm battered the town: ${lost} materials ruined.`, "bad");
  }
  if (working(t, "farm") && rng() < 0.06) {
    t = { ...t, food: t.food + 5 };
    say("A bumper harvest: +5 food.", "good");
  }
  return t;
}

// --- Actions --------------------------------------------------------------------------

export function startBuilding(t: Town, type: BuildingType, renown: number, id: string): Town {
  const why = cantBuild(t, type, renown);
  if (why) throw new Error(why);
  const def = BUILDINGS[type];
  return {
    ...t,
    gold: t.gold - def.cost.gold,
    materials: t.materials - def.cost.materials,
    buildings: [...t.buildings, { id, type, readyAt: Math.floor(t.hours) + def.hours }],
    log: [...t.log, { at: t.hours, text: `Work began on a ${def.name.toLowerCase()} (${def.hours} hours).`, tone: "info" as const }].slice(-MAX_TOWN_LOG),
  };
}

/** Someone from the story moves in (no bed needed: they'll make do). */
export function welcome(t: Town, s: Omit<Settler, "id" | "arrivedAt">, id: string): Town {
  if (t.settlers.some((x) => x.name === s.name)) return t;
  return {
    ...t,
    settlers: [...t.settlers, { ...s, id, arrivedAt: Math.floor(t.hours) }],
    log: [...t.log, { at: t.hours, text: `${s.name}${s.trade ? `, a ${s.trade},` : ""} moved in. ${s.from}.`, tone: "good" as const }].slice(-MAX_TOWN_LOG),
  };
}

/** Gold and potions brought home from an adventure. */
export function bringHome(t: Town, gold: number, potions: Record<string, number>, from: string): Town {
  const stash = { ...t.stash };
  for (const [k, n] of Object.entries(potions)) if (n > 0) stash[k] = (stash[k] ?? 0) + n;
  const count = Object.values(potions).reduce((a, b) => a + Math.max(0, b), 0);
  const parts = [gold > 0 ? `${gold} gold` : "", count ? `${count} potion${count === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  if (!parts) return t;
  return { ...t, gold: t.gold + gold, stash, log: [...t.log, { at: t.hours, text: `The heroes came home from ${from} with ${parts}.`, tone: "good" as const }].slice(-MAX_TOWN_LOG) };
}

/** Potions leave with the party on an adventure. */
export function takeStash(t: Town): { town: Town; potions: Record<string, number> } {
  return { town: { ...t, stash: {} }, potions: { ...t.stash } };
}

/** A summary of what changed while the player was away. */
export function awayReport(before: Town, after: Town, events: TownEvent[], hours: number) {
  return {
    hours,
    gold: after.gold - before.gold,
    food: after.food - before.food,
    materials: after.materials - before.materials,
    settlers: after.settlers.length - before.settlers.length,
    events,
  };
}
export type AwayReport = ReturnType<typeof awayReport>;
