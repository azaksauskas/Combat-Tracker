import { describe, expect, it } from "vitest";
import { BUILTIN_FACTIONS } from "./region";
import { WORLD_H, WORLD_W, bandAt, dist, generateWorld, march, moveBands, spawnBand, terrainAt, travelHours, type Band } from "./world";
import { mulberry32 } from "./rng";

const sites = [{ id: "goblin-trail", title: "The Goblin Trail" }];
const world = generateWorld(42, "Oakhaven", BUILTIN_FACTIONS, sites);

describe("the world map", () => {
  it("is the same land for the same seed, with home, five settlements, every lair and every adventure", () => {
    expect(generateWorld(42, "Oakhaven", BUILTIN_FACTIONS, sites)).toEqual(world);
    expect(generateWorld(43, "Oakhaven", BUILTIN_FACTIONS, sites)).not.toEqual(world);
    const kinds = world.places.map((p) => p.kind);
    expect(kinds.filter((k) => k === "home")).toHaveLength(1);
    expect(kinds.filter((k) => k === "village" || k === "town" || k === "city")).toHaveLength(5);
    expect(world.places.filter((p) => p.kind === "lair")).toHaveLength(BUILTIN_FACTIONS.length);
    expect(world.places.find((p) => p.kind === "site")?.ref).toBe("goblin-trail");
    for (const p of world.places) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WORLD_W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(WORLD_H);
    }
    // A road reaches every settlement.
    for (const p of world.places.filter((q) => q.kind === "village" || q.kind === "town" || q.kind === "city")) {
      expect(world.roads.some((r) => dist(r[2]!, p) < 1)).toBe(true);
      expect(terrainAt(world, p)).toBe("road");
    }
  });

  it("roads are quick, rough ground is slow", () => {
    const road = world.roads[0]!;
    const onRoad = march(world, road[0]!, road[2]!, 1);
    const forest = world.patches.find((p) => p.terrain === "forest")!;
    const inForest = march(world, { x: forest.x, y: forest.y }, { x: forest.x + 200, y: forest.y }, 0.5);
    expect(dist(onRoad.pos, road[0]!)).toBeGreaterThan(dist(inForest.pos, forest) * 1.5);
    expect(travelHours(world, road[0]!, road[2]!)).toBeGreaterThan(0);
    expect(march(world, { x: 100, y: 100 }, { x: 101, y: 100 }, 1)).toMatchObject({ arrived: true, pos: { x: 101, y: 100 } });
  });

  it("bands wander, chase a company they see, and catch it", () => {
    const rng = mulberry32(1).rng;
    const band = spawnBand(world, rng, "b1", 3, BUILTIN_FACTIONS);
    expect(band.foe).toBeTruthy();
    const company = { x: 500, y: 600 };
    const near: Band = { ...band, x: company.x + 60, y: company.y, goal: { x: 0, y: 0 }, home: { x: company.x + 60, y: company.y } };
    let bands = [near];
    for (let i = 0; i < 20 && !bandAt(bands, company); i++) bands = moveBands(world, bands, company, 0.5, rng);
    expect(bandAt(bands, company)?.id).toBe(band.id);
    // Far away, it doesn't come.
    const far: Band = { ...band, x: 20, y: 20, goal: { x: 40, y: 40 }, home: { x: 20, y: 20 } };
    expect(dist(moveBands(world, [far], company, 1, rng)[0]!, company)).toBeGreaterThan(300);
  });

  it("a band won't chase the company far from its own ground", () => {
    const rng = mulberry32(5).rng;
    const company = { x: 500, y: 300 };
    // Its home is far away: it turns back instead of following.
    const b: Band = { id: "x", foe: "wolves", name: "Wolves", x: company.x + 50, y: company.y, goal: { x: company.x, y: company.y }, home: { x: 950, y: 300 } };
    const after = moveBands(world, [b], company, 1, rng)[0]!;
    expect(dist(after, company)).toBeGreaterThan(dist(b, company));
  });

  it("settlements are safe ground", () => {
    const home = world.places.find((p) => p.kind === "home")!;
    const rng = mulberry32(2).rng;
    const b: Band = { id: "x", foe: "wolves", name: "Wolves", x: home.x + 50, y: home.y, goal: { x: home.x, y: home.y } };
    let bands = [b];
    for (let i = 0; i < 30; i++) bands = moveBands(world, bands, home, 0.5, rng);
    expect(bandAt(bands, home)).toBeUndefined();
  });
});
