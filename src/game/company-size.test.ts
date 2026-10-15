import { describe, expect, it } from "vitest";
import { PARTY } from "../content/srd";
import { key, startCells } from "./board";
import { boardFromAscii } from "./engine";
import { SCENARIOS, scaleForParty, setupFor } from "./scenarios";
import { foeBattle } from "./patrol";
import { setTuning } from "./tuning";
import { foundTown } from "./town";
import { cantRaise, raiseCost } from "./town-store";

describe("a bigger company", () => {
  it("finds starting squares for everyone: the marked ones first, then free ones nearby, never a wall or a taken square", () => {
    const board = boardFromAscii(["#....", "#....", "#####"]);
    const cells = startCells(board, [{ x: 1, y: 0 }, { x: 1, y: 1 }], 6, [{ x: 2, y: 0 }]);
    expect(cells).toHaveLength(6);
    expect(cells.slice(0, 2)).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }]);
    const keys = cells.map(key);
    expect(new Set(keys).size).toBe(6);
    expect(keys).not.toContain("2,0");
    expect(keys.every((k) => !board.walls.includes(k))).toBe(true);
  });

  it("six heroes take the field without stacking up", () => {
    const sc = SCENARIOS[0]!;
    const six = [...PARTY, PARTY[0]!, PARTY[1]!].map((e, i) => ({ ...e, key: `${e.key}${i}` }));
    const { units, board } = setupFor(sc, six);
    const heroes = units.filter((u) => u.side === "party");
    expect(heroes).toHaveLength(6);
    const spots = units.map((u) => key(u.pos));
    expect(new Set(spots).size).toBe(spots.length);
    expect(spots.every((k) => !board.walls.includes(k))).toBe(true);
  });

  it("fights written for four get more foes for six; fights sized for the party don't", () => {
    const sc = SCENARIOS.find((s) => s.monsters.length >= 4)!;
    expect(scaleForParty(sc, 4)).toBe(sc);
    expect(scaleForParty(sc, 6).monsters.length).toBe(sc.monsters.length + Math.round(sc.monsters.length / 2));
    const patrol = foeBattle("wolves", 1, 6, "low", 7);
    expect(scaleForParty(patrol, 6)).toBe(patrol);
  });
});

describe("death is harder to undo", () => {
  it("raising needs a level 2 shrine, costs more for higher levels, and can be switched off", () => {
    const base = foundTown("A", 0, 1);
    const worker = { id: "s", name: "S", trade: "priest", from: "x", arrivedAt: 0, alignment: "Neutral", mood: 60, mind: "" };
    const low = { ...base, buildings: [...base.buildings, { id: "sh", type: "shrine" as const }], settlers: [worker] };
    expect(cantRaise(low)).toMatch(/level 2 shrine/);
    const high = { ...low, buildings: [...base.buildings, { id: "sh", type: "shrine" as const, level: 2 }] };
    expect(cantRaise(high)).toBeNull();
    expect(raiseCost(3).gold).toBe(raiseCost(1).gold * 3);
    setTuning({ "death.final": 1 });
    expect(cantRaise(high)).toMatch(/final/);
    setTuning({});
  });
});
