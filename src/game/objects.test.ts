import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Rng } from "../domain/dice";
import type { Cell } from "./board";
import { apply, boardFromAscii, createGame, reachable, type Command, type UnitSetup } from "./engine";
import type { GameState, MapObject } from "./state";

const content = [...PARTY, ...SRD_MONSTERS];

function setup(id: string, key: string, pos: Cell): UnitSetup {
  const c = content.find((e) => e.key === key)!.build();
  return { id, name: id, side: c.isMonster ? "enemy" : "party", stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos };
}

function game(rows: string[], units: UnitSetup[], objects: MapObject[], opts: { exit?: Cell[]; stash?: Record<string, number> } = {}): GameState {
  const { state } = createGame(boardFromAscii(rows), units, 7, { objects, stash: opts.stash, ...(opts.exit ? { objective: { kind: "exit", cells: opts.exit } } : {}) });
  return produce(state, (d) => {
    d.units.sort((a, b) => units.findIndex((u) => u.id === a.id) - units.findIndex((u) => u.id === b.id));
    d.turnIndex = 0;
  });
}

/** Every d20 lands on `face`. */
const always = (face: number): Rng => () => (face - 1) / 20 + 1e-9;
const run = (s: GameState, cmd: Command, rng?: Rng) => apply(s, cmd, rng ? { rng } : {});
const ROWS = ["......", "......", "......", "......"];

describe("map objects", () => {
  it("a closed door blocks the way until opened", () => {
    const rows = ["..#...", "......", "..#..."].map((r, y) => (y === 1 ? "..#..." : r));
    const s = game(rows, [setup("f", "fighter", { x: 1, y: 1 })], [{ id: "d", kind: "door", pos: { x: 2, y: 0 } }], { exit: [{ x: 5, y: 2 }] });
    // Walls at (2,0) door, (2,1), (2,2): no way across.
    expect(reachable(s, "f").has("3,1")).toBe(false);
    const opened = run(s, { type: "interact", unitId: "f", objectId: "d" }).state;
    expect(opened.objects![0]!.open).toBe(true);
    expect(reachable(opened, "f").has("3,1")).toBe(true);
    // Once a turn.
    expect(() => run(opened, { type: "interact", unitId: "f", objectId: "d" })).toThrow(/already/);
  });

  it("a locked door is picked with a good roll and holds with a bad one", () => {
    const door: MapObject = { id: "d", kind: "door", pos: { x: 1, y: 0 }, locked: true, dc: 12 };
    const s = game(ROWS, [setup("r", "rogue", { x: 0, y: 0 })], [door]);
    expect(() => run(s, { type: "interact", unitId: "r", objectId: "d" }, always(1)).state).not.toThrow();
    expect(run(s, { type: "interact", unitId: "r", objectId: "d" }, always(1)).state.objects![0]!.open).toBeFalsy();
    const ok = run(s, { type: "interact", unitId: "r", objectId: "d" }, always(15)).state;
    expect(ok.objects![0]!.open).toBe(true);
    expect(ok.board.walls).not.toContain("1,0");
  });

  it("a key found on the floor unlocks its door", () => {
    const objects: MapObject[] = [
      { id: "k", kind: "loot", pos: { x: 1, y: 1 }, group: "red" },
      { id: "d", kind: "door", pos: { x: 3, y: 1 }, locked: true, group: "red" },
    ];
    let s = game(ROWS, [setup("f", "fighter", { x: 0, y: 1 })], objects, { exit: [{ x: 5, y: 3 }] });
    s = run(s, { type: "move", unitId: "f", to: { x: 2, y: 1 } }).state;
    expect(s.keys).toContain("red");
    s = run(s, { type: "interact", unitId: "f", objectId: "d" }).state;
    expect(s.objects!.find((o) => o.id === "d")!.open).toBe(true);
  });

  it("a lever opens the gates of its group", () => {
    const objects: MapObject[] = [
      { id: "l", kind: "lever", pos: { x: 0, y: 0 }, group: "g" },
      { id: "g", kind: "gate", pos: { x: 3, y: 2 }, group: "g" },
    ];
    let s = game(ROWS, [setup("f", "fighter", { x: 1, y: 0 })], objects);
    expect(s.board.walls).toContain("3,2");
    s = run(s, { type: "interact", unitId: "f", objectId: "l" }).state;
    expect(s.board.walls).not.toContain("3,2");
    expect(s.objects!.find((o) => o.id === "g")!.open).toBe(true);
  });

  it("a hidden trap goes off underfoot and stops the hero", () => {
    const trap: MapObject = { id: "t", kind: "trap", trap: "spikes", pos: { x: 2, y: 0 }, hidden: true, armed: true, dc: 25, damage: "2d6" };
    const s = game(ROWS, [setup("f", "fighter", { x: 0, y: 0 })], [trap]);
    expect(s.objects![0]!.hidden).toBe(true);
    const { state, events } = run(s, { type: "move", unitId: "f", to: { x: 4, y: 0 } }, always(2));
    const f = state.units[0]!;
    expect(f.pos).toEqual({ x: 2, y: 0 });
    expect(f.hp).toBeLessThan(f.hpMax);
    expect(f.conditions).toContain("Prone");
    expect(state.objects![0]!.armed).toBe(false);
    // The walk is shown before the trap goes off.
    expect(events.findIndex((e) => e.type === "move")).toBeLessThan(events.findIndex((e) => e.type === "object"));
  });

  it("sharp eyes see an easy trap from the start, and heroes walk around it", () => {
    const trap: MapObject = { id: "t", kind: "trap", pos: { x: 1, y: 0 }, hidden: true, armed: true, dc: 5 };
    const s = game(["...", "###"], [setup("f", "fighter", { x: 0, y: 0 })], [trap]);
    expect(s.objects![0]!.hidden).toBe(false);
    expect(reachable(s, "f").has("2,0")).toBe(false);
    const disarmed = run(s, { type: "interact", unitId: "f", objectId: "t" }, always(20)).state;
    expect(disarmed.objects![0]!.armed).toBe(false);
    expect(reachable(disarmed, "f").has("2,0")).toBe(true);
  });

  it("searching finds hidden traps nearby", () => {
    const trap: MapObject = { id: "t", kind: "trap", pos: { x: 3, y: 0 }, hidden: true, armed: true, dc: 18 };
    const s = game(ROWS, [setup("c", "cleric", { x: 0, y: 0 })], [trap]);
    expect(run(s, { type: "search", unitId: "c" }, always(20)).state.objects![0]!.hidden).toBe(false);
  });

  it("a chest's gold and potions go to the party", () => {
    const chest: MapObject = { id: "c", kind: "chest", pos: { x: 1, y: 0 }, loot: { gold: 25, items: ["longsword"], stash: { "potion-healing": 2 } } };
    const s = game(ROWS, [setup("f", "fighter", { x: 0, y: 0 })], [chest], { stash: { "potion-healing": 1 } });
    // Can't walk into it.
    expect(reachable(s, "f").has("1,0")).toBe(false);
    const after = run(s, { type: "interact", unitId: "f", objectId: "c" }).state;
    expect(after.haul).toEqual({ gold: 25, items: ["longsword"] });
    expect(after.stash!["potion-healing"]).toBe(3);
  });

  it("a delve level is won at the exit, not by beating the foes", () => {
    let s = game(ROWS, [setup("f", "fighter", { x: 0, y: 0 })], [{ id: "x", kind: "exit", pos: { x: 3, y: 0 } }], { exit: [{ x: 3, y: 0 }] });
    expect(s.outcome).toBeNull();
    s = run(s, { type: "move", unitId: "f", to: { x: 3, y: 0 } }).state;
    expect(s.outcome).toBe("victory");
  });

  it("alchemist's fire splashes everyone around the square", () => {
    const s = game(ROWS, [setup("w", "wizard", { x: 0, y: 0 }), setup("g1", "goblin-warrior", { x: 3, y: 1 }), setup("g2", "goblin-warrior", { x: 4, y: 2 })], [], { stash: { "alchemists-fire": 1 } });
    const { state } = run(s, { type: "throw", unitId: "w", itemId: "alchemists-fire", point: { x: 3, y: 2 } }, always(1));
    expect(state.units.filter((u) => u.side === "enemy").every((u) => u.hp < u.hpMax)).toBe(true);
    expect(state.stash!["alchemists-fire"]).toBe(0);
    expect(() => run(state, { type: "throw", unitId: "w", itemId: "alchemists-fire", point: { x: 3, y: 2 } })).toThrow(/None/);
  });

  it("holy water burns the undead and does nothing to the living", () => {
    const s = game(ROWS, [setup("c", "cleric", { x: 0, y: 0 }), setup("sk", "skeleton", { x: 2, y: 0 }), setup("g", "goblin-warrior", { x: 2, y: 2 })], [], { stash: { "holy-water": 2 } });
    const hit = run(s, { type: "throw", unitId: "c", itemId: "holy-water", targetId: "sk" }, always(19)).state;
    expect(hit.units.find((u) => u.id === "sk")!.hp).toBeLessThan(hit.units.find((u) => u.id === "sk")!.hpMax);
    const wasted = run(s, { type: "throw", unitId: "c", itemId: "holy-water", targetId: "g" }, always(19)).state;
    expect(wasted.units.find((u) => u.id === "g")!.hp).toBe(wasted.units.find((u) => u.id === "g")!.hpMax);
  });
});
