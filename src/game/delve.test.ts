import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { findPath, key } from "./board";
import { DELVE, levelObjects, levelSetup } from "./delve";
import { createGame } from "./engine";
import { MAGIC_ITEMS } from "./treasure";
import { ARMORS, WEAPONS } from "./arsenal";

describe("the delve", () => {
  it("has five levels, getting harder", () => {
    expect(DELVE.map((l) => l.n)).toEqual([1, 2, 3, 4, 5]);
    expect(DELVE.some((l) => l.kind === "explore" && l.monsters.length === 0)).toBe(true);
    expect(DELVE.at(-1)!.kind).toBe("boss");
    for (let i = 1; i < DELVE.length; i++) expect(DELVE[i]!.trapDc).toBeGreaterThanOrEqual(DELVE[i - 1]!.trapDc);
  });

  for (const level of DELVE) {
    describe(level.name, () => {
      it("has a square map with walls all round", () => {
        const w = level.map[0]!.length;
        for (const row of level.map) expect(row.length).toBe(w);
        expect(level.map[0]).toMatch(/^#+$/);
        expect(level.map.at(-1)).toMatch(/^#+$/);
        for (const row of level.map) expect(row[0] + row.at(-1)!).toBe("##");
      });

      it("has one way in and one way out, and every monster on the map", () => {
        const objects = levelObjects(level);
        expect(objects.filter((o) => o.kind === "entrance")).toHaveLength(1);
        expect(objects.filter((o) => o.kind === "exit")).toHaveLength(1);
        const digits = level.map.join("").match(/[1-9]/g) ?? [];
        expect(digits.length).toBe(level.monsters.length);
        for (const c of level.chests) for (const id of c.items ?? []) expect(id in MAGIC_ITEMS || id in WEAPONS || id in ARMORS).toBe(true);
        for (const id of level.unlocks) expect(id in MAGIC_ITEMS || id in WEAPONS || id in ARMORS).toBe(true);
      });

      it("can be walked from the start to the way out once doors and gates are open", () => {
        const { board, units, objects, objective } = levelSetup(level, PARTY);
        const solid = new Set(objects.filter((o) => o.kind === "chest" || o.kind === "barrel").map((o) => key(o.pos)));
        const exit = objective.kind === "exit" ? objective.cells[0]! : null;
        expect(exit).toBeTruthy();
        for (const h of units.filter((u) => u.side === "party")) {
          expect(findPath(board, h.pos, exit!, 9999, { blocked: (c) => solid.has(key(c)) }), `${h.name} reaches the exit`).not.toBeNull();
        }
        // Nobody starts on an object, and nobody shares a square.
        const taken = units.map((u) => key(u.pos));
        expect(new Set(taken).size).toBe(taken.length);
        for (const o of objects) expect(taken).not.toContain(key(o.pos));
      });

      it("starts a battle that isn't over before it begins", () => {
        const { board, units, objects, objective } = levelSetup(level, PARTY);
        const { state } = createGame(board, units, 3, { objects, objective });
        expect(state.outcome).toBeNull();
        // Closed doors are walls now.
        for (const o of objects.filter((x) => x.kind === "door" || x.kind === "gate")) expect(state.board.walls).toContain(key(o.pos));
      });
    });
  }

  it("names the boss", () => {
    const { units } = levelSetup(DELVE[4]!, PARTY);
    expect(units.some((u) => u.name === "The Fog Priest")).toBe(true);
  });

  it("the gate on the flooded level is the only way across", () => {
    const level = DELVE[2]!;
    const { board, units, objects, objective } = levelSetup(level, PARTY);
    const shut = new Set(objects.filter((o) => o.kind === "gate").map((o) => key(o.pos)));
    const exit = objective.kind === "exit" ? objective.cells[0]! : null;
    expect(findPath({ ...board, walls: [...board.walls, ...shut] }, units[0]!.pos, exit!, 9999, { blocked: () => false })).toBeNull();
  });
});
