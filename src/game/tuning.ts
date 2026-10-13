/**
 * Every number the DM can tune from the Game balance page. Game rules read
 * them through `num(key)`; the DM's overrides (stored in the synced library)
 * are applied with `setTuning`, so changes reach every player at once.
 * Defaults here are the game's out-of-the-box values.
 */

export interface TuningField {
  key: string;
  label: string;
  group: string;
  default: number;
  /** Shown under the field. */
  help?: string;
  min?: number;
  max?: number;
  step?: number;
}

const f = (group: string, key: string, label: string, def: number, help?: string, opts: Partial<TuningField> = {}): TuningField => ({ key, label, group, default: def, help, min: 0, ...opts });

const BUILDING_DEFAULTS: [string, string, number, number, number][] = [
  // type, name, gold, materials, hours
  ["house", "House", 15, 10, 8],
  ["farm", "Farm", 10, 6, 10],
  ["lumber", "Lumber camp", 10, 0, 8],
  ["market", "Market", 25, 15, 16],
  ["tavern", "Tavern", 30, 15, 16],
  ["apothecary", "Apothecary", 40, 10, 20],
  ["watchtower", "Watchtower", 20, 20, 16],
  ["smithy", "Smithy", 50, 25, 24],
];

const MOD_DEFAULTS: [string, string, number, number, number, number, number][] = [
  // id, name, gold, iron, herbs, dust, hours
  ["mod-sharp", "Honed edge", 10, 2, 0, 0, 3],
  ["mod-balanced", "Balanced grip", 15, 3, 0, 0, 4],
  ["mod-flame", "Fire rune", 30, 2, 0, 2, 6],
  ["mod-plate", "Riveted plates", 25, 4, 0, 0, 6],
  ["mod-crystal", "Focus crystal", 30, 0, 0, 3, 6],
  ["mod-lens", "Splitting lens", 25, 1, 0, 2, 4],
];

const BREW_DEFAULTS: [string, string, number, number, number, number][] = [
  // item id, name, gold, herbs, dust, hours
  ["potion-healing", "Potion of Healing", 5, 2, 0, 2],
  ["potion-greater-healing", "Potion of Greater Healing", 20, 4, 1, 6],
];

export const TUNING_FIELDS: TuningField[] = [
  // Time
  f("Time", "time.onlineMinutesPerHour", "Real minutes per game hour (while playing)", 1, "1 = a game day takes 24 real minutes.", { min: 0.1, step: 0.1 }),
  f("Time", "time.offlineHoursPerHour", "Real hours per game hour (while away)", 1, "1 = a week away is a game week; 0.5 = it counts double.", { min: 0.05, step: 0.05 }),
  f("Time", "time.maxCatchUpDays", "Most game days caught up after an absence", 30, undefined, { min: 1 }),
  f("Time", "time.helpsPerBed", "\"Help out\" uses per bed per real day", 1, undefined, { step: 0.5 }),
  f("Time", "time.sleepFrom", "Sleep allowed from (hour)", 20, "Until dawn (06:00).", { max: 23 }),
  f("Time", "time.choiceHours", "Game hours per adventure choice", 1),

  // Starting a town
  f("Founding", "town.startGold", "Starting gold", 30),
  f("Founding", "town.startFood", "Starting food", 6),
  f("Founding", "town.startMaterials", "Starting materials", 10),
  f("Founding", "town.hallBeds", "Beds in the town hall", 2),
  f("Founding", "town.houseBeds", "Beds per house", 3),

  // Buildings
  ...BUILDING_DEFAULTS.flatMap(([type, name, gold, materials, hours]) => [
    f("Buildings", `building.${type}.gold`, `${name}: gold`, gold),
    f("Buildings", `building.${type}.materials`, `${name}: materials`, materials),
    f("Buildings", `building.${type}.hours`, `${name}: build hours`, hours),
  ]),
  f("Buildings", "renown.buildings1", "Most buildings at renown 1", 4),
  f("Buildings", "renown.buildings2", "Most buildings at renown 2", 7),
  f("Buildings", "renown.buildings3", "Most buildings at renown 3", 11),
  f("Buildings", "renown.buildings4", "Most buildings at renown 4", 15),
  f("Buildings", "renown.buildings5", "Most buildings at renown 5", 20),

  // Daily production
  f("Production (per day)", "prod.hallFood", "Food gathered by the hall", 1),
  f("Production (per day)", "prod.hallMaterials", "Materials gathered by the hall", 1),
  f("Production (per day)", "prod.farmFood", "Food per staffed farm", 4),
  f("Production (per day)", "prod.lumberMaterials", "Materials per staffed lumber camp", 3),
  f("Production (per day)", "prod.marketGold", "Gold per staffed market", 2),
  f("Production (per day)", "prod.marketSettlersPerGold", "Market: settlers per extra gold", 2, "2 = +1 gold for every two settlers."),
  f("Production (per day)", "prod.tavernGold", "Gold per staffed tavern", 2),
  f("Production (per day)", "prod.apothecaryHerbs", "Herbs per staffed apothecary", 1),
  f("Production (per day)", "prod.potionEveryDays", "Apothecary: free potion every … days", 3, undefined, { min: 1 }),
  f("Production (per day)", "prod.foodPerSettler", "Food eaten per settler", 1),

  // Settlers
  f("Settlers", "settlers.travellerMin", "Traveller chance per day: minimum", 0.02, "Grows with the town's appeal.", { step: 0.01, max: 1 }),
  f("Settlers", "settlers.travellerMax", "Traveller chance per day: maximum", 0.3, undefined, { step: 0.01, max: 1 }),
  f("Settlers", "settlers.tavernBonus", "Extra traveller chance with a tavern", 0.15, undefined, { step: 0.01, max: 1 }),
  f("Settlers", "settlers.stayAt", "Newcomers stay if they rate the town at least", 35, "Out of 100.", { max: 100 }),
  f("Settlers", "settlers.leaveBelow", "The unhappiest may leave below mood", 20, undefined, { max: 100 }),
  f("Settlers", "settlers.leaveChance", "…with this chance per day", 0.6, undefined, { step: 0.05, max: 1 }),
  f("Settlers", "settlers.inviteFrom", "Happy settlers (mood ≥) invite friends", 80, undefined, { max: 100 }),
  f("Settlers", "settlers.inviteChance", "Invite chance per happy settler per day", 0.08, undefined, { step: 0.01, max: 1 }),
  f("Settlers", "settlers.moodDrift", "How fast moods follow opinions (0–1)", 0.3, undefined, { step: 0.05, max: 1 }),
  f("Settlers", "settlers.hireCost", "Gold to hire a worker at the tavern", 20),

  // Events
  f("Events (chance per day)", "events.thief", "Thieves: base chance", 0.06, "Plus the town's power ÷ the number below.", { step: 0.01, max: 1 }),
  f("Events (chance per day)", "events.thiefPowerDivisor", "Thieves: power divisor", 400, undefined, { min: 1 }),
  f("Events (chance per day)", "events.caravan", "Merchant caravan", 0.08, undefined, { step: 0.01, max: 1 }),
  f("Events (chance per day)", "events.storm", "Storm", 0.05, undefined, { step: 0.01, max: 1 }),
  f("Events (chance per day)", "events.harvest", "Bumper harvest (with a farm)", 0.06, undefined, { step: 0.01, max: 1 }),

  // Factions
  f("Factions", "region.attentionRate", "Attention growth multiplier", 1, "1 = as designed; 0.5 = half as fast.", { step: 0.1 }),
  f("Factions", "region.scoutsAt", "Scouts appear at attention", 25, undefined, { max: 100 }),
  f("Factions", "region.demandAt", "Tribute demanded at attention", 55, undefined, { max: 100 }),
  f("Factions", "region.deadlineHours", "Hours to pay tribute", 72),
  f("Factions", "region.raidNoticeHours", "Hours' warning before a raid", 24),
  f("Factions", "region.tributeMultiplier", "Tribute multiplier", 1, undefined, { step: 0.1 }),
  f("Factions", "region.raidGold", "Raid takes this share of gold", 0.35, undefined, { step: 0.05, max: 1 }),
  f("Factions", "region.raidFood", "…of food", 0.3, undefined, { step: 0.05, max: 1 }),
  f("Factions", "region.raidMaterials", "…of materials", 0.25, undefined, { step: 0.05, max: 1 }),

  // Crafting
  f("Crafting", "price.iron", "Market price: iron", 6),
  f("Crafting", "price.herbs", "Market price: herbs", 4),
  f("Crafting", "price.dust", "Market price: arcane dust", 15),
  ...MOD_DEFAULTS.flatMap(([id, name, gold, iron, herbs, dust, hours]) => [
    f("Crafting", `${id}.gold`, `${name}: gold`, gold),
    f("Crafting", `${id}.iron`, `${name}: iron`, iron),
    f("Crafting", `${id}.herbs`, `${name}: herbs`, herbs),
    f("Crafting", `${id}.dust`, `${name}: dust`, dust),
    f("Crafting", `${id}.hours`, `${name}: hours`, hours),
  ]),
  ...BREW_DEFAULTS.flatMap(([id, name, gold, herbs, dust, hours]) => [
    f("Crafting", `brew.${id}.gold`, `Brew ${name}: gold`, gold),
    f("Crafting", `brew.${id}.herbs`, `Brew ${name}: herbs`, herbs),
    f("Crafting", `brew.${id}.dust`, `Brew ${name}: dust`, dust),
    f("Crafting", `brew.${id}.hours`, `Brew ${name}: hours`, hours),
  ]),

  // Heroes
  f("Heroes", "xp.battleMultiplier", "XP from town battles (multiplier)", 1, undefined, { step: 0.25 }),
  f("Heroes", "xp.adventureMultiplier", "XP from adventure battles (multiplier)", 1, undefined, { step: 0.25 }),
];

export const TUNING_DEFAULTS: Record<string, number> = Object.fromEntries(TUNING_FIELDS.map((x) => [x.key, x.default]));

let overrides: Record<string, number> = {};

/** The DM's overrides (unknown keys and non-numbers are ignored). */
export function setTuning(next: Record<string, unknown> | undefined) {
  overrides = Object.fromEntries(Object.entries(next ?? {}).filter(([k, v]) => k in TUNING_DEFAULTS && typeof v === "number" && Number.isFinite(v))) as Record<string, number>;
}

/** A tunable number: the DM's value if set, otherwise the default. */
export function num(key: string): number {
  const v = overrides[key] ?? TUNING_DEFAULTS[key];
  if (v === undefined) throw new Error(`Unknown tuning key "${key}"`);
  return v;
}
