import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { PARTY, SRD_MONSTERS } from "../content/srd";
import type { Rng } from "../domain/dice";
import { apply, boardFromAscii, createGame, type UnitSetup } from "./engine";
import { createParty, gainXp, withProgress } from "./party";
import type { GameState } from "./state";

const entry = (key: string) => [...PARTY, ...SRD_MONSTERS].find((e) => e.key === key)!;
const at = (key: string, level: number) => createParty([withProgress(entry(key), { level })]).heroes[0]!;
const action = (stats: { actions: { name: string }[] }, name: string) => stats.actions.find((a) => a.name.startsWith(name)) as never as Record<string, unknown>;

function unitFrom(id: string, key: string, level: number, x: number, side?: "party" | "enemy"): UnitSetup {
  const c = withProgress(entry(key), { level }).build();
  return { id, name: id, side: side ?? (c.isMonster ? "enemy" : "party"), stats: c.stats!, ac: c.ac, hp: c.hpMax, speed: c.speed, pos: { x, y: 0 } };
}
function game(units: UnitSetup[]): GameState {
  const { state } = createGame(boardFromAscii(["........"]), units, 1);
  return produce(state, (d) => {
    d.units.sort((a, b) => units.findIndex((u) => u.id === a.id) - units.findIndex((u) => u.id === b.id));
    d.turnIndex = 0;
  });
}
const dice = (...faces: [number, number][]): Rng => {
  let i = 0;
  return () => {
    const f = faces[i++];
    if (!f) throw new Error(`Unscripted roll #${i}`);
    return (f[0] - 1) / f[1] + 1e-9;
  };
};

describe("levels 4 and 5", () => {
  it("the XP table goes to level 5", () => {
    const { party } = gainXp(createParty(), 6500);
    expect(party.heroes.map((h) => h.level)).toEqual([5, 5, 5, 5]);
  });

  it("level 4: +2 to the main ability, carried into attacks, DCs and skills", () => {
    const b3 = at("fighter", 3);
    const b4 = at("fighter", 4);
    expect(b4.stats.abilities.str).toBe(b3.stats.abilities.str + 2);
    expect(action(b4.stats, "Greatsword")).toMatchObject({ toHit: 6, damage: [{ dice: "2d6+3+1" }] });
    // The javelin is thrown with Strength too.
    expect(action(b4.stats, "Javelin")).toMatchObject({ toHit: 6 });
    expect(b4.stats.skills.Athletics).toBe(b3.stats.skills.Athletics! + 1);
    const ezra4 = at("wizard", 4);
    expect(action(ezra4.stats, "Burning Hands")).toMatchObject({ dc: 14 });
    expect(action(ezra4.stats, "Fire Bolt")).toMatchObject({ toHit: 6 });
    expect(action(ezra4.stats, "Dagger")).toMatchObject({ toHit: 3 });
  });

  it("level 5: proficiency +3 and each class's new feature", () => {
    const brann = at("fighter", 5);
    expect(brann.stats.proficiency).toBe(3);
    expect(brann.stats.attacksPerAction).toBe(2);
    expect(action(brann.stats, "Greatsword")).toMatchObject({ toHit: 7 });
    expect(at("rogue", 5).stats.features).toContain("uncanny-dodge");
    const maren = at("cleric", 5);
    expect(maren.stats.spellSlots).toEqual([4, 3, 2]);
    expect(maren.resources).toMatchObject({ slot1: 4, slot2: 3, slot3: 2 });
    expect(action(maren.stats, "Mass Healing Word")).toMatchObject({ targets: 6, slot: 3, bonusAction: true });
    const ezra = at("wizard", 5);
    expect(action(ezra.stats, "Fireball")).toMatchObject({ dc: 15, area: { shape: "sphere", size: 20 }, damage: [{ dice: "8d6" }] });
    expect(ezra.hpMax).toBe(8 + 4 * (3 + 1 + 2));
  });

  it("Extra Attack: two weapon attacks for one action", () => {
    let s = game([unitFrom("brann", "fighter", 5, 0), unitFrom("gob", "goblin-warrior", 1, 1)]);
    s = produce(s, (d) => void (d.units[1]!.hp = d.units[1]!.hpMax = 100));
    const gs = s.units[0]!.stats.actions.find((a) => a.name === "Greatsword")!.id;
    s = apply(s, { type: "action", unitId: "brann", actionId: gs, targetId: "gob" }, { rng: dice([2, 20]) }).state;
    expect(s.units[0]!.turn).toMatchObject({ action: true, attacksLeft: 1 });
    s = apply(s, { type: "action", unitId: "brann", actionId: gs, targetId: "gob" }, { rng: dice([2, 20]) }).state;
    expect(s.units[0]!.turn.action).toBe(false);
    expect(() => apply(s, { type: "action", unitId: "brann", actionId: gs, targetId: "gob" })).toThrow(/already used/);
  });

  it("Uncanny Dodge halves a hit, once a round", () => {
    let s = game([unitFrom("gob", "goblin-warrior", 1, 1), unitFrom("pip", "rogue", 5, 0)]);
    const scim = s.units[0]!.stats.actions[0]!.id;
    const { state, events } = apply(s, { type: "action", unitId: "gob", actionId: scim, targetId: "pip" }, { rng: dice([18, 20], [6, 6]) });
    expect(events.some((e) => e.type === "feature" && e.name === "Uncanny Dodge")).toBe(true);
    // 6 + 2 = 8, halved to 4.
    expect(state.units[1]!.hp).toBe(state.units[1]!.hpMax - 4);
    expect(state.units[1]!.reaction).toBe(false);
    s = state;
  });

  it("Mass Healing Word heals several allies with one bonus action", () => {
    let s = game([unitFrom("maren", "cleric", 5, 0), unitFrom("brann", "fighter", 1, 3), unitFrom("pip", "rogue", 1, 5), unitFrom("gob", "goblin-warrior", 1, 7)]);
    s = produce(s, (d) => {
      d.units[1]!.hp = 1;
      d.units[2]!.hp = 1;
    });
    const mhw = s.units[0]!.stats.actions.find((a) => a.name === "Mass Healing Word")!.id;
    s = apply(s, { type: "action", unitId: "maren", actionId: mhw, targetIds: ["brann", "pip"] }, { rng: dice([1, 4], [1, 4], [1, 4], [1, 4]) }).state;
    // 1 HP + (1 + 1 + Wis 4) + Disciple of Life (2 + slot level 3) each.
    expect(s.units[1]!.hp).toBe(12);
    expect(s.units[2]!.hp).toBe(10); // capped at her maximum
    expect(s.units[0]!.turn).toMatchObject({ action: true, bonusAction: false });
    expect(s.units[0]!.resources.slot3).toBe(1);
  });

  it("a hero's progress shows on their sheet", () => {
    const e = withProgress(entry("cleric"), { level: 3 });
    expect(e.subtitle).toMatch(/^Level 3 Cleric/);
    expect(e.build().stats!.actions.map((a) => a.name)).toContain("Aid");
    expect(withProgress(entry("cleric"), undefined)).toBe(entry("cleric"));
  });
});
