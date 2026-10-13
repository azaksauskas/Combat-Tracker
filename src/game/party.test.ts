import { describe, expect, it } from "vitest";
import { type Party, applyFight, createParty, equip, gainXp, heroSetups, heroStats, levelForXp, longRest, shortRest, unequip } from "./party";
import { boardFromAscii, createGame } from "./engine";
import { produce } from "immer";

const fixed = (...faces: number[]) => {
  let i = 0;
  return () => (faces[i++]! - 1) / 10 + 1e-9; // d10-ish helper: face on a d10
};

describe("party progression", () => {
  it("uses the 2024 XP table", () => {
    expect([0, 299, 300, 899, 900, 2700, 5000, 6500, 99999].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 4, 4, 5, 5]);
  });

  it("levels up with fixed HP, hit dice and class features", () => {
    const { party, reports } = gainXp(createParty(), 900);
    const brann = party.heroes.find((h) => h.key === "fighter")!;
    expect(brann.level).toBe(3);
    expect(brann.hpMax).toBe(12 + 2 * (6 + 2)); // d10 average 6 + Con 2, twice
    expect(brann.hitDice).toBe(3);
    expect(brann.stats.features).toEqual(expect.arrayContaining(["second-wind", "action-surge", "improved-critical"]));
    expect(brann.resources["action-surge"]).toBe(1);
    const maren = party.heroes.find((h) => h.key === "cleric")!;
    expect(maren.resources["channel-divinity"]).toBe(2);
    expect(reports).toHaveLength(8);
    expect(reports[0]!.gains[0]).toMatch(/max HP/);
  });

  it("fallen heroes don't level up", () => {
    const p = createParty();
    const party = { ...p, heroes: p.heroes.map((h) => (h.key === "rogue" ? { ...h, dead: true } : h)) };
    const { party: next, reports } = gainXp(party, 300);
    expect(next.heroes.find((h) => h.key === "rogue")!.level).toBe(1);
    expect(reports.map((r) => r.hero.key)).not.toContain("rogue");
  });

  it("short rests spend hit dice and refresh some features; long rests restore everything", () => {
    let party = gainXp(createParty(), 300).party;
    party = { ...party, heroes: party.heroes.map((h) => ({ ...h, hp: 1, resources: { ...h.resources, "second-wind": 0, "action-surge": 0 } })) };
    const s = shortRest(party, { fighter: 1 }, fixed(5));
    const brann = s.party.heroes.find((h) => h.key === "fighter")!;
    expect(brann.hp).toBe(1 + 5 + 2);
    expect(brann.hitDice).toBe(1);
    expect(brann.resources).toMatchObject({ "second-wind": 1, "action-surge": 1 });
    const l = longRest(s.party);
    expect(l.party.heroes.every((h) => h.hp === h.hpMax && h.hitDice === h.level)).toBe(true);
  });

  it("equips a +1 weapon onto weapon attacks only", () => {
    let party: Party = { ...createParty(), items: { "weapon-plus-1": 1 } };
    party = equip(party, "wizard", "weapon-plus-1");
    const ezra = party.heroes.find((h) => h.key === "wizard")!;
    const actions = heroStats(ezra).actions;
    expect(actions.find((a) => a.name.startsWith("Dagger"))).toMatchObject({ name: "Dagger +1", toHit: 4 });
    expect(actions.find((a) => a.name.startsWith("Fire Bolt"))!.name).toBe("Fire Bolt");
    expect(party.items["weapon-plus-1"]).toBe(0);
    expect(unequip(party, "wizard", "weapon-plus-1").items["weapon-plus-1"]).toBe(1);
  });

  it("carries fight results back: HP, potions, the fallen, and XP per hero", () => {
    const party = { ...createParty(), items: { "potion-healing": 2 } };
    const setups = heroSetups(party, [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }]);
    const { state } = createGame(boardFromAscii(["......", "......", "......", "......"]), [
      ...setups,
      { id: "m1", name: "Goblin", side: "enemy", stats: { ...setups[0]!.stats, cr: "1/4" }, ac: 10, hp: 5, speed: 30, pos: { x: 5, y: 0 } },
    ], 1, { stash: { "potion-healing": 2 } });
    const done = produce(state, (d) => {
      d.units.find((u) => u.id === "m1")!.dead = true;
      d.units.find((u) => u.id === "hero:wizard")!.hp = 0;
      d.units.find((u) => u.id === "hero:rogue")!.dead = true;
      d.stash!["potion-healing"] = 1;
      d.outcome = "victory";
    });
    const r = applyFight(party, done);
    expect(r.xpEach).toBe(12); // 50 XP / 4 heroes
    expect(r.fallen).toEqual(["Pip Thistlefoot"]);
    expect(r.party.heroes.find((h) => h.key === "wizard")!.hp).toBe(1);
    expect(r.party.items["potion-healing"]).toBe(1);
  });
});
