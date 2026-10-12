import { describe, expect, it } from "vitest";
import {
  findFreeSpot,
  applyDamage,
  applyHealing,
  grantTempHp,
  insertByInitiative,
  loadEncounter,
  nextTurn,
  previousTurn,
  removeCombatant,
  saveEncounter,
  spawnCombatant,
  uniqueName,
} from "./combat";
import { hitsPolyline, snapToGrid } from "./grid";
import { migrateLegacyState } from "./legacy";
import { parseDoc, type Combatant, type CombatDoc } from "./types";

const make = (over: Partial<Combatant> = {}): Combatant =>
  parseDoc("combat", { combatants: [{ id: "x", name: "X", hpMax: 10, hpCurrent: 10, ...over }] })
    .combatants[0]!;

const combat = (...cs: Partial<Combatant>[]): CombatDoc =>
  parseDoc("combat", { combatants: cs.map((c, i) => ({ id: `c${i}`, name: `C${i}`, ...c })) });

describe("uniqueName", () => {
  it("numbers duplicates", () => {
    expect(uniqueName("Goblin", [])).toBe("Goblin");
    expect(uniqueName("Goblin", ["Goblin"])).toBe("Goblin 2");
    expect(uniqueName("Goblin 2", ["Goblin", "Goblin 2"])).toBe("Goblin 3");
    expect(uniqueName("Goblin", ["Goblin King"])).toBe("Goblin");
  });
  it("is safe with regex characters in names", () => {
    expect(uniqueName("Orc (Boss)", ["Orc (Boss)"])).toBe("Orc (Boss) 2");
  });
});

describe("initiative order", () => {
  it("inserts after ties", () => {
    const list = [make({ id: "a", initiative: 15 }), make({ id: "b", initiative: 10 })];
    insertByInitiative(list, make({ id: "c", initiative: 15 }));
    expect(list.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("spawns with unique names and rolled initiative", () => {
    const doc = combat({ name: "Goblin", initiative: 30 });
    const c = spawnCombatant(doc, make({ name: "Goblin" }), { rollInitiative: true, rng: () => 0.5 });
    expect(c.name).toBe("Goblin 2");
    expect(c.initiative).toBe(11);
    expect(doc.combatants.at(-1)!.id).toBe(c.id);
  });

  it("does not stack new tokens on top of existing ones", () => {
    expect(findFreeSpot([], { x: 500, y: 500 })).toEqual({ x: 500, y: 500 });
    const spot = findFreeSpot([{ x: 500, y: 500 }], { x: 500, y: 500 });
    expect(Math.max(Math.abs(spot.x - 500), Math.abs(spot.y - 500))).toBe(50);
  });
});

describe("hit points", () => {
  it("burns temp HP first and never goes below zero", () => {
    const doc = combat({ hpMax: 20, hpCurrent: 20, hpTemp: 5 });
    applyDamage(doc, "c0", 8);
    expect(doc.combatants[0]).toMatchObject({ hpTemp: 0, hpCurrent: 17 });
    applyDamage(doc, "c0", 100);
    expect(doc.combatants[0]!.hpCurrent).toBe(0);
  });

  it("caps healing at max and keeps the higher temp HP", () => {
    const doc = combat({ hpMax: 20, hpCurrent: 5 });
    applyHealing(doc, "c0", 50);
    expect(doc.combatants[0]!.hpCurrent).toBe(20);
    grantTempHp(doc, "c0", 6);
    grantTempHp(doc, "c0", 3);
    expect(doc.combatants[0]!.hpTemp).toBe(6);
  });
});

describe("turns", () => {
  it("cycles through combatants and counts rounds", () => {
    const doc = combat({}, {}, {});
    nextTurn(doc);
    expect([doc.activeId, doc.round]).toEqual(["c0", 1]);
    nextTurn(doc);
    nextTurn(doc);
    nextTurn(doc);
    expect([doc.activeId, doc.round]).toEqual(["c0", 2]);
    previousTurn(doc);
    expect([doc.activeId, doc.round]).toEqual(["c2", 1]);
  });

  it("hands the turn on when the active combatant is removed", () => {
    const doc = combat({}, {});
    doc.activeId = "c0";
    removeCombatant(doc, "c0");
    expect(doc.activeId).toBe("c1");
    removeCombatant(doc, "c1");
    expect(doc.activeId).toBeNull();
  });
});

describe("encounters", () => {
  it("saves a snapshot, adds new stat blocks to the roster and reloads with fresh ids", () => {
    const doc = combat({ name: "Goblin 2" }, { name: "Hero" });
    const library = parseDoc("library", { roster: [{ id: "r", name: "Hero" }] });
    const enc = saveEncounter(library, doc, "Ambush");
    expect(library.roster.map((r) => r.name)).toEqual(["Hero", "Goblin"]);
    loadEncounter(doc, enc);
    expect(doc.combatants.map((c) => c.name)).toEqual(["Goblin 2", "Hero"]);
    expect(doc.combatants[0]!.id).not.toBe("c0");
  });
});

describe("grid", () => {
  it("snaps odd tokens to cell centres and even tokens to corners", () => {
    expect(snapToGrid({ x: 60, y: 90 }, "square", 1)).toEqual({ x: 75, y: 75 });
    expect(snapToGrid({ x: 60, y: 90 }, "square", 2)).toEqual({ x: 50, y: 100 });
  });

  it("detects strokes near a polyline", () => {
    expect(hitsPolyline({ x: 50, y: 5 }, [0, 0, 100, 0], 10)).toBe(true);
    expect(hitsPolyline({ x: 50, y: 30 }, [0, 0, 100, 0], 10)).toBe(false);
  });
});

describe("legacy migration", () => {
  it("maps the old single-document format", () => {
    const docs = migrateLegacyState({
      combatants: [{ id: 1712, name: "Orc", resistances: "<b>fire</b>", hpMax: 15, hpCurrent: 7, ac: 13 }],
      sharedCombatants: [{ id: 5, name: "Orc" }],
      activeId: 1712,
      dmNotes: "hello",
      ui: { mapGrid: "hex" },
      mapState: { lines: [{ color: "#fff", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }], shapes: [] },
    });
    expect(docs.combat.combatants[0]).toMatchObject({ id: "1712", notes: "<b>fire</b>", hpCurrent: 7 });
    expect(docs.combat.activeId).toBe("1712");
    expect(docs.combat.map.grid).toBe("hex");
    expect(docs.combat.map.lines[0]!.points).toEqual([1, 2, 3, 4]);
    expect(docs.library.roster).toHaveLength(1);
    expect(docs.notes.campaign).toBe("hello");
  });
});
