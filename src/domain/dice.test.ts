import { describe, expect, it } from "vitest";
import { ROLLABLE_PATTERN, addDieToExpression, addModifierToExpression, describeRoll, parseDice, roll, rollTerms, rollableToExpression, withAdvantage } from "./dice";

/** Deterministic RNG that yields the given die faces for dN rolls of `sides`. */
const faces = (sides: number, ...values: number[]) => {
  let i = 0;
  return () => (values[i++ % values.length]! - 1) / sides + 1e-9;
};

describe("parseDice", () => {
  it("parses dice, modifiers, keep and percentile", () => {
    expect(parseDice("1d20 + 5")).toEqual([
      { kind: "dice", sign: 1, count: 1, sides: 20 },
      { kind: "mod", sign: 1, value: 5 },
    ]);
    expect(parseDice("4d6kh3")[0]).toMatchObject({ count: 4, sides: 6, keep: { mode: "high", n: 3 } });
    expect(parseDice("d%")[0]).toMatchObject({ count: 1, sides: 100 });
    expect(parseDice("2d8-1d4-1").map((t) => t.sign)).toEqual([1, -1, -1]);
  });

  it("rejects nonsense with a readable error", () => {
    expect(() => parseDice("")).toThrow(/Enter dice/);
    expect(() => parseDice("2d6 fire")).toThrow(/Can't read/);
    expect(() => parseDice("1d20 5")).toThrow(/Can't read/);
    expect(() => parseDice("1000d6")).toThrow(/between 1 and 100/);
    expect(() => parseDice("2d6kh3")).toThrow(/keep/);
  });
});

describe("rolling", () => {
  it("adds dice and modifiers", () => {
    const r = roll("2d6+3", faces(6, 4, 2));
    expect(r.total).toBe(9);
    expect(describeRoll(r)).toBe("[4, 2] + 3");
  });

  it("keeps the highest/lowest and flags natural 20s and 1s", () => {
    const adv = rollTerms(withAdvantage(parseDice("1d20+4"), "adv"), faces(20, 7, 20));
    expect(adv.expression).toBe("2d20kh1+4");
    expect(adv.total).toBe(24);
    expect(adv.natural).toBe(20);
    expect(describeRoll(adv)).toBe("[~7~, 20] + 4");

    const dis = rollTerms(withAdvantage(parseDice("1d20"), "dis"), faces(20, 1, 15));
    expect(dis.total).toBe(1);
    expect(dis.natural).toBe(1);
  });

  it("doesn't call 2d20 summed a natural 20", () => {
    expect(roll("2d20", faces(20, 20, 20)).natural).toBeUndefined();
  });

  it("stays within 1..sides with the real RNG", () => {
    for (let i = 0; i < 500; i++) {
      const v = roll("1d6").total;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe("rollable text in stat blocks", () => {
  const find = (s: string) => s.match(ROLLABLE_PATTERN) ?? [];
  it("finds dice and to-hit modifiers", () => {
    expect(find("Scimitar: +4 to hit, 1d6 + 2 slashing")).toEqual(["+4", "1d6 + 2"]);
    expect(find("STR 16 (+3), DEX 14 (+2)")).toEqual(["+3", "+2"]);
    expect(find("Fire Breath 12d6, DC 17")).toEqual(["12d6"]);
    expect(find("Goblin-2 and 5ft")).toEqual([]);
  });
  it("turns modifiers into d20 checks", () => {
    expect(rollableToExpression("+4")).toBe("1d20+4");
    expect(rollableToExpression("1d6 + 2")).toBe("1d6+2");
  });
});

describe("dice tray helpers", () => {
  it("stacks dice of the same size", () => {
    expect(addDieToExpression("", 6)).toBe("1d6");
    expect(addDieToExpression("1d6", 6)).toBe("2d6");
    expect(addDieToExpression("1d20+4", 8)).toBe("1d20+4+1d8");
    expect(addDieToExpression("1d20+4+1d8", 8)).toBe("1d20+4+2d8");
  });
  it("adjusts the trailing modifier", () => {
    expect(addModifierToExpression("1d20", 1)).toBe("1d20+1");
    expect(addModifierToExpression("1d20+1", 1)).toBe("1d20+2");
    expect(addModifierToExpression("1d20+1", -1)).toBe("1d20");
    expect(addModifierToExpression("1d20", -2)).toBe("1d20-2");
  });
});
