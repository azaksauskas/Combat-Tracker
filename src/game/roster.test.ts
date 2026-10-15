import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { saveBonus } from "../domain/statblock";
import { addDeeds, applyTraits, attraction, candidates, patronBoost, questOf, questStage, tavernBatch } from "./roster";
import { foundTown, yields } from "./town";

const hero = (key: string) => PARTY.find((p) => p.key === key)!.build();

describe("traits", () => {
  it("change the sheet", () => {
    const brann = hero("fighter");
    const t = applyTraits(brann, ["tough", "brawler", "veteran", "quick", "stalwart"]);
    expect(t).toMatchObject({ hpMax: brann.hpMax + 1, ac: brann.ac + 1, speed: brann.speed + 5 });
    expect(t.stats!.actions.find((a) => a.name === "Greatsword")).toMatchObject({ damage: [{ dice: "2d6+4" }] });
    expect(saveBonus(t.stats!, "wis")).toBe(saveBonus(brann.stats!, "wis") + 1);
    const ezra = applyTraits(hero("wizard"), ["studious"]);
    expect(ezra.stats!.actions.find((a) => a.name === "Burning Hands")).toMatchObject({ dc: 14 });
    expect(applyTraits(brann, [])).toBe(brann);
  });
});

describe("personal quests", () => {
  it("stages come from deeds", () => {
    const q = questOf("Fighter");
    let d = addDeeds(undefined, { dealt: 20, taken: 5, healed: 0, downed: 3 }, true);
    expect(questStage(q, d)).toBe(0);
    d = addDeeds(d, { dealt: 30, taken: 2, healed: 0, downed: 2 }, false);
    expect(d).toMatchObject({ battles: 2, wins: 1, felled: 5, dealt: 50 });
    expect(questStage(q, d)).toBe(1);
    expect(questStage(questOf("Cleric"), { ...d, healed: 250 })).toBe(3);
  });
});

describe("patrons and the tavern", () => {
  it("a patron raises a building's output, more if it suits their class", () => {
    let t = foundTown("A", 0, 3);
    const farm = { id: "f", type: "farm" as const };
    t = { ...t, buildings: [...t.buildings, farm], settlers: [{ id: "s", name: "S", trade: "farmer", from: "x", arrivedAt: 0, alignment: "Neutral", mood: 60, mind: "" }] };
    const base = yields(t, farm).food;
    expect(patronBoost(farm, { key: "fighter", name: "Brann", className: "Fighter", traits: [] })).toBe(0.25);
    expect(patronBoost(farm, { key: "cleric", name: "Maren", className: "Cleric", traits: [] })).toBe(0.5);
    const withPatron = { ...t, patrons: { f: { key: "cleric", name: "Maren", className: "Cleric", traits: ["merchant"] } } };
    expect(yields(withPatron, farm).food).toBeCloseTo(base * 1.5);
    expect(yields(withPatron, farm).gold).toBe(2);
  });

  it("the tavern's heroes: none without a tavern, more as the town draws them, fixed per batch, hired ones gone", () => {
    const plain = foundTown("A", 0, 3);
    expect(candidates(plain, 1, 1, 0)).toEqual([]);
    const t = { ...plain, buildings: [...plain.buildings, { id: "tv", type: "tavern" as const }] };
    const few = candidates(t, 1, 1, 0);
    expect(few.length).toBe(1);
    expect(attraction(t, 1, 0).score).toBe(20);
    const famous = candidates({ ...t, spirit: 20 }, 4, 4, 2);
    expect(famous.length).toBeGreaterThan(few.length);
    expect(famous.every((c) => c.level >= 3 && c.level <= 4 && c.traits.length >= 1 && c.fee > 0)).toBe(true);
    expect(candidates({ ...t, spirit: 20 }, 4, 4, 2)).toEqual(famous);
    expect(candidates({ ...t, spirit: 20, tavernHired: [famous[0]!.id] }, 4, 4, 2).map((c) => c.id)).not.toContain(famous[0]!.id);
    // A new batch every few days.
    expect(tavernBatch(t.hours + 24 * 3)).toBe(tavernBatch(t.hours) + 1);
  });
});
