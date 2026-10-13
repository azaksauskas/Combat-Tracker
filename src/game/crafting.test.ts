import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { applyMods, cantAfford, costText, fitMod, fits, pay, salvage, withMods } from "./crafting";
import { MODS } from "./crafting";
import { createGame } from "./engine";
import { createParty } from "./party";
import { SCENARIOS, setupFor } from "./scenarios";
import { foundTown, helpsLeft, sleepHours, useHelp } from "./town";

const hero = (key: string) => PARTY.find((p) => p.key === key)!;

describe("smithy mods", () => {
  it("weapon mods change weapon attacks only", () => {
    const ezra = applyMods(hero("wizard").build(), ["mod-sharp", "mod-balanced", "mod-flame"]);
    const dagger = ezra.stats!.actions.find((a) => a.name === "Dagger")!;
    expect(dagger).toMatchObject({ toHit: 4, damage: [{ dice: "1d4+1+1", type: "piercing" }, { dice: "1d4", type: "fire" }] });
    expect(ezra.stats!.actions.find((a) => a.name === "Fire Bolt")).toMatchObject({ toHit: 5, damage: [{ dice: "1d10" }] });
  });

  it("focus mods improve spells; armour adds AC", () => {
    const ezra = applyMods(hero("wizard").build(), ["mod-crystal", "mod-plate"]);
    expect(ezra.ac).toBe(12);
    expect(ezra.stats!.actions.find((a) => a.name === "Burning Hands")).toMatchObject({ dc: 14 });
    expect(ezra.stats!.actions.find((a) => a.name === "Fire Bolt")).toMatchObject({ toHit: 6 });
    const lens = applyMods(hero("wizard").build(), ["mod-lens"]);
    expect(lens.stats!.actions.find((a) => a.name === "Magic Missile")).toMatchObject({ darts: 4 });
  });

  it("one mod per slot; only what fits the hero", () => {
    expect(fitMod(["mod-sharp", "mod-plate"], "mod-flame")).toEqual(["mod-plate", "mod-flame"]);
    const brann = hero("fighter").build().stats!;
    expect(fits(MODS["mod-crystal"]!, brann)).toBe(false);
    expect(fits(MODS["mod-lens"]!, hero("cleric").build().stats!)).toBe(false);
    expect(fits(MODS["mod-crystal"]!, hero("cleric").build().stats!)).toBe(true);
  });

  it("mods go into battle and adventures", () => {
    const brann = withMods(hero("fighter"), ["mod-plate", "mod-balanced"]);
    const { units } = setupFor(SCENARIOS[0]!, [brann]);
    expect(units[0]!.ac).toBe(18);
    expect(createParty([brann]).heroes[0]!.ac).toBe(18);
    expect(createParty([brann]).heroes[0]!.stats.actions[0]).toMatchObject({ toHit: 6 });
  });

  it("costs come out of the town", () => {
    const t = { ...foundTown("A", 0, 1), gold: 40, components: { iron: 3, herbs: 0, dust: 1 } };
    expect(cantAfford(t, MODS["mod-flame"]!.cost)).toBe("Needs 2 arcane dust");
    expect(pay(t, MODS["mod-balanced"]!.cost)).toMatchObject({ gold: 25, components: { iron: 0 } });
    expect(() => pay(t, MODS["mod-plate"]!.cost)).toThrow(/iron/);
    expect(costText(MODS["mod-flame"]!.cost)).toBe("30 gold · 2 iron · 2 arcane dust");
  });

  it("salvage: iron from armed foes, dust from the undead, nothing from a loss", () => {
    const crypt = SCENARIOS.find((s) => s.id === "crypt")!;
    const { board, units } = setupFor(crypt, PARTY);
    const won = { ...createGame(board, units, 1).state, outcome: "victory" as const };
    won.units = won.units.map((u) => (u.side === "enemy" ? { ...u, dead: true, hp: 0 } : u));
    // 2 skeletons (shortswords, undead) + 3 zombies (undead).
    expect(salvage(won)).toEqual({ iron: 1, dust: 5 });
    expect(salvage({ ...won, outcome: "defeat" })).toEqual({});
  });
});

describe("skipping time", () => {
  it("help out: once per bed per real day", () => {
    let t = foundTown("A", 0, 1);
    expect(helpsLeft(t, "2026-10-13")).toBe(2);
    t = useHelp(useHelp(t, "2026-10-13"), "2026-10-13");
    expect(helpsLeft(t, "2026-10-13")).toBe(0);
    expect(helpsLeft(t, "2026-10-14")).toBe(2);
  });

  it("sleep only at night, until dawn", () => {
    expect(sleepHours(12)).toBeNull();
    expect(sleepHours(20)).toBe(10);
    expect(sleepHours(23.5)).toBe(7);
    expect(sleepHours(24 + 2)).toBe(4);
  });
});
