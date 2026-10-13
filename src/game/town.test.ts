import { describe, expect, it } from "vitest";
import { TownSchema, type Town } from "../domain/town";
import { hireCost, appeal, applyDeeds, hire, lift, opinion, startingReputation, BUILDINGS, DAWN, maxCatchUpHours, offlineMsPerHour, advance, awayReport, beds, bringHome, cantBuild, catchUp, clockText, durationText, foundTown, power, staffing, startBuilding, takeStash, welcome } from "./town";

const ctx = { renown: 1, residents: [] };
const T0 = 1_000_000;

describe("towns", () => {
  it("founding gives a hall, some stores and a clock at dawn of day 1", () => {
    const t = foundTown("Millbrook", T0, 7);
    expect(t.buildings).toEqual([{ id: "hall", type: "hall" }]);
    expect(clockText(t.hours)).toBe("Day 1, 06:00");
    expect(beds(t)).toBe(2);
    expect(TownSchema.parse(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });

  it("building costs resources, takes time, one project at a time, limited by renown", () => {
    let t = { ...foundTown("A", T0, 1), gold: 100, materials: 100 };
    expect(cantBuild({ ...t, gold: 10 }, "smithy", 1)).toMatch(/50 gold/);
    expect(cantBuild(t, "hall", 1)).toMatch(/one hall/);
    t = startBuilding(t, "farm", 1, "b1");
    expect([t.gold, t.materials]).toEqual([90, 94]);
    expect(cantBuild(t, "house", 1)).toMatch(/one project/);
    t = advance(t, BUILDINGS.farm.hours - 1, T0, ctx).town;
    expect(t.buildings[1]!.readyAt).toBeDefined();
    const { town, events } = advance(t, 1, T0, ctx);
    expect(town.buildings[1]).toEqual({ id: "b1", type: "farm" });
    expect(events.map((e) => e.text)).toContain("Farm finished.");
    // Renown 1 allows 4 buildings.
    let full = { ...town, buildings: [...town.buildings, { id: "x", type: "house" as const }, { id: "y", type: "house" as const }] };
    expect(cantBuild(full, "lumber", 1)).toMatch(/4 buildings/);
    expect(cantBuild(full, "lumber", 2)).toBeNull();
    full = { ...full, gold: 0 };
    expect(cantBuild(full, "lumber", 2)).toMatch(/gold/);
  });

  it("settlers staff buildings in the order they were built", () => {
    let t = foundTown("A", T0, 1);
    t = { ...t, buildings: [...t.buildings, { id: "f", type: "farm" }, { id: "h", type: "house" }, { id: "l", type: "lumber" }] };
    t = welcome(t, { name: "Tamsin", trade: "miller", from: "Rescued" }, "s1");
    expect([...staffing(t)]).toEqual([["f", true], ["l", false]]);
  });

  it("a day of production: food, materials, gold, and settlers eat", () => {
    let t = foundTown("A", T0, 1);
    t = { ...t, buildings: [...t.buildings, { id: "f", type: "farm" }, { id: "m", type: "market" }] };
    t = welcome(welcome(t, { name: "A", trade: "", from: "x" }, "1"), { name: "B", trade: "", from: "x" }, "2");
    const before = { food: t.food, materials: t.materials, gold: t.gold };
    const next = advance({ ...t, seed: 12345 }, 24, T0, ctx).town;
    // Food: +1 hall +4 farm −2 settlers; materials +1; market 2 + 1 (two settlers), give or take a random event.
    expect(next.food - before.food).toBeGreaterThanOrEqual(3);
    expect(next.materials - before.materials).toBeLessThanOrEqual(1);
    expect(next.gold - before.gold).not.toBe(0);
  });

  it("hunger drives settlers away over a few days, and they say why", () => {
    let t = { ...foundTown("A", T0, 3), food: 0 };
    for (const n of ["A", "B", "C"]) t = welcome(t, { name: n, trade: "", from: "x", mood: 50 }, n);
    const { town, events } = advance(t, 24 * 6, T0, ctx);
    expect(town.settlers.length).toBeLessThan(3);
    expect(events.some((e) => e.tone === "bad" && /left: "We're going hungry/.test(e.text))).toBe(true);
  });

  it("the same seed gives the same history", () => {
    const t = { ...foundTown("A", T0, 99), gold: 50 };
    const a = advance(t, 24 * 20, T0, ctx);
    const b = advance(t, 24 * 20, T0, ctx);
    expect(a.town).toEqual(b.town);
    expect(a.events.length).toBeGreaterThan(5);
  });

  it("time away runs at real speed and is capped", () => {
    const t = foundTown("A", T0, 5);
    const back = catchUp(t, T0 + 10 * offlineMsPerHour(), ctx);
    expect(back.hours).toBeCloseTo(10);
    expect(back.town.hours).toBeCloseTo(DAWN + 10);
    expect(back.town.at).toBe(T0 + 10 * offlineMsPerHour());
    const year = catchUp(t, T0 + 365 * 24 * offlineMsPerHour(), ctx);
    expect(year.hours).toBe(maxCatchUpHours());
    const report = awayReport(t, year.town, year.events, year.hours);
    expect(durationText(report.hours)).toBe("30 days");
  });

  it("potions go on adventures and gold comes home", () => {
    let t: Town = { ...foundTown("A", T0, 1), stash: { "potion-healing": 2 } };
    const out = takeStash(t);
    expect(out.potions).toEqual({ "potion-healing": 2 });
    t = bringHome(out.town, 40, { "potion-healing": 1 }, "The Goblin Trail");
    expect(t.gold).toBe(70);
    expect(t.stash).toEqual({ "potion-healing": 1 });
    expect(t.log.at(-1)!.text).toBe("The heroes came home from The Goblin Trail with 40 gold and 1 potion.");
  });

  it("power grows with the town and renown", () => {
    const t = foundTown("A", T0, 1);
    expect(power(t, { renown: 1, residents: [] })).toBe(2 + 5);
    expect(power(t, { renown: 3, residents: [2] })).toBe(2 + 15 + 10);
  });

  it("durations read naturally", () => {
    expect(durationText(0)).toBe("0 hours");
    expect(durationText(1)).toBe("1 hour");
    expect(durationText(26.5)).toBe("1 day, 2 hours");
  });
});

describe("settlers' opinions", () => {
  const base = () => ({ ...foundTown("A", T0, 1), food: 30, buildings: [{ id: "hall", type: "hall" as const }, { id: "h", type: "house" as const }] });

  it("food, crowding, safety and pride move the mood", () => {
    const t = base();
    expect(opinion(t, "Neutral", ctx).target).toBe(55 + 6);
    expect(opinion({ ...t, food: 0 }, "Neutral", ctx).reasons[0]!.text).toBe("We're going hungry");
    expect(opinion({ ...t, lastTheft: t.hours - 10 }, "Neutral", ctx).reasons.map((r) => r.text)).toContain("Thieves were here this week");
    expect(opinion(lift(t, 12), "Neutral", ctx).reasons.map((r) => r.text)).toContain("Proud of our heroes");
    expect(opinion(t, "Neutral", { ...ctx, ownerAway: true }).reasons.map((r) => r.text)).toContain("The hall stands empty");
  });

  it("beliefs: good folk like kind heroes and dislike cruel ones", () => {
    const kind = applyDeeds(base(), { law: 0, good: 6 });
    expect(kind.log.at(-1)!.text).toMatch(/known as kind/);
    expect(opinion(kind, "Neutral Good", ctx).target).toBeGreaterThan(opinion(kind, "Neutral Evil", ctx).target);
    const cruel = applyDeeds(base(), { law: 0, good: -10 });
    expect(opinion(cruel, "Lawful Good", ctx).reasons.some((r) => r.delta < 0 && /Can't stand/.test(r.text))).toBe(true);
    expect(applyDeeds(base(), { law: 50, good: 0 }).reputation.law).toBe(10);
  });

  it("starting reputation comes from the founders' alignments", () => {
    expect(startingReputation(["Lawful Good", "Chaotic Good", "Neutral Good", "Neutral"])).toEqual({ law: 0, good: 2 });
    expect(startingReputation([])).toEqual({ law: 0, good: 0 });
  });

  it("an appealing town with a tavern fills its beds; a grim one doesn't", () => {
    const nice: Town = { ...base(), gold: 0, buildings: [...base().buildings, { id: "t", type: "tavern" }, { id: "f", type: "farm" }, { id: "f2", type: "farm" }, { id: "h2", type: "house" }] };
    let staffed = welcome(nice, { name: "Barkeep", trade: "brewer", from: "x" }, "b");
    staffed = welcome(welcome(staffed, { name: "Farmer", trade: "farmer", from: "x" }, "f"), { name: "Farmer 2", trade: "farmer", from: "x" }, "f2");
    const after = advance(staffed, 24 * 15, T0, ctx).town;
    expect(after.settlers.length).toBeGreaterThan(5);
    const grim = { ...base(), food: 0, lastTheft: 1e9 };
    expect(appeal(grim, ctx)).toBeLessThan(appeal(base(), ctx));
  });

  it("the tavern hires a worker for gold when there's a bed", () => {
    let t: Town = { ...base(), gold: 50, buildings: [...base().buildings, { id: "t", type: "tavern" }] };
    expect(() => hire(t)).toThrow(/staffed tavern/);
    t = welcome(t, { name: "Barkeep", trade: "brewer", from: "x" }, "b");
    t = hire(t);
    expect(t.settlers).toHaveLength(2);
    expect(t.gold).toBe(50 - hireCost());
    expect(t.settlers[1]!.from).toBe("Hired at the tavern");
  });
});

describe("tuning", () => {
  it("the DM's balance settings change the rules; unknown or bad values are ignored", async () => {
    const { setTuning, num } = await import("./tuning");
    try {
      setTuning({ "prod.farmFood": 10, "building.farm.gold": 99, "town.houseBeds": 5, nonsense: 3, "prod.hallFood": "lots" as unknown as number });
      expect(num("prod.farmFood")).toBe(10);
      expect(num("prod.hallFood")).toBe(1);
      expect(BUILDINGS.farm.cost.gold).toBe(99);
      expect(BUILDINGS.farm.description).toMatch(/^10 food a day/);
      let t: Town = { ...foundTown("A", T0, 1), food: 0, buildings: [{ id: "hall", type: "hall" }, { id: "f", type: "farm" }, { id: "h", type: "house" }] };
      expect(beds(t)).toBe(2 + 5);
      t = welcome(t, { name: "F", trade: "farmer", from: "x" }, "f1");
      // Dawn: hall 1 + farm 10 − 1 eaten.
      expect(advance(t, 24, T0, ctx).town.food).toBeGreaterThanOrEqual(10);
    } finally {
      setTuning({});
    }
    expect(BUILDINGS.farm.cost.gold).toBe(10);
  });
});
