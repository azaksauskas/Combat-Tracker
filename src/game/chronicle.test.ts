import { describe, expect, it } from "vitest";
import { GOBLIN_TRAIL } from "../content/adventures";
import { PlayerDocSchema, emptyPlayerDoc } from "../domain/players";
import { readLegacySaves } from "../store/players";
import { choose, startAdventure, type CampaignState } from "./adventure";
import { chronicleFight, chronicleStep } from "./chronicle";

const T = "The Goblin Trail";

describe("chronicle", () => {
  it("records setting out, abandoning, and nothing for an idle step", () => {
    const s = startAdventure(GOBLIN_TRAIL, 1);
    expect(chronicleStep(null, s, T)).toEqual([{ kind: "adventure", adventure: T, text: `Set out on “${T}” with Brann Ironside, Pip Thistlefoot, Sister Maren, Ezra Vell.` }]);
    expect(chronicleStep(s, null, T)[0]!.text).toBe(`Abandoned “${T}”.`);
    expect(chronicleStep(s, s, T)).toEqual([]);
  });

  it("records loot, XP, level-ups, deaths, flags and the ending", () => {
    const before = startAdventure(GOBLIN_TRAIL, 1);
    const after: CampaignState = {
      ...before,
      flags: ["warned"],
      ended: "victory",
      party: {
        ...before.party,
        gold: before.party.gold + 30,
        xp: 300,
        items: { "potion-healing": 2 },
        heroes: before.party.heroes.map((h, i) => (i === 0 ? { ...h, level: 2, equipment: ["weapon-plus-1"] } : i === 3 ? { ...h, dead: true } : h)),
      },
    };
    const kinds = chronicleStep(before, after, T);
    expect(kinds.map((e) => e.kind)).toEqual(["loot", "level", "death", "story", "adventure"]);
    expect(kinds[0]).toMatchObject({ gold: 30, xp: 300, items: { "potion-healing": 2, "weapon-plus-1": 1 } });
    expect(kinds[0]!.text).toBe("Found 30 gp, 2 × Potion of Healing, +1 Weapon (+300 XP).");
    expect(kinds[1]!.text).toBe("Brann Ironside reached level 2.");
    expect(kinds[2]!.text).toBe("Ezra Vell died.");
    expect(kinds[4]!.text).toMatch(/^Completed “The Goblin Trail”\. Party: Brann Ironside \(level 2\)/);
  });

  it("equipping an item isn't loot", () => {
    const base = startAdventure(GOBLIN_TRAIL, 1);
    const before = { ...base, party: { ...base.party, items: { "weapon-plus-1": 1 } } };
    const after = { ...before, party: { ...before.party, items: { "weapon-plus-1": 0 }, heroes: before.party.heroes.map((h, i) => (i === 0 ? { ...h, equipment: ["weapon-plus-1"] } : h)) } };
    expect(chronicleStep(before, after, T)).toEqual([]);
  });

  it("a real choice that pays gold shows up", () => {
    let s = startAdventure(GOBLIN_TRAIL, 3);
    s = choose(s, GOBLIN_TRAIL, "set-out");
    const before = choose(s, GOBLIN_TRAIL, "river");
    const after = choose(before, GOBLIN_TRAIL, "pay");
    expect(chronicleStep(before, after, T)).toContainEqual({ kind: "story", adventure: T, text: "Spent 20 gp.", gold: -20 });
  });

  it("fights", () => {
    expect(chronicleFight(T, "Goblin Ambush", "victory", false, 4).text).toBe("Won Goblin Ambush in 4 rounds.");
    expect(chronicleFight(T, "Goblin Ambush", "defeat", true, 2).text).toBe("Retreated from Goblin Ambush.");
  });
});

describe("player documents", () => {
  it("fill in defaults and drop broken entries", () => {
    expect(PlayerDocSchema.parse({})).toEqual(emptyPlayerDoc());
    const doc = PlayerDocSchema.parse({ chronicle: [{ id: 1, text: "ok", at: 5 }, "junk"], characters: [{ id: "c", name: "Rin", className: "Rogue" }, 7], picks: "nope" });
    expect(doc.chronicle).toEqual([{ id: "1", text: "ok", at: 5, kind: "story", status: "new" }]);
    expect(doc.characters.map((c) => c.name)).toEqual(["Rin"]);
    expect(doc.picks).toEqual([]);
  });

  it("import what a browser saved before profiles existed", () => {
    const store: Record<string, string> = {
      "combat-tracker:campaign": JSON.stringify({ state: { state: { adventureId: "goblin-trail" } }, version: 0 }),
      "combat-tracker:game": JSON.stringify({ state: { game: { round: 2 }, scenario: { name: "X" }, mode: "campaign", log: [] }, version: 0 }),
      "combat-tracker:party": JSON.stringify({ state: { picks: ["fighter", 3, "custom-a"] }, version: 0 }),
    };
    const legacy = readLegacySaves({ getItem: (k) => store[k] ?? null });
    expect(legacy).toEqual({
      campaign: { adventureId: "goblin-trail" },
      battle: { game: { round: 2 }, scenario: { name: "X" }, mode: "campaign", log: [] },
      picks: ["fighter", "custom-a"],
    });
    expect(readLegacySaves({ getItem: () => "{broken" })).toEqual({});
  });
});
