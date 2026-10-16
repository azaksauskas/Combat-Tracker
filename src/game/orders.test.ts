import { describe, expect, it } from "vitest";
import { ordersAt, tradeInFor, workshopOf } from "./orders";
import type { Place } from "./world";

const place = (kind: Place["kind"], known: string): Place => ({ id: "p", kind, name: "X", x: 0, y: 0, known });

describe("orders at other settlements' workshops", () => {
  it("villages make nothing; towns +1; cities +2; the forge town anything", () => {
    expect(ordersAt(place("village", "a holy well"))).toEqual([]);
    const town = ordersAt(place("town", "the river market")).map((r) => r.item);
    expect(town).toContain("weapon-plus-1");
    expect(town).not.toContain("weapon-plus-2");
    expect(ordersAt(place("city", "the duke's court")).map((r) => r.item)).toContain("weapon-plus-2");
    const forge = ordersAt(place("town", "a busy forge")).map((r) => r.item);
    expect(forge).toContain("weapon-plus-3");
    expect(forge).toContain("armor-plus-2");
    expect(workshopOf(place("city", "a college of mages")).tower).toBe(3);
    expect(ordersAt(place("town", "a busy forge")).some((r) => r.at === "tower")).toBe(false);
  });

  it("orders cost more and take longer than at home", () => {
    const r = ordersAt(place("town", "a busy forge")).find((x) => x.item === "weapon-plus-1")!;
    expect(r.price).toBeGreaterThan(r.gold);
    expect(r.wait).toBeGreaterThan(r.hours);
  });

  it("a weaker piece of the same kind is traded in, the best one first", () => {
    const owned = [
      { uid: "a", id: "weapon-plus-1" },
      { uid: "b", id: "weapon-plus-2", on: "hero" },
      { uid: "c", id: "shield-plus-1" },
    ];
    expect(tradeInFor("weapon-plus-3", owned)).toMatchObject({ uid: "b", on: "hero" });
    expect(tradeInFor("weapon-plus-2", owned)).toMatchObject({ uid: "a" });
    expect(tradeInFor("weapon-plus-1", owned)).toBeNull();
    expect(tradeInFor("cloak-of-protection", owned)).toBeNull();
    expect(tradeInFor("weapon-plus-2", owned)!.credit).toBeGreaterThan(0);
  });
});
