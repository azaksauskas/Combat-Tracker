import { describe, expect, it } from "vitest";
import type { Town } from "../domain/town";
import { boardSize, completeContract, contractsDay, notePatrol, patrolBounty, tradeAtMarket } from "./economy";
import { FOES, foeBattle, pickMonsters } from "./patrol";
import { advance, foundTown } from "./town";
import { mulberry32 } from "./rng";

const withMarket = (): Town => {
  const t = foundTown("A", 0, 3, 100);
  return { ...t, buildings: [...t.buildings, { id: "m", type: "market" }], settlers: [{ id: "s", name: "S", trade: "trader", from: "", arrivedAt: 0, alignment: "Neutral", mood: 60, mind: "" }] };
};

describe("the market", () => {
  it("buys and sells stores, at half price when selling", () => {
    let t = withMarket();
    t = tradeAtMarket(t, "food", 5);
    expect([t.gold, t.food]).toEqual([90, 11]);
    t = tradeAtMarket(t, "materials", -10);
    expect([t.gold, t.materials]).toEqual([105, 0]);
    expect(() => tradeAtMarket(t, "materials", -1)).toThrow(/Only 0/);
    expect(() => tradeAtMarket({ ...t, settlers: [] }, "food", 1)).toThrow(/staffed market/);
  });
});

describe("patrols", () => {
  it("pay a little, and less each time the same day", () => {
    let t = withMarket();
    expect(patrolBounty(t, 1)).toBe(8);
    t = notePatrol(t);
    expect(patrolBounty(t, 1)).toBe(4);
    t = notePatrol(notePatrol(t));
    expect(patrolBounty(t, 1)).toBe(1);
    // A new day starts fresh; higher levels earn more.
    expect(patrolBounty({ ...t, hours: t.hours + 24 }, 3)).toBe(16);
  });

  it("build fights that fit the 2024 budget", () => {
    const rng = mulberry32(1).rng;
    // Level 1, four heroes, Low: 200 XP of wolves (50 each) = 4 wolves.
    expect(pickMonsters(FOES.wolves!, 1, 4, "low", rng)).toEqual(["wolf", "wolf", "wolf", "wolf"]);
    expect(pickMonsters(FOES.bandits!, 1, 4, "low", rng).every((k) => k === "bandit")).toBe(true);
    const sc = foeBattle("goblins", 1, 4, "moderate", 42, "Goblins in the old mill");
    expect(sc.name).toBe("Goblins in the old mill");
    expect(sc.map.join("").match(/P/g)).toHaveLength(6);
    expect(sc.map.join("").match(/[1-9]/g)).toHaveLength(sc.monsters.length);
    expect(foeBattle("goblins", 1, 4, "moderate", 42)).toEqual({ ...sc, name: expect.any(String) });
  });
});

describe("contracts", () => {
  it("appear on the board in the morning, expire, and pay out", () => {
    const say: string[] = [];
    let t = withMarket();
    expect(boardSize(t)).toBe(2);
    t = contractsDay(t, 30, () => 0, 1, (x) => say.push(x));
    expect(t.contracts).toHaveLength(1);
    expect(say[0]).toMatch(/A new job on the board/);
    const c = t.contracts[0]!;
    const paid = completeContract(t, c.id);
    expect(paid.gold).toBe(t.gold + c.reward.gold);
    expect(paid.contracts).toHaveLength(0);
    // Gone once expired.
    expect(contractsDay(t, c.expiresAt, () => 0.99, 1, () => {}).contracts).toHaveLength(0);
    // And the clock posts them by itself.
    const later = advance(withMarket(), 24 * 10, 0, { renown: 1, residents: [] }).town;
    expect(later.log.some((e) => /A new job on the board/.test(e.text))).toBe(true);
  });
});
