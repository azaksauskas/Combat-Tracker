import { attack, buff, creature, heal, missile, save, stats, type ContentEntry } from "../content/srd";
import { STANDARD_ARRAY, type BackgroundName, type CharacterSpec, type ClassName, type SpeciesName } from "../domain/character";
import { ABILITIES, ABILITY_NAMES, abilityMod, type Ability, type Feature, type StatAction, type StatBlock } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";
import { SKILL_ABILITY } from "./skills";

/**
 * Level-1 character builder (2024 rules, SRD 5.2): class, species,
 * background, standard array and the background's +2 / +1. Pure: the same
 * choices always build the same character.
 */

interface ClassDef {
  hitDie: number;
  saves: Ability[];
  /** Ability to put the highest score in; the builder suggests an array from it. */
  suggested: Ability[];
  skills: string[];
  /** Skills with Expertise (double proficiency). */
  expertise?: string[];
  armor: string;
  ac: (dex: number) => number;
  features: Feature[];
  spellSlots?: number[];
  actions: (m: Record<Ability, number>, prof: number) => StatAction[];
  traits: (m: Record<Ability, number>, prof: number) => { name: string; text: string }[];
}

const dc = (prof: number, mod: number) => 8 + prof + mod;

export const CLASSES: Record<ClassName, ClassDef> = {
  Fighter: {
    hitDie: 10,
    saves: ["str", "con"],
    suggested: ["str", "con", "dex", "wis", "cha", "int"],
    skills: ["Athletics", "Perception"],
    armor: "Chain Mail and Defense fighting style",
    ac: () => 17,
    features: ["second-wind"],
    actions: (m, p) => [
      attack({ name: "Greatsword", attackType: "melee", toHit: p + m.str, damage: [{ dice: `2d6${sign(m.str)}`, type: "slashing" }], mastery: "graze", notes: `Mastery: Graze — on a miss, deal ${Math.max(0, m.str)} slashing damage` }),
      attack({ name: "Javelin", attackType: "ranged", toHit: p + m.str, range: [30, 120], damage: [{ dice: `1d6${sign(m.str)}`, type: "piercing" }], mastery: "slow", notes: "Mastery: Slow — on a hit, speed −10 ft. until your next turn" }),
    ],
    traits: () => [
      { name: "Fighting Style: Defense", text: "+1 AC while wearing armor (included: Chain Mail 16 + 1)." },
      { name: "Second Wind (Bonus Action, 2/Long Rest)", text: "Regain 1d10 + your Fighter level HP." },
      { name: "Weapon Mastery", text: "Greatsword (Graze), Javelin (Slow)." },
    ],
  },
  Rogue: {
    hitDie: 8,
    saves: ["dex", "int"],
    suggested: ["dex", "con", "wis", "int", "cha", "str"],
    skills: ["Acrobatics", "Perception", "Sleight of Hand", "Stealth"],
    expertise: ["Stealth", "Sleight of Hand"],
    armor: "Leather Armor",
    ac: (dex) => 11 + dex,
    features: ["sneak-attack"],
    actions: (m, p) => [
      attack({ name: "Shortsword", attackType: "melee", toHit: p + m.dex, finesse: true, mastery: "vex", damage: [{ dice: `1d6${sign(m.dex)}`, type: "piercing" }], notes: "Mastery: Vex — on a hit, Advantage on your next attack against that target" }),
      attack({ name: "Shortbow", attackType: "ranged", toHit: p + m.dex, range: [80, 320], finesse: true, mastery: "vex", damage: [{ dice: `1d6${sign(m.dex)}`, type: "piercing" }], notes: "Mastery: Vex" }),
    ],
    traits: () => [
      { name: "Sneak Attack", text: "Once per turn, +1d6 damage to a Finesse or Ranged weapon hit if you have Advantage, or an ally is within 5 ft. of the target." },
      { name: "Expertise", text: "Stealth and Sleight of Hand." },
      { name: "Thieves' Cant", text: "You know the secret language of rogues." },
    ],
  },
  Cleric: {
    hitDie: 8,
    saves: ["wis", "cha"],
    suggested: ["wis", "con", "str", "cha", "dex", "int"],
    skills: ["Insight", "Medicine"],
    armor: "Chain Shirt and Shield",
    ac: (dex) => 13 + Math.min(2, dex) + 2,
    features: [],
    spellSlots: [2],
    actions: (m, p) => [
      attack({ name: "Mace", attackType: "melee", toHit: p + m.str, damage: [{ dice: `1d6${sign(m.str)}`, type: "bludgeoning" }] }),
      save({ name: "Sacred Flame", save: "dex", dc: dc(p, m.wis), range: 60, cantrip: true, damage: [{ dice: "1d8", type: "radiant" }], onSuccess: "none" }),
      attack({ name: "Guiding Bolt", attackType: "ranged", toHit: p + m.wis, range: [120, 120], slot: 1, onHitEffect: "guided", damage: [{ dice: "4d6", type: "radiant" }], notes: "Next attack against the target before your next turn has Advantage" }),
      heal({ name: "Cure Wounds", dice: "2d8", ability: "wis", range: 5, slot: 1 }),
      heal({ name: "Healing Word", dice: "2d4", ability: "wis", range: 60, slot: 1, bonusAction: true }),
      buff({ name: "Bless", buff: "bless", range: 30, targets: 3, concentration: true, slot: 1, notes: "+1d4 to attack rolls and saving throws" }),
    ],
    traits: (m, p) => [
      { name: "Spellcasting", text: `Spell save DC ${dc(p, m.wis)}, spell attack ${sign(p + m.wis)}. Prepared: Bless, Cure Wounds, Guiding Bolt, Healing Word.` },
      { name: "Divine Order: Protector", text: "Martial weapons and Heavy armor." },
    ],
  },
  Wizard: {
    hitDie: 6,
    saves: ["int", "wis"],
    suggested: ["int", "con", "dex", "wis", "cha", "str"],
    skills: ["Arcana", "Investigation"],
    armor: "no armor",
    ac: (dex) => 10 + dex,
    features: ["shield-spell", "arcane-recovery"],
    spellSlots: [2],
    actions: (m, p) => [
      attack({ name: "Fire Bolt", attackType: "ranged", toHit: p + m.int, range: [120, 120], cantrip: true, damage: [{ dice: "1d10", type: "fire" }] }),
      missile({ name: "Magic Missile", darts: 3, dice: "1d4+1", damageType: "force", range: 120, slot: 1 }),
      save({ name: "Burning Hands", save: "dex", dc: dc(p, m.int), range: 15, area: { shape: "cone", size: 15 }, slot: 1, damage: [{ dice: "3d6", type: "fire" }], onSuccess: "half" }),
      attack({ name: "Dagger", attackType: "melee", toHit: p + Math.max(m.str, m.dex), finesse: true, damage: [{ dice: `1d4${sign(Math.max(m.str, m.dex))}`, type: "piercing" }] }),
    ],
    traits: (m, p) => [
      { name: "Spellcasting", text: `Spell save DC ${dc(p, m.int)}, spell attack ${sign(p + m.int)}. Prepared: Burning Hands, Magic Missile, Shield (reaction: +5 AC when hit, cast automatically), Detect Magic.` },
      { name: "Arcane Recovery", text: "Once per long rest, a short rest restores expended spell slots worth up to half your level (rounded up)." },
    ],
  },
};

interface SpeciesDef {
  speed: number;
  resistances?: StatBlock["resistances"];
  /** Extra HP per level (Dwarven Toughness). */
  hpPerLevel?: number;
  skills?: string[];
  traits: { name: string; text: string }[];
}

export const SPECIES: Record<SpeciesName, SpeciesDef> = {
  Human: {
    speed: 30,
    skills: ["Insight"],
    traits: [
      { name: "Resourceful", text: "You gain Heroic Inspiration whenever you finish a long rest." },
      { name: "Skillful", text: "Proficiency in one extra skill (Insight)." },
    ],
  },
  Dwarf: {
    speed: 30,
    resistances: ["poison"],
    hpPerLevel: 1,
    traits: [
      { name: "Darkvision", text: "120 ft." },
      { name: "Dwarven Resilience", text: "Resistance to Poison damage; Advantage on saves against Poisoned." },
      { name: "Dwarven Toughness", text: "+1 HP per level (included)." },
    ],
  },
  Elf: {
    speed: 30,
    skills: ["Perception"],
    traits: [
      { name: "Darkvision", text: "60 ft." },
      { name: "Fey Ancestry", text: "Advantage on saves against Charmed." },
      { name: "Keen Senses", text: "Proficiency in Perception." },
    ],
  },
  Halfling: {
    speed: 30,
    traits: [
      { name: "Brave", text: "Advantage on saves against Frightened." },
      { name: "Halfling Nimbleness", text: "You can move through the space of any creature larger than you." },
      { name: "Luck", text: "Reroll a 1 on a d20 Test (not yet applied automatically)." },
    ],
  },
};

interface BackgroundDef {
  abilities: [Ability, Ability, Ability];
  skills: [string, string];
  feat: { name: string; text: string };
}

export const BACKGROUNDS: Record<BackgroundName, BackgroundDef> = {
  Acolyte: { abilities: ["int", "wis", "cha"], skills: ["Insight", "Religion"], feat: { name: "Magic Initiate (Cleric)", text: "Two cleric cantrips and one 1st-level spell." } },
  Criminal: { abilities: ["dex", "con", "int"], skills: ["Sleight of Hand", "Stealth"], feat: { name: "Alert", text: "Add your Proficiency Bonus to Initiative." } },
  Sage: { abilities: ["con", "int", "wis"], skills: ["Arcana", "History"], feat: { name: "Magic Initiate (Wizard)", text: "Two wizard cantrips and one 1st-level spell." } },
  Soldier: { abilities: ["str", "dex", "con"], skills: ["Athletics", "Intimidation"], feat: { name: "Savage Attacker", text: "Once per turn, roll a weapon's damage dice twice and use either roll." } },
};

const sign = (n: number) => (n === 0 ? "" : n > 0 ? `+${n}` : String(n));

/** A sensible starting point for a class: the standard array in the class's order. */
export function suggestedSpec(className: ClassName, id: string, name = "New hero"): CharacterSpec {
  const order = CLASSES[className].suggested;
  const base = Object.fromEntries(order.map((a, i) => [a, STANDARD_ARRAY[i]!])) as Record<Ability, number>;
  const background = ({ Fighter: "Soldier", Rogue: "Criminal", Cleric: "Acolyte", Wizard: "Sage" } as const)[className];
  const allowed = BACKGROUNDS[background].abilities;
  const plus2 = allowed.includes(order[0]!) ? order[0]! : allowed[0];
  const plus1 = allowed.find((a) => a !== plus2 && a === order[1]) ?? allowed.find((a) => a !== plus2)!;
  return { id, name, className, species: "Human", background, base, plus2, plus1, alignment: "Neutral Good" };
}

/** What's wrong with these choices (empty when the character is legal). */
export function validateSpec(spec: CharacterSpec): string[] {
  const errs: string[] = [];
  if (!spec.name.trim()) errs.push("Give your hero a name");
  const used = ABILITIES.map((a) => spec.base[a]).sort((a, b) => b - a);
  if (used.join() !== STANDARD_ARRAY.join()) errs.push(`Use each standard-array score once (${STANDARD_ARRAY.join(", ")})`);
  const allowed = BACKGROUNDS[spec.background].abilities;
  if (!allowed.includes(spec.plus2) || !allowed.includes(spec.plus1))
    errs.push(`${spec.background} raises ${allowed.map((a) => ABILITY_NAMES[a]).join(", ")} only`);
  if (spec.plus2 === spec.plus1) errs.push("The +2 and +1 must go to different abilities");
  return errs;
}

export function finalAbilities(spec: CharacterSpec): Record<Ability, number> {
  const out = { ...spec.base };
  out[spec.plus2] += 2;
  out[spec.plus1] += 1;
  return out;
}

/** The character sheet at level 1, as a combatant the game and the tracker both understand. */
export function buildCharacter(spec: CharacterSpec): CombatantDraft {
  const cls = CLASSES[spec.className];
  const sp = SPECIES[spec.species];
  const bg = BACKGROUNDS[spec.background];
  const abilities = finalAbilities(spec);
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(abilities[a])])) as Record<Ability, number>;
  const prof = 2;
  const skillNames = [...new Set([...cls.skills, ...bg.skills, ...(sp.skills ?? [])])];
  const skills = Object.fromEntries(
    skillNames.map((s) => [s, m[SKILL_ABILITY[s] ?? "str"] + prof * (cls.expertise?.includes(s) ? 2 : 1)]),
  );
  const hpMax = Math.max(1, cls.hitDie + m.con + (sp.hpPerLevel ?? 0));
  const block = stats({
    abilities,
    proficiency: prof,
    className: spec.className,
    level: 1,
    saveProficiencies: cls.saves,
    skills,
    resistances: sp.resistances ?? [],
    actions: cls.actions(m, prof),
    features: cls.features,
    spellSlots: cls.spellSlots ?? [],
    traits: [...cls.traits(m, prof), ...sp.traits, bg.feat, { name: "Armor", text: cls.armor }],
    alignment: spec.alignment,
  });
  return creature({ name: spec.name.trim() || "Hero", isMonster: false, ac: cls.ac(m.dex), hpMax, speed: sp.speed }, block);
}

export const characterKey = (spec: Pick<CharacterSpec, "id">) => `custom-${spec.id}`;

/** A built character in the same shape as the ready-made party. */
export function characterEntry(spec: CharacterSpec): ContentEntry {
  return {
    key: characterKey(spec),
    label: spec.name,
    subtitle: `Level 1 ${spec.className} · ${spec.species} ${spec.background} · ${spec.alignment}`,
    build: () => buildCharacter(spec),
  };
}
