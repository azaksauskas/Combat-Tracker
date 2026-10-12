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

const attack = (a: ActionInput): StatAction => ({ id: newId(), kind: "attack", reach: 5, range: null, notes: "", ...a });
const save = (a: SaveInput): StatAction => ({ id: newId(), kind: "save", notes: "", ...a });
const stats = (s: Partial<StatBlock> & Pick<StatBlock, "abilities">): StatBlock => StatBlockSchema.parse(s);

const plainText = (traits: StatBlock["traits"]) => traits.map((t) => `<p><strong>${t.name}.</strong> ${t.text}</p>`).join("");

function creature(
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
            save({ name: "Sacred Flame (cantrip, 60 ft.)", save: "dex", dc: 13, damage: [{ dice: "1d8", type: "radiant" }], onSuccess: "none" }),
            attack({ name: "Guiding Bolt (1st-level slot)", attackType: "ranged", toHit: 5, range: [120, 120], damage: [{ dice: "4d6", type: "radiant" }], notes: "Next attack against the target before your next turn has Advantage" }),
          ],
          traits: [
            { name: "Spellcasting", text: "Spell save DC 13, spell attack +5. Two 1st-level slots. Prepared: Bless, Cure Wounds (2d8 + 3), Guiding Bolt, Healing Word (2d4 + 3)." },
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
          // Standard array; Sage +2 INT, +1 CON.
          abilities: { str: 8, dex: 13, con: 15, int: 17, wis: 12, cha: 10 },
          proficiency: 2,
          className: "Wizard",
          level: 1,
          saveProficiencies: ["int", "wis"],
          skills: { Arcana: 5, History: 5, Perception: 3 },
          actions: [
            attack({ name: "Fire Bolt (cantrip)", attackType: "ranged", toHit: 5, range: [120, 120], damage: [{ dice: "1d10", type: "fire" }] }),
            save({ name: "Burning Hands (1st-level slot, 15-ft. cone)", save: "dex", dc: 13, damage: [{ dice: "3d6", type: "fire" }], onSuccess: "half" }),
            attack({ name: "Dagger", attackType: "melee", toHit: 3, damage: [{ dice: "1d4+1", type: "piercing" }] }),
          ],
          traits: [
            { name: "Spellcasting", text: "Spell save DC 13, spell attack +5. Two 1st-level slots. Prepared: Burning Hands, Magic Missile (3 × 1d4 + 1 force, auto-hit), Shield, Mage Armor (AC 14)." },
            { name: "Fey Ancestry", text: "Advantage on saves against Charmed." },
            { name: "Darkvision", text: "60 ft." },
          ],
        }),
      ),
  },
];

export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
