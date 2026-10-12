import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Cell } from "./board";
import { nextAiCommand, hitChance } from "./ai";
import { apply, boardFromAscii, createGame, currentUnit, type UnitSetup } from "./engine";
import { GameError, type GameState } from "./state";

const content = [...PARTY, ...SRD_MONSTERS];
function setup(id: string, key: string, pos: Cell): UnitSetup {
  const c = content.find((e) => e.key === key)!.build();
  return { id, name: id, side: c.isMonster ? "enemy" : "party", stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos };
}

/** Lets the AI play both sides until someone wins. */
function autoplay(state: GameState, limit = 2000) {
  let s = state;
  for (let i = 0; i < limit && !s.outcome; i++) {
    const cmd = nextAiCommand(s);
    try {
      s = apply(s, cmd).state;
    } catch (err) {
      if (err instanceof GameError) throw new Error(`AI issued an invalid command ${JSON.stringify(cmd)}: ${err.message}`);
      throw err;
    }
  }
  return s;
}

const ARENA = [
  "............",
  "....##......",
  "....##..~~..",
  "........~~..",
  "..#.........",
  "..#.....##..",
  "............",
  "............",
];

const lineup = () => [
  setup("brann", "fighter", { x: 0, y: 2 }),
  setup("pip", "rogue", { x: 0, y: 3 }),
  setup("maren", "cleric", { x: 1, y: 3 }),
  setup("ezra", "wizard", { x: 0, y: 4 }),
  setup("gob1", "goblin-warrior", { x: 10, y: 2 }),
  setup("gob2", "goblin-warrior", { x: 11, y: 4 }),
  setup("wolf", "wolf", { x: 10, y: 6 }),
  setup("skel", "skeleton", { x: 11, y: 0 }),
];

describe("monster AI", () => {
  it("attacks an adjacent foe", () => {
    const { state } = createGame(boardFromAscii(["...."]), [setup("gob", "goblin-warrior", { x: 0, y: 0 }), setup("brann", "fighter", { x: 1, y: 0 })], 1);
    const s = state.units[0]!.id === "gob" ? state : apply(state, { type: "end-turn", unitId: "brann" }).state;
    expect(nextAiCommand(s)).toMatchObject({ type: "action", targetId: "brann" });
  });

  it("closes in on a distant foe", () => {
    const { state } = createGame(boardFromAscii(["............"]), [setup("wolf", "wolf", { x: 0, y: 0 }), setup("brann", "fighter", { x: 11, y: 0 })], 1);
    const s = currentUnit(state)!.id === "wolf" ? state : apply(state, { type: "end-turn", unitId: "brann" }).state;
    const cmd = nextAiCommand(s);
    expect(cmd.type).toBe("move");
  });

  it("plays whole battles to a finish without invalid commands", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = createGame(boardFromAscii(ARENA), lineup(), seed);
      const end = autoplay(state);
      expect(end.outcome, `seed ${seed}`).not.toBeNull();
    }
  });
});

describe("hit chance", () => {
  it("accounts for natural 1/20 and advantage", () => {
    expect(hitChance(5, 15)).toBeCloseTo(0.55);
    expect(hitChance(30, 10)).toBe(0.95);
    expect(hitChance(-5, 30)).toBe(0.05);
    expect(hitChance(5, 15, "adv")).toBeCloseTo(0.7975);
    expect(hitChance(5, 15, "dis")).toBeCloseTo(0.3025);
  });
});

describe("scenarios", () => {
  it("every built-in scenario sets up cleanly and plays to a finish", async () => {
    const { SCENARIOS, scenarioSetup } = await import("./scenarios");
    for (const sc of SCENARIOS) {
      const { board, units } = scenarioSetup(sc);
      expect(units.filter((u) => u.side === "party")).toHaveLength(4);
      expect(units.filter((u) => u.side === "enemy")).toHaveLength(sc.monsters.length);
      // No one starts in a wall.
      for (const u of units) expect(board.walls, `${sc.id} ${u.name}`).not.toContain(`${u.pos.x},${u.pos.y}`);
      for (let seed = 1; seed <= 10; seed++) expect(autoplay(createGame(board, units, seed).state).outcome, `${sc.id} seed ${seed}`).not.toBeNull();
    }
  }, 30_000);
});
