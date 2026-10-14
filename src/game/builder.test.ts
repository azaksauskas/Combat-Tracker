import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { CLASS_NAMES, CharacterSpecSchema, type CharacterSpec } from "../domain/character";
import { buildCharacter, characterEntry, suggestedSpec, validateSpec } from "./builder";
import { createGame } from "./engine";
import { createParty, gainXp } from "./party";
import { resolveParty } from "./party-store";
import { SCENARIOS, scenarioSetup } from "./scenarios";

describe("character builder", () => {
  it("suggests a legal character for every class", () => {
    for (const c of CLASS_NAMES) expect(validateSpec(suggestedSpec(c, "x", "Test"))).toEqual([]);
  });

  it("builds a human soldier fighter like the ready-made one", () => {
    const fighter = buildCharacter(suggestedSpec("Fighter", "f", "Ada"));
    expect(fighter).toMatchObject({ name: "Ada", ac: 17, hpMax: 12, speed: 30 });
    expect(fighter.stats!.abilities).toMatchObject({ str: 17, con: 15 });
    expect(fighter.stats!.actions[0]).toMatchObject({ name: "Greatsword", toHit: 5, damage: [{ dice: "2d6+3" }] });
    expect(fighter.stats!.skills).toMatchObject({ Athletics: 5, Intimidation: 2, Insight: 3, Perception: 3 });
    expect(fighter.stats!.features).toContain("second-wind");
  });

  it("applies species: dwarven toughness and resilience, elven senses", () => {
    const dwarf = buildCharacter({ ...suggestedSpec("Cleric", "c", "Dora"), species: "Dwarf" });
    expect(dwarf.hpMax).toBe(8 + 2 + 1);
    expect(dwarf.stats!.resistances).toContain("poison");
    const elf = buildCharacter({ ...suggestedSpec("Wizard", "w", "Eli"), species: "Elf" });
    expect(elf.stats!.skills.Perception).toBe(2 + 1);
    expect(elf.stats!.spellSlots).toEqual([2]);
    expect(elf.stats!.actions.find((a) => a.name === "Burning Hands")).toMatchObject({ dc: 13 });
  });

  it("spell DCs and attacks follow the casting ability", () => {
    // A cleric with Wisdom 14 instead of 17.
    const spec: CharacterSpec = { ...suggestedSpec("Cleric", "c", "Low Wis"), base: { str: 15, dex: 10, con: 14, int: 8, wis: 13, cha: 12 }, plus2: "int", plus1: "wis" };
    expect(validateSpec(spec)).toEqual([]);
    const sheet = buildCharacter(spec);
    expect(sheet.stats!.actions.find((a) => a.name === "Sacred Flame")).toMatchObject({ dc: 12 });
    expect(sheet.stats!.actions.find((a) => a.name === "Guiding Bolt")).toMatchObject({ toHit: 4 });
  });

  it("rejects illegal choices", () => {
    const ok = suggestedSpec("Rogue", "r", "Rin");
    expect(validateSpec({ ...ok, base: { ...ok.base, str: 15 } })[0]).toMatch(/standard-array/);
    expect(validateSpec({ ...ok, plus2: "wis" })[0]).toMatch(/Criminal raises/);
    expect(validateSpec({ ...ok, plus1: ok.plus2 })).toContain("The +2 and +1 must go to different abilities");
    expect(validateSpec({ ...ok, name: " " })).toContain("Give your hero a name");
  });

  it("stored specs survive a round trip through the schema", () => {
    const spec = suggestedSpec("Wizard", "w1", "Mira");
    expect(CharacterSpecSchema.parse(JSON.parse(JSON.stringify(spec)))).toEqual(spec);
    expect(CharacterSpecSchema.parse({ id: 5, className: "Bard" })).toMatchObject({ id: "5", className: "Fighter" });
  });

  it("built heroes join the party, fight and level up", () => {
    const wiz = characterEntry({ ...suggestedSpec("Wizard", "w", "Mira"), species: "Dwarf" });
    const party = createParty([wiz, PARTY[0]!]);
    expect(party.heroes.map((h) => h.key)).toEqual(["custom-w", "fighter"]);
    const { party: lvl3 } = gainXp(party, 900);
    const mira = lvl3.heroes[0]!;
    // d6 wizard, Con 15: 4 + 2 + 1 (dwarf) per level.
    expect(mira.hpMax).toBe(6 + 2 + 1 + 2 * 7);
    expect(mira.stats.actions.find((a) => a.name === "Shatter")).toMatchObject({ dc: 13 });
    const { board, units } = scenarioSetup(SCENARIOS[0]!, [wiz]);
    expect(units.filter((u) => u.side === "party").map((u) => u.name)).toEqual(["Mira"]);
    expect(createGame(board, units, 1).state.units).toHaveLength(1 + SCENARIOS[0]!.monsters.length);
  });

  it("resolves the picked party", () => {
    const spec = suggestedSpec("Rogue", "r", "Rin");
    expect(resolveParty(["custom-r", "cleric", "gone"], [spec]).map((e) => e.label)).toEqual(["Rin", "Sister Maren"]);
    expect(resolveParty([], [])).toEqual(PARTY);
  });
});
