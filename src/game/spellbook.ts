import { abilityMod, ActionSchema, type Ability, type Feature, type StatAction, type StatBlock } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";

/**
 * The spells a Cleric or Wizard can prepare (SRD 5.2, those the rules
 * engine can run), and how many. Preparing changes the hero's spell list;
 * Shield and Mage Armor are kept as features rather than actions.
 */

export interface SpellDef {
  id: string;
  name: string;
  classes: ("Cleric" | "Wizard")[];
  /** 0 = cantrip. */
  level: number;
  text: string;
  /** The action, worked out from the caster (Shield and Mage Armor have none). */
  action?: (c: Caster) => Record<string, unknown>;
  /** A feature this spell turns on instead. */
  feature?: "shield-spell" | "mage-armor";
}

interface Caster {
  dc: number;
  toHit: number;
  /** Cantrip damage dice count: 1, or 2 from level 5. */
  dice: number;
  ability: Ability;
}

const sp = (x: SpellDef) => x;

export const SPELLS: SpellDef[] = [
  // Wizard cantrips
  sp({
    id: "fire-bolt",
    name: "Fire Bolt",
    classes: ["Wizard"],
    level: 0,
    text: "Ranged spell attack, 120 ft, 1d10 fire.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [120, 120],
      cantrip: true,
      damage: [{ dice: `${c.dice}d10`, type: "fire" }],
    }),
  }),
  sp({
    id: "ray-of-frost",
    name: "Ray of Frost",
    classes: ["Wizard"],
    level: 0,
    text: "Ranged spell attack, 60 ft, 1d8 cold; the target's speed drops 10 ft.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [60, 60],
      cantrip: true,
      mastery: "slow",
      damage: [{ dice: `${c.dice}d8`, type: "cold" }],
    }),
  }),
  sp({
    id: "shocking-grasp",
    name: "Shocking Grasp",
    classes: ["Wizard"],
    level: 0,
    text: "Melee spell attack, 1d8 lightning.",
    action: (c) => ({
      kind: "attack",
      attackType: "melee",
      toHit: c.toHit,
      cantrip: true,
      damage: [{ dice: `${c.dice}d8`, type: "lightning" }],
    }),
  }),
  sp({
    id: "chill-touch",
    name: "Chill Touch",
    classes: ["Wizard"],
    level: 0,
    text: "Melee spell attack, 1d10 necrotic.",
    action: (c) => ({
      kind: "attack",
      attackType: "melee",
      toHit: c.toHit,
      cantrip: true,
      damage: [{ dice: `${c.dice}d10`, type: "necrotic" }],
    }),
  }),
  sp({
    id: "poison-spray",
    name: "Poison Spray",
    classes: ["Wizard"],
    level: 0,
    text: "Ranged spell attack, 30 ft, 1d12 poison.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [30, 30],
      cantrip: true,
      damage: [{ dice: `${c.dice}d12`, type: "poison" }],
    }),
  }),
  sp({
    id: "acid-splash",
    name: "Acid Splash",
    classes: ["Wizard"],
    level: 0,
    text: "Dexterity save in a 5-ft sphere, 60 ft away, 1d6 acid.",
    action: (c) => ({
      kind: "save",
      save: "dex",
      dc: c.dc,
      range: 60,
      area: { shape: "sphere", size: 5 },
      cantrip: true,
      onSuccess: "none",
      damage: [{ dice: `${c.dice}d6`, type: "acid" }],
    }),
  }),
  // Cleric cantrips
  sp({
    id: "sacred-flame",
    name: "Sacred Flame",
    classes: ["Cleric"],
    level: 0,
    text: "Dexterity save, 60 ft, 1d8 radiant (cover doesn't help).",
    action: (c) => ({
      kind: "save",
      save: "dex",
      dc: c.dc,
      range: 60,
      cantrip: true,
      onSuccess: "none",
      damage: [{ dice: `${c.dice}d8`, type: "radiant" }],
    }),
  }),
  sp({
    id: "toll-the-dead",
    name: "Toll the Dead",
    classes: ["Cleric"],
    level: 0,
    text: "Wisdom save, 60 ft, 1d8 necrotic.",
    action: (c) => ({
      kind: "save",
      save: "wis",
      dc: c.dc,
      range: 60,
      cantrip: true,
      onSuccess: "none",
      damage: [{ dice: `${c.dice}d8`, type: "necrotic" }],
    }),
  }),
  // Wizard, level 1
  sp({
    id: "magic-missile",
    name: "Magic Missile",
    classes: ["Wizard"],
    level: 1,
    text: "Three darts that always hit, 1d4+1 force each.",
    action: () => ({
      kind: "missile",
      darts: 3,
      dice: "1d4+1",
      damageType: "force",
      range: 120,
      slot: 1,
    }),
  }),
  sp({
    id: "burning-hands",
    name: "Burning Hands",
    classes: ["Wizard"],
    level: 1,
    text: "15-ft cone, Dexterity save, 3d6 fire (half on a success).",
    action: (c) => ({
      kind: "save",
      save: "dex",
      dc: c.dc,
      range: 15,
      area: { shape: "cone", size: 15 },
      slot: 1,
      onSuccess: "half",
      damage: [{ dice: "3d6", type: "fire" }],
    }),
  }),
  sp({
    id: "chromatic-orb",
    name: "Chromatic Orb",
    classes: ["Wizard"],
    level: 1,
    text: "Ranged spell attack, 90 ft, 3d8 (fire).",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [90, 90],
      slot: 1,
      damage: [{ dice: "3d8", type: "fire" }],
    }),
  }),
  sp({
    id: "ray-of-sickness",
    name: "Ray of Sickness",
    classes: ["Wizard"],
    level: 1,
    text: "Ranged spell attack, 60 ft, 2d8 poison.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [60, 60],
      slot: 1,
      damage: [{ dice: "2d8", type: "poison" }],
    }),
  }),
  sp({
    id: "ice-knife",
    name: "Ice Knife",
    classes: ["Wizard"],
    level: 1,
    text: "Ranged spell attack, 60 ft, 1d10 piercing.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [60, 60],
      slot: 1,
      damage: [{ dice: "1d10", type: "piercing" }],
    }),
  }),
  sp({
    id: "shield",
    name: "Shield",
    classes: ["Wizard"],
    level: 1,
    text: "Reaction when hit: +5 AC until your next turn (cast for you, uses a 1st-level slot).",
    feature: "shield-spell",
  }),
  sp({
    id: "mage-armor",
    name: "Mage Armor",
    classes: ["Wizard"],
    level: 1,
    text: "Cast before setting out: AC 13 + Dex while you wear no armour.",
    feature: "mage-armor",
  }),
  // Cleric, level 1
  sp({
    id: "bless",
    name: "Bless",
    classes: ["Cleric"],
    level: 1,
    text: "Up to three allies add 1d4 to attacks and saves (concentration).",
    action: () => ({
      kind: "buff",
      buff: "bless",
      range: 30,
      targets: 3,
      concentration: true,
      slot: 1,
    }),
  }),
  sp({
    id: "cure-wounds",
    name: "Cure Wounds",
    classes: ["Cleric"],
    level: 1,
    text: "Touch: heal 2d8 + Wisdom.",
    action: (c) => ({
      kind: "heal",
      dice: "2d8",
      ability: c.ability,
      range: 5,
      slot: 1,
    }),
  }),
  sp({
    id: "healing-word",
    name: "Healing Word",
    classes: ["Cleric"],
    level: 1,
    text: "Bonus action, 60 ft: heal 2d4 + Wisdom.",
    action: (c) => ({
      kind: "heal",
      dice: "2d4",
      ability: c.ability,
      range: 60,
      slot: 1,
      bonusAction: true,
    }),
  }),
  sp({
    id: "guiding-bolt",
    name: "Guiding Bolt",
    classes: ["Cleric"],
    level: 1,
    text: "Ranged spell attack, 120 ft, 4d6 radiant; the next attack on the target has Advantage.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [120, 120],
      slot: 1,
      onHitEffect: "guided",
      damage: [{ dice: "4d6", type: "radiant" }],
    }),
  }),
  sp({
    id: "inflict-wounds",
    name: "Inflict Wounds",
    classes: ["Cleric"],
    level: 1,
    text: "Touch, Constitution save, 2d10 necrotic (half on a success).",
    action: (c) => ({
      kind: "save",
      save: "con",
      dc: c.dc,
      range: 5,
      slot: 1,
      onSuccess: "half",
      damage: [{ dice: "2d10", type: "necrotic" }],
    }),
  }),
  sp({
    id: "shield-of-faith",
    name: "Shield of Faith",
    classes: ["Cleric"],
    level: 1,
    text: "Bonus action, 60 ft: an ally gains +2 AC (concentration).",
    action: () => ({
      kind: "buff",
      buff: "faith",
      range: 60,
      targets: 1,
      concentration: true,
      slot: 1,
      bonusAction: true,
    }),
  }),
  // Level 2
  sp({
    id: "shatter",
    name: "Shatter",
    classes: ["Wizard"],
    level: 2,
    text: "10-ft sphere, 60 ft away, Constitution save, 3d8 thunder (half on a success).",
    action: (c) => ({
      kind: "save",
      save: "con",
      dc: c.dc,
      range: 60,
      area: { shape: "sphere", size: 10 },
      slot: 2,
      onSuccess: "half",
      damage: [{ dice: "3d8", type: "thunder" }],
    }),
  }),
  sp({
    id: "acid-arrow",
    name: "Acid Arrow",
    classes: ["Wizard"],
    level: 2,
    text: "Ranged spell attack, 90 ft, 4d4 acid.",
    action: (c) => ({
      kind: "attack",
      attackType: "ranged",
      toHit: c.toHit,
      range: [90, 90],
      slot: 2,
      damage: [{ dice: "4d4", type: "acid" }],
    }),
  }),
  sp({
    id: "aid",
    name: "Aid",
    classes: ["Cleric"],
    level: 2,
    text: "Up to three allies gain 5 max and current HP.",
    action: () => ({
      kind: "buff",
      buff: "aid",
      range: 30,
      targets: 3,
      slot: 2,
    }),
  }),
  // Level 3
  sp({
    id: "fireball",
    name: "Fireball",
    classes: ["Wizard"],
    level: 3,
    text: "20-ft sphere, 150 ft away, Dexterity save, 8d6 fire (half on a success).",
    action: (c) => ({
      kind: "save",
      save: "dex",
      dc: c.dc,
      range: 150,
      area: { shape: "sphere", size: 20 },
      slot: 3,
      onSuccess: "half",
      damage: [{ dice: "8d6", type: "fire" }],
    }),
  }),
  sp({
    id: "mass-healing-word",
    name: "Mass Healing Word",
    classes: ["Cleric"],
    level: 3,
    text: "Bonus action, 60 ft: up to six allies heal 2d4 + Wisdom.",
    action: (c) => ({
      kind: "heal",
      dice: "2d4",
      ability: c.ability,
      range: 60,
      targets: 6,
      slot: 3,
      bonusAction: true,
    }),
  }),
];

const CASTING: Record<string, Ability> = { Cleric: "wis", Wizard: "int" };
export const isCaster = (className: string | null | undefined) => !!className && className in CASTING;

/** How many cantrips and prepared spells (2024 tables), and the highest spell level. */
export function spellLimits(className: string | null | undefined, level: number) {
  const prepared = [0, 4, 5, 6, 7, 9][Math.min(5, Math.max(1, level))]!;
  const cantrips = level >= 4 ? 4 : 3;
  const maxLevel = level >= 5 ? 3 : level >= 3 ? 2 : 1;
  return isCaster(className) ? { cantrips, prepared, maxLevel } : { cantrips: 0, prepared: 0, maxLevel: 0 };
}

/** Spells this hero could prepare now. */
export const spellsFor = (st: Pick<StatBlock, "className" | "level">) =>
  SPELLS.filter((s) => s.classes.includes(st.className as "Cleric" | "Wizard") && s.level <= spellLimits(st.className, st.level ?? 1).maxLevel);

/** The spells the ready-made heroes (and the builder's casters) start with. */
export function startingSpells(className: string | null | undefined): string[] {
  if (className === "Cleric") return ["sacred-flame", "toll-the-dead", "guiding-bolt", "cure-wounds", "healing-word", "bless"];
  if (className === "Wizard") return ["fire-bolt", "ray-of-frost", "shocking-grasp", "magic-missile", "burning-hands", "shield", "mage-armor"];
  return [];
}

/** Why this choice of spells doesn't fit, or null. */
export function spellProblem(st: Pick<StatBlock, "className" | "level">, chosen: string[]): string | null {
  const lim = spellLimits(st.className, st.level ?? 1);
  const known = chosen.map((id) => SPELLS.find((s) => s.id === id)).filter((s): s is SpellDef => !!s);
  const cantrips = known.filter((s) => s.level === 0).length;
  const leveled = known.filter((s) => s.level > 0).length;
  if (cantrips > lim.cantrips) return `At most ${lim.cantrips} cantrips`;
  if (leveled > lim.prepared) return `At most ${lim.prepared} prepared spells`;
  const tooHigh = known.find((s) => s.level > lim.maxLevel);
  if (tooHigh) return `${tooHigh.name} needs a level ${tooHigh.level} slot`;
  return null;
}

const isSpellAction = (a: StatAction) => !!a.slot || !!a.cantrip;

/** A caster's sheet with these spells prepared (other actions and features stay; Shield and Mage Armor as features). */
export function applySpells<T extends Pick<CombatantDraft, "ac" | "stats">>(c: T, chosen: string[], unarmored: boolean): T {
  const st = c.stats;
  if (!st || !isCaster(st.className)) return c;
  const ability = CASTING[st.className!]!;
  const mod = abilityMod(st.abilities[ability]);
  const caster: Caster = {
    dc: 8 + st.proficiency + mod,
    toHit: st.proficiency + mod,
    dice: (st.level ?? 1) >= 5 ? 2 : 1,
    ability,
  };
  const defs = chosen.map((id) => SPELLS.find((s) => s.id === id)).filter((s): s is SpellDef => !!s && s.classes.includes(st.className as "Cleric" | "Wizard"));
  const spells = defs
    .filter((d) => d.action)
    .map((d) =>
      ActionSchema.parse({
        id: `spell-${d.id}`,
        name: d.name,
        notes: d.text,
        ...d.action!(caster),
      }),
    );
  const features: Feature[] = st.features.filter((f) => f !== "shield-spell");
  if (defs.some((d) => d.feature === "shield-spell")) features.push("shield-spell");
  const mageArmor = defs.some((d) => d.feature === "mage-armor") && unarmored;
  const ac = mageArmor ? Math.max(c.ac, 13 + abilityMod(st.abilities.dex)) : c.ac;
  return {
    ...c,
    ac,
    stats: {
      ...st,
      features,
      actions: [...st.actions.filter((a) => !isSpellAction(a)), ...spells],
    },
  };
}
