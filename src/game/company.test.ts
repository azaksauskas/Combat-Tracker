import { describe, expect, it } from "vitest";
import { addRep, contractsAt, payday, priceOf, repText, sells, wageOf } from "./company";
import { BUILTIN_FACTIONS } from "./region";
import { generateWorld } from "./world";

const world = generateWorld(42, "Oakhaven", BUILTIN_FACTIONS, []);
const village = world.places.find((p) => p.kind === "village")!;
const city = world.places.find((p) => p.kind === "city")!;

describe("running the company", () => {
  it("wages by level; pay whoever the purse covers, feed whoever marches", () => {
    expect(wageOf(1)).toBe(3);
    expect(wageOf(3)).toBe(7);
    const roster = [
      { key: "a", level: 1 },
      { key: "b", level: 3 },
      { key: "c", level: 1 },
    ];
    expect(payday(100, roster, 3, 10)).toEqual({ paid: 13, unpaid: [], eaten: 3, hungry: false });
    expect(payday(5, roster, 3, 2)).toEqual({ paid: 3, unpaid: ["b", "c"], eaten: 2, hungry: true });
  });

  it("prices: cities cost more, a good name helps; villages sell only food", () => {
    expect(priceOf("ration", village, 0)).toBe(1);
    expect(priceOf("potion", city, 0)).toBeGreaterThan(priceOf("potion", city, 8));
    expect(sells(village)).toEqual(["ration"]);
    expect(sells(city)).toContain("potion");
    expect(addRep({}, "x", 15)).toEqual({ x: 10 });
    expect(repText(7)).toBe("beloved");
    expect(repText(-7)).toBe("hated");
  });

  it("each settlement posts its own work, fixed for a few days, better paid with a good name", () => {
    const a = contractsAt(world, city, 10, 2, 0);
    expect(a).toHaveLength(3);
    expect(contractsAt(world, city, 20, 2, 0)).toEqual(a);
    expect(contractsAt(world, city, 24 * 3 + 1, 2, 0)).not.toEqual(a);
    expect(contractsAt(world, village, 10, 2, 0)).toHaveLength(1);
    const liked = contractsAt(world, city, 10, 2, 10);
    expect(liked[0]!.reward).toBeGreaterThan(a[0]!.reward);
    const keys = a.map((c) => c.foe ?? c.to);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of a) {
      expect(c.reward).toBeGreaterThan(0);
      if (c.kind === "hunt") expect(c.at).toBeDefined();
      else expect(world.places.some((p) => p.id === c.to)).toBe(true);
    }
  });
});
