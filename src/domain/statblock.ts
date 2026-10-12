import { z } from "zod";

/**
 * Structured stat blocks (D&D 2024 / SRD 5.2). Optional on every combatant:
 * free-text actions and notes keep working for quick homebrew, while a
 * structured block unlocks one-click attacks, saves and resistances, and is
 * what the game's rules engine runs on.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

const str = z.string().catch("");
const id = z.union([z.string(), z.number()]).transform(String);

export const DamagePartSchema = z.object({
  /** Dice notation, e.g. "1d6+2". */
  dice: z.string(),
  type: z.enum(DAMAGE_TYPES).catch("bludgeoning"),
});
export type DamagePart = z.infer<typeof DamagePartSchema>;

/** 2024 weapon mastery properties the engine implements. */
export const MASTERIES = ["graze", "sap", "slow", "vex"] as const;
export type Mastery = (typeof MASTERIES)[number];

/**
 * Rules features the game engine knows how to apply. Anything else stays a
 * descriptive trait.
 */
export const FEATURES = ["pack-tactics", "sneak-attack", "undead-fortitude", "nimble-escape", "second-wind"] as const;
export type Feature = (typeof FEATURES)[number];

/** "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage." */
export const AttackActionSchema = z.object({
  id,
  kind: z.literal("attack"),
  name: str,
  attackType: z.enum(["melee", "ranged"]).catch("melee"),
  toHit: z.number().catch(0),
  /** Melee reach in feet. */
  reach: z.number().catch(5),
  /** Ranged: normal / long range in feet. */
  range: z.tuple([z.number(), z.number()]).nullable().catch(null),
  damage: z.array(DamagePartSchema).catch([]),
  notes: str,
  /** Finesse or ranged weapon: qualifies for Sneak Attack. */
  finesse: z.boolean().optional(),
  mastery: z.enum(MASTERIES).optional(),
  /** e.g. Goblin Warrior: +1d4 if the attack roll had Advantage. */
  extraDamageOnAdvantage: z.array(DamagePartSchema).optional(),
  /** Condition applied on a hit, e.g. the Wolf's bite knocks Prone. */
  onHitCondition: z.string().optional(),
});
export type AttackAction = z.infer<typeof AttackActionSchema>;

/** "Dexterity Saving Throw: DC 13 … Failure: 7 (2d6) Fire damage. Success: Half damage." */
export const SaveActionSchema = z.object({
  id,
  kind: z.literal("save"),
  name: str,
  save: z.enum(ABILITIES).catch("dex"),
  dc: z.number().catch(10),
  damage: z.array(DamagePartSchema).catch([]),
  onSuccess: z.enum(["half", "none"]).catch("half"),
  notes: str,
});
export type SaveAction = z.infer<typeof SaveActionSchema>;

export const ActionSchema = z.discriminatedUnion("kind", [AttackActionSchema, SaveActionSchema]);
export type StatAction = z.infer<typeof ActionSchema>;

export const TraitSchema = z.object({ name: str, text: str });

export const StatBlockSchema = z.object({
  abilities: z.object({
    str: z.number().catch(10),
    dex: z.number().catch(10),
    con: z.number().catch(10),
    int: z.number().catch(10),
    wis: z.number().catch(10),
    cha: z.number().catch(10),
  }),
  proficiency: z.number().catch(2),
  /** Abilities with saving-throw proficiency. */
  saveProficiencies: z.array(z.enum(ABILITIES)).catch([]),
  /** Skill name → total bonus, e.g. { Stealth: 6 }. */
  skills: z.record(z.string(), z.number()).catch({}),
  resistances: z.array(z.enum(DAMAGE_TYPES)).catch([]),
  immunities: z.array(z.enum(DAMAGE_TYPES)).catch([]),
  vulnerabilities: z.array(z.enum(DAMAGE_TYPES)).catch([]),
  conditionImmunities: z.array(z.string()).catch([]),
  /** Monsters: challenge rating ("1/4"); characters: class and level. */
  cr: z.string().nullable().catch(null),
  className: z.string().nullable().catch(null),
  level: z.number().nullable().catch(null),
  actions: z.array(ActionSchema).catch([]),
  traits: z.array(TraitSchema).catch([]),
  features: z.array(z.enum(FEATURES)).catch([]),
});
export type StatBlock = z.infer<typeof StatBlockSchema>;

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const formatMod = (n: number) => (n >= 0 ? `+${n}` : String(n));

export function saveBonus(stats: StatBlock, ability: Ability) {
  return abilityMod(stats.abilities[ability]) + (stats.saveProficiencies.includes(ability) ? stats.proficiency : 0);
}

/** "1d6+2 slashing + 1d4 fire" */
export const formatDamage = (parts: readonly DamagePart[]) => parts.map((p) => `${p.dice} ${p.type}`).join(" + ");

export function describeAction(a: StatAction): string {
  if (a.kind === "save") {
    return `DC ${a.dc} ${ABILITY_NAMES[a.save]} save · ${formatDamage(a.damage)}${a.onSuccess === "half" ? ", half on success" : ""}`;
  }
  const reach = a.attackType === "ranged" && a.range ? `range ${a.range[0]}/${a.range[1]} ft` : `reach ${a.reach} ft`;
  return `${a.attackType === "melee" ? "Melee" : "Ranged"} ${formatMod(a.toHit)}, ${reach} · ${formatDamage(a.damage)}`;
}
