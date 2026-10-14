import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { applySpells, spellLimits, spellProblem, spellsFor, startingSpells } from "./spellbook";

const hero = (key: string) => PARTY.find((p) => p.key === key)!.build();

describe("spellbook", () => {
  it("follows the 2024 tables for cantrips, prepared spells and the highest level", () => {
    expect(spellLimits("Wizard", 1)).toEqual({
      cantrips: 3,
      prepared: 4,
      maxLevel: 1,
    });
    expect(spellLimits("Cleric", 4)).toEqual({
      cantrips: 4,
      prepared: 7,
      maxLevel: 2,
    });
    expect(spellLimits("Wizard", 5)).toEqual({
      cantrips: 4,
      prepared: 9,
      maxLevel: 3,
    });
    expect(spellLimits("Fighter", 5).prepared).toBe(0);
    expect(spellsFor({ className: "Wizard", level: 1 }).some((s) => s.id === "fireball")).toBe(false);
    expect(spellsFor({ className: "Wizard", level: 5 }).some((s) => s.id === "fireball")).toBe(true);
  });

  it("refuses too many spells, or spells above the hero's level", () => {
    const wiz = { className: "Wizard", level: 1 };
    expect(spellProblem(wiz, ["fire-bolt", "ray-of-frost", "shocking-grasp"])).toBeNull();
    expect(spellProblem(wiz, ["fire-bolt", "ray-of-frost", "shocking-grasp", "chill-touch"])).toMatch(/cantrips/);
    expect(spellProblem(wiz, ["magic-missile", "burning-hands", "chromatic-orb", "ice-knife", "shield"])).toMatch(/prepared/);
    expect(spellProblem(wiz, ["fireball"])).toMatch(/level 3/);
  });

  it("swaps the spell actions and keeps the weapons; Shield and Mage Armor are features", () => {
    const wiz = hero("wizard");
    const dagger = wiz.stats!.actions.filter((a) => !a.slot && !a.cantrip);
    const after = applySpells(wiz, ["fire-bolt", "chill-touch", "ice-knife", "mage-armor"], true);
    const names = after.stats!.actions.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(["Fire Bolt", "Chill Touch", "Ice Knife", ...dagger.map((a) => a.name)]));
    expect(names).not.toContain("Magic Missile");
    expect(after.stats!.features).not.toContain("shield-spell");
    expect(after.ac).toBe(13 + 1);
    // Mage Armor does nothing over real armour.
    expect(applySpells(wiz, ["mage-armor"], false).ac).toBe(wiz.ac);
    const withShield = applySpells(wiz, [...startingSpells("Wizard")], true);
    expect(withShield.stats!.features).toContain("shield-spell");
    // Cleric spells use Wisdom: save DC 8 + 2 + 3.
    const cleric = applySpells(hero("cleric"), ["sacred-flame", "bless"], false);
    expect(cleric.stats!.actions.find((a) => a.name === "Sacred Flame")).toMatchObject({ kind: "save", dc: 13, cantrip: true });
    // Non-casters are untouched.
    const fighter = hero("fighter");
    expect(applySpells(fighter, ["fireball"], true)).toBe(fighter);
  });
});
