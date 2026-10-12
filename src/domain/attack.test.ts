import { describe, expect, it } from "vitest";
import { adjustDamage, resolveAttack, resolveSave } from "./attack";
import { StatBlockSchema, abilityMod, saveBonus, type AttackAction, type SaveAction } from "./statblock";

/** Yields fixed die faces in order; each call is converted for the die being rolled. */
function seq(...dice: [number, number][]) {
  let i = 0;
  return () => {
    const [face, sides] = dice[i++]!;
    return (face - 1) / sides + 1e-9;
  };
}

const scimitar: AttackAction = {
  id: "a",
  kind: "attack",
  name: "Scimitar",
  attackType: "melee",
  toHit: 4,
  reach: 5,
  range: null,
  damage: [{ dice: "1d6+2", type: "slashing" }],
  notes: "",
};

const skeleton = StatBlockSchema.parse({
  abilities: { str: 10, dex: 16, con: 15, int: 6, wis: 8, cha: 5 },
  vulnerabilities: ["bludgeoning"],
  immunities: ["poison"],
  resistances: ["slashing"],
  saveProficiencies: ["dex"],
  proficiency: 2,
});

describe("ability helpers", () => {
  it("computes modifiers and save bonuses", () => {
    expect([1, 8, 9, 10, 11, 15, 20].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 2, 5]);
    expect(saveBonus(skeleton, "dex")).toBe(5);
    expect(saveBonus(skeleton, "wis")).toBe(-1);
  });
});

describe("attacks", () => {
  it("hits when the total meets AC and rolls damage", () => {
    const r = resolveAttack(scimitar, { ac: 15 }, { rng: seq([11, 20], [4, 6]) });
    expect(r.attack.total).toBe(15);
    expect(r.hit).toBe(true);
    expect(r.total).toBe(6);
  });

  it("misses below AC and on a natural 1, whatever the bonus", () => {
    expect(resolveAttack(scimitar, { ac: 15 }, { rng: seq([10, 20]) }).hit).toBe(false);
    expect(resolveAttack({ ...scimitar, toHit: 30 }, { ac: 5 }, { rng: seq([1, 20]) }).hit).toBe(false);
  });

  it("crits on a natural 20: damage dice twice, modifier once", () => {
    const r = resolveAttack(scimitar, { ac: 30 }, { rng: seq([20, 20], [3, 6], [5, 6]) });
    expect(r.crit).toBe(true);
    expect(r.hit).toBe(true);
    expect(r.damage[0]!.roll.expression).toBe("2d6+2");
    expect(r.total).toBe(10);
  });

  it("uses advantage on the d20", () => {
    const r = resolveAttack(scimitar, { ac: 15 }, { advantage: "adv", rng: seq([2, 20], [14, 20], [1, 6]) });
    expect(r.attack.total).toBe(18);
    expect(r.hit).toBe(true);
  });
});

describe("damage adjustments", () => {
  it("applies resistance, immunity and vulnerability", () => {
    expect(adjustDamage(7, "slashing", skeleton)).toEqual({ amount: 3, adjustment: "resisted" });
    expect(adjustDamage(7, "poison", skeleton)).toEqual({ amount: 0, adjustment: "immune" });
    expect(adjustDamage(7, "bludgeoning", skeleton)).toEqual({ amount: 14, adjustment: "vulnerable" });
    expect(adjustDamage(7, "fire", skeleton)).toEqual({ amount: 7, adjustment: null });
  });
});

describe("saving throws", () => {
  const burning: SaveAction = {
    id: "b",
    kind: "save",
    name: "Burning Hands",
    save: "dex",
    dc: 13,
    damage: [{ dice: "3d6", type: "fire" }],
    onSuccess: "half",
    notes: "",
  };

  it("deals full damage on a failure and half on a success", () => {
    const fail = resolveSave(burning, { ac: 10, stats: skeleton }, { rng: seq([5, 20], [6, 6], [5, 6], [4, 6]) });
    expect(fail.save.total).toBe(10);
    expect(fail.success).toBe(false);
    expect(fail.total).toBe(15);

    const ok = resolveSave(burning, { ac: 10, stats: skeleton }, { rng: seq([8, 20], [6, 6], [5, 6], [4, 6]) });
    expect(ok.success).toBe(true);
    expect(ok.total).toBe(7);
  });
});
