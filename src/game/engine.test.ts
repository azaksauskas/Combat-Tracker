import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Rng } from "../domain/dice";
import { findPath, lineOfSight, reachableCells, type Cell } from "./board";
import { apply, boardFromAscii, checkTarget, createGame, currentUnit, reachable, type Command, type UnitSetup } from "./engine";
import { GameError, type GameEvent, type GameState } from "./state";

// --- helpers ------------------------------------------------------------------

const content = [...PARTY, ...SRD_MONSTERS];

function setup(id: string, key: string, pos: Cell, side?: "party" | "enemy"): UnitSetup {
  const entry = content.find((e) => e.key === key)!;
  const c = entry.build();
  return { id, name: id, side: side ?? (c.isMonster ? "enemy" : "party"), stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos };
}

/** Builds a game and fixes the turn order to the given ids (first one acts). */
function game(rows: string[], units: UnitSetup[], order = units.map((u) => u.id)): GameState {
  const { state } = createGame(boardFromAscii(rows), units, 42);
  return produce(state, (d) => {
    d.units.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    d.turnIndex = 0;
  });
}

/** Scripted dice: each entry is [face, sides]. Throws if the engine rolls more than scripted. */
function dice(...faces: [number, number][]): Rng {
  let i = 0;
  return () => {
    const f = faces[i++];
    if (!f) throw new Error(`Unscripted roll #${i}`);
    return (f[0] - 1) / f[1] + 1e-9;
  };
}

function run(state: GameState, cmd: Command, rng?: Rng) {
  return apply(state, cmd, rng ? { rng } : {});
}

const unitOf = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const actionId = (s: GameState, unit: string, name: string) => unitOf(s, unit).stats.actions.find((a) => a.name.startsWith(name))!.id;

const OPEN = ["........", "........", "........", "........", "........", "........"];

// --- board --------------------------------------------------------------------

describe("board", () => {
  const board = boardFromAscii(["....", ".#~.", "....", "...."]);
  const free = { blocked: () => false };

  it("charges double for difficult terrain and routes around walls", () => {
    expect(findPath(board, { x: 3, y: 1 }, { x: 2, y: 1 }, 100, free)!.cost).toBe(10);
    expect(findPath(board, { x: 0, y: 0 }, { x: 3, y: 0 }, 100, free)!.cost).toBe(15);
    // Around the wall without cutting its corners: down, across, then into the difficult cell.
    expect(findPath(board, { x: 0, y: 1 }, { x: 2, y: 1 }, 100, free)!.cost).toBe(25);
  });

  it("doesn't cut diagonally past a wall corner", () => {
    // (0,0) → (1,1) is a wall; (0,2) → (1,1) blocked too; going (0,1)→(1,2) diagonally would squeeze past the corner.
    const p = findPath(board, { x: 0, y: 1 }, { x: 1, y: 2 }, 100, free)!;
    expect(p.path.length).toBe(2);
  });

  it("limits reachable cells by budget", () => {
    const r = reachableCells(board, { x: 0, y: 0 }, 5, free);
    expect([...r.keys()].sort()).toEqual(["0,0", "0,1", "1,0"]);
  });

  it("blocks line of sight through walls but not past a single corner", () => {
    expect(lineOfSight(board, { x: 0, y: 1 }, { x: 3, y: 1 })).toBe(false);
    expect(lineOfSight(board, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
    expect(lineOfSight(board, { x: 1, y: 0 }, { x: 0, y: 1 })).toBe(true); // diagonal next to the wall at (1,1)
    const pillar = boardFromAscii(["...", ".#.", "..."]);
    expect(lineOfSight(pillar, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false); // straight through the pillar
  });
});

// --- turns & movement ----------------------------------------------------------

describe("turns and movement", () => {
  it("rolls initiative in descending order and starts round 1", () => {
    const { state, events } = createGame(boardFromAscii(OPEN), [setup("a", "fighter", { x: 0, y: 0 }), setup("g", "goblin-warrior", { x: 5, y: 5 })], 7);
    expect(state.units[0]!.initiative).toBeGreaterThanOrEqual(state.units[1]!.initiative);
    expect(events[0]).toEqual({ type: "round", round: 1 });
    expect(state.round).toBe(1);
  });

  it("moves within speed and charges movement", () => {
    let s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 7, y: 5 })]);
    s = run(s, { type: "move", unitId: "brann", to: { x: 3, y: 3 } }).state;
    expect(unitOf(s, "brann").pos).toEqual({ x: 3, y: 3 });
    expect(unitOf(s, "brann").turn.movement).toBe(15);
    expect(() => run(s, { type: "move", unitId: "brann", to: { x: 7, y: 3 } })).toThrow(GameError);
  });

  it("can pass allies but not stop on them, and can't pass enemies", () => {
    const s = game(
      ["#.#", "...", "#.#"],
      [setup("brann", "fighter", { x: 1, y: 0 }), setup("pip", "rogue", { x: 1, y: 1 }), setup("gob", "goblin-warrior", { x: 0, y: 1 })],
    );
    expect(reachable(s, "brann").has("1,1")).toBe(false);
    expect(reachable(s, "brann").has("1,2")).toBe(true);
    expect(reachable(s, "brann").has("0,1")).toBe(false);
  });

  it("refuses commands out of turn and second actions", () => {
    const s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    expect(() => run(s, { type: "dash", unitId: "gob" })).toThrow(/not that creature's turn/);
    const s2 = run(s, { type: "dash", unitId: "brann" }).state;
    expect(unitOf(s2, "brann").turn.movement).toBe(60);
    expect(() => run(s2, { type: "dodge", unitId: "brann" })).toThrow(/already used their action/);
  });

  it("ends turns, skips the dead and counts rounds", () => {
    let s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("dead", "goblin-warrior", { x: 4, y: 4 }), setup("gob", "goblin-warrior", { x: 5, y: 5 })]);
    s = produce(s, (d) => {
      d.units[1]!.dead = true;
    });
    s = run(s, { type: "end-turn", unitId: "brann" }).state;
    expect(currentUnit(s)!.id).toBe("gob");
    const r = run(s, { type: "end-turn", unitId: "gob" });
    expect(currentUnit(r.state)!.id).toBe("brann");
    expect(r.state.round).toBe(2);
    expect(r.events).toContainEqual({ type: "round", round: 2 });
  });
});

// --- attacks -------------------------------------------------------------------

describe("attacks", () => {
  it("rejects targets out of range or out of sight", () => {
    const s = game(["....#....."], [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 0 })]);
    expect(checkTarget(s, "brann", actionId(s, "brann", "Greatsword"), "gob")).toMatchObject({ ok: false, reason: /out of range/ });
    expect(checkTarget(s, "brann", actionId(s, "brann", "Javelin"), "gob")).toMatchObject({ ok: false, reason: /line of sight/ });
  });

  it("gives ranged attacks Disadvantage with an enemy adjacent", () => {
    const s = game(OPEN, [setup("pip", "rogue", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    const c = checkTarget(s, "pip", actionId(s, "pip", "Shortbow"), "gob");
    expect(c.advantage).toBe("dis");
    expect(c.reasons).toContain("− enemy within 5 ft");
  });

  it("kills a monster at 0 HP and declares victory", () => {
    const s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    // d20 15 (+5 = 20 vs AC 15) → hit; 2d6 = 6 + 5 → 11 +3 = 14 ≥ 10 HP.
    const r = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "gob" }, dice([15, 20], [6, 6], [5, 6]));
    expect(ofType(r.events, "attack")[0]).toMatchObject({ hit: true, crit: false });
    expect(unitOf(r.state, "gob").dead).toBe(true);
    expect(r.state.outcome).toBe("victory");
  });

  it("Graze deals the ability modifier on a miss", () => {
    const s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    const r = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "gob" }, dice([2, 20]));
    expect(ofType(r.events, "attack")[0]!.hit).toBe(false);
    expect(unitOf(r.state, "gob").hp).toBe(7);
  });

  it("a kill by Graze still ends the battle", () => {
    let s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    s = produce(s, (d) => {
      d.units[1]!.hp = 2;
    });
    const r = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "gob" }, dice([2, 20]));
    expect(unitOf(r.state, "gob").dead).toBe(true);
    expect(r.state.outcome).toBe("victory");
  });

  it("Pack Tactics gives Advantage and the bite knocks Prone", () => {
    const s = game(OPEN, [setup("wolf", "wolf", { x: 0, y: 0 }), setup("wolf2", "wolf", { x: 2, y: 0 }), setup("brann", "fighter", { x: 1, y: 0 })]);
    const r = run(s, { type: "action", unitId: "wolf", actionId: actionId(s, "wolf", "Bite"), targetId: "brann" }, dice([3, 20], [16, 20], [2, 6]));
    const atk = ofType(r.events, "attack")[0]!;
    expect(atk.advantage).toBe("adv");
    expect(atk.reasons).toContain("+ Pack Tactics");
    expect(atk.hit).toBe(true); // 16 + 4 = 20 vs AC 17
    expect(unitOf(r.state, "brann").conditions).toContain("Prone");
  });

  it("adds Sneak Attack once per turn with an ally next to the target", () => {
    const s = game(OPEN, [setup("pip", "rogue", { x: 0, y: 0 }), setup("brann", "fighter", { x: 2, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    const r = run(s, { type: "action", unitId: "pip", actionId: actionId(s, "pip", "Shortsword"), targetId: "gob" }, dice([12, 20], [1, 6], [1, 6]));
    expect(ofType(r.events, "feature").map((e) => e.name)).toContain("Sneak Attack");
    expect(ofType(r.events, "damage")[0]!.amount).toBe(5); // 1 + 3 + 1
    expect(unitOf(r.state, "pip").turn.sneakAttackUsed).toBe(true);
  });

  it("crits on a natural 20 by rolling damage dice twice", () => {
    const s = game(OPEN, [setup("pip", "rogue", { x: 0, y: 0 }), setup("zom", "zombie", { x: 1, y: 0 })]);
    const r = run(s, { type: "action", unitId: "pip", actionId: actionId(s, "pip", "Shortsword"), targetId: "zom" }, dice([20, 20], [1, 6], [1, 6]));
    const atk = ofType(r.events, "attack")[0]!;
    expect(atk.crit).toBe(true);
    expect(ofType(r.events, "damage")[0]!.amount).toBe(5); // 2d6 (1+1) + 3; Undead Fortitude not needed
  });

  it("Undead Fortitude can keep a zombie at 1 HP", () => {
    const s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("zom", "zombie", { x: 1, y: 0 })]);
    // Hit for 6+6+3 = 15 → 0 HP; Con save d20 20 + 3 = 23 ≥ DC 20 → 1 HP.
    const r = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "zom" }, dice([15, 20], [6, 6], [6, 6], [20, 20]));
    expect(ofType(r.events, "fortitude")[0]).toMatchObject({ dc: 20, success: true });
    expect(unitOf(r.state, "zom")).toMatchObject({ hp: 1, dead: false });
  });
});

// --- opportunity attacks ----------------------------------------------------------

describe("opportunity attacks", () => {
  const units = () => [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })];

  it("triggers when leaving an enemy's reach", () => {
    const s = game(OPEN, units());
    const r = run(s, { type: "move", unitId: "brann", to: { x: 0, y: 3 } }, dice([5, 20]));
    expect(ofType(r.events, "attack")[0]).toMatchObject({ attackerId: "gob", opportunity: true, hit: false });
    expect(unitOf(r.state, "gob").reaction).toBe(false);
    expect(unitOf(r.state, "brann").pos).toEqual({ x: 0, y: 3 });
  });

  it("doesn't trigger after Disengage", () => {
    let s = game(OPEN, units());
    s = run(s, { type: "disengage", unitId: "brann" }).state;
    const r = run(s, { type: "move", unitId: "brann", to: { x: 0, y: 3 } }, dice());
    expect(ofType(r.events, "attack")).toHaveLength(0);
  });

  it("goblins can Disengage as a bonus action (Nimble Escape), others can't", () => {
    const s = game(OPEN, [setup("gob", "goblin-warrior", { x: 0, y: 0 }), setup("brann", "fighter", { x: 1, y: 0 })]);
    const r = run(s, { type: "disengage", unitId: "gob", bonus: true });
    expect(unitOf(r.state, "gob").turn).toMatchObject({ disengaged: true, action: true, bonusAction: false });
    const s2 = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    expect(() => run(s2, { type: "disengage", unitId: "brann", bonus: true })).toThrow(/bonus action/);
  });
});

describe("retreat", () => {
  it("enemies next to a conscious hero get a parting attack, then the fight is lost", () => {
    const s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 }), setup("far", "goblin-warrior", { x: 6, y: 5 })]);
    const r = run(s, { type: "retreat", unitId: "brann" }, dice([5, 20]));
    expect(ofType(r.events, "attack")).toEqual([expect.objectContaining({ attackerId: "gob", targetId: "brann", opportunity: true })]);
    expect(r.state.outcome).toBe("defeat");
    expect(r.state.fled).toBe(true);
    expect(() => run(r.state, { type: "end-turn", unitId: "brann" })).toThrow(/over/);
  });
});

// --- dying ---------------------------------------------------------------------------

describe("dropping to 0 HP", () => {
  function downedEzra() {
    const s = game(OPEN, [setup("gob", "goblin-warrior", { x: 0, y: 0 }), setup("ezra", "wizard", { x: 1, y: 0 }), setup("brann", "fighter", { x: 5, y: 5 })]);
    // 18+4 hits AC 11; 1d6+2 = 6+2 = 8 → Ezra (8 HP) drops to 0.
    return run(s, { type: "action", unitId: "gob", actionId: actionId(s, "gob", "Scimitar"), targetId: "ezra" }, dice([18, 20], [6, 6]));
  }

  it("knocks a character Unconscious and Prone", () => {
    const r = downedEzra();
    expect(ofType(r.events, "down")).toHaveLength(1);
    expect(unitOf(r.state, "ezra")).toMatchObject({ hp: 0, dead: false, conditions: ["Unconscious", "Prone"] });
    expect(r.state.outcome).toBeNull();
  });

  it("a downed character's turn waits for the death save, then passes", () => {
    const s = downedEzra().state;
    const waiting = run(s, { type: "end-turn", unitId: "gob" }).state;
    expect(currentUnit(waiting)!.id).toBe("ezra");
    expect(unitOf(waiting, "ezra").turn.needsDeathSave).toBe(true);
    expect(() => run(waiting, { type: "dodge", unitId: "ezra" })).toThrow(/roll the death save/);
    const r = run(waiting, { type: "death-save", unitId: "ezra" }, dice([4, 20]));
    expect(ofType(r.events, "death-save")[0]).toMatchObject({ unitId: "ezra", result: "failure", failures: 1 });
    expect(unitOf(r.state, "ezra").death.worst).toBe(1);
    expect(currentUnit(r.state)!.id).toBe("brann");
  });

  it("a natural 20 death save revives with 1 HP", () => {
    const s = run(downedEzra().state, { type: "end-turn", unitId: "gob" }).state;
    const r = run(s, { type: "death-save", unitId: "ezra" }, dice([20, 20]));
    expect(unitOf(r.state, "ezra")).toMatchObject({ hp: 1 });
    expect(unitOf(r.state, "ezra").conditions).not.toContain("Unconscious");
    expect(currentUnit(r.state)!.id).toBe("ezra");
  });

  it("damage at 0 HP adds failures; a crit adds two and kills at three", () => {
    let s = downedEzra().state;
    s = produce(s, (d) => {
      d.units[0]!.turn.action = true;
    });
    // Unconscious target within 5 ft: Advantage and an automatic crit on a hit.
    const r = run(s, { type: "action", unitId: "gob", actionId: actionId(s, "gob", "Scimitar"), targetId: "ezra" }, dice([10, 20], [12, 20], [1, 6], [1, 6], [1, 4], [1, 4]));
    expect(ofType(r.events, "attack")[0]).toMatchObject({ crit: true, advantage: "adv" });
    expect(unitOf(r.state, "ezra").death.failures).toBe(2);
  });

  it("massive damage kills outright", () => {
    const s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("ezra", "wizard", { x: 1, y: 0 }, "enemy"), setup("pip", "rogue", { x: 5, y: 5 }, "enemy")]);
    // Treat Ezra as a character on the other side to test the rule: 8 HP, needs 16+ damage.
    const s2 = produce(s, (d) => {
      d.units[1]!.side = "party";
      d.units[0]!.side = "enemy";
    });
    const r = run(s2, { type: "action", unitId: "brann", actionId: actionId(s2, "brann", "Greatsword"), targetId: "ezra" }, dice([20, 20], [6, 6], [6, 6], [6, 6], [6, 6]));
    expect(unitOf(r.state, "ezra").dead).toBe(true);
  });
});

// --- features -----------------------------------------------------------------------

describe("features", () => {
  it("Vex lasts until the end of the attacker's next turn", () => {
    let s = game(OPEN, [setup("pip", "rogue", { x: 0, y: 0 }), setup("zom", "zombie", { x: 1, y: 0 })]);
    s = run(s, { type: "action", unitId: "pip", actionId: actionId(s, "pip", "Shortsword"), targetId: "zom" }, dice([15, 20], [2, 6])).state;
    expect(s.effects.map((e) => e.kind)).toEqual(["vex"]);
    s = run(s, { type: "end-turn", unitId: "pip" }).state; // end of Pip's turn: still active
    s = run(s, { type: "end-turn", unitId: "zom" }).state;
    expect(checkTarget(s, "pip", actionId(s, "pip", "Shortsword"), "zom").reasons).toContain("+ Vex");
    s = run(s, { type: "end-turn", unitId: "pip" }).state; // end of Pip's next turn: gone
    expect(s.effects).toHaveLength(0);
  });


  it("Second Wind heals 1d10 + level as a bonus action, twice per rest", () => {
    let s = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 5, y: 5 })]);
    s = produce(s, (d) => {
      d.units[0]!.hp = 2;
    });
    const r = run(s, { type: "second-wind", unitId: "brann" }, dice([7, 10]));
    expect(unitOf(r.state, "brann")).toMatchObject({ hp: 10, resources: { "second-wind": 1 } });
    expect(() => run(r.state, { type: "second-wind", unitId: "brann" })).toThrow(/bonus action/);
  });

  it("is deterministic for a given seed", () => {
    const make = () => game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    const swing = (s: GameState) => run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "gob" });
    const a = swing(make());
    const b = swing(make());
    expect(ofType(a.events, "attack")[0]!.roll.total).toBe(ofType(b.events, "attack")[0]!.roll.total);
  });
});

describe("level 2–3 features, potions and surprise", () => {
  const withFeatures = (u: UnitSetup, ...features: UnitSetup["stats"]["features"]) => ({ ...u, stats: { ...u.stats, features: [...u.stats.features, ...features] } });

  it("Action Surge gives a second action once", () => {
    let s = game(OPEN, [withFeatures(setup("brann", "fighter", { x: 0, y: 0 }), "action-surge"), setup("gob", "goblin-warrior", { x: 5, y: 5 })]);
    expect(() => run(s, { type: "action-surge", unitId: "brann" })).toThrow(/action first/);
    s = run(s, { type: "dash", unitId: "brann" }).state;
    s = run(s, { type: "action-surge", unitId: "brann" }).state;
    expect(unitOf(s, "brann").turn.action).toBe(true);
    s = run(s, { type: "dash", unitId: "brann" }).state;
    expect(unitOf(s, "brann").turn.movement).toBe(90);
    expect(() => run(s, { type: "action-surge", unitId: "brann" })).toThrow(/No Action Surge/);
  });

  it("Improved Critical crits on a 19", () => {
    const s = game(OPEN, [withFeatures(setup("brann", "fighter", { x: 0, y: 0 }), "improved-critical"), setup("zom", "zombie", { x: 1, y: 0 })]);
    const r = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "zom" }, dice([19, 20], [1, 6], [1, 6], [1, 6], [1, 6], [20, 20]));
    expect(ofType(r.events, "attack")[0]).toMatchObject({ hit: true, crit: true });
  });

  it("Cunning Action: Dash and Disengage as bonus actions", () => {
    let s = game(OPEN, [withFeatures(setup("pip", "rogue", { x: 0, y: 0 }), "cunning-action"), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    s = run(s, { type: "dash", unitId: "pip", bonus: true }).state;
    expect(unitOf(s, "pip").turn).toMatchObject({ movement: 60, action: true, bonusAction: false });
    const s2 = game(OPEN, [setup("brann", "fighter", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    expect(() => run(s2, { type: "dash", unitId: "brann", bonus: true })).toThrow(/bonus action/);
  });

  it("Turn Undead: failed saves leave undead Turned until they're hurt", () => {
    let s = game(OPEN, [
      withFeatures(setup("maren", "cleric", { x: 0, y: 0 }), "turn-undead"),
      setup("skel", "skeleton", { x: 3, y: 0 }),
      setup("gob", "goblin-warrior", { x: 1, y: 1 }),
      setup("brann", "fighter", { x: 4, y: 0 }),
    ]);
    // Skeleton saves: d20 2 − 1 = 1 vs DC 13 → Turned. The goblin isn't undead.
    const r = run(s, { type: "turn-undead", unitId: "maren" }, dice([2, 20]));
    expect(ofType(r.events, "save")).toHaveLength(1);
    expect(unitOf(r.state, "skel").conditions).toContain("Turned");
    expect(unitOf(r.state, "maren").resources["channel-divinity"]).toBe(1);
    s = run(r.state, { type: "end-turn", unitId: "maren" }).state;
    expect(currentUnit(s)!.id).toBe("skel");
    expect(() => run(s, { type: "dash", unitId: "skel" })).toThrow(/can't act/);
    s = run(s, { type: "end-turn", unitId: "skel" }).state;
    s = run(s, { type: "end-turn", unitId: "gob" }).state;
    // Brann's hit snaps it out of it.
    const hit = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "skel" }, dice([15, 20], [1, 6], [1, 6]));
    expect(unitOf(hit.state, "skel").conditions).not.toContain("Turned");
  });

  it("potions heal you or an adjacent ally as a bonus action and come from the stash", () => {
    const { state } = createGame(boardFromAscii(OPEN), [setup("pip", "rogue", { x: 0, y: 0 }), setup("brann", "fighter", { x: 1, y: 0 }), setup("gob", "goblin-warrior", { x: 7, y: 5 })], 3, { stash: { "potion-healing": 1 } });
    let s = produce(state, (d) => {
      d.units.sort((a, b) => ["pip", "brann", "gob"].indexOf(a.id) - ["pip", "brann", "gob"].indexOf(b.id));
      d.turnIndex = 0;
      d.units[1]!.hp = 2;
    });
    const r = run(s, { type: "use-potion", unitId: "pip", itemId: "potion-healing", targetId: "brann" }, dice([4, 4], [4, 4]));
    expect(unitOf(r.state, "brann").hp).toBe(12);
    expect(r.state.stash!["potion-healing"]).toBe(0);
    expect(unitOf(r.state, "pip").turn.bonusAction).toBe(false);
    s = produce(r.state, (d) => {
      d.units[0]!.turn.bonusAction = true;
    });
    expect(() => run(s, { type: "use-potion", unitId: "pip", itemId: "potion-healing", targetId: "pip" })).toThrow(/No potion/);
  });

  it("carries HP and resources into a fight, and surprise lowers initiative", () => {
    const units = [{ ...setup("brann", "fighter", { x: 0, y: 0 }), hp: 5, hpMax: 12, resources: { "second-wind": 0 } }, setup("gob", "goblin-warrior", { x: 5, y: 5 })];
    const { state } = createGame(boardFromAscii(OPEN), units, 9);
    expect(unitOf(state, "brann")).toMatchObject({ hp: 5, hpMax: 12, resources: { "second-wind": 0 } });
    // Over many seeds, a surprised side rolls lower on average.
    let normal = 0;
    let surprised = 0;
    for (let seed = 1; seed <= 200; seed++) {
      normal += unitOf(createGame(boardFromAscii(OPEN), units, seed).state, "gob").initiative;
      surprised += unitOf(createGame(boardFromAscii(OPEN), units, seed, { surprised: "enemy" }).state, "gob").initiative;
    }
    expect(surprised).toBeLessThan(normal);
  });
});
