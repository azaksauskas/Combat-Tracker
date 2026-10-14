import type { ContentEntry } from "../content/srd";
import type { StatAction, StatBlock } from "../domain/statblock";
import type { Town } from "../domain/town";
import type { CombatantDraft } from "../store/actions";
import type { GameState } from "./state";
import { num } from "./tuning";

/**
 * Crafting in the town: mods fitted at the smithy (one per slot per hero:
 * weapon, armour, spell focus) and potions brewed at the apothecary.
 * Components are salvaged from battles, gathered, or bought at the market.
 * Pure functions; the town-store applies them.
 */

export type Component = "iron" | "herbs" | "dust";
export const COMPONENTS: Record<Component, { name: string; icon: string; price: number }> = {
  iron: { name: "Iron", icon: "⛓", get price() { return num("price.iron"); } },
  herbs: { name: "Herbs", icon: "🌿", get price() { return num("price.herbs"); } },
  dust: { name: "Arcane dust", icon: "✨", get price() { return num("price.dust"); } },
};

export interface Cost {
  gold: number;
  iron?: number;
  herbs?: number;
  dust?: number;
}

export type Slot = "weapon" | "armour" | "focus";
export const SLOTS: Record<Slot, string> = { weapon: "Weapon", armour: "Armour", focus: "Spell focus" };

export interface ModDef {
  name: string;
  slot: Slot;
  description: string;
  cost: Cost;
  /** Game hours of work. */
  hours: number;
}

const STATIC_MODS: Record<string, ModDef> = {
  "mod-sharp": { name: "Honed edge", slot: "weapon", description: "+1 damage with weapon attacks.", cost: { gold: 10, iron: 2 }, hours: 3 },
  "mod-balanced": { name: "Balanced grip", slot: "weapon", description: "+1 to hit with weapon attacks.", cost: { gold: 15, iron: 3 }, hours: 4 },
  "mod-flame": { name: "Fire rune", slot: "weapon", description: "Weapon hits deal an extra 1d4 fire damage.", cost: { gold: 30, iron: 2, dust: 2 }, hours: 6 },
  "mod-plate": { name: "Riveted plates", slot: "armour", description: "+1 AC.", cost: { gold: 25, iron: 4 }, hours: 6 },
  "mod-crystal": { name: "Focus crystal", slot: "focus", description: "+1 to spell attacks and spell save DCs.", cost: { gold: 30, dust: 3 }, hours: 6 },
  "mod-lens": { name: "Splitting lens", slot: "focus", description: "Magic Missile fires one more dart.", cost: { gold: 25, dust: 2, iron: 1 }, hours: 4 },
};

export interface BrewDef {
  cost: Cost;
  hours: number;
}

/** Item ids from party.ts ITEMS. */
const STATIC_BREWS: Record<string, BrewDef> = {
  "potion-healing": { cost: { gold: 5, herbs: 2 }, hours: 2 },
  "potion-greater-healing": { cost: { gold: 20, herbs: 4, dust: 1 }, hours: 6 },
};

const tunedCost = (prefix: string): Cost => ({ gold: num(`${prefix}.gold`), iron: num(`${prefix}.iron`), herbs: num(`${prefix}.herbs`), dust: num(`${prefix}.dust`) });

/** Mods with costs and hours from the DM's tuning. */
export const MODS: Record<string, ModDef> = Object.fromEntries(
  Object.entries(STATIC_MODS).map(([id, m]) => [
    id,
    Object.defineProperties({ ...m }, { cost: { get: () => tunedCost(id), enumerable: true }, hours: { get: () => num(`${id}.hours`), enumerable: true } }),
  ]),
);

/** Brews with costs and hours from the DM's tuning. */
export const BREWS: Record<string, BrewDef> = Object.fromEntries(
  Object.entries(STATIC_BREWS).map(([id, b]) => [
    id,
    Object.defineProperties({ ...b }, { cost: { get: () => ({ gold: num(`brew.${id}.gold`), herbs: num(`brew.${id}.herbs`), dust: num(`brew.${id}.dust`) }), enumerable: true }, hours: { get: () => num(`brew.${id}.hours`), enumerable: true } }),
  ]),
);

const isSpell = (a: StatAction) => !!a.slot || !!a.cantrip;
const isWeapon = (a: StatAction) => a.kind === "attack" && !isSpell(a);
export const isCaster = (s: StatBlock) => s.actions.some(isSpell);

/** Can this hero use a mod in this slot? */
export function fits(mod: ModDef, stats: StatBlock): boolean {
  if (mod.slot === "weapon") return stats.actions.some(isWeapon);
  if (mod.slot === "focus") return isCaster(stats) && (mod.name !== "Splitting lens" || stats.actions.some((a) => a.kind === "missile"));
  return true;
}

export function costText(c: Cost): string {
  return [c.gold ? `${c.gold} gold` : "", ...(["iron", "herbs", "dust"] as const).map((k) => (c[k] ? `${c[k]} ${COMPONENTS[k].name.toLowerCase()}` : ""))].filter(Boolean).join(" · ");
}

/** Why the town can't pay for this, or null. */
export function cantAfford(t: Town, c: Cost): string | null {
  if (t.gold < c.gold) return `Needs ${c.gold} gold`;
  for (const k of ["iron", "herbs", "dust"] as const) if ((c[k] ?? 0) > t.components[k]) return `Needs ${c[k]} ${COMPONENTS[k].name.toLowerCase()}`;
  return null;
}

export function pay(t: Town, c: Cost): Town {
  const why = cantAfford(t, c);
  if (why) throw new Error(why);
  return {
    ...t,
    gold: t.gold - c.gold,
    components: { iron: t.components.iron - (c.iron ?? 0), herbs: t.components.herbs - (c.herbs ?? 0), dust: t.components.dust - (c.dust ?? 0) },
  };
}

export function addComponents(t: Town, add: Partial<Record<Component, number>>): Town {
  return { ...t, components: { iron: t.components.iron + (add.iron ?? 0), herbs: t.components.herbs + (add.herbs ?? 0), dust: t.components.dust + (add.dust ?? 0) } };
}

/** A hero's mods after fitting a new one: it replaces whatever was in that slot. */
export function fitMod(current: string[], modId: string): string[] {
  const slot = MODS[modId]?.slot;
  return [...current.filter((m) => MODS[m]?.slot !== slot), modId];
}

const addToDice = (dice: string, n: number) => `${dice}${n >= 0 ? "+" : ""}${n}`;

/** A character with their mods applied (stat block and AC). */
export function applyMods<T extends Pick<CombatantDraft, "ac" | "stats">>(c: T, mods: string[]): T {
  if (!c.stats || !mods.length) return c;
  const has = (id: string) => mods.includes(id);
  const actions = c.stats.actions.map((a): StatAction => {
    if (isWeapon(a) && a.kind === "attack") {
      let w = a;
      if (has("mod-sharp")) w = { ...w, damage: w.damage.map((d, i) => (i === 0 ? { ...d, dice: addToDice(d.dice, 1) } : d)) };
      if (has("mod-balanced")) w = { ...w, toHit: w.toHit + 1 };
      if (has("mod-flame")) w = { ...w, damage: [...w.damage, { dice: "1d4", type: "fire" }] };
      return w;
    }
    if (isSpell(a) && has("mod-crystal")) {
      if (a.kind === "attack") return { ...a, toHit: a.toHit + 1 };
      if (a.kind === "save") return { ...a, dc: a.dc + 1 };
    }
    if (a.kind === "missile" && has("mod-lens")) return { ...a, darts: a.darts + 1 };
    return a;
  });
  return { ...c, ac: c.ac + (has("mod-plate") ? 1 : 0), stats: { ...c.stats, actions } };
}

/** A party member with their mods, for skirmishes and adventures. */
export function withMods(e: ContentEntry, mods: string[] | undefined): ContentEntry {
  if (!mods?.length) return e;
  return { ...e, build: () => applyMods(e.build(), mods) };
}

/** What can be salvaged from a won battle: iron from armed foes, dust from the undead. */
export function salvage(game: GameState): Partial<Record<Component, number>> {
  if (game.outcome !== "victory") return {};
  // Foes who ran off took their gear with them.
  const fallen = game.units.filter((u) => u.side === "enemy" && u.dead && !u.fled);
  const undead = fallen.filter((u) => u.stats.creatureType === "undead").length;
  const armed = fallen.filter((u) => u.stats.creatureType !== "beast" && u.stats.actions.some((a) => a.kind === "attack" && /sword|scimitar|axe|mace|bow|sickle|spear|dagger/i.test(a.name))).length;
  return { iron: Math.ceil(armed / 2), dust: undead };
}
