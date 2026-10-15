import { describe, expect, it } from "vitest";
import { foundTown } from "./town";
import { homes, phaseOf, skyAt, whereabouts } from "./village";

const settler = (id: string, trade: string) => ({ id, name: id, trade, from: "x", arrivedAt: 0, alignment: "Neutral", mood: 60, mind: "" });

describe("the living village", () => {
  const base = foundTown("A", 0, 1);
  const t = {
    ...base,
    buildings: [...base.buildings, { id: "h", type: "house" as const }, { id: "f", type: "farm" as const }, { id: "tv", type: "tavern" as const }],
    settlers: [settler("a", "farmer"), settler("b", "brewer"), settler("c", "")],
  };

  it("phases of the day", () => {
    expect([3, 7, 12, 20, 23].map(phaseOf)).toEqual(["night", "morning", "work", "evening", "night"]);
    expect(phaseOf(24 * 5 + 12)).toBe("work");
  });

  it("everyone has a bed: houses first, then the hall", () => {
    const beds = homes(t);
    expect([...beds.values()].every((b) => b === "h" || b === "hall")).toBe(true);
    expect(beds.get("a")).toBe("h");
  });

  it("work by day, the tavern in the evening, home at night", () => {
    const at = (h: number) => Object.fromEntries(whereabouts(t, h).map((w) => [w.settler.id, w.at]));
    expect(at(12)).toMatchObject({ a: "f", b: "tv" });
    expect(at(20)).toMatchObject({ a: "tv", b: "tv", c: "tv" });
    const night = whereabouts(t, 2);
    expect(night.every((w) => w.asleep)).toBe(true);
    expect(night.find((w) => w.settler.id === "a")!.at).toBe("h");
  });

  it("the sun by day, the moon and stars by night", () => {
    const noon = skyAt(12);
    expect(noon.sun).toBeCloseTo(0.46, 1);
    expect(noon.moon).toBeNull();
    expect(noon.stars).toBe(0);
    const midnight = skyAt(24);
    expect(midnight.sun).toBeNull();
    expect(midnight.moon).not.toBeNull();
    expect(midnight.stars).toBe(1);
  });
});
