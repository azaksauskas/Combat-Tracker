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
export const FEATURES = [
  "pack-tactics",
  "sneak-attack",
  "undead-fortitude",
  "nimble-escape",
  "second-wind",
  // Gained at levels 2–3 (2024 rules):
  "action-surge",
  "improved-critical",
  "cunning-action",
  "turn-undead",
  // Spellcasting (2024): Shield as a reaction, Evoker and Life Domain features.
  "shield-spell",
  "potent-cantrip",
  "disciple-of-life",
  "arcane-recovery",
  // Level 5:
  "uncanny-dodge",
] as const;

/** Spell fields shared by every kind of action. */
const spellFields = {
  /** Spell level; uses a slot of that level. Absent for weapons and cantrips. */
  slot: z.number().optional(),
  cantrip: z.boolean().optional(),
  /** Cast as a Bonus Action instead of an Action. */
  bonusAction: z.boolean().optional(),
};
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
  /** Guiding Bolt: the next attack roll against the target has Advantage. */
  onHitEffect: z.enum(["guided"]).optional(),
  /** Which hand's weapon this is (from the hero's loadout): a spare weapon must be drawn first. */
  hand: z.enum(["main", "off", "spare"]).optional(),
  ...spellFields,
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
  /** Range in feet (default 60). For a cone it's the cone's length. */
  range: z.number().optional(),
  /** Area spells hit every creature inside, friend or foe. */
  area: z.object({ shape: z.enum(["cone", "sphere"]), size: z.number() }).optional(),
  ...spellFields,
});
export type SaveAction = z.infer<typeof SaveActionSchema>;

/** Healing spells: Cure Wounds, Healing Word. */
export const HealActionSchema = z.object({
  id,
  kind: z.literal("heal"),
  name: str,
  dice: z.string().catch("1d8"),
  /** Ability modifier added to the healing (the caster's spellcasting ability). */
  ability: z.enum(ABILITIES).optional(),
  /** 5 = touch. */
  range: z.number().catch(5),
  /** How many creatures it can heal at once (Mass Healing Word: 6). */
  targets: z.number().optional(),
  notes: str,
  ...spellFields,
});
export type HealAction = z.infer<typeof HealActionSchema>;

/** Spells that help allies: Bless and Shield of Faith (concentration), and Aid. */
export const BuffActionSchema = z.object({
  id,
  kind: z.literal("buff"),
  name: str,
  buff: z.enum(["bless", "aid", "faith"]),
  range: z.number().catch(30),
  /** How many allies it can affect. */
  targets: z.number().catch(3),
  concentration: z.boolean().optional(),
  notes: str,
  ...spellFields,
});
export type BuffAction = z.infer<typeof BuffActionSchema>;

/** Magic Missile: darts that always hit. */
export const MissileActionSchema = z.object({
  id,
  kind: z.literal("missile"),
  name: str,
  darts: z.number().catch(3),
  dice: z.string().catch("1d4+1"),
  damageType: z.enum(DAMAGE_TYPES).catch("force"),
  range: z.number().catch(120),
  notes: str,
  ...spellFields,
});
export type MissileAction = z.infer<typeof MissileActionSchema>;

export const ActionSchema = z.discriminatedUnion("kind", [AttackActionSchema, SaveActionSchema, HealActionSchema, BuffActionSchema, MissileActionSchema]);
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
  /** Spell slots per spell level, e.g. [4, 2] = four 1st-level, two 2nd-level. */
  spellSlots: z.array(z.number()).catch([]),
  /** "undead", "beast", "humanoid"… (Turn Undead needs to know). */
  creatureType: z.string().nullable().catch(null),
  /** Weapon attacks per Attack action: Extra Attack (Fighter 5) or a monster's Multiattack. */
  attacksPerAction: z.number().catch(1),
  /** "Lawful Good", "Neutral Evil", "Unaligned"… (see domain/alignment.ts). */
  alignment: z.string().nullable().catch(null),
});
export type StatBlock = z.infer<typeof StatBlockSchema>;

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const formatMod = (n: number) => (n >= 0 ? `+${n}` : String(n));

export function saveBonus(stats: StatBlock, ability: Ability) {
  return abilityMod(stats.abilities[ability]) + (stats.saveProficiencies.includes(ability) ? stats.proficiency : 0);
}

/** Damage an action can deal (Magic Missile: one part per dart; healing and buffs: none). */
export function actionDamage(a: StatAction): DamagePart[] {
  if (a.kind === "attack" || a.kind === "save") return a.damage;
  if (a.kind === "missile") return Array.from({ length: a.darts }, () => ({ dice: a.dice, type: a.damageType }));
  return [];
}

/** "1d6+2 slashing + 1d4 fire" */
export const formatDamage = (parts: readonly DamagePart[]) => parts.map((p) => `${p.dice} ${p.type}`).join(" + ");

const spellTag = (a: StatAction) => (a.slot ? `${ordinal(a.slot)}-level slot · ` : a.cantrip ? "cantrip · " : "") + (a.bonusAction ? "bonus action · " : "");
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

export function describeAction(a: StatAction): string {
  if (a.kind === "heal") return `${spellTag(a)}heals ${a.dice}${a.ability ? ` + ${a.ability.toUpperCase()}` : ""} · ${a.range <= 5 ? "touch" : `${a.range} ft`}`;
  if (a.kind === "buff")
    return `${spellTag(a)}${a.buff === "bless" ? "+1d4 to attacks and saves" : a.buff === "faith" ? "+2 AC" : "+5 current and max HP"} · up to ${a.targets} all${a.targets === 1 ? "y" : "ies"} within ${a.range} ft${a.concentration ? " · concentration" : ""}`;
  if (a.kind === "missile") return `${spellTag(a)}${a.darts} darts × ${a.dice} ${a.damageType}, always hit · ${a.range} ft`;
  if (a.kind === "save") {
    const area = a.area ? `${a.area.size}-ft ${a.area.shape} · ` : `${a.range ?? 60} ft · `;
    return `${spellTag(a)}${area}DC ${a.dc} ${ABILITY_NAMES[a.save]} save · ${formatDamage(a.damage)}${a.onSuccess === "half" ? ", half on success" : ""}`;
  }
  const reach = a.attackType === "ranged" && a.range ? `range ${a.range[0]}/${a.range[1]} ft` : `reach ${a.reach} ft`;
  return `${spellTag(a)}${a.attackType === "melee" ? "Melee" : "Ranged"} ${formatMod(a.toHit)}, ${reach} · ${formatDamage(a.damage)}`;
}
