import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { applyLoadout, armorClass, loadoutProblem, startingKit, weaponAttacks } from "./arsenal";

const hero = (key: string) => PARTY.find((p) => p.key === key)!.build();
const attack = (c: ReturnType<typeof hero>, name: string) => c.stats!.actions.find((a) => a.name === name);

describe("loadouts", () => {
  it("each class's starting kit gives the ready-made hero's AC and weapon attacks", () => {
    for (const [key, ac] of [
      ["fighter", 17],
      ["rogue", 14],
      ["cleric", 15],
      ["wizard", 11],
    ] as const) {
      const c = hero(key);
      const after = applyLoadout(c, startingKit(c.stats!.className));
      expect(after.ac).toBe(ac);
    }
    const brann = applyLoadout(hero("fighter"), startingKit("Fighter"));
    expect(attack(brann, "Greatsword")).toMatchObject({
      toHit: 5,
      damage: [{ dice: "2d6+3" }],
      mastery: "graze",
      hand: "main",
    });
    expect(attack(brann, "Javelin (thrown)")).toMatchObject({
      attackType: "ranged",
      range: [30, 120],
      hand: "spare",
      mastery: "slow",
    });
    const pip = applyLoadout(hero("rogue"), startingKit("Rogue"));
    expect(attack(pip, "Shortsword")).toMatchObject({
      toHit: 5,
      damage: [{ dice: "1d6+3" }],
      finesse: true,
      mastery: "vex",
    });
    // Spells stay.
    const maren = applyLoadout(hero("cleric"), startingKit("Cleric"));
    expect(maren.stats!.actions.some((a) => a.name === "Bless")).toBe(true);
    expect(attack(maren, "Mace")).toMatchObject({
      toHit: 3,
      damage: [{ dice: "1d6+1" }],
    });
  });

  it("versatile weapons hit harder in two hands; off-hand attacks are a bonus action without the modifier", () => {
    const brann = hero("fighter");
    expect(weaponAttacks(brann.stats!, "longsword", "main", true)[0]!.damage[0]!.dice).toBe("1d10+3");
    expect(weaponAttacks(brann.stats!, "longsword", "main", false)[0]!.damage[0]!.dice).toBe("1d8+3");
    const pip = applyLoadout(hero("rogue"), {
      main: "shortsword",
      off: "dagger",
      armor: "leather",
    });
    expect(attack(pip, "Off-hand Dagger")).toMatchObject({
      bonusAction: true,
      damage: [{ dice: "1d4" }],
    });
  });

  it("training limits what heroes can wear and how well they fight", () => {
    const ezra = hero("wizard");
    expect(loadoutProblem(ezra.stats!, { main: "dagger", armor: "chain-mail" })).toMatch(/Not trained/);
    expect(weaponAttacks(ezra.stats!, "longsword", "main", false)[0]!.toHit).toBe(-1); // Str 8, no proficiency
    expect(
      loadoutProblem(hero("fighter").stats!, {
        main: "greatsword",
        off: "shield",
      }),
    ).toMatch(/both hands/);
    expect(
      armorClass(hero("fighter").stats!, {
        main: "longsword",
        off: "shield",
        armor: "plate",
      }),
    ).toBe(18 + 2 + 1);
  });
});
