import { MAX_TOWN_LOG, type Building, type BuildingType, type Settler, type Town, type TownEvent } from "../domain/town";
import { axesOf, reputationText } from "../domain/alignment";
import { mulberry32 } from "./rng";
import type { Faction } from "../domain/faction";
import { regionDay } from "./region";
import { num } from "./tuning";

/**
 * Towns and the world clock. Pure: every function takes a town and returns a
 * new one, and randomness comes from the seed stored in the town, so a
 * catch-up after a long absence gives the same result wherever it runs.
 *
 * Time: while the player is in the game, 1 real minute = 1 game hour. While
 * they're away the world runs at real speed (1 real hour = 1 game hour), and
 * catching up is capped at 30 game days.
 */

/** Real milliseconds per game hour while playing / while away, and the catch-up cap (all tunable). */
export const onlineMsPerHour = () => num("time.onlineMinutesPerHour") * 60_000;
export const offlineMsPerHour = () => num("time.offlineHoursPerHour") * 3_600_000;
export const maxCatchUpHours = () => num("time.maxCatchUpDays") * 24;
/** Daily production and events happen at this hour (morning). */
export const DAWN = 6;

// --- Renown --------------------------------------------------------------------------

const tier = (level: number, title: string, reach: string) => ({
  level,
  title,
  reach,
  get maxBuildings() {
    return num(`renown.buildings${level}`);
  },
});
export const RENOWN = [
  tier(1, "Unknown", "a village name at most"),
  tier(2, "Known in the valley", "people come looking for you"),
  tier(3, "Known across the region", "rivals take notice"),
  tier(4, "Known across the realm", "lords and factions take notice"),
  tier(5, "A hero of the realm", "songs are sung in far-off taverns"),
];
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

const STATIC_BUILDINGS: Record<BuildingType, BuildingDef> = {
  hall: { name: "Town hall", icon: "🏛", description: "The heart of the town. Beds for 2; gathers 1 food and 1 materials a day.", cost: { gold: 0, materials: 0 }, hours: 0, staffed: false, beds: 2, max: 1 },
  house: { name: "House", icon: "🏠", description: "Beds for 3 more settlers.", cost: { gold: 15, materials: 10 }, hours: 8, staffed: false, beds: 3 },
  farm: { name: "Farm", icon: "🌾", description: "4 food a day. Each settler eats 1.", cost: { gold: 10, materials: 6 }, hours: 10, staffed: true },
  lumber: { name: "Lumber camp", icon: "🪓", description: "3 materials a day for building.", cost: { gold: 10, materials: 0 }, hours: 8, staffed: true },
  market: { name: "Market", icon: "⚖", description: "2 gold a day, plus 1 for every two settlers. Caravans pay better.", cost: { gold: 25, materials: 15 }, hours: 16, staffed: true, max: 1 },
  tavern: { name: "Tavern", icon: "🍺", description: "2 gold a day, and travellers looking for a home stop by far more often.", cost: { gold: 30, materials: 15 }, hours: 16, staffed: true, max: 1 },
  apothecary: { name: "Apothecary", icon: "⚗", description: "Gathers a herb a day and brews a Potion of Healing every 3 days; brews more to order. Your next adventure takes the potions along.", cost: { gold: 40, materials: 10 }, hours: 20, staffed: true, max: 1 },
  watchtower: { name: "Watchtower", icon: "🗼", description: "Halves the chance of thieves.", cost: { gold: 20, materials: 20 }, hours: 16, staffed: true, max: 2 },
  smithy: { name: "Smithy", icon: "⚒", description: "Fits mods to your heroes' weapons, armour and spell foci.", cost: { gold: 50, materials: 25 }, hours: 24, staffed: true, max: 1 },
  shrine: { name: "Shrine", icon: "🕯", description: "Treats lasting injuries and, for a great price, raises the fallen. A place to pray lifts spirits.", cost: { gold: 40, materials: 20 }, hours: 16, staffed: true, max: 1 },
};

/** Descriptions that quote tunable numbers. */
const DESCRIPTIONS: Partial<Record<BuildingType, () => string>> = {
  hall: () => `The heart of the town. Beds for ${num("town.hallBeds")}; gathers ${num("prod.hallFood")} food and ${num("prod.hallMaterials")} materials a day.`,
  house: () => `Beds for ${num("town.houseBeds")} more settlers.`,
  farm: () => `${num("prod.farmFood")} food a day. Each settler eats ${num("prod.foodPerSettler")}.`,
  lumber: () => `${num("prod.lumberMaterials")} materials a day for building.`,
  market: () => `${num("prod.marketGold")} gold a day, plus 1 for every ${num("prod.marketSettlersPerGold")} settlers. Caravans pay better.`,
  tavern: () => `${num("prod.tavernGold")} gold a day, and travellers looking for a home stop by far more often.`,
  apothecary: () => `Gathers ${num("prod.apothecaryHerbs")} herb a day and brews a Potion of Healing every ${num("prod.potionEveryDays")} days; brews more to order. Your next adventure takes the potions along.`,
};

/** The building catalogue, with costs, build times and beds read from the DM's tuning. */
export const BUILDINGS = Object.fromEntries(
  (Object.entries(STATIC_BUILDINGS) as [BuildingType, BuildingDef][]).map(([type, def]) => [
    type,
    Object.defineProperties(
      { ...def },
      {
        cost: { get: () => (type === "hall" ? def.cost : { gold: num(`building.${type}.gold`), materials: num(`building.${type}.materials`) }), enumerable: true },
        hours: { get: () => (type === "hall" ? 0 : num(`building.${type}.hours`)), enumerable: true },
        beds: { get: () => (type === "hall" ? num("town.hallBeds") : type === "house" ? num("town.houseBeds") : undefined), enumerable: true },
        description: { get: () => DESCRIPTIONS[type]?.() ?? def.description, enumerable: true },
      },
    ),
  ]),
) as Record<BuildingType, BuildingDef>;

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

/** `reputation` starts from the founding heroes' alignments (see startingReputation). */
export function foundTown(name: string, now: number, seed: number, gold = num("town.startGold"), reputation = { law: 0, good: 0 }): Town {
  return {
    name: name.trim() || "New town",
    hours: DAWN,
    at: now,
    simulated: DAWN,
    gold,
    food: num("town.startFood"),
    materials: num("town.startMaterials"),
    stash: {},
    components: { iron: 0, herbs: 0, dust: 0 },
    helps: { day: "", used: 0 },
    reputation,
    spirit: 0,
    lastTheft: -1000,
    threats: [],
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
  /** The region's factions (built-in and the DM's). */
  factions?: Faction[];
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
  const away = Math.min(maxCatchUpHours(), Math.max(0, (now - town.at) / offlineMsPerHour()));
  return { ...advance(town, away, now, ctx), hours: away };
}

// --- What settlers think -----------------------------------------------------------------

export interface Opinion {
  /** Where their mood is heading (0–100). */
  target: number;
  /** Why, biggest effects first. */
  reasons: { text: string; delta: number }[];
}

const REP_MAX = 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** How someone with this alignment feels about living in the town right now. */
export function opinion(t: Town, alignment: string, ctx: SimContext, hour = t.hours): Opinion {
  const reasons: Opinion["reasons"] = [];
  const add = (delta: number, text: string) => delta !== 0 && reasons.push({ delta, text });
  const mouths = Math.max(1, t.settlers.length);
  const days = t.food / mouths;
  if (days < 1) add(-25, "We're going hungry");
  else if (days < 3) add(-8, "Food is running short");
  else if (days >= 7) add(6, "Plenty to eat");
  if (t.settlers.length > beds(t)) add(-15, "We're sleeping on top of each other");
  if (hour - t.lastTheft < 7 * 24) add(-12, "Thieves were here this week");
  if (working(t, "watchtower")) add(6, "The watch keeps us safe");
  if (working(t, "tavern")) add(5, "A good tavern");
  if (working(t, "market")) add(4, "A busy market");
  if (working(t, "shrine")) add(4, "A shrine to pray at");
  if (t.spirit >= 5) add(Math.round(t.spirit / 2), "Proud of our heroes");
  else if (t.spirit <= -5) add(Math.round(t.spirit / 2), "Our heroes keep failing");
  if (ctx.ownerAway) add(-6, "The hall stands empty");
  // Beliefs: do the heroes act the way this person thinks is right?
  const me = axesOf(alignment);
  const fit = (me.law * t.reputation.law + me.good * t.reputation.good) / REP_MAX;
  if (Math.abs(fit) >= 0.2) add(Math.round(fit * 15), fit > 0 ? `Likes how the heroes are ${reputationText(t.reputation)}` : `Can't stand how ${reputationText(t.reputation)} the heroes are`);
  const target = clamp(55 + reasons.reduce((n, r) => n + r.delta, 0), 0, 100);
  return { target, reasons: reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}

/** How attractive the town looks to a newcomer (0–100). */
export const appeal = (t: Town, ctx: SimContext) => opinion(t, "Neutral", ctx).target;

const say1 = (o: Opinion, mood: "good" | "bad") => (mood === "bad" ? o.reasons.find((r) => r.delta < 0) : o.reasons.find((r) => r.delta > 0))?.text ?? "";

const ALIGNMENT_ODDS: [string, number][] = [
  ["Neutral Good", 3],
  ["Neutral", 3],
  ["Lawful Good", 2],
  ["Chaotic Good", 2],
  ["Lawful Neutral", 2],
  ["Chaotic Neutral", 2],
  ["Lawful Evil", 0.5],
  ["Neutral Evil", 0.5],
  ["Chaotic Evil", 0.5],
];
function randomAlignment(rng: () => number): string {
  let r = rng() * ALIGNMENT_ODDS.reduce((n, [, w]) => n + w, 0);
  for (const [a, w] of ALIGNMENT_ODDS) if ((r -= w) <= 0) return a;
  return "Neutral";
}

/** Average alignment of the founding heroes, as a starting reputation. */
export function startingReputation(alignments: string[]): { law: number; good: number } {
  if (!alignments.length) return { law: 0, good: 0 };
  const sum = alignments.map(axesOf).reduce((a, b) => ({ law: a.law + b.law, good: a.good + b.good }));
  return { law: Math.round((sum.law / alignments.length) * 3), good: Math.round((sum.good / alignments.length) * 3) };
}

/** Deeds from an adventure move the town's reputation. */
export function applyDeeds(t: Town, deeds: { law: number; good: number }): Town {
  if (!deeds.law && !deeds.good) return t;
  const reputation = { law: clamp(t.reputation.law + deeds.law, -REP_MAX, REP_MAX), good: clamp(t.reputation.good + deeds.good, -REP_MAX, REP_MAX) };
  return { ...t, reputation, log: [...t.log, { at: t.hours, text: `Word of the heroes' deeds spread. The town is now known as ${reputationText(reputation)}.`, tone: "info" as const }].slice(-MAX_TOWN_LOG) };
}

/** Triumphs lift the town's spirit; defeats and deaths sink it. */
export const lift = (t: Town, delta: number): Town => ({ ...t, spirit: clamp(t.spirit + delta, -20, 20) });

function newcomer(t: Town, h: number, rng: () => number, from: string): Settler {
  const taken = new Set(t.settlers.map((s) => s.name));
  const name = pick(NAMES.filter((n) => !taken.has(n)).concat(`${pick(NAMES, rng)} the Younger`), rng);
  return { id: `s${h}-${Math.floor(rng() * 1e6)}`, name, trade: pick(TRADES, rng), from, arrivedAt: h, alignment: randomAlignment(rng), mood: 60, mind: "" };
}

/** A staffed tavern can hire a worker on the spot. */
export const hireCost = () => num("settlers.hireCost");
export function hire(t: Town): Town {
  if (!working(t, "tavern")) throw new Error("Hiring needs a staffed tavern");
  if (t.settlers.length >= beds(t)) throw new Error("No free bed for a new worker");
  if (t.gold < hireCost()) throw new Error(`Needs ${hireCost()} gold`);
  const seeded = mulberry32(t.seed);
  const s = newcomer(t, Math.floor(t.hours), seeded.rng, "Hired at the tavern");
  return {
    ...t,
    gold: t.gold - hireCost(),
    seed: seeded.seed(),
    settlers: [...t.settlers, { ...s, mood: 55, mind: "Here for the wages" }],
    log: [...t.log, { at: t.hours, text: `Hired ${s.name}, a ${s.trade}, for ${hireCost()} gold.`, tone: "good" as const }].slice(-MAX_TOWN_LOG),
  };
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
  food += num("prod.hallFood") + num("prod.farmFood") * working(t, "farm");
  materials += num("prod.hallMaterials") + num("prod.lumberMaterials") * working(t, "lumber");
  const markets = working(t, "market");
  gold += markets * (num("prod.marketGold") + Math.floor(t.settlers.length / Math.max(1, num("prod.marketSettlersPerGold")))) + num("prod.tavernGold") * working(t, "tavern");
  let components = t.components;
  if (working(t, "apothecary")) components = { ...components, herbs: components.herbs + num("prod.apothecaryHerbs") };
  if (working(t, "apothecary") && day(h) % Math.max(1, Math.round(num("prod.potionEveryDays"))) === 0) {
    stash["potion-healing"] = (stash["potion-healing"] ?? 0) + 1;
    say("The apothecary brewed a Potion of Healing.", "good");
  }
  // Everyone eats; whoever goes without is miserable.
  const settlers: Settler[] = t.settlers;
  let hungry = 0;
  food -= settlers.length * num("prod.foodPerSettler");
  if (food < 0) {
    hungry = -food;
    food = 0;
    say(`Food ran out: ${hungry} settler${hungry === 1 ? "" : "s"} went hungry.`, "bad");
  }
  t = { ...t, gold, food, materials, stash, settlers, components };

  // Events.
  const p = power(t, ctx);
  const watch = working(t, "watchtower");
  const thiefChance = (num("events.thief") + p / Math.max(1, num("events.thiefPowerDivisor"))) * (watch ? 0.5 : 1) * (ctx.ownerAway ? 1.5 : 1);
  if (t.gold >= 10 && rng() < thiefChance) {
    const lost = Math.max(1, Math.round(t.gold * (0.1 + rng() * 0.15)));
    t = { ...t, gold: t.gold - lost, lastTheft: h };
    say(`Thieves broke into the treasury and made off with ${lost} gold.${watch ? "" : " A watchtower would help."}`, "bad");
  }
  // Moods drift towards what each settler thinks of the town; the unhappy leave, the happy bring others.
  const moods = t.settlers.map((s0) => {
    const o = opinion(t, s0.alignment, ctx, h);
    const mood = clamp(Math.round(s0.mood + (o.target - s0.mood) * num("settlers.moodDrift") - (hungry > 0 ? 15 : 0)), 0, 100);
    return { ...s0, mood, mind: say1(o, mood < 50 ? "bad" : "good") };
  });
  // At most one person gives up each day: the unhappiest, if they're miserable.
  const unhappiest = [...moods].sort((a, b) => a.mood - b.mood)[0];
  if (unhappiest && unhappiest.mood < num("settlers.leaveBelow") && rng() < num("settlers.leaveChance")) {
    say(`${unhappiest.name} the ${unhappiest.trade || "settler"} packed up and left: "${unhappiest.mind || "This isn't the place for me"}."`, "bad");
    t = { ...t, settlers: moods.filter((s) => s.id !== unhappiest.id) };
  } else t = { ...t, settlers: moods };
  const free = beds(t) - t.settlers.length;
  const happy = t.settlers.filter((s) => s.mood >= num("settlers.inviteFrom")).length;
  if (free > 0 && happy && rng() < num("settlers.inviteChance") * happy) {
    const s = newcomer(t, h, rng, "Invited by a happy neighbour");
    t = { ...t, settlers: [...t.settlers, { ...s, mood: 70, mind: "Heard good things" }] };
    say(`${s.name}, a ${s.trade}, came because a friend here wrote how good life is.`, "good");
  } else if (free > 0) {
    // Travellers: the more appealing the town, the more stop by; the tavern spreads the word.
    const chance = clamp((appeal(t, ctx) - 30) / 150, num("settlers.travellerMin"), num("settlers.travellerMax")) + (working(t, "tavern") ? num("settlers.tavernBonus") : 0);
    if (rng() < chance) {
      const s = newcomer(t, h, rng, working(t, "tavern") ? "Heard about the town at the tavern" : "Wandered in from the road");
      const o = opinion(t, s.alignment, ctx, h);
      if (o.target >= num("settlers.stayAt")) {
        t = { ...t, settlers: [...t.settlers, { ...s, mood: o.target, mind: say1(o, "good") }] };
        say(`${s.name}, a ${s.trade} (${s.alignment}), arrived and asked to stay.`, "good");
      } else say(`${s.name}, a ${s.trade}, looked around and moved on: "${say1(o, "bad") || "Not for me"}."`, "info");
    }
  } else if (rng() < 0.05) {
    say("A traveller asked for a bed, but every bed is taken. Build a house.", "info");
  }
  // The region takes notice.
  if (ctx.factions?.length) t = regionDay(t, h, rng, ctx.factions, { power: power(t, ctx), watch: working(t, "watchtower") > 0, renown: ctx.renown }, say);
  // Pride in the heroes fades.
  if (t.spirit !== 0) t = { ...t, spirit: t.spirit - Math.sign(t.spirit) };
  if (rng() < num("events.caravan")) {
    const paid = roll(1, 10, rng) + (markets ? 10 : 2);
    t = { ...t, gold: t.gold + paid };
    say(`A merchant caravan passed through${markets ? " and traded at the market" : ""}: +${paid} gold.`, "good");
  }
  if (rng() < num("events.storm") && t.materials > 0) {
    const lost = Math.min(t.materials, roll(1, 6, rng));
    t = { ...t, materials: t.materials - lost };
    say(`A storm battered the town: ${lost} materials ruined.`, "bad");
  }
  if (working(t, "farm") && rng() < num("events.harvest")) {
    t = { ...t, food: t.food + 5, components: { ...t.components, herbs: t.components.herbs + 1 } };
    say("A bumper harvest: +5 food and a basket of herbs.", "good");
  }
  return t;
}

// --- Skipping time ---------------------------------------------------------------------

/** "Help out" (a day's work) can be used once per bed in the town, per real day. */
export const helpsLeft = (t: Town, today: string) => Math.max(0, Math.floor(beds(t) * num("time.helpsPerBed")) - (t.helps.day === today ? t.helps.used : 0));
export const useHelp = (t: Town, today: string): Town => ({ ...t, helps: { day: today, used: (t.helps.day === today ? t.helps.used : 0) + 1 } });

/** Sleep is for the night (20:00–06:00) and lasts until dawn; null during the day. */
export function sleepHours(hours: number): number | null {
  const h = Math.floor(hours) % 24;
  if (h >= num("time.sleepFrom")) return 24 - h + DAWN;
  if (h < DAWN) return DAWN - h;
  return null;
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
export function welcome(t: Town, s: Pick<Settler, "name" | "trade" | "from"> & Partial<Settler>, id: string): Town {
  if (t.settlers.some((x) => x.name === s.name)) return t;
  return {
    ...t,
    settlers: [...t.settlers, { alignment: "Neutral Good", mood: 75, mind: "Grateful to the heroes", ...s, id, arrivedAt: Math.floor(t.hours) }],
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
