import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Rng } from "../domain/dice";
import { mulberry32 } from "./rng";
import type { Cell } from "./board";
import { apply, areaCells, boardFromAscii, checkArea, checkTarget, createGame, type Command, type UnitSetup } from "./engine";
import { applyFight, createParty, gainXp, shortRest } from "./party";
import { GameError, type GameEvent, type GameState } from "./state";

// --- helpers (as in engine.test.ts) -------------------------------------------------

const content = [...PARTY, ...SRD_MONSTERS];

function setup(id: string, key: string, pos: Cell, side?: "party" | "enemy"): UnitSetup {
  const c = content.find((e) => e.key === key)!.build();
  return { id, name: id, side: side ?? (c.isMonster ? "enemy" : "party"), stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos };
}

function game(units: UnitSetup[], tweak?: (d: GameState) => void): GameState {
  const { state } = createGame(boardFromAscii(OPEN), units, 42);
  return produce(state, (d) => {
    d.units.sort((a, b) => units.findIndex((u) => u.id === a.id) - units.findIndex((u) => u.id === b.id));
    d.turnIndex = 0;
    tweak?.(d);
  });
}

function dice(...faces: [number, number][]): Rng {
  let i = 0;
  return () => {
    const f = faces[i++];
    if (!f) throw new Error(`Unscripted roll #${i}`);
    return (f[0] - 1) / f[1] + 1e-9;
  };
}

const run = (s: GameState, cmd: Command, rng?: Rng) => apply(s, cmd, { rng: rng ?? mulberry32(7).rng });
const unitOf = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const actionId = (s: GameState, unit: string, name: string) => unitOf(s, unit).stats.actions.find((a) => a.name.startsWith(name))!.id;
const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

const OPEN = ["..........", "..........", "..........", "..........", "..........", "..........", ".........."];

// --- healing --------------------------------------------------------------------------

describe("healing spells", () => {
  it("Cure Wounds heals a touched ally, wakes them, and uses a slot", () => {
    let s = game([setup("maren", "cleric", { x: 0, y: 0 }), setup("brann", "fighter", { x: 1, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })], (d) => {
      const b = d.units.find((u) => u.id === "brann")!;
      b.hp = 0;
      b.conditions.push("Unconscious");
    });
    expect(unitOf(s, "maren").resources.slot1).toBe(2);
    s = run(s, { type: "action", unitId: "maren", actionId: actionId(s, "maren", "Cure Wounds"), targetId: "brann" }, dice([2, 8], [3, 8])).state;
    // 2 + 3 + Wis 3 = 8
    expect(unitOf(s, "brann").hp).toBe(8);
    expect(unitOf(s, "brann").conditions).not.toContain("Unconscious");
    expect(unitOf(s, "maren").resources.slot1).toBe(1);
  });

  it("is for allies only, and touch range means 5 ft", () => {
    const s = game([setup("maren", "cleric", { x: 0, y: 0 }), setup("brann", "fighter", { x: 3, y: 0 }), setup("gob", "goblin-warrior", { x: 1, y: 0 })]);
    expect(checkTarget(s, "maren", actionId(s, "maren", "Cure Wounds"), "gob").ok).toBe(false);
    expect(checkTarget(s, "maren", actionId(s, "maren", "Cure Wounds"), "brann").reason).toMatch(/out of range/);
    expect(checkTarget(s, "maren", actionId(s, "maren", "Cure Wounds"), "maren").ok).toBe(true);
    expect(checkTarget(s, "maren", actionId(s, "maren", "Healing Word"), "brann").ok).toBe(true);
  });

  it("Healing Word is a bonus action and leaves the action free", () => {
    let s = game([setup("maren", "cleric", { x: 0, y: 0 }), setup("brann", "fighter", { x: 6, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })]);
    s = run(s, { type: "action", unitId: "maren", actionId: actionId(s, "maren", "Healing Word"), targetId: "brann" }).state;
    expect(unitOf(s, "maren").turn).toMatchObject({ action: true, bonusAction: false });
  });

  it("refuses when the slots are gone", () => {
    const s = game([setup("maren", "cleric", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })], (d) => {
      d.units[0]!.resources.slot1 = 0;
    });
    expect(() => run(s, { type: "action", unitId: "maren", actionId: actionId(s, "maren", "Cure Wounds"), targetId: "maren" })).toThrow(GameError);
    expect(checkTarget(s, "maren", actionId(s, "maren", "Guiding Bolt"), "gob").reason).toMatch(/spell slots/);
  });

  it("Disciple of Life adds 2 + the slot level", () => {
    const s = game([setup("maren", "cleric", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })], (d) => {
      d.units[0]!.hp = 1;
      d.units[0]!.stats.features.push("disciple-of-life");
    });
    const next = run(s, { type: "action", unitId: "maren", actionId: actionId(s, "maren", "Cure Wounds"), targetId: "maren" }, dice([1, 8], [1, 8])).state;
    // 1 + 1 + 3 (Wis) + 3 (Disciple) = 8, plus the 1 HP she had.
    expect(unitOf(next, "maren").hp).toBe(9);
  });
});

// --- Bless and concentration ----------------------------------------------------------

describe("Bless and concentration", () => {
  const start = () =>
    game([
      setup("maren", "cleric", { x: 0, y: 0 }),
      setup("brann", "fighter", { x: 1, y: 0 }),
      setup("pip", "rogue", { x: 2, y: 0 }),
      setup("ezra", "wizard", { x: 3, y: 0 }),
      setup("gob", "goblin-warrior", { x: 2, y: 1 }),
    ]);

  it("blesses up to three allies and the d4 is added to attack rolls", () => {
    let s = start();
    const bless = actionId(s, "maren", "Bless");
    expect(() => run(s, { type: "action", unitId: "maren", actionId: bless, targetIds: ["maren", "brann", "pip", "ezra"] })).toThrow(/at most 3/);
    s = run(s, { type: "action", unitId: "maren", actionId: bless, targetIds: ["brann", "pip", "maren"] }).state;
    expect(unitOf(s, "maren").concentration).toBe("Bless");
    expect(s.effects.filter((e) => e.kind === "bless")).toHaveLength(3);
    // Brann's turn: d20 10 + d4 3 + 5 = 18 vs AC 15 → hit, which wouldn't hit without Bless at 9.
    s = produce(s, (d) => {
      d.turnIndex = 1;
    });
    const { events } = run(s, { type: "action", unitId: "brann", actionId: actionId(s, "brann", "Greatsword"), targetId: "gob" }, dice([10, 20], [3, 4], [1, 6], [1, 6]));
    const atk = ofType(events, "attack")[0]!;
    expect(atk.roll.total).toBe(18);
  });

  it("losing concentration ends Bless on everyone", () => {
    let s = start();
    s = run(s, { type: "action", unitId: "maren", actionId: actionId(s, "maren", "Bless"), targetIds: ["brann", "pip"] }).state;
    // Goblin hits Maren; she fails the Con save (d20 1 + d4? she isn't blessed herself).
    s = produce(s, (d) => {
      d.units.find((u) => u.id === "gob")!.pos = { x: 1, y: 1 };
      d.turnIndex = d.units.findIndex((u) => u.id === "gob");
    });
    const { state, events } = run(s, { type: "action", unitId: "gob", actionId: actionId(s, "gob", "Scimitar"), targetId: "maren" }, dice([19, 20], [4, 6], [1, 20]));
    expect(ofType(events, "save").some((e) => e.action.startsWith("Concentration") && !e.success)).toBe(true);
    expect(unitOf(state, "maren").concentration).toBeNull();
    expect(state.effects.filter((e) => e.kind === "bless")).toHaveLength(0);
  });

  it("casting a new concentration spell replaces the old one", () => {
    let s = start();
    const bless = actionId(s, "maren", "Bless");
    s = run(s, { type: "action", unitId: "maren", actionId: bless, targetIds: ["brann"] }).state;
    s = produce(s, (d) => {
      d.units[0]!.turn.action = true;
    });
    s = run(s, { type: "action", unitId: "maren", actionId: bless, targetIds: ["pip"] }).state;
    expect(s.effects.filter((e) => e.kind === "bless").map((e) => e.target)).toEqual(["pip"]);
  });
});

// --- attack spells -------------------------------------------------------------------

describe("attack spells", () => {
  it("Magic Missile always hits, one roll per dart", () => {
    let s = game([setup("ezra", "wizard", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })]);
    s = run(s, { type: "action", unitId: "ezra", actionId: actionId(s, "ezra", "Magic Missile"), targetId: "gob" }, dice([1, 4], [2, 4], [3, 4])).state;
    // (1+1) + (2+1) + (3+1) = 9 of the goblin's 10.
    expect(unitOf(s, "gob").hp).toBe(1);
    expect(unitOf(s, "ezra").resources.slot1).toBe(1);
  });

  it("Guiding Bolt gives the next attack against the target Advantage", () => {
    let s = game([setup("maren", "cleric", { x: 0, y: 0 }), setup("pip", "rogue", { x: 5, y: 0 }), setup("gob", "goblin-warrior", { x: 6, y: 0 })], (d) => {
      d.units[2]!.hp = 30;
      d.units[2]!.hpMax = 30;
    });
    s = run(s, { type: "action", unitId: "maren", actionId: actionId(s, "maren", "Guiding Bolt"), targetId: "gob" }, dice([15, 20], [1, 6], [1, 6], [1, 6], [1, 6])).state;
    const check = checkTarget(s, "pip", actionId(s, "pip", "Shortsword"), "gob");
    expect(check.advantage).toBe("adv");
    expect(check.reasons).toContain("+ Guiding Bolt");
  });

  it("Potent Cantrip: a missed Fire Bolt still deals half damage", () => {
    let s = game([setup("ezra", "wizard", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 6, y: 0 })], (d) => {
      d.units[0]!.stats.features.push("potent-cantrip");
    });
    s = run(s, { type: "action", unitId: "ezra", actionId: actionId(s, "ezra", "Fire Bolt"), targetId: "gob" }, dice([2, 20], [9, 10])).state;
    expect(unitOf(s, "gob").hp).toBe(10 - 4);
  });

  it("Shield turns a hit into a miss when +5 AC is enough", () => {
    let s = game([setup("gob", "goblin-warrior", { x: 1, y: 0 }), setup("ezra", "wizard", { x: 0, y: 0 })]);
    // 8 + 4 = 12 hits AC 11, but not 16.
    const { state, events } = run(s, { type: "action", unitId: "gob", actionId: actionId(s, "gob", "Scimitar"), targetId: "ezra" }, dice([8, 20]));
    expect(ofType(events, "attack")[0]!.hit).toBe(false);
    expect(unitOf(state, "ezra")).toMatchObject({ reaction: false, hp: 8 });
    expect(unitOf(state, "ezra").resources.slot1).toBe(1);
    s = state;
    // A roll that beats 16 anyway doesn't waste the slot.
    const fresh = game([setup("gob", "goblin-warrior", { x: 1, y: 0 }), setup("ezra", "wizard", { x: 0, y: 0 })]);
    const big = run(fresh, { type: "action", unitId: "gob", actionId: actionId(fresh, "gob", "Scimitar"), targetId: "ezra" }, dice([15, 20], [1, 6])).state;
    expect(unitOf(big, "ezra").resources.slot1).toBe(2);
  });
});

// --- areas ---------------------------------------------------------------------------

describe("area spells", () => {
  it("a 15-ft cone spreads from the caster", () => {
    const s = game([setup("ezra", "wizard", { x: 0, y: 3 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })]);
    const action = unitOf(s, "ezra").stats.actions.find((a) => a.name === "Burning Hands")!;
    const cells = areaCells(s, "ezra", action, { x: 3, y: 3 }).map((c) => `${c.x},${c.y}`);
    expect(cells).toEqual(expect.arrayContaining(["1,3", "2,3", "3,3", "3,4", "3,2"]));
    expect(cells).not.toContain("1,2"); // 45° off the axis
    expect(cells).not.toContain("4,3"); // beyond 15 ft
    expect(checkArea(s, "ezra", action.id, { x: 0, y: 3 }).ok).toBe(false);
  });

  it("Burning Hands hits every creature in the cone, friend or foe, with one damage roll", () => {
    let s = game([setup("ezra", "wizard", { x: 0, y: 3 }), setup("g1", "goblin-warrior", { x: 1, y: 3 }), setup("g2", "goblin-warrior", { x: 2, y: 4 }), setup("brann", "fighter", { x: 3, y: 3 }), setup("g3", "goblin-warrior", { x: 0, y: 0 })]);
    const { state, events } = run(s, { type: "action", unitId: "ezra", actionId: actionId(s, "ezra", "Burning Hands"), point: { x: 3, y: 3 } });
    const saved = ofType(events, "save").map((e) => e.targetId);
    expect(saved.sort()).toEqual(["brann", "g1", "g2"]);
    expect(unitOf(state, "g3").hp).toBe(10);
    expect(unitOf(state, "ezra").resources.slot1).toBe(1);
    s = state;
  });

  it("a sphere needs range and line of sight", () => {
    const s = game([setup("ezra", "wizard", { x: 0, y: 0 }), setup("gob", "goblin-warrior", { x: 9, y: 6 })], (d) => {
      d.units[0]!.stats.actions.push({ id: "shatter", kind: "save", name: "Shatter", save: "con", dc: 13, range: 30, area: { shape: "sphere", size: 10 }, slot: 2, damage: [{ dice: "3d8", type: "thunder" }], onSuccess: "half", notes: "" });
      d.units[0]!.stats.spellSlots = [4, 2];
      d.units[0]!.resources.slot2 = 2;
    });
    expect(checkArea(s, "ezra", "shatter", { x: 9, y: 6 }).reason).toMatch(/range/);
    expect(checkArea(s, "ezra", "shatter", { x: 5, y: 3 }).ok).toBe(true);
    const shatter = unitOf(s, "ezra").stats.actions.find((a) => a.id === "shatter")!;
    expect(areaCells(s, "ezra", shatter, { x: 5, y: 3 })).toHaveLength(25);
  });
});

// --- progression ---------------------------------------------------------------------

describe("spellcasters level up", () => {
  it("gain slots and spells at levels 2 and 3", () => {
    const { party } = gainXp(createParty(), 900);
    const maren = party.heroes.find((h) => h.key === "cleric")!;
    const ezra = party.heroes.find((h) => h.key === "wizard")!;
    expect(maren.stats.spellSlots).toEqual([4, 2]);
    expect(maren.resources).toMatchObject({ slot1: 4, slot2: 2 });
    expect(maren.stats.actions.map((a) => a.name)).toContain("Aid");
    expect(maren.stats.features).toContain("disciple-of-life");
    expect(ezra.stats.actions.map((a) => a.name)).toContain("Shatter");
    expect(ezra.stats.features).toContain("potent-cantrip");
  });

  it("Arcane Recovery returns slots on a short rest, once", () => {
    let { party } = gainXp(createParty(), 900);
    party = { ...party, heroes: party.heroes.map((h) => (h.key === "wizard" ? { ...h, resources: { ...h.resources, slot1: 0, slot2: 0 } } : h)) };
    party = shortRest(party, {}).party;
    // Level 3 → 2 slot levels: one 2nd-level slot.
    expect(party.heroes.find((h) => h.key === "wizard")!.resources).toMatchObject({ slot1: 0, slot2: 1, "arcane-recovery": 0 });
    party = shortRest(party, {}).party;
    expect(party.heroes.find((h) => h.key === "wizard")!.resources.slot2).toBe(1);
  });

  it("Aid's extra hit points end with the fight", () => {
    const { party } = gainXp(createParty(), 900);
    const maren = party.heroes.find((h) => h.key === "cleric")!;
    let s = game([{ ...setup("hero:cleric", "cleric", { x: 0, y: 0 }), stats: maren.stats, hp: maren.hpMax, hpMax: maren.hpMax, resources: maren.resources }, setup("gob", "goblin-warrior", { x: 9, y: 6 })]);
    s = run(s, { type: "action", unitId: "hero:cleric", actionId: actionId(s, "hero:cleric", "Aid"), targetIds: ["hero:cleric"] }).state;
    expect(unitOf(s, "hero:cleric")).toMatchObject({ hp: maren.hpMax + 5, hpMax: maren.hpMax + 5 });
    expect(unitOf(s, "hero:cleric").resources.slot2).toBe(1);
    const after = applyFight(party, s).party.heroes.find((h) => h.key === "cleric")!;
    expect(after.hp).toBe(maren.hpMax);
    expect(after.resources.slot2).toBe(1);
  });
});
