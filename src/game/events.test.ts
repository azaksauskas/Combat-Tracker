import { describe, expect, it } from "vitest";
import { BUILTIN_FACTIONS } from "./region";
import { EVENTS, MARKS, resolveChoice } from "./events";
import { mulberry32 } from "./rng";
import { dist, generateWorld, spawnEvent, terrainAt } from "./world";

describe("events on the road", () => {
  const world = generateWorld(42, "Home", BUILTIN_FACTIONS, [{ id: "a", title: "The Cave" }]);

  it("every event and landmark offers a way to walk on, and every check has both outcomes", () => {
    for (const def of [...Object.values(EVENTS), ...Object.values(MARKS)]) {
      expect(def.choices.some((c) => c.leave)).toBe(true);
      for (const c of def.choices.filter((c) => c.skill)) {
        expect(c.dc).toBeGreaterThan(0);
        expect(c.ok?.text).toBeTruthy();
        expect(c.fail?.text).toBeTruthy();
      }
    }
  });

  it("a check succeeds on meeting the DC; a sure thing always does", () => {
    const check = EVENTS.wagon!.choices[0]!;
    expect(resolveChoice(check, 2, 9)).toMatchObject({ ok: true, total: 11 });
    expect(resolveChoice(check, 2, 8)).toMatchObject({ ok: false, total: 10 });
    expect(resolveChoice(EVENTS.wagon!.choices[1]!, -5, 1).ok).toBe(true);
  });

  it("landmarks lie out in the land, apart from each other", () => {
    const marks = world.places.filter((p) => p.kind === "mark");
    expect(marks.length).toBeGreaterThanOrEqual(5);
    for (const m of marks) expect(MARKS[m.ref ?? ""]).toBeTruthy();
  });

  it("happenings turn up around the company, on dry land, clear of places", () => {
    const rng = mulberry32(3).rng;
    const company = { x: 500, y: 320 };
    for (let i = 0; i < 20; i++) {
      const e = spawnEvent(world, rng, `e${i}`, company, 10, 150);
      if (!e) continue;
      expect(EVENTS[e.kind]).toBeTruthy();
      expect(dist(e, company)).toBeLessThan(150 * 1.4 + 1);
      expect(terrainAt(world, e)).not.toBe("water");
      expect(world.places.every((p) => dist(p, e) >= 30)).toBe(true);
      expect(e.until).toBeGreaterThan(10);
    }
  });
});
