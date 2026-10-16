import { describe, expect, it } from "vitest";
import { priceOf } from "./company";
import { BUILDING, CHARACTER, DEEDS, buildingsOf, characterOf, deedCost, greeting, townsfolkOf } from "./settlement";
import type { Place } from "./world";

const place = (kind: Place["kind"], known: string): Place => ({ id: `p-${kind}`, kind, name: "Ashby", x: 0, y: 0, known });

describe("settlements", () => {
  it("every reputation a place can have means something, with its own building", () => {
    for (const [known, c] of Object.entries(CHARACTER)) {
      expect(BUILDING[c.building]).toBeTruthy();
      expect(buildingsOf(place("town", known))).toContain(c.building);
    }
  });

  it("what a place is known for changes its prices", () => {
    const farm = place("village", "farms and cheap bread");
    const plain = place("village", "hunters and furs");
    expect(priceOf("ration", farm, 0)).toBeLessThan(priceOf("ration", plain, 0));
    expect(characterOf(place("city", "the duke's court")).pay).toBeGreaterThan(1);
  });

  it("the reeve is always about; the people change with the days but not between visits", () => {
    const p = place("city", "a college of mages");
    const a = townsfolkOf(7, p, 3);
    expect(a).toEqual(townsfolkOf(7, p, 3));
    expect(a[0]!.role).toBe("elder");
    expect(a.length).toBe(5);
    expect(new Set(a.map((f) => f.name)).size).toBe(a.length);
    for (const f of a) expect(buildingsOf(p)).toContain(f.at);
    expect(townsfolkOf(7, p, 4).map((f) => f.id)).not.toEqual(a.map((f) => f.id));
  });

  it("greetings remember a bad name; deeds cost more in bigger places", () => {
    const f = townsfolkOf(1, place("village", "a holy well"), 0)[0]!;
    expect(greeting(f, -4, 1)).toMatch(/forgotten/);
    const round = DEEDS.find((d) => d.id === "round")!;
    expect(deedCost(round, place("city", "x"))).toBeGreaterThan(deedCost(round, place("village", "x")));
  });
});
