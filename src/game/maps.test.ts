import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import { SkirmishMapSchema } from "../domain/skirmish-map";
import type { Combatant } from "../domain/types";
import { blankMap, checkMap, difficulty, mapScenario, outline, paint, resize, scenarioToMap, trialRuns, type Tool } from "./maps";
import { SCENARIOS, setupFor } from "./scenarios";

let n = 0;
const id = () => `id${n++}`;
const goblin: Tool = { kind: "monster", source: "srd", ref: "goblin-warrior" };

describe("map editor", () => {
  it("paints walls, terrain, starts and monsters, one thing per square", () => {
    let m = blankMap("m");
    m = paint(m, { x: 5, y: 5 }, { kind: "wall" }, id);
    expect(m.walls).toEqual(["5,5"]);
    // A monster replaces the wall; difficult terrain can sit under it.
    m = paint(m, { x: 5, y: 5 }, goblin, id);
    m = paint(m, { x: 5, y: 5 }, { kind: "difficult" }, id);
    expect(m.walls).toEqual([]);
    expect(m.monsters.map((x) => x.cell)).toEqual(["5,5"]);
    expect(m.difficult).toEqual(["5,5"]);
    // Painting the same monster again changes nothing.
    expect(paint(m, { x: 5, y: 5 }, goblin, id)).toBe(m);
    m = paint(m, { x: 5, y: 5 }, { kind: "erase" }, id);
    expect([m.walls, m.difficult, m.monsters]).toEqual([[], [], []]);
    // Off the map: ignored.
    expect(paint(m, { x: 99, y: 0 }, { kind: "wall" }, id)).toBe(m);
  });

  it("allows at most four start squares", () => {
    let m = blankMap("m");
    expect(m.starts).toHaveLength(4);
    expect(paint(m, { x: 8, y: 8 }, { kind: "start" }, id)).toBe(m);
    m = paint(m, { x: 0, y: 3 }, { kind: "erase" }, id);
    m = paint(m, { x: 8, y: 8 }, { kind: "start" }, id);
    expect(m.starts).toContain("8,8");
  });

  it("resizing drops what falls off the edge, within limits", () => {
    let m = paint(blankMap("m"), { x: 15, y: 9 }, goblin, id);
    m = resize(m, 10, 3);
    expect([m.width, m.height]).toEqual([10, 6]);
    expect(m.monsters).toEqual([]);
    expect(resize(m, 100, 100)).toMatchObject({ width: 30, height: 20 });
  });

  it("outline walls the edge but leaves starts and monsters alone", () => {
    const m = outline(blankMap("m"));
    expect(m.walls).toContain("0,0");
    expect(m.walls).not.toContain("0,3");
    expect(m.walls).toHaveLength(2 * 16 + 2 * 8 - 4);
  });

  it("checks for missing pieces and sealed-off monsters", () => {
    const empty = blankMap("m");
    expect(checkMap(empty, []).map((i) => i.text)).toContain("Place at least one monster");
    let m = paint(empty, { x: 10, y: 5 }, goblin, id);
    expect(checkMap(m, []).filter((i) => i.level === "error")).toEqual([]);
    for (const [x, y] of [[9, 4], [10, 4], [11, 4], [9, 5], [11, 5], [9, 6], [10, 6], [11, 6]]) m = paint(m, { x: x!, y: y! }, { kind: "wall" }, id);
    expect(checkMap(m, []).map((i) => i.text)).toContain("1 monster is walled off from the heroes");
    const lost = paint(empty, { x: 10, y: 5 }, { kind: "monster", source: "roster", ref: "deleted" }, id);
    expect(checkMap(lost, []).map((i) => i.text)).toContain("1 monster is no longer in your roster");
  });

  it("rates difficulty with the 2024 budget", () => {
    expect(difficulty(["1/4", "1/4", "1/4", "1/4", "1/4"], [1, 1, 1, 1])).toMatchObject({ xp: 250, label: "Moderate", budget: [200, 300, 400] });
    expect(difficulty(["1/8"], [3, 3, 3, 3]).label).toBe("Trivial");
    expect(difficulty(["2", "2"], [1, 1, 1, 1]).label).toBe("Deadly");
  });

  it("plays a map: walls, terrain, starts in order, roster monsters", () => {
    const wolf = SRD_MONSTERS.find((e) => e.key === "wolf")!.build();
    const roster = [{ ...wolf, id: "r1", name: "Dire Pup", x: 0, y: 0 } as unknown as Combatant];
    let m = blankMap("m");
    m = paint(m, { x: 6, y: 6 }, { kind: "wall" }, id);
    m = paint(m, { x: 7, y: 6 }, { kind: "difficult" }, id);
    m = paint(m, { x: 12, y: 3 }, goblin, id);
    m = paint(m, { x: 12, y: 4 }, goblin, id);
    m = paint(m, { x: 13, y: 4 }, { kind: "monster", source: "roster", ref: "r1" }, id);
    const sc = mapScenario(m, roster);
    expect(sc.id).toBe("map:m");
    expect(sc.custom.map((u) => u.name)).toEqual(["Goblin Warrior", "Goblin Warrior 2", "Dire Pup"]);
    const { board, units } = setupFor(sc, PARTY);
    expect(board.walls).toEqual(["6,6"]);
    expect(board.difficult).toEqual(["7,6"]);
    expect(units.filter((u) => u.side === "party").map((u) => u.pos)).toEqual([{ x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 0, y: 6 }]);
  });

  it("built-in scenarios copy into maps that play the same", () => {
    for (const sc of SCENARIOS) {
      const m = scenarioToMap(sc, "c");
      expect(SkirmishMapSchema.parse(m)).toEqual(m);
      expect(m.monsters).toHaveLength(sc.monsters.length);
      const a = setupFor(sc, PARTY);
      const b = setupFor(mapScenario(m, []), PARTY);
      expect(b.board).toEqual(a.board);
      expect(b.units.map((u) => [u.name, u.pos])).toEqual(expect.arrayContaining(a.units.map((u) => [u.name, u.pos])));
    }
  });

  it("trial runs report a win rate", () => {
    const m = scenarioToMap(SCENARIOS.find((s) => s.id === "bandit-camp")!, "t");
    const r = trialRuns(m, [], PARTY, 5);
    expect(r.runs).toBe(5);
    expect(r.winRate).toBeGreaterThan(0);
    expect(r.avgRounds).toBeGreaterThan(1);
  }, 20_000);
});
