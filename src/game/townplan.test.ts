import { describe, expect, it } from "vitest";
import { buildingsOf, CHARACTER } from "./settlement";
import { PLAN_H, PLAN_W, planOf } from "./townplan";
import type { Place } from "./world";

const kinds = ["village", "town", "city"] as const;

describe("a settlement from above", () => {
  it("every building that matters gets a place on the plan, apart and on the paper", () => {
    let n = 0;
    for (const kind of kinds)
      for (const known of Object.keys(CHARACTER))
        for (let i = 0; i < 4; i++) {
          const place: Place = { id: `s${n++}`, kind, name: "X", x: 0, y: 0, known };
          const plan = planOf(place);
          expect(plan.keys.map((k) => k.b).sort()).toEqual([...buildingsOf(place)].sort());
          for (const k of plan.keys) {
            expect(k.x).toBeGreaterThan(0);
            expect(k.y).toBeGreaterThan(0);
            expect(k.x).toBeLessThan(PLAN_W);
            expect(k.y).toBeLessThan(PLAN_H);
            for (const o of plan.keys) if (o !== k) expect(Math.hypot(o.x - k.x, o.y - k.y)).toBeGreaterThan(Math.max(o.r, k.r));
          }
          if (known === "the river market") expect(plan.river).not.toBeNull();
        }
  });

  it("bigger places have more houses and walls; the same place is drawn the same way", () => {
    const at = (kind: Place["kind"]) => planOf({ id: "p", kind, name: "X", x: 0, y: 0, known: "a holy well" });
    expect(at("city").houses.length).toBeGreaterThan(at("town").houses.length);
    expect(at("town").houses.length).toBeGreaterThan(at("village").houses.length);
    expect(at("village").wall).toBeNull();
    expect(at("city").wall?.kind).toBe("stone");
    expect(at("town")).toEqual(at("town"));
  });
});
