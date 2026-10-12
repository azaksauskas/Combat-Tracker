import { PARTY, type ContentEntry } from "../content/srd";
import { secureRng, type Rng } from "../domain/dice";
import { ActionSchema, abilityMod, type Feature, type StatAction, type StatBlock } from "../domain/statblock";
import type { Cell } from "./board";
import { defaultResources, type UnitSetup } from "./engine";
import type { GameState } from "./state";

/**
 * The persistent party for adventures: levels, XP, HP between fights, hit
 * dice, limited-use features, gold and items. Pure functions; the 2024
 * rules for XP, level-up HP, and short/long rests.
 */

export interface Hero {
  /** Content key, e.g. "fighter". */
  key: string;
  name: string;
  className: string;
  level: number;
  stats: StatBlock;
  ac: number;
  speed: number;
  hp: number;
  hpMax: number;
  hitDie: number;
  /** Hit dice left to spend on short rests (max = level). */
  hitDice: number;
  resources: Record<string, number>;
  /** Item ids this hero has equipped, e.g. ["weapon-plus-1"]. */
  equipment: string[];
  dead: boolean;
}

export interface Party {
  heroes: Hero[];
  /** XP per character (everyone levels together). */
  xp: number;
  gold: number;
  /** Shared items: id → count. */
  items: Record<string, number>;
}

/** 2024 character advancement: XP needed for levels 1–5. */
export const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500];
export const MAX_LEVEL = 3;
export const levelForXp = (xp: number) => {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) if (xp >= XP_FOR_LEVEL[l]!) level = l;
  return level;
};

/** XP by challenge rating. */
export const XP_BY_CR: Record<string, number> = { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700 };

export const ITEMS: Record<string, { name: string; description: string; kind: "potion" | "equipment" }> = {
  "potion-healing": { name: "Potion of Healing", description: "Bonus action: you or an ally within 5 ft regains 2d4 + 2 HP.", kind: "potion" },
  "potion-greater-healing": { name: "Potion of Greater Healing", description: "Bonus action: regain 4d4 + 4 HP.", kind: "potion" },
  "weapon-plus-1": { name: "+1 Weapon", description: "Equip: +1 to attack and damage rolls with your weapons.", kind: "equipment" },
};

const HIT_DIE: Record<string, number> = { Fighter: 10, Rogue: 8, Cleric: 8, Wizard: 6 };

/** A fresh level-1 party from the ready-made heroes, or the ones you picked. */
export function createParty(members: ContentEntry[] = PARTY): Party {
  const heroes = members.map((p): Hero => {
    const c = p.build();
    const stats = c.stats!;
    return {
      key: p.key,
      name: c.name,
      className: stats.className ?? "Adventurer",
      level: 1,
      stats,
      ac: c.ac,
      speed: c.speed,
      hp: c.hpMax,
      hpMax: c.hpMax,
      hitDie: HIT_DIE[stats.className ?? ""] ?? 8,
      hitDice: 1,
      resources: defaultResources(stats),
      equipment: [],
      dead: false,
    };
  });
  return { heroes, xp: 0, gold: 0, items: {} };
}

// --- Level up ----------------------------------------------------------------------

interface ClassLevel {
  features?: Feature[];
  traits: { name: string; text: string }[];
  /** Spell slots at this level (replaces the previous table row). */
  spellSlots?: number[];
  /** New spells or attacks (the stat block gives the spell save DC). */
  actions?: (s: StatBlock) => StatAction[];
}

/** A spell learned on level-up, with a stable id. */
const spell = (a: Record<string, unknown> & { kind: StatAction["kind"]; name: string }): StatAction =>
  ActionSchema.parse({ id: `spell-${a.name.toLowerCase()}`, notes: "", ...a });

/** What each class gains at levels 2 and 3 (2024; SRD subclasses at 3). */
const CLASS_LEVELS: Record<string, Record<number, ClassLevel>> = {
  Fighter: {
    2: { features: ["action-surge"], traits: [{ name: "Action Surge (1/Short Rest)", text: "Take one additional action on your turn." }] },
    3: {
      features: ["improved-critical"],
      traits: [{ name: "Champion: Improved Critical", text: "Your attack rolls score a Critical Hit on a 19 or 20." }],
    },
  },
  Rogue: {
    2: { features: ["cunning-action"], traits: [{ name: "Cunning Action", text: "Bonus Action: Dash, Disengage or Hide." }] },
    3: { traits: [{ name: "Thief: Fast Hands", text: "Bonus Action: Sleight of Hand, use an object, or disarm a trap. Sneak Attack is now 2d6." }] },
  },
  Cleric: {
    2: {
      features: ["turn-undead"],
      spellSlots: [3],
      traits: [{ name: "Channel Divinity: Turn Undead (2/Long Rest, 1 back on a Short Rest)", text: "Undead within 30 ft make a Wisdom save or are Frightened and Incapacitated until they take damage." }],
    },
    3: {
      features: ["disciple-of-life"],
      spellSlots: [4, 2],
      actions: () => [spell({ kind: "buff", name: "Aid", buff: "aid", range: 30, targets: 3, slot: 2, notes: "+5 max HP and current HP until the end of the adventure day" })],
      traits: [
        { name: "Life Domain: Disciple of Life", text: "Healing spells that use a slot restore an extra 2 + the slot's level HP." },
        { name: "2nd-level spells", text: "Aid. Spell slots: four 1st, two 2nd." },
      ],
    },
  },
  Wizard: {
    2: { spellSlots: [3], traits: [{ name: "Scholar", text: "Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion." }] },
    3: {
      features: ["potent-cantrip"],
      spellSlots: [4, 2],
      actions: (st) => [
        spell({
          kind: "save",
          name: "Shatter",
          save: "con",
          dc: 8 + st.proficiency + abilityMod(st.abilities.int),
          range: 60,
          area: { shape: "sphere", size: 10 },
          slot: 2,
          damage: [{ dice: "3d8", type: "thunder" }],
          onSuccess: "half",
        }),
      ],
      traits: [
        { name: "Evoker: Potent Cantrip", text: "Your damaging cantrips deal half damage on a miss." },
        { name: "2nd-level spells", text: "Shatter. Spell slots: four 1st, two 2nd." },
      ],
    },
  },
};

export interface LevelUpReport {
  hero: Hero;
  level: number;
  hpGain: number;
  gains: string[];
}

/** One level: fixed HP (2024 average), a hit die, and class features. */
export function levelUp(hero: Hero): LevelUpReport {
  const level = hero.level + 1;
  // 2024 fixed HP: half the hit die + 1 + Con; dwarves get 1 more (Dwarven Toughness).
  const toughness = hero.stats.traits.some((t) => t.name === "Dwarven Toughness") ? 1 : 0;
  const hpGain = Math.max(1, hero.hitDie / 2 + 1 + abilityMod(hero.stats.abilities.con)) + toughness;
  const cl = CLASS_LEVELS[hero.className]?.[level] ?? { traits: [] };
  const stats: StatBlock = {
    ...hero.stats,
    level,
    features: [...hero.stats.features, ...(cl.features ?? [])],
    traits: [...hero.stats.traits, ...cl.traits],
    actions: [...hero.stats.actions, ...(cl.actions?.(hero.stats) ?? [])],
    spellSlots: cl.spellSlots ?? hero.stats.spellSlots,
  };
  const next: Hero = {
    ...hero,
    level,
    stats,
    hpMax: hero.hpMax + hpGain,
    hp: hero.dead ? 0 : hero.hp + hpGain,
    hitDice: hero.hitDice + 1,
    resources: { ...defaultResources(stats), ...hero.resources },
  };
  // A newly gained feature starts with full uses.
  for (const [k, v] of Object.entries(defaultResources(stats))) if (!(k in hero.resources)) next.resources[k] = v;
  // New spell slots arrive ready to use.
  stats.spellSlots.forEach((max, i) => {
    const k = `slot${i + 1}`;
    const gained = max - (hero.stats.spellSlots[i] ?? 0);
    if (gained > 0 && k in hero.resources) next.resources[k] = hero.resources[k]! + gained;
  });
  const slots = cl.spellSlots ? [`Spell slots: ${cl.spellSlots.map((n, i) => `${n} × level ${i + 1}`).join(", ")}`] : [];
  return { hero: next, level, hpGain, gains: [`+${hpGain} max HP`, ...slots, ...cl.traits.map((t) => t.name)] };
}

/** Adds XP and levels everyone up as far as it goes. */
export function gainXp(party: Party, xp: number): { party: Party; reports: LevelUpReport[] } {
  const total = party.xp + xp;
  const target = levelForXp(total);
  const reports: LevelUpReport[] = [];
  const heroes = party.heroes.map((h) => {
    let cur = h;
    // The fallen don't advance.
    while (!cur.dead && cur.level < target) {
      const r = levelUp(cur);
      reports.push(r);
      cur = r.hero;
    }
    return cur;
  });
  return { party: { ...party, xp: total, heroes }, reports };
}

// --- Rests -------------------------------------------------------------------------

export interface RestReport {
  lines: string[];
  party: Party;
}

/**
 * Short rest: each living hero may spend hit dice (d + Con mod each).
 * Second Wind and Channel Divinity regain one use; Action Surge comes back.
 */
export function shortRest(party: Party, spend: Record<string, number>, rng: Rng = secureRng): RestReport {
  const lines: string[] = [];
  const heroes = party.heroes.map((h) => {
    if (h.dead) return h;
    let hp = h.hp;
    let dice = h.hitDice;
    const n = Math.min(spend[h.key] ?? 0, dice);
    let healed = 0;
    for (let i = 0; i < n && hp < h.hpMax; i++) {
      const roll = Math.floor(rng() * h.hitDie) + 1 + abilityMod(h.stats.abilities.con);
      healed += Math.max(0, roll);
      hp = Math.min(h.hpMax, hp + Math.max(0, roll));
      dice -= 1;
    }
    if (healed) lines.push(`${h.name} spends ${h.hitDice - dice} hit ${h.hitDice - dice === 1 ? "die" : "dice"} and regains ${healed} HP.`);
    const full = defaultResources(h.stats);
    const resources = { ...h.resources };
    if ("second-wind" in full) resources["second-wind"] = Math.min(full["second-wind"]!, (resources["second-wind"] ?? 0) + 1);
    if ("channel-divinity" in full) resources["channel-divinity"] = Math.min(full["channel-divinity"]!, (resources["channel-divinity"] ?? 0) + 1);
    if ("action-surge" in full) resources["action-surge"] = full["action-surge"]!;
    // Arcane Recovery: slot levels worth up to half the wizard's level, highest first.
    if ((resources["arcane-recovery"] ?? 0) > 0) {
      let budget = Math.ceil(h.level / 2);
      const recovered: number[] = [];
      for (let lvl = h.stats.spellSlots.length; lvl >= 1; lvl--) {
        const k = `slot${lvl}`;
        while (lvl <= budget && (resources[k] ?? 0) < (full[k] ?? 0)) {
          resources[k] = (resources[k] ?? 0) + 1;
          budget -= lvl;
          recovered.push(lvl);
        }
      }
      if (recovered.length) {
        resources["arcane-recovery"] = 0;
        lines.push(`${h.name} uses Arcane Recovery: ${recovered.map((l) => `level ${l}`).join(", ")} slot back.`);
      }
    }
    return { ...h, hp, hitDice: dice, resources };
  });
  lines.push("Limited features recover (Second Wind, Action Surge, Channel Divinity). Spell slots come back after a long rest.");
  return { party: { ...party, heroes }, lines };
}

/** Long rest (2024): all HP, all hit dice and all uses back. The dead stay dead. */
export function longRest(party: Party): RestReport {
  const heroes = party.heroes.map((h) => (h.dead ? h : { ...h, hp: h.hpMax, hitDice: h.level, resources: defaultResources(h.stats) }));
  return { party: { ...party, heroes }, lines: ["After a long rest the party is fully restored."] };
}

// --- Equipment & fights --------------------------------------------------------------

/** Stat block with equipment applied (e.g. +1 weapon on every weapon attack). */
export function heroStats(hero: Hero): StatBlock {
  if (!hero.equipment.includes("weapon-plus-1")) return hero.stats;
  return {
    ...hero.stats,
    actions: hero.stats.actions.map((a) =>
      a.kind === "attack" && !a.cantrip && !a.slot
        ? { ...a, name: `${a.name} +1`, toHit: a.toHit + 1, damage: a.damage.map((d, i) => (i === 0 ? { ...d, dice: `${d.dice}+1` } : d)) }
        : a,
    ),
  };
}

export function equip(party: Party, heroKey: string, itemId: string): Party {
  if ((party.items[itemId] ?? 0) <= 0 || ITEMS[itemId]?.kind !== "equipment") return party;
  return {
    ...party,
    items: { ...party.items, [itemId]: party.items[itemId]! - 1 },
    heroes: party.heroes.map((h) => (h.key === heroKey ? { ...h, equipment: [...h.equipment, itemId] } : h)),
  };
}

export function unequip(party: Party, heroKey: string, itemId: string): Party {
  const hero = party.heroes.find((h) => h.key === heroKey);
  if (!hero?.equipment.includes(itemId)) return party;
  return {
    ...party,
    items: { ...party.items, [itemId]: (party.items[itemId] ?? 0) + 1 },
    heroes: party.heroes.map((h) => (h.key === heroKey ? { ...h, equipment: h.equipment.filter((e) => e !== itemId) } : h)),
  };
}

/** Living heroes as game units, placed on the given start squares. */
export function heroSetups(party: Party, starts: Cell[]): UnitSetup[] {
  return party.heroes
    .filter((h) => !h.dead)
    .map((h, i) => ({
      id: `hero:${h.key}`,
      name: h.name,
      side: "party" as const,
      stats: heroStats(h),
      ac: h.ac,
      hp: Math.max(1, h.hp),
      hpMax: h.hpMax,
      speed: h.speed,
      pos: starts[i] ?? { x: 0, y: i },
      resources: h.resources,
    }));
}

export function potionStash(party: Party): Record<string, number> {
  return Object.fromEntries(Object.entries(party.items).filter(([id, n]) => ITEMS[id]?.kind === "potion" && n > 0));
}

export interface FightResult {
  party: Party;
  xpEach: number;
  fallen: string[];
}

/**
 * Carries a finished battle back into the party: HP and feature uses,
 * potions drunk, the fallen, and XP for slain monsters (split per hero).
 * After a victory, unconscious-but-alive heroes wake with 1 HP.
 */
export function applyFight(party: Party, game: GameState): FightResult {
  const fallen: string[] = [];
  const heroes = party.heroes.map((h) => {
    const u = game.units.find((x) => x.id === `hero:${h.key}`);
    if (!u) return h;
    if (u.dead) {
      fallen.push(h.name);
      return { ...h, hp: 0, dead: true };
    }
    // Aid's extra HP ends with the fight; current HP can't exceed the hero's max.
    const hp = Math.min(h.hpMax, u.hp);
    return { ...h, hp: hp > 0 ? hp : game.outcome === "victory" ? 1 : 0, resources: { ...u.resources } };
  });
  const monsterXp = game.units
    .filter((u) => u.side === "enemy" && u.dead)
    .reduce((n, u) => n + (XP_BY_CR[u.stats.cr ?? ""] ?? 0), 0);
  const xpEach = Math.floor(monsterXp / Math.max(1, party.heroes.length));
  const items = { ...party.items };
  for (const [id, n] of Object.entries(game.stash ?? {})) items[id] = n;
  return { party: { ...party, heroes, items }, xpEach, fallen };
}
