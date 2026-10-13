import { describe, expect, it } from "vitest";
import { TownSchema, type Town } from "../domain/town";
import { BUILDINGS, DAWN, MAX_CATCH_UP_HOURS, OFFLINE_MS_PER_HOUR, advance, awayReport, beds, bringHome, cantBuild, catchUp, clockText, durationText, foundTown, power, staffing, startBuilding, takeStash, welcome } from "./town";

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

  it("hunger drives settlers away", () => {
    let t = { ...foundTown("A", T0, 3), food: 0 };
    for (const n of ["A", "B", "C"]) t = welcome(t, { name: n, trade: "", from: "x" }, n);
    const { town, events } = advance(t, 24, T0, ctx);
    expect(town.settlers.length).toBeLessThan(3);
    expect(events.some((e) => e.tone === "bad" && /Food ran out/.test(e.text))).toBe(true);
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
    const back = catchUp(t, T0 + 10 * OFFLINE_MS_PER_HOUR, ctx);
    expect(back.hours).toBeCloseTo(10);
    expect(back.town.hours).toBeCloseTo(DAWN + 10);
    expect(back.town.at).toBe(T0 + 10 * OFFLINE_MS_PER_HOUR);
    const year = catchUp(t, T0 + 365 * 24 * OFFLINE_MS_PER_HOUR, ctx);
    expect(year.hours).toBe(MAX_CATCH_UP_HOURS);
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
