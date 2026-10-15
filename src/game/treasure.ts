import type { DamageType, StatAction } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";
import { mulberry32 } from "./rng";
import { num } from "./tuning";

/**
 * Magic items (SRD 5.2, the ones the rules engine can run) and a few unique
 * treasures; loot chests and what's in them; what the smithy and the mage
 * tower can make. Pure functions: the town-store keeps the player's items.
 */

export const RARITIES = ["uncommon", "rare", "very-rare", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY: Record<Rarity, { name: string; color: string }> = {
  uncommon: { name: "Uncommon", color: "#3f9b4a" },
  rare: { name: "Rare", color: "#3a74c9" },
  "very-rare": { name: "Very rare", color: "#8b4fc9" },
  legendary: { name: "Legendary", color: "#d08a1c" },
};

/** Where an item sits: on the weapon in hand, on the armour, on the shield, or worn (cloaks, rings, wands…). */
export type ItemSlot = "weapon" | "armor" | "shield" | "worn";

/** What an item does to its wearer's sheet. */
export interface ItemEffect {
  /** Weapon in hand: + to attack and damage rolls. */
  weapon?: number;
  /** Weapon in hand: extra damage on every hit. */
  extra?: { dice: string; type: DamageType };
  ac?: number;
  /** AC while wearing no armour and no shield (Bracers of Defense). */
  acUnarmored?: number;
  saves?: number;
  /** + to spell attack rolls and spell save DCs. */
  spells?: number;
  hp?: number;
  speed?: number;
  resist?: DamageType[];
  /** Constitution becomes this (if lower): more hit points. */
  con?: number;
  /** Extra 1st-level spell slots. */
  slots?: number;
  /** Time in the infirmary is cut by half. */
  mending?: boolean;
}

export interface MagicItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  slot: ItemSlot;
  attune: boolean;
  icon: string;
  /** What it does, in the game's terms. */
  text: string;
  effect: ItemEffect;
  /** A one-of-a-kind treasure: each player finds it at most once. */
  unique?: boolean;
  lore?: string;
}

const item = (d: MagicItemDef) => d;
const plus = (slot: "weapon" | "armor" | "shield", n: number, rarity: Rarity): MagicItemDef => {
  const base = { weapon: ["Weapon", "🗡"], armor: ["Armor", "🥋"], shield: ["Shield", "🛡"] }[slot];
  return item({
    id: `${slot}-plus-${n}`,
    name: `${base[0]}, +${n}`,
    rarity,
    slot,
    attune: false,
    icon: base[1]!,
    text: slot === "weapon" ? `+${n} to attack and damage rolls with the weapon in hand.` : `+${n} AC while you ${slot === "armor" ? "wear armour" : "carry a shield"}.`,
    effect: slot === "weapon" ? { weapon: n } : { ac: n },
  });
};
const resistance = (type: DamageType) =>
  item({ id: `ring-resistance-${type}`, name: `Ring of Resistance (${type})`, rarity: "rare", slot: "worn", attune: true, icon: "💍", text: `Resistance to ${type} damage.`, effect: { resist: [type] } });

export const MAGIC_ITEMS: Record<string, MagicItemDef> = Object.fromEntries(
  [
    plus("weapon", 1, "uncommon"),
    plus("weapon", 2, "rare"),
    plus("weapon", 3, "very-rare"),
    plus("shield", 1, "uncommon"),
    plus("shield", 2, "rare"),
    plus("shield", 3, "very-rare"),
    plus("armor", 1, "rare"),
    plus("armor", 2, "very-rare"),
    plus("armor", 3, "legendary"),
    item({ id: "flame-tongue", name: "Flame Tongue", rarity: "rare", slot: "weapon", attune: true, icon: "🔥", text: "The weapon in hand burns: +2d6 fire damage on a hit.", effect: { extra: { dice: "2d6", type: "fire" } } }),
    item({ id: "frost-brand", name: "Frost Brand", rarity: "very-rare", slot: "weapon", attune: true, icon: "❄", text: "+1d6 cold damage on a hit, and resistance to fire.", effect: { extra: { dice: "1d6", type: "cold" }, resist: ["fire"] } }),
    item({ id: "cloak-of-protection", name: "Cloak of Protection", rarity: "uncommon", slot: "worn", attune: true, icon: "🧥", text: "+1 AC and +1 to saving throws.", effect: { ac: 1, saves: 1 } }),
    item({ id: "ring-of-protection", name: "Ring of Protection", rarity: "rare", slot: "worn", attune: true, icon: "💍", text: "+1 AC and +1 to saving throws.", effect: { ac: 1, saves: 1 } }),
    item({ id: "bracers-of-defense", name: "Bracers of Defense", rarity: "rare", slot: "worn", attune: true, icon: "🔰", text: "+2 AC while you wear no armour and carry no shield.", effect: { acUnarmored: 2 } }),
    item({ id: "stone-of-good-luck", name: "Stone of Good Luck", rarity: "uncommon", slot: "worn", attune: true, icon: "🍀", text: "+1 to saving throws (and, at the table, to ability checks).", effect: { saves: 1 } }),
    item({ id: "amulet-of-health", name: "Amulet of Health", rarity: "rare", slot: "worn", attune: true, icon: "📿", text: "Your Constitution becomes 19: more hit points.", effect: { con: 19 } }),
    item({ id: "periapt-of-wound-closure", name: "Periapt of Wound Closure", rarity: "uncommon", slot: "worn", attune: true, icon: "🩹", text: "Wounds close fast: half the time in the infirmary.", effect: { mending: true } }),
    item({ id: "pearl-of-power", name: "Pearl of Power", rarity: "uncommon", slot: "worn", attune: true, icon: "⚪", text: "One more 1st-level spell slot.", effect: { slots: 1 } }),
    item({ id: "boots-of-speed", name: "Boots of Speed", rarity: "rare", slot: "worn", attune: true, icon: "👢", text: "+10 ft speed (a click of the heels at the start of the fight).", effect: { speed: 10 } }),
    item({ id: "wand-of-the-war-mage-1", name: "Wand of the War Mage, +1", rarity: "uncommon", slot: "worn", attune: true, icon: "🪄", text: "+1 to spell attack rolls and spell save DCs.", effect: { spells: 1 } }),
    item({ id: "wand-of-the-war-mage-2", name: "Wand of the War Mage, +2", rarity: "rare", slot: "worn", attune: true, icon: "🪄", text: "+2 to spell attack rolls and spell save DCs.", effect: { spells: 2 } }),
    item({ id: "wand-of-the-war-mage-3", name: "Wand of the War Mage, +3", rarity: "very-rare", slot: "worn", attune: true, icon: "🪄", text: "+3 to spell attack rolls and spell save DCs.", effect: { spells: 3 } }),
    resistance("fire"),
    resistance("cold"),
    resistance("necrotic"),
    resistance("poison"),
    // One of a kind.
    item({
      id: "emberbrand",
      name: "Emberbrand",
      rarity: "legendary",
      slot: "weapon",
      attune: true,
      icon: "🌋",
      unique: true,
      text: "+2 to attack and damage, +1d6 fire on a hit, and resistance to cold.",
      effect: { weapon: 2, extra: { dice: "1d6", type: "fire" }, resist: ["cold"] },
      lore: "Forged for a bandit king who never lived to hold it. The steel is warm to the touch, even in snow.",
    }),
    item({
      id: "crypt-wardens-mantle",
      name: "The Crypt-Warden's Mantle",
      rarity: "legendary",
      slot: "worn",
      attune: true,
      icon: "🦇",
      unique: true,
      text: "+2 AC and +2 to saving throws; resistance to necrotic damage.",
      effect: { ac: 2, saves: 2, resist: ["necrotic"] },
      lore: "Woven from grave-moss by the last keeper of the hill crypt, so the dead would know her as one of their own.",
    }),
    item({
      id: "hearthstone",
      name: "Hearthstone",
      rarity: "very-rare",
      slot: "worn",
      attune: true,
      icon: "🏡",
      unique: true,
      text: "+5 maximum HP, and half the time in the infirmary.",
      effect: { hp: 5, mending: true },
      lore: "A pebble from the first hearth of the first village on this road. Whoever carries it always finds the way home.",
    }),
    item({
      id: "staff-of-the-last-dawn",
      name: "Staff of the Last Dawn",
      rarity: "legendary",
      slot: "worn",
      attune: true,
      icon: "🌅",
      unique: true,
      text: "+2 to spell attacks and spell save DCs, and two more 1st-level spell slots.",
      effect: { spells: 2, slots: 2 },
      lore: "Its crystal holds the light of a sunrise that ended a war. It will not glow at night.",
    }),
    item({
      id: "wolfsong",
      name: "Wolfsong",
      rarity: "very-rare",
      slot: "weapon",
      attune: true,
      icon: "🐺",
      unique: true,
      text: "+1 to attack and damage, +1d8 piercing on a hit, and +10 ft speed.",
      effect: { weapon: 1, extra: { dice: "1d8", type: "piercing" }, speed: 10 },
      lore: "A huntress's weapon; the pack she ran with still howls when it is drawn.",
    }),
  ].map((d) => [d.id, d]),
);

export const isMagicItem = (id: string) => id in MAGIC_ITEMS;
export const MAX_ATTUNED = 3;

/** One item a player owns; `on` is the hero carrying it. */
export interface Treasure {
  uid: string;
  id: string;
  on?: string;
}

/** What the hero carries that magic items need. */
export interface Carrying {
  weapon: boolean;
  armor: boolean;
  shield: boolean;
}

/** Why this hero can't take this item now, or null. */
export function cantEquip(def: MagicItemDef, worn: MagicItemDef[], carrying: Carrying): string | null {
  if (def.slot === "weapon" && !carrying.weapon) return "Needs a weapon in hand";
  if (def.slot === "armor" && !carrying.armor) return "Needs armour to enchant";
  if (def.slot === "shield" && !carrying.shield) return "Needs a shield";
  if (def.slot !== "worn" && worn.some((w) => w.slot === def.slot)) return `Already has a magic ${def.slot === "armor" ? "armour" : def.slot}`;
  if (def.slot === "worn" && worn.some((w) => w.id === def.id)) return `Already wears one`;
  if (def.attune && worn.filter((w) => w.attune).length >= MAX_ATTUNED) return `Attuned to ${MAX_ATTUNED} items already`;
  return null;
}

const isSpell = (a: StatAction) => !!a.slot || !!a.cantrip;
/** "1d8+3" + 1 → "1d8+4". */
function addToDice(dice: string, n: number): string {
  if (!n) return dice;
  const m = /^(.*?)([+-]\d+)$/.exec(dice);
  const total = (m ? Number(m[2]) : 0) + n;
  const base = m ? m[1]! : dice;
  return total ? `${base}${total > 0 ? "+" : ""}${total}` : base;
}
const mod = (score: number) => Math.floor((score - 10) / 2);

/** The weapon attacks a magic weapon applies to: the one in hand, or (on a ready-made sheet) the first weapon. */
function inHand(actions: StatAction[]): (a: StatAction) => boolean {
  const weapons = actions.filter((a) => a.kind === "attack" && !isSpell(a));
  if (weapons.some((a) => a.kind === "attack" && a.hand)) return (a) => a.kind === "attack" && a.hand === "main";
  const first = weapons[0]?.name;
  return (a) => !!first && a.kind === "attack" && !isSpell(a) && (a.name === first || a.name === `${first} (thrown)`);
}

/** A hero's sheet with their magic items applied. */
export function applyTreasure<T extends Pick<CombatantDraft, "ac" | "stats" | "hpMax" | "hpCurrent" | "speed">>(c: T, items: MagicItemDef[], carrying: Carrying): T {
  if (!c.stats || !items.length) return c;
  const sum = (k: "ac" | "saves" | "spells" | "hp" | "speed" | "slots") => items.reduce((n, i) => n + (i.effect[k] ?? 0), 0);
  const weapon = items.filter((i) => i.slot === "weapon");
  const bonus = weapon.reduce((n, i) => n + (i.effect.weapon ?? 0), 0);
  const extras = weapon.flatMap((i) => (i.effect.extra ? [i.effect.extra] : []));
  const spells = sum("spells");
  const held = inHand(c.stats.actions);
  const actions = c.stats.actions.map((a): StatAction => {
    if (held(a) && a.kind === "attack") {
      return { ...a, toHit: a.toHit + bonus, damage: [...a.damage.map((d, i) => (i === 0 ? { ...d, dice: addToDice(d.dice, bonus) } : d)), ...extras] };
    }
    if (spells && isSpell(a)) {
      if (a.kind === "attack") return { ...a, toHit: a.toHit + spells };
      if (a.kind === "save") return { ...a, dc: a.dc + spells };
    }
    return a;
  });
  // Amulet of Health: Constitution 19 (if lower) → more hit points per level.
  const con = Math.max(c.stats.abilities.con, ...items.map((i) => i.effect.con ?? 0));
  const conHp = (mod(con) - mod(c.stats.abilities.con)) * (c.stats.level ?? 1);
  const hpMax = c.hpMax + sum("hp") + conHp;
  const bare = !carrying.armor && !carrying.shield;
  const ac = c.ac + sum("ac") + (bare ? items.reduce((n, i) => n + (i.effect.acUnarmored ?? 0), 0) : 0);
  const resist = [...new Set([...c.stats.resistances, ...items.flatMap((i) => i.effect.resist ?? [])])];
  const slots = sum("slots");
  const spellSlots = slots && c.stats.spellSlots.length ? [c.stats.spellSlots[0]! + slots, ...c.stats.spellSlots.slice(1)] : c.stats.spellSlots;
  return {
    ...c,
    ac,
    hpMax,
    hpCurrent: Math.min(c.hpCurrent + (hpMax - c.hpMax), hpMax),
    speed: c.speed + sum("speed"),
    stats: {
      ...c.stats,
      abilities: { ...c.stats.abilities, con },
      allSaves: (c.stats.allSaves ?? 0) + sum("saves"),
      resistances: resist,
      spellSlots,
      actions,
    },
  };
}

// --- Loot chests --------------------------------------------------------------------------

export interface Chest {
  id: string;
  /** 1 wooden … 4 gilded. */
  tier: number;
  /** Where it was found. */
  from: string;
  seed: number;
}

export const CHESTS = [
  { name: "Wooden chest", icon: "📦" },
  { name: "Iron-bound chest", icon: "🧰" },
  { name: "Silver chest", icon: "🗃" },
  { name: "Gilded chest", icon: "👑" },
] as const;
export const chestLook = (tier: number) => CHESTS[Math.min(4, Math.max(1, tier)) - 1]!;

/** A chest's tier: how hard the fight was, plus the heroes' level. */
export const chestTier = (base: number, level: number) => Math.min(4, Math.max(1, base + Math.floor((level - 1) / 2)));

/** Rarity weights per tier (uncommon, rare, very rare, legendary). */
const RARITY_WEIGHTS: Record<number, number[]> = {
  1: [90, 10, 0, 0],
  2: [70, 27, 3, 0],
  3: [40, 45, 13, 2],
  4: [20, 45, 28, 7],
};

export interface Loot {
  gold: number;
  iron: number;
  herbs: number;
  dust: number;
  items: string[];
}

/** What's in a chest (decided by its seed; uniques already found are skipped). */
export function openChest(chest: Chest, foundUniques: string[]): Loot {
  const rng = mulberry32(chest.seed).rng;
  const t = Math.min(4, Math.max(1, chest.tier));
  const roll = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const loot: Loot = {
    gold: Math.round(roll(5, 15) * t * num("loot.goldMultiplier")),
    iron: rng() < 0.5 ? roll(1, t + 1) : 0,
    herbs: rng() < 0.4 ? roll(1, t) : 0,
    dust: rng() < 0.3 + 0.15 * t ? roll(1, t) : 0,
    items: [],
  };
  const pick = (): string | null => {
    const weights = RARITY_WEIGHTS[t]!;
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < weights.length - 1 && r >= weights[i]!) r -= weights[i++]!;
    const pool = Object.values(MAGIC_ITEMS).filter((d) => !d.unique && d.rarity === RARITIES[i]);
    return pool.length ? pool[Math.floor(rng() * pool.length)]!.id : null;
  };
  if (rng() < num(`loot.itemChance${t}`)) {
    const id = pick();
    if (id) loot.items.push(id);
  }
  if (t === 4 && rng() < 0.5) {
    const id = pick();
    if (id) loot.items.push(id);
  }
  const uniques = Object.values(MAGIC_ITEMS).filter((d) => d.unique && !foundUniques.includes(d.id));
  if (t >= 3 && uniques.length && rng() < num("loot.uniqueChance") * (t - 2)) loot.items.push(uniques[Math.floor(rng() * uniques.length)]!.id);
  return loot;
}

/** What an item fetches at the market, and the dust the mage tower draws out of it. */
export const sellValue = (id: string) => Math.round(num(`treasure.value.${MAGIC_ITEMS[id]?.rarity ?? "uncommon"}`) * num("treasure.sellShare"));
export const dustValue = (id: string) => num(`treasure.dust.${MAGIC_ITEMS[id]?.rarity ?? "uncommon"}`);

// --- Making them --------------------------------------------------------------------------

export interface Recipe {
  item: string;
  at: "smithy" | "tower";
  /** The building level it takes. */
  level: number;
  gold: number;
  iron: number;
  dust: number;
  hours: number;
}

/** Base costs by rarity (scaled by tuning). */
const RECIPE_COST: Record<Rarity, { gold: number; iron: number; dust: number; hours: number }> = {
  uncommon: { gold: 80, iron: 4, dust: 3, hours: 12 },
  rare: { gold: 250, iron: 8, dust: 8, hours: 24 },
  "very-rare": { gold: 700, iron: 14, dust: 18, hours: 48 },
  legendary: { gold: 2000, iron: 25, dust: 40, hours: 96 },
};

const RECIPES_BASE: [string, "smithy" | "tower", number][] = [
  ["weapon-plus-1", "smithy", 2],
  ["shield-plus-1", "smithy", 2],
  ["weapon-plus-2", "smithy", 3],
  ["shield-plus-2", "smithy", 3],
  ["armor-plus-1", "smithy", 3],
  ["weapon-plus-3", "smithy", 5],
  ["shield-plus-3", "smithy", 5],
  ["armor-plus-2", "smithy", 5],
  ["cloak-of-protection", "tower", 1],
  ["stone-of-good-luck", "tower", 1],
  ["wand-of-the-war-mage-1", "tower", 1],
  ["periapt-of-wound-closure", "tower", 1],
  ["pearl-of-power", "tower", 2],
  ["ring-of-protection", "tower", 2],
  ["bracers-of-defense", "tower", 2],
  ["boots-of-speed", "tower", 3],
  ["amulet-of-health", "tower", 3],
  ["wand-of-the-war-mage-2", "tower", 3],
  ["flame-tongue", "tower", 3],
  ["ring-resistance-fire", "tower", 2],
  ["ring-resistance-cold", "tower", 2],
  ["ring-resistance-necrotic", "tower", 2],
  ["ring-resistance-poison", "tower", 2],
];

/** What the smithy and the mage tower can make, with costs from the DM's tuning. */
export function recipes(): Recipe[] {
  const k = num("treasure.craftMultiplier");
  return RECIPES_BASE.map(([id, at, level]) => {
    const c = RECIPE_COST[MAGIC_ITEMS[id]!.rarity];
    // Iron for the smith, dust for the mage; a little of the other.
    const iron = at === "smithy" ? c.iron : Math.ceil(c.iron / 4);
    const dust = at === "tower" ? c.dust : Math.ceil(c.dust / 3);
    return { item: id, at, level, gold: Math.round(c.gold * k), iron, dust, hours: c.hours };
  });
}
