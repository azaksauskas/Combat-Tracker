import { newId } from "../domain/combat";
import { StatBlockSchema, type StatAction, type StatBlock } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";

/**
 * Built-in content. Monsters are from the System Reference Document 5.2
 * (CC-BY-4.0, see README). The party are level-1 characters built with the
 * 2024 rules: standard array, background ability increases, starting gear.
 */

type ActionInput = Omit<Extract<StatAction, { kind: "attack" }>, "id" | "kind" | "notes" | "range" | "reach"> & {
  reach?: number;
  range?: [number, number];
  notes?: string;
};
type SaveInput = Omit<Extract<StatAction, { kind: "save" }>, "id" | "kind" | "notes"> & { notes?: string };

export const attack = (a: ActionInput): StatAction => ({ id: newId(), kind: "attack", reach: 5, range: null, notes: "", ...a });
export const save = (a: SaveInput): StatAction => ({ id: newId(), kind: "save", notes: "", ...a });
type Spell<K extends StatAction["kind"]> = Omit<Extract<StatAction, { kind: K }>, "id" | "kind" | "notes"> & { notes?: string };
export const heal = (a: Spell<"heal">): StatAction => ({ id: newId(), kind: "heal", notes: "", ...a });
export const buff = (a: Spell<"buff">): StatAction => ({ id: newId(), kind: "buff", notes: "", ...a });
export const missile = (a: Spell<"missile">): StatAction => ({ id: newId(), kind: "missile", notes: "", ...a });
export const stats = (s: Partial<StatBlock> & Pick<StatBlock, "abilities">): StatBlock => StatBlockSchema.parse(s);

const plainText = (traits: StatBlock["traits"]) => traits.map((t) => `<p><strong>${t.name}.</strong> ${t.text}</p>`).join("");

export function creature(
  base: Pick<CombatantDraft, "name" | "isMonster" | "ac" | "hpMax" | "speed"> & { size?: number },
  block: StatBlock,
): CombatantDraft {
  return {
    image: null,
    size: base.size ?? 1,
    group: "",
    initiative: 0,
    hpCurrent: base.hpMax,
    hpTemp: 0,
    attributes: "",
    saves: "",
    actions: "",
    notes: plainText(block.traits),
    ...base,
    stats: block,
  };
}

export interface ContentEntry {
  key: string;
  label: string;
  /** e.g. "CR 1/4 · Small humanoid" or "Level 1 Fighter" */
  subtitle: string;
  build: () => CombatantDraft;
}

// --- Monsters (SRD 5.2) ------------------------------------------------------

export const SRD_MONSTERS: ContentEntry[] = [
  {
    key: "goblin-warrior",
    label: "Goblin Warrior",
    subtitle: "CR 1/4 · Small fey (goblinoid)",
    build: () =>
      creature(
        { name: "Goblin Warrior", isMonster: true, ac: 15, hpMax: 10, speed: 30 },
        stats({
          alignment: "Chaotic Neutral",
          abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
          proficiency: 2,
          cr: "1/4",
          skills: { Stealth: 6 },
          actions: [
            attack({ name: "Scimitar", attackType: "melee", toHit: 4, finesse: true, damage: [{ dice: "1d6+2", type: "slashing" }], extraDamageOnAdvantage: [{ dice: "1d4", type: "slashing" }], notes: "+1d4 slashing if the attack roll had Advantage" }),
            attack({ name: "Shortbow", attackType: "ranged", toHit: 4, range: [80, 320], damage: [{ dice: "1d6+2", type: "piercing" }], extraDamageOnAdvantage: [{ dice: "1d4", type: "piercing" }], notes: "+1d4 piercing if the attack roll had Advantage" }),
          ],
          traits: [
            { name: "Darkvision", text: "60 ft." },
            { name: "Nimble Escape (Bonus Action)", text: "The goblin takes the Disengage or Hide action." },
          ],
          features: ["nimble-escape"],
        }),
      ),
  },
  {
    key: "wolf",
    label: "Wolf",
    subtitle: "CR 1/4 · Medium beast",
    build: () =>
      creature(
        { name: "Wolf", isMonster: true, ac: 12, hpMax: 11, speed: 40 },
        stats({
          alignment: "Unaligned",
          abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
          proficiency: 2,
          cr: "1/4",
          skills: { Perception: 5, Stealth: 4 },
          actions: [attack({ name: "Bite", attackType: "melee", toHit: 4, damage: [{ dice: "1d6+2", type: "piercing" }], onHitCondition: "Prone", notes: "A Medium or smaller target has the Prone condition" })],
          features: ["pack-tactics"],
          traits: [{ name: "Pack Tactics", text: "Advantage on attack rolls against a creature if an ally is within 5 ft. of it and isn't Incapacitated." }],
        }),
      ),
  },
  {
    key: "skeleton",
    label: "Skeleton",
    subtitle: "CR 1/4 · Medium undead",
    build: () =>
      creature(
        { name: "Skeleton", isMonster: true, ac: 14, hpMax: 13, speed: 30 },
        stats({
          alignment: "Lawful Evil",
          abilities: { str: 10, dex: 16, con: 15, int: 6, wis: 8, cha: 5 },
          proficiency: 2,
          cr: "1/4",
          creatureType: "undead",
          vulnerabilities: ["bludgeoning"],
          immunities: ["poison"],
          conditionImmunities: ["Exhaustion", "Poisoned"],
          actions: [
            attack({ name: "Shortsword", attackType: "melee", toHit: 5, damage: [{ dice: "1d6+3", type: "piercing" }] }),
            attack({ name: "Shortbow", attackType: "ranged", toHit: 5, range: [80, 320], damage: [{ dice: "1d6+3", type: "piercing" }] }),
          ],
          traits: [{ name: "Darkvision", text: "60 ft." }],
        }),
      ),
  },
  {
    key: "zombie",
    label: "Zombie",
    subtitle: "CR 1/4 · Medium undead",
    build: () =>
      creature(
        { name: "Zombie", isMonster: true, ac: 8, hpMax: 15, speed: 20 },
        stats({
          alignment: "Neutral Evil",
          abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
          proficiency: 2,
          cr: "1/4",
          creatureType: "undead",
          saveProficiencies: ["wis"],
          immunities: ["poison"],
          conditionImmunities: ["Exhaustion", "Poisoned"],
          actions: [attack({ name: "Slam", attackType: "melee", toHit: 3, damage: [{ dice: "1d8+1", type: "bludgeoning" }] })],
          features: ["undead-fortitude"],
          traits: [
            {
              name: "Undead Fortitude",
              text: "If damage reduces the zombie to 0 HP, it makes a Constitution save (DC 5 + the damage taken) unless the damage is Radiant or from a Critical Hit. On a success, it drops to 1 HP instead.",
            },
            { name: "Darkvision", text: "60 ft." },
          ],
        }),
      ),
  },
  {
    key: "bandit",
    label: "Bandit",
    subtitle: "CR 1/8 · Medium humanoid",
    build: () =>
      creature(
        { name: "Bandit", isMonster: true, ac: 12, hpMax: 11, speed: 30 },
        stats({
          alignment: "Neutral",
          abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
          proficiency: 2,
          cr: "1/8",
          actions: [
            attack({ name: "Scimitar", attackType: "melee", toHit: 3, damage: [{ dice: "1d6+1", type: "slashing" }] }),
            attack({ name: "Light Crossbow", attackType: "ranged", toHit: 3, range: [80, 320], damage: [{ dice: "1d8+1", type: "piercing" }] }),
          ],
        }),
      ),
  },
  // Added in M4; transcribed from the SRD 5.2 from memory — check against the PDF.
  {
    key: "giant-rat",
    label: "Giant Rat",
    subtitle: "CR 1/8 · Small beast",
    build: () =>
      creature(
        { name: "Giant Rat", isMonster: true, ac: 13, hpMax: 7, speed: 30 },
        stats({
          alignment: "Unaligned",
          abilities: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 },
          proficiency: 2,
          cr: "1/8",
          skills: { Perception: 2 },
          creatureType: "beast",
          actions: [attack({ name: "Bite", attackType: "melee", toHit: 4, damage: [{ dice: "1d4+2", type: "piercing" }] })],
          features: ["pack-tactics"],
          traits: [
            { name: "Pack Tactics", text: "Advantage on attack rolls against a creature if an ally is within 5 ft. of it and isn't Incapacitated." },
            { name: "Darkvision", text: "60 ft." },
          ],
        }),
      ),
  },
  {
    key: "cultist",
    label: "Cultist",
    subtitle: "CR 1/8 · Medium humanoid",
    build: () =>
      creature(
        { name: "Cultist", isMonster: true, ac: 12, hpMax: 9, speed: 30 },
        stats({
          alignment: "Neutral Evil",
          abilities: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 },
          proficiency: 2,
          cr: "1/8",
          skills: { Deception: 2, Religion: 2 },
          creatureType: "humanoid",
          actions: [
            attack({ name: "Ritual Sickle", attackType: "melee", toHit: 3, damage: [{ dice: "1d4+1", type: "slashing" }, { dice: "1", type: "necrotic" }] }),
          ],
          traits: [],
        }),
      ),
  },
  // Stronger foes for heroes of levels 3–5 (also transcribed from memory: check against the SRD 5.2).
  {
    key: "gnoll-warrior",
    label: "Gnoll Warrior",
    subtitle: "CR 1/2 · Medium fiend",
    build: () =>
      creature(
        { name: "Gnoll Warrior", isMonster: true, ac: 15, hpMax: 27, speed: 30 },
        stats({
          alignment: "Chaotic Evil",
          abilities: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 },
          proficiency: 2,
          cr: "1/2",
          creatureType: "fiend",
          actions: [
            attack({ name: "Rend", attackType: "melee", toHit: 4, damage: [{ dice: "1d6+2", type: "piercing" }] }),
            attack({ name: "Bone Bow", attackType: "ranged", toHit: 3, range: [150, 600], damage: [{ dice: "1d10+1", type: "piercing" }] }),
          ],
          traits: [{ name: "Darkvision", text: "60 ft." }],
        }),
      ),
  },
  {
    key: "bugbear-warrior",
    label: "Bugbear Warrior",
    subtitle: "CR 1 · Medium fey (goblinoid)",
    build: () =>
      creature(
        { name: "Bugbear Warrior", isMonster: true, ac: 14, hpMax: 33, speed: 30 },
        stats({
          alignment: "Chaotic Evil",
          abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
          proficiency: 2,
          cr: "1",
          creatureType: "fey",
          skills: { Stealth: 6, Survival: 2 },
          actions: [
            attack({ name: "Light Hammer", attackType: "melee", toHit: 4, reach: 10, damage: [{ dice: "3d4+2", type: "bludgeoning" }], notes: "Reach 10 ft" }),
            attack({ name: "Grab", attackType: "melee", toHit: 4, damage: [{ dice: "2d6+2", type: "bludgeoning" }] }),
          ],
          traits: [{ name: "Abduct", text: "Moves at full speed while dragging a creature." }],
        }),
      ),
  },
  {
    key: "bandit-captain",
    label: "Bandit Captain",
    subtitle: "CR 2 · Medium humanoid",
    build: () =>
      creature(
        { name: "Bandit Captain", isMonster: true, ac: 15, hpMax: 52, speed: 30 },
        stats({
          alignment: "Neutral",
          abilities: { str: 10, dex: 16, con: 14, int: 14, wis: 11, cha: 14 },
          proficiency: 2,
          cr: "2",
          creatureType: "humanoid",
          attacksPerAction: 2,
          skills: { Athletics: 4, Deception: 4 },
          actions: [
            attack({ name: "Scimitar", attackType: "melee", toHit: 5, finesse: true, damage: [{ dice: "1d6+3", type: "slashing" }] }),
            attack({ name: "Dagger", attackType: "ranged", toHit: 5, range: [20, 60], damage: [{ dice: "1d4+3", type: "piercing" }] }),
          ],
          traits: [{ name: "Multiattack", text: "Two attacks with its Scimitar or Dagger." }],
        }),
      ),
  },
];

// --- Ready-made party (level 1, 2024 rules) -----------------------------------

export const PARTY: ContentEntry[] = [
  {
    key: "fighter",
    label: "Brann Ironside",
    subtitle: "Level 1 Fighter · Human Soldier",
    build: () =>
      creature(
        { name: "Brann Ironside", isMonster: false, ac: 17, hpMax: 12, speed: 30 },
        stats({
          alignment: "Lawful Good",
          // Standard array; Soldier +2 STR, +1 CON.
          abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
          proficiency: 2,
          className: "Fighter",
          level: 1,
          saveProficiencies: ["str", "con"],
          skills: { Athletics: 5, Intimidation: 2, Perception: 3 },
          actions: [
            attack({ name: "Greatsword", attackType: "melee", toHit: 5, damage: [{ dice: "2d6+3", type: "slashing" }], mastery: "graze", notes: "Mastery: Graze — on a miss, deal 3 slashing damage" }),
            attack({ name: "Javelin", attackType: "ranged", toHit: 5, range: [30, 120], damage: [{ dice: "1d6+3", type: "piercing" }], mastery: "slow", notes: "Mastery: Slow — on a hit, speed −10 ft. until your next turn" }),
          ],
          traits: [
            { name: "Fighting Style: Defense", text: "+1 AC while wearing armor (included: Chain Mail 16 + 1)." },
            { name: "Second Wind (Bonus Action, 2/Long Rest)", text: "Regain 1d10 + 1 HP." },
            { name: "Weapon Mastery", text: "Greatsword (Graze), Javelin (Slow), Flail (Sap)." },
            { name: "Savage Attacker", text: "Once per turn, roll a weapon's damage dice twice and use either roll." },
          ],
          features: ["second-wind"],
        }),
      ),
  },
  {
    key: "rogue",
    label: "Pip Thistlefoot",
    subtitle: "Level 1 Rogue · Halfling Criminal",
    build: () =>
      creature(
        { name: "Pip Thistlefoot", isMonster: false, ac: 14, hpMax: 10, speed: 30 },
        stats({
          alignment: "Chaotic Good",
          // Standard array; Criminal +2 DEX, +1 CON.
          abilities: { str: 8, dex: 17, con: 15, int: 12, wis: 13, cha: 10 },
          proficiency: 2,
          className: "Rogue",
          level: 1,
          saveProficiencies: ["dex", "int"],
          skills: { Stealth: 7, "Sleight of Hand": 7, Acrobatics: 5, Perception: 3 },
          actions: [
            attack({ name: "Shortsword", attackType: "melee", toHit: 5, finesse: true, mastery: "vex", damage: [{ dice: "1d6+3", type: "piercing" }], notes: "Mastery: Vex — on a hit, Advantage on your next attack against that target" }),
            attack({ name: "Shortbow", attackType: "ranged", toHit: 5, range: [80, 320], finesse: true, mastery: "vex", damage: [{ dice: "1d6+3", type: "piercing" }], notes: "Mastery: Vex" }),
          ],
          traits: [
            { name: "Sneak Attack", text: "Once per turn, +1d6 damage to a Finesse or Ranged weapon hit if you have Advantage, or an ally is within 5 ft. of the target." },
            { name: "Expertise", text: "Stealth and Sleight of Hand." },
            { name: "Luck", text: "Reroll a 1 on a d20 Test." },
            { name: "Alert", text: "Add your Proficiency Bonus to Initiative." },
          ],
          features: ["sneak-attack"],
        }),
      ),
  },
  {
    key: "cleric",
    label: "Sister Maren",
    subtitle: "Level 1 Cleric · Dwarf Acolyte",
    build: () =>
      creature(
        { name: "Sister Maren", isMonster: false, ac: 15, hpMax: 11, speed: 30 },
        stats({
          alignment: "Neutral Good",
          // Standard array; Acolyte +2 WIS, +1 CHA.
          abilities: { str: 13, dex: 10, con: 14, int: 8, wis: 17, cha: 13 },
          proficiency: 2,
          className: "Cleric",
          level: 1,
          saveProficiencies: ["wis", "cha"],
          skills: { Insight: 5, Religion: 1, Medicine: 5 },
          resistances: ["poison"],
          actions: [
            attack({ name: "Mace", attackType: "melee", toHit: 3, damage: [{ dice: "1d6+1", type: "bludgeoning" }] }),
            save({ name: "Sacred Flame", save: "dex", dc: 13, range: 60, cantrip: true, damage: [{ dice: "1d8", type: "radiant" }], onSuccess: "none" }),
            attack({
              name: "Guiding Bolt",
              attackType: "ranged",
              toHit: 5,
              range: [120, 120],
              slot: 1,
              onHitEffect: "guided",
              damage: [{ dice: "4d6", type: "radiant" }],
              notes: "Next attack against the target before your next turn has Advantage",
            }),
            heal({ name: "Cure Wounds", dice: "2d8", ability: "wis", range: 5, slot: 1 }),
            heal({ name: "Healing Word", dice: "2d4", ability: "wis", range: 60, slot: 1, bonusAction: true }),
            buff({ name: "Bless", buff: "bless", range: 30, targets: 3, concentration: true, slot: 1, notes: "+1d4 to attack rolls and saving throws" }),
          ],
          spellSlots: [2],
          traits: [
            { name: "Spellcasting", text: "Spell save DC 13, spell attack +5. Prepared: Bless, Cure Wounds, Guiding Bolt, Healing Word." },
            { name: "Divine Order: Protector", text: "Martial weapons and Heavy armor." },
            { name: "Dwarven Resilience", text: "Resistance to Poison damage; Advantage on saves against Poisoned." },
            { name: "Dwarven Toughness", text: "+1 HP per level (included)." },
          ],
        }),
      ),
  },
  {
    key: "wizard",
    label: "Ezra Vell",
    subtitle: "Level 1 Wizard · Elf Sage",
    build: () =>
      creature(
        { name: "Ezra Vell", isMonster: false, ac: 11, hpMax: 8, speed: 30 },
        stats({
          alignment: "Neutral",
          // Standard array; Sage +2 INT, +1 CON.
          abilities: { str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 },
          proficiency: 2,
          className: "Wizard",
          level: 1,
          saveProficiencies: ["int", "wis"],
          skills: { Arcana: 5, History: 5, Perception: 3 },
          actions: [
            attack({ name: "Fire Bolt", attackType: "ranged", toHit: 5, range: [120, 120], cantrip: true, damage: [{ dice: "1d10", type: "fire" }] }),
            missile({ name: "Magic Missile", darts: 3, dice: "1d4+1", damageType: "force", range: 120, slot: 1 }),
            save({
              name: "Burning Hands",
              save: "dex",
              dc: 13,
              range: 15,
              area: { shape: "cone", size: 15 },
              slot: 1,
              damage: [{ dice: "3d6", type: "fire" }],
              onSuccess: "half",
            }),
            attack({ name: "Dagger", attackType: "melee", toHit: 3, finesse: true, damage: [{ dice: "1d4+1", type: "piercing" }] }),
          ],
          spellSlots: [2],
          features: ["shield-spell", "arcane-recovery"],
          traits: [
            { name: "Spellcasting", text: "Spell save DC 13, spell attack +5. Prepared: Burning Hands, Magic Missile, Shield (reaction: +5 AC when hit, cast automatically), Detect Magic." },
            { name: "Arcane Recovery", text: "Once per long rest, a short rest restores expended spell slots worth up to half your level (rounded up)." },
            { name: "Fey Ancestry", text: "Advantage on saves against Charmed." },
            { name: "Darkvision", text: "60 ft." },
          ],
        }),
      ),
  },
];

export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
