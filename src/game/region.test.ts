import { describe, expect, it } from "vitest";
import type { Town } from "../domain/town";
import { BUILTIN_FACTIONS, canStrike, kinship, lairResult, payTribute, raidResult, refuseTribute, regionDay, threatOf } from "./region";
import { advance, foundTown } from "./town";

const goblins = BUILTIN_FACTIONS[0]!;
const dead = BUILTIN_FACTIONS[2]!;
const big = (): Town => ({ ...foundTown("A", 0, 7, 300, { law: 0, good: 4 }), food: 500 });
const run = (t: Town, days: number, renown = 1) => advance(t, days * 24, 0, { renown, residents: [], factions: [goblins] });

describe("factions and the town", () => {
  it("attention builds into scouts, then a demand with a deadline", () => {
    const { town, events } = run(big(), 30);
    const texts = events.map((e) => e.text);
    expect(texts.some((x) => /Scouts of The Red Fang/.test(x))).toBe(true);
    expect(texts.some((x) => /demand \d+ gold by Day/.test(x))).toBe(true);
    expect(["demanding", "raiding", "watching"]).toContain(threatOf(town, goblins.id).stage);
  });

  it("an unpaid demand becomes a raid, and an undefended raid costs dearly", () => {
    const t = { ...big(), threats: [{ faction: goblins.id, attention: 60, stage: "demanding" as const, demand: 20, dueAt: 30 }] };
    const say: string[] = [];
    const raiding = regionDay(t, 30, () => 0.5, [goblins], { power: 10, watch: false, renown: 1 }, (x) => say.push(x));
    expect(threatOf(raiding, goblins.id)).toMatchObject({ stage: "raiding", dueAt: 54 });
    const hit = regionDay(raiding, 54, () => 0.5, [goblins], { power: 10, watch: false, renown: 1 }, (x) => say.push(x));
    expect(hit.gold).toBeLessThan(raiding.gold);
    expect(hit.lastTheft).toBe(54);
    expect(say.at(-1)).toMatch(/raided the town and carried off/);
  });

  it("paying or refusing tribute", () => {
    const t = { ...big(), threats: [{ faction: goblins.id, attention: 60, stage: "demanding" as const, demand: 20, dueAt: 100 }] };
    const paid = payTribute(t, goblins);
    expect(paid.gold).toBe(280);
    expect(threatOf(paid, goblins.id)).toMatchObject({ stage: "watching", attention: 20 });
    expect(() => payTribute({ ...t, gold: 5 }, goblins)).toThrow(/20 gold/);
    expect(threatOf(refuseTribute(t, goblins), goblins.id).stage).toBe("raiding");
  });

  it("defending and striking back", () => {
    const t = { ...big(), threats: [{ faction: goblins.id, attention: 70, stage: "raiding" as const, dueAt: 50 }] };
    expect(canStrike(threatOf(t, goblins.id))).toBe(true);
    expect(threatOf(raidResult(t, goblins, true), goblins.id)).toMatchObject({ stage: "watching", attention: 15 });
    expect(raidResult(t, goblins, false).gold).toBeLessThan(t.gold);
    const won = lairResult(t, goblins, true);
    expect(threatOf(won, goblins.id).stage).toBe("defeated");
    expect(won.gold).toBe(t.gold + 20 + goblins.tribute);
    // A broken faction never comes back.
    expect(threatOf(run(won, 30).town, goblins.id).stage).toBe("defeated");
    expect(threatOf(lairResult(t, goblins, false), goblins.id).attention).toBe(90);
  });

  it("kindred factions turn friendly; renown decides who notices", () => {
    const cruel: Town = { ...big(), reputation: { law: -5, good: -8 } };
    expect(kinship(goblins, cruel)).toBeGreaterThan(0.6);
    const { town, events } = run(cruel, 3);
    expect(threatOf(town, goblins.id).stage).toBe("friendly");
    expect(events.some((e) => /sent an envoy/.test(e.text))).toBe(true);
    // The Restless Dead only notice heroes of renown 2.
    const quiet = advance(big(), 40 * 24, 0, { renown: 1, residents: [], factions: [dead] }).town;
    expect(threatOf(quiet, dead.id).stage).toBe("quiet");
    const noticed = advance(big(), 40 * 24, 0, { renown: 2, residents: [], factions: [dead] }).town;
    expect(threatOf(noticed, dead.id).stage).not.toBe("quiet");
  });

  it("a watchtower slows them down", () => {
    const plain = run(big(), 10).town;
    const guarded: Town = { ...big(), buildings: [...big().buildings, { id: "w", type: "watchtower" }], settlers: [{ id: "g", name: "G", trade: "guard", from: "x", arrivedAt: 0, alignment: "Lawful Good", mood: 80, mind: "" }] };
    expect(threatOf(run(guarded, 10).town, goblins.id).attention).toBeLessThan(threatOf(plain, goblins.id).attention);
  });
});
