import { describe, expect, it } from "vitest";
import { ADVENTURES, GOBLIN_TRAIL } from "../content/adventures";
import { nextAiCommand } from "./ai";
import { acknowledge, checkChance, choose, finishFight, finishShortRest, skillBonus, startAdventure, validateAdventure, visibleChoices, StoryError, type CampaignState } from "./adventure";
import { apply, createGame } from "./engine";
import { heroSetups, potionStash } from "./party";
import { SCENARIOS, scenarioSetup } from "./scenarios";

const ids = SCENARIOS.map((s) => s.id);

/** Plays a pending fight with the AI on both sides. */
function fight(state: CampaignState, seed: number): CampaignState {
  const f = state.pending[0];
  if (f?.kind !== "fight") throw new Error("no fight pending");
  const sc = SCENARIOS.find((x) => x.id === f.scenarioId)!;
  const base = scenarioSetup(sc);
  const starts = base.units.filter((u) => u.side === "party").map((u) => u.pos);
  const units = [...heroSetups(state.party, starts), ...base.units.filter((u) => u.side === "enemy")];
  let g = createGame(base.board, units, seed, { surprised: f.surprised, stash: potionStash(state.party) }).state;
  for (let i = 0; i < 5000 && !g.outcome; i++) g = apply(g, nextAiCommand(g)).state;
  return finishFight(state, GOBLIN_TRAIL, g);
}

/** Clears level-ups and rests (spending every hit die) so a choice can be made. */
function settle(s: CampaignState, seed: number): CampaignState {
  for (let i = 0; i < 20 && s.pending.length; i++) {
    const p = s.pending[0]!;
    if (p.kind === "levelup") s = acknowledge(s);
    else if (p.kind === "short-rest") s = finishShortRest(s, Object.fromEntries(s.party.heroes.map((h) => [h.key, h.hitDice])));
    else s = fight(s, seed + i);
  }
  return s;
}

describe("adventures", () => {
  it("built-in adventures reference only real scenes, fights and items", () => {
    for (const adv of ADVENTURES) expect(validateAdventure(adv, ids)).toEqual([]);
  });

  it("starts in Millbrook with starting gold", () => {
    const s = startAdventure(GOBLIN_TRAIL, 1);
    expect(s.sceneId).toBe("millbrook");
    expect(s.party.gold).toBe(25);
    expect(visibleChoices(s, GOBLIN_TRAIL).map((c) => c.id)).toEqual(["hunters", "shrine", "set-out"]);
  });

  it("'choose' checks need a hero and use their skill; once-only choices disappear", () => {
    const s = startAdventure(GOBLIN_TRAIL, 1);
    expect(() => choose(s, GOBLIN_TRAIL, "hunters")).toThrow(StoryError);
    const s2 = choose(s, GOBLIN_TRAIL, "hunters", "cleric");
    expect(s2.story.some((e) => e.kind === "check" && e.text.startsWith("Sister Maren: Persuasion"))).toBe(true);
    expect(visibleChoices(s2, GOBLIN_TRAIL).map((c) => c.id)).not.toContain("hunters");
  });

  it("skill bonuses and odds", () => {
    const pip = startAdventure(GOBLIN_TRAIL, 1).party.heroes.find((h) => h.key === "rogue")!;
    expect(skillBonus(pip, "Stealth")).toBe(7);
    expect(skillBonus(pip, "Athletics")).toBe(-1);
    expect(checkChance(7, 12)).toBeCloseTo(0.8);
    expect(checkChance(0, 25)).toBe(0);
  });

  it("ends the adventure if the whole party falls, even with a defeat scene", () => {
    let s = startAdventure(GOBLIN_TRAIL, 1);
    s = choose(s, GOBLIN_TRAIL, "set-out");
    s = choose(s, GOBLIN_TRAIL, "briars-sneak");
    const game = { units: s.party.heroes.map((h) => ({ id: `hero:${h.key}`, side: "party", dead: true, hp: 0, resources: {}, stats: h.stats })), outcome: "defeat", stash: {} };
    const end = finishFight(s, GOBLIN_TRAIL, game as never);
    expect(end.ended).toBe("defeat");
  });

  it("gold costs are enforced", () => {
    let s = startAdventure(GOBLIN_TRAIL, 1);
    s = { ...s, party: { ...s.party, gold: 5 } };
    s = choose(s, GOBLIN_TRAIL, "set-out");
    s = choose(s, GOBLIN_TRAIL, "river");
    expect(() => choose(s, GOBLIN_TRAIL, "pay")).toThrow(/20 gp/);
  });

  it("can be played start to finish on either route with the AI fighting", () => {
    let finished = 0;
    for (const route of ["briars-sneak", "river"] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        let s = startAdventure(GOBLIN_TRAIL, seed);
        s = choose(s, GOBLIN_TRAIL, "set-out");
        s = choose(s, GOBLIN_TRAIL, route);
        let defeats = 0;
        for (let step = 0; step < 60 && !s.ended; step++) {
          s = settle(s, seed * 100 + step);
          if (s.ended) break;
          if (s.sceneId === "captured") defeats++;
          // Take the first repeatable "move on" option; give up after a second defeat.
          const choices = visibleChoices(s, GOBLIN_TRAIL);
          const pick =
            s.sceneId === "captured" && defeats > 1
              ? choices.find((c) => c.id === "give-up")!
              : (choices.find((c) => !c.once && c.id !== "give-up" && !c.costGold) ?? choices.at(-1)!);
          s = choose(s, GOBLIN_TRAIL, pick.id, s.party.heroes.find((h) => !h.dead)!.key);
        }
        expect(s.ended, `${route} seed ${seed}`).not.toBeNull();
        if (s.ended === "victory") {
          finished++;
          expect(s.party.heroes.find((h) => !h.dead)!.level).toBe(3);
        }
      }
    }
    expect(finished).toBeGreaterThan(0);
  });
});
