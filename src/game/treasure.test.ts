import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { saveBonus } from "../domain/statblock";
import { applyLoadout } from "./arsenal";
import { MAGIC_ITEMS, MAX_ATTUNED, RARITIES, applyTreasure, cantEquip, chestTier, openChest, recipes } from "./treasure";

const hero = (key: string) => PARTY.find((p) => p.key === key)!.build();
const items = (...ids: string[]) => ids.map((i) => MAGIC_ITEMS[i]!);
const armed = { weapon: true, armor: true, shield: false };
const action = (c: ReturnType<typeof hero>, name: string) => c.stats!.actions.find((a) => a.name === name);

describe("magic items", () => {
  it("a magic weapon works on the weapon in hand only", () => {
    const brann = hero("fighter");
    const plain = action(brann, "Greatsword") as { toHit: number };
    const plus = applyTreasure(brann, items("weapon-plus-2", "flame-tongue"), armed);
    expect(action(plus, "Greatsword")).toMatchObject({ toHit: plain.toHit + 2, damage: [{ dice: "2d6+5" }, { dice: "2d6", type: "fire" }] });
    // The javelin isn't in hand.
    expect(action(plus, "Javelin")).toEqual(action(brann, "Javelin"));
    // With a loadout, the main-hand weapon (and its thrown use) gets it; the spare doesn't.
    const kitted = applyLoadout(brann, { main: "handaxe", spare: "longbow", armor: "chain-mail" });
    const after = applyTreasure(kitted, items("weapon-plus-1"), armed);
    expect((action(after, "Handaxe (thrown)") as { toHit: number }).toHit).toBe((action(kitted, "Handaxe (thrown)") as { toHit: number }).toHit + 1);
    expect(action(after, "Longbow")).toEqual(action(kitted, "Longbow"));
  });

  it("protection, health, power and the war mage's wand", () => {
    const ezra = hero("wizard");
    const worn = applyTreasure(ezra, items("cloak-of-protection", "bracers-of-defense", "amulet-of-health"), { weapon: true, armor: false, shield: false });
    expect(worn.ac).toBe(ezra.ac + 1 + 2);
    expect(saveBonus(worn.stats!, "dex")).toBe(saveBonus(ezra.stats!, "dex") + 1);
    // Con 15 → 19: +2 HP per level.
    expect(worn.hpMax).toBe(ezra.hpMax + 2);
    // Bracers do nothing over armour.
    expect(applyTreasure(hero("cleric"), items("bracers-of-defense"), { weapon: true, armor: true, shield: true }).ac).toBe(hero("cleric").ac);
    const caster = applyTreasure(ezra, items("wand-of-the-war-mage-2", "pearl-of-power"), armed);
    expect(action(caster, "Burning Hands")).toMatchObject({ dc: 15 });
    expect(action(caster, "Fire Bolt")).toMatchObject({ toHit: 7 });
    expect(caster.stats!.spellSlots[0]).toBe(ezra.stats!.spellSlots[0]! + 1);
    const ringed = applyTreasure(ezra, items("ring-resistance-fire", "boots-of-speed"), armed);
    expect(ringed.stats!.resistances).toContain("fire");
    expect(ringed.speed).toBe(ezra.speed + 10);
  });

  it("attunement, one magic weapon, and the gear it needs", () => {
    expect(cantEquip(MAGIC_ITEMS["armor-plus-1"]!, [], { weapon: true, armor: false, shield: false })).toMatch(/armour/);
    expect(cantEquip(MAGIC_ITEMS["shield-plus-1"]!, [], armed)).toMatch(/shield/);
    expect(cantEquip(MAGIC_ITEMS["weapon-plus-1"]!, items("flame-tongue"), armed)).toMatch(/magic weapon/);
    const three = items("cloak-of-protection", "ring-of-protection", "stone-of-good-luck");
    expect(three).toHaveLength(MAX_ATTUNED);
    expect(cantEquip(MAGIC_ITEMS["pearl-of-power"]!, three, armed)).toMatch(/Attuned/);
    // No attunement needed for a +1 weapon.
    expect(cantEquip(MAGIC_ITEMS["weapon-plus-1"]!, three, armed)).toBeNull();
    expect(cantEquip(MAGIC_ITEMS["cloak-of-protection"]!, items("cloak-of-protection"), armed)).toMatch(/Already/);
  });
});

describe("loot chests", () => {
  it("tiers grow with the heroes' level", () => {
    expect(chestTier(1, 1)).toBe(1);
    expect(chestTier(1, 3)).toBe(2);
    expect(chestTier(3, 5)).toBe(4);
  });

  it("are decided by their seed, follow the rarity table, and never repeat a unique", () => {
    const chest = (tier: number, seed: number) => ({ id: "c", tier, from: "x", seed });
    expect(openChest(chest(2, 7), [])).toEqual(openChest(chest(2, 7), []));
    const rank = (id: string) => RARITIES.indexOf(MAGIC_ITEMS[id]!.rarity);
    let gilded = 0;
    const uniques = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const wooden = openChest(chest(1, seed), []);
      expect(wooden.items.every((i) => rank(i) <= 1)).toBe(true);
      const g = openChest(chest(4, seed), ["emberbrand"]);
      if (g.items.length) gilded++;
      for (const i of g.items) if (MAGIC_ITEMS[i]!.unique) uniques.add(i);
    }
    expect(gilded).toBe(400);
    expect(uniques.size).toBeGreaterThan(0);
    expect(uniques.has("emberbrand")).toBe(false);
  });

  it("every recipe makes a real item", () => {
    for (const r of recipes()) expect(MAGIC_ITEMS[r.item]).toBeDefined();
    expect(recipes().find((r) => r.item === "weapon-plus-1")).toMatchObject({ at: "smithy", level: 2 });
  });
});
