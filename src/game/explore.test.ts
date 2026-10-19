import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Rng } from "../domain/dice";
import type { Cell } from "./board";
import { apply, boardFromAscii, createGame, currentUnit, type Command, type UnitSetup } from "./engine";
import type { GameState, MapObject } from "./state";

const content = [...PARTY, ...SRD_MONSTERS];

function setup(id: string, key: string, pos: Cell, extra: Partial<UnitSetup> = {}): UnitSetup {
  const c = content.find((e) => e.key === key)!.build();
  return { id, name: id, side: c.isMonster ? "enemy" : "party", stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos, ...(c.isMonster ? { dormant: true } : {}), ...extra };
}

/** A long hall: the party on the left, the way out on the far right. */
const HALL = ["##############################", "#............................#", "#............................#", "#............................#", "##############################"];
const EXIT = { x: 28, y: 2 };

function explore(units: UnitSetup[], objects: MapObject[] = [], rows = HALL): GameState {
  return createGame(boardFromAscii(rows), units, 5, { objects: [{ id: "x", kind: "exit", pos: EXIT }, ...objects], objective: { kind: "exit", cells: [EXIT] }, fog: true }).state;
}

const always = (face: number): Rng => () => (face - 1) / 20 + 1e-9;
const run = (s: GameState, cmd: Command, rng?: Rng) => apply(s, cmd, rng ? { rng } : {});
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;

describe("exploring", () => {
  it("starts with no fight, sees only what's in the light", () => {
    const s = explore([setup("f", "fighter", { x: 1, y: 2 }), setup("r", "rogue", { x: 1, y: 1 })]);
    expect(s.explore).toBe(true);
    expect(currentUnit(s)!.side).toBe("party");
    expect(s.seen).toContain("5,2");
    expect(s.seen).not.toContain("25,2");
  });

  it("lets any hero lead, walks far in one go, and the others follow", () => {
    let s = explore([setup("f", "fighter", { x: 1, y: 2 }), setup("r", "rogue", { x: 1, y: 1 }), setup("c", "cleric", { x: 1, y: 3 })]);
    s = run(s, { type: "move", unitId: "r", to: { x: 8, y: 2 }, follow: true }).state;
    expect(unit(s, "r").pos).toEqual({ x: 8, y: 2 });
    for (const id of ["f", "c"]) expect(Math.max(Math.abs(unit(s, id).pos.x - 8), Math.abs(unit(s, id).pos.y - 2))).toBeLessThanOrEqual(2);
    // Still exploring, and they can go again straight away.
    expect(s.explore).toBe(true);
    s = run(s, { type: "move", unitId: "f", to: { x: 14, y: 2 } }).state;
    expect(unit(s, "f").pos).toEqual({ x: 14, y: 2 });
    // Can't walk into the dark.
    expect(() => run(s, { type: "move", unitId: "f", to: { x: 27, y: 2 } })).toThrow(/seen/);
  });

  it("reaching the way out wins", () => {
    let s = explore([setup("f", "fighter", { x: 20, y: 2 })]);
    s = run(s, { type: "move", unitId: "f", to: EXIT }).state;
    expect(s.outcome).toBe("victory");
  });

  it("a monster coming into the light stops the walk and starts a fight", () => {
    let s = explore([setup("f", "fighter", { x: 1, y: 2 }), setup("g", "goblin-warrior", { x: 20, y: 2 })]);
    expect(unit(s, "g").dormant).toBe(true);
    s = run(s, { type: "move", unitId: "f", to: { x: 9, y: 2 } }).state;
    s = run(s, { type: "move", unitId: "f", to: { x: 16, y: 2 } }).state;
    expect(unit(s, "f").pos.x).toBeLessThan(16);
    expect(s.explore).toBe(false);
    expect(unit(s, "g").dormant).toBe(false);
  });

  it("an ambusher waits unseen until a hero is close, then goes first", () => {
    let s = explore([setup("f", "fighter", { x: 1, y: 2 }), setup("g", "goblin-warrior", { x: 12, y: 2 }, { ambush: true })]);
    s = run(s, { type: "move", unitId: "f", to: { x: 8, y: 2 } }).state;
    expect(s.explore).toBe(true);
    s = run(s, { type: "move", unitId: "f", to: { x: 9, y: 1 } }).state;
    s = run(s, { type: "move", unitId: "f", to: { x: 11, y: 1 } }).state;
    expect(s.explore).toBe(false);
    expect(currentUnit(s)!.id).toBe("g");
  });

  it("wakes the monster's friends close by, but not the ones far off", () => {
    let s = explore([setup("f", "fighter", { x: 1, y: 2 }), setup("g1", "goblin-warrior", { x: 12, y: 2 }), setup("g2", "goblin-warrior", { x: 14, y: 1 }), setup("g3", "goblin-warrior", { x: 27, y: 2 })]);
    s = run(s, { type: "move", unitId: "f", to: { x: 5, y: 2 } }).state;
    expect(unit(s, "g1").dormant).toBe(false);
    expect(unit(s, "g2").dormant).toBe(false);
    expect(unit(s, "g3").dormant).toBe(true);
  });

  it("goes back to exploring when the fight is won", () => {
    let s = explore([setup("f", "fighter", { x: 10, y: 2 }), setup("g", "goblin-warrior", { x: 11, y: 2 })]);
    expect(s.explore).toBe(false);
    s = produce(s, (d) => {
      d.turnIndex = d.units.findIndex((u) => u.id === "f");
      d.units.find((u) => u.id === "g")!.hp = 1;
    });
    const attack = unit(s, "f").stats.actions.find((a) => a.kind === "attack")!.id;
    s = run(s, { type: "action", unitId: "f", actionId: attack, targetId: "g" }, always(18)).state;
    expect(unit(s, "g").dead).toBe(true);
    expect(s.explore).toBe(true);
    expect(s.outcome).toBeNull();
  });

  it("notices a trap only up close, and stops in front of it", () => {
    const trap: MapObject = { id: "t", kind: "trap", pos: { x: 8, y: 2 }, hidden: true, armed: true, dc: 5 };
    let s = explore([setup("f", "fighter", { x: 1, y: 2 })], [trap]);
    expect(s.objects!.find((o) => o.id === "t")!.hidden).toBe(true);
    s = run(s, { type: "move", unitId: "f", to: { x: 8, y: 1 } }).state;
    expect(s.objects!.find((o) => o.id === "t")!.hidden).toBe(false);
    expect(s.objects!.find((o) => o.id === "t")!.armed).toBe(true);
  });

  it("gives each hero one search per trap", () => {
    const trap: MapObject = { id: "t", kind: "trap", pos: { x: 4, y: 2 }, hidden: true, armed: true, dc: 30 };
    let s = explore([setup("c", "cleric", { x: 1, y: 2 })], [trap]);
    s = run(s, { type: "search", unitId: "c" }, always(20)).state;
    expect(s.objects!.find((o) => o.id === "t")!.searched).toEqual(["c"]);
    // Exploring: searching again is allowed, but finds nothing new at that spot.
    const again = run(s, { type: "search", unitId: "c" }, always(20)).state;
    expect(again.objects!.find((o) => o.id === "t")!.hidden).toBe(true);
  });
});
