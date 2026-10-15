import { describe, expect, it } from "vitest";
import { generateBattlemap } from "./battlemaps";
import { boardFromAscii } from "./engine";
import { findPath, makeBoardIndex, type Cell } from "./board";
import { mulberry32 } from "./rng";

const cells = (map: string[], test: (ch: string) => boolean): Cell[] => map.flatMap((r, y) => [...r].flatMap((ch, x) => (test(ch) ? [{ x, y }] : [])));

describe("battle maps", () => {
  for (const kind of ["dungeon", "cave", "wilds"] as const) {
    it(`${kind}: room for both sides, and every hero can reach every foe`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const m = generateBattlemap(kind, mulberry32(seed).rng, 6, 7);
        const heroes = cells(m.map, (c) => c === "P");
        const foes = cells(m.map, (c) => /[1-9]/.test(c));
        expect(heroes.length).toBeGreaterThanOrEqual(4);
        expect(foes.length).toBe(7);
        const board = boardFromAscii(m.map.map((r) => r.replace(/[P1-9]/g, ".")), m.heights);
        for (const f of foes) expect(findPath(board, heroes[0]!, f, 10_000, { blocked: () => false })).not.toBeNull();
      }
    });
  }

  it("the same seed makes the same map; dungeons and the wilds have more than one level", () => {
    expect(generateBattlemap("cave", mulberry32(3).rng, 6, 5)).toEqual(generateBattlemap("cave", mulberry32(3).rng, 6, 5));
    for (const kind of ["dungeon", "wilds"] as const) {
      const m = generateBattlemap(kind, mulberry32(9).rng, 6, 5);
      const idx = makeBoardIndex(boardFromAscii(m.map, m.heights));
      const levels = new Set(m.map.flatMap((r, y) => [...r].map((_, x) => idx.height({ x, y }))));
      expect(levels.size).toBeGreaterThan(1);
    }
  });
});

describe("levels", () => {
  it("cliffs can't be climbed; stairs join the levels", () => {
    const board = boardFromAscii(["....", "...."], ["0011", "0a11"]);
    // Straight across the cliff on the top row: no; round by the stairs: yes, but longer.
    const path = findPath(board, { x: 1, y: 0 }, { x: 2, y: 0 }, 1000, { blocked: () => false })!;
    expect(path.path.some((c) => c.x === 1 && c.y === 1)).toBe(true);
    const noStairs = boardFromAscii(["....", "...."], ["0011", "0011"]);
    expect(findPath(noStairs, { x: 1, y: 0 }, { x: 2, y: 0 }, 1000, { blocked: () => false })).toBeNull();
  });
});
