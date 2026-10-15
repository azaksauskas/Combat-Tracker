import { describe, expect, it } from "vitest";
import { emptyPlayerDoc, type PlayerDoc } from "../domain/players";
import type { Town } from "../domain/town";
import { applyIncoming, catchChance, due, incoming, newMission, resolveMission } from "./intrigue";
import { authority, blockedBy, crackdown, guildsIn, holds, influence, reclaim, stageOf, titheShare, townStage } from "./guilds";
import { setTuning } from "./tuning";
import { dailyChange, foundTown, produceHour } from "./town";

const DAY = 24 * 3_600_000;
const NOW = 1_000 * DAY;
const town = (over: Partial<Town> = {}): Town => ({ ...foundTown("Target", 0, 1, 100), food: 40, materials: 60, ...over });
const doc = (over: Partial<PlayerDoc> = {}): PlayerDoc => ({ ...emptyPlayerDoc(), ...over });

describe("spies", () => {
  it("watchtowers catch more spies", () => {
    const plain = town();
    const guarded = town({ buildings: [...plain.buildings, { id: "w", type: "watchtower" }], settlers: [{ id: "g", name: "G", trade: "guard", from: "", arrivedAt: 0, alignment: "Neutral", mood: 60, mind: "" }] });
    expect(catchChance(plain)).toBeCloseTo(0.15);
    expect(catchChance(guarded)).toBeCloseTo(0.35);
  });

  it("a mission settles when the spy arrives, the same way every time", () => {
    const m = newMission("sabotage", "victim", NOW, 12345);
    expect(due([m], NOW)).toEqual([]);
    expect(due([m], m.arriveAt)).toEqual([m]);
    const r = resolveMission(m, town(), m.arriveAt);
    expect(resolveMission(m, town(), m.arriveAt)).toEqual(r);
    if (!r.caught) expect(r.damage).toEqual({ food: 6, materials: 9 });
  });

  it("the target applies what spies did, once, and learns who sent the ones it caught", () => {
    const sab = { ...newMission("sabotage", "me", NOW, 1), result: { at: NOW, caught: false, damage: { food: 6, materials: 9 } } };
    const caught = { ...newMission("scout", "me", NOW, 2), id: "x2", result: { at: NOW, caught: true } };
    const docs = { me: doc({ town: town() }), them: doc({ missions: [sab, caught] }) };
    const list = incoming("me", docs.me, docs);
    expect(list).toHaveLength(2);
    const { town: after, news } = applyIncoming(docs.me.town!, list, () => "Mara");
    expect([after.food, after.materials]).toEqual([34, 51]);
    expect(news.map((n) => n.text).join(" ")).toMatch(/caught a spy sent by Mara/);
    // Once seen, never again.
    expect(incoming("me", { ...docs.me, seenMissions: [sab.id, "x2"] }, docs)).toEqual([]);
  });
});

describe("guilds and the takeover", () => {
  const member = (joinedDaysAgo: number, renown = 1, extra: Partial<PlayerDoc> = {}) =>
    doc({ residence: "owner", renown, guild: { id: "m1", name: "The Coin", town: "owner", joinedAt: NOW - joinedDaysAgo * DAY }, ...extra });

  it("members living in the town make up the guild; influence grows with time, fame and work", () => {
    const docs: Record<string, PlayerDoc> = { owner: doc({ town: town(), renown: 1 }), m1: member(5), m2: member(2, 3, { guildWork: { day: "", total: 2 } }), gone: { ...member(9), residence: null } };
    const [g] = guildsIn("owner", docs);
    expect(g!.members.sort()).toEqual(["m1", "m2"]);
    // m1: 5 days × 4 = 20; m2: 2 × 4 × 2 = 16, + 2 work × 3 = 6.
    expect(influence(g!, docs, NOW)).toBe(42);
  });

  it("influence against authority makes the stages; the owner can push back", () => {
    const owner = doc({ town: town(), renown: 1 });
    expect(authority(owner)).toBe(20 + 10 + 0 + 10); // base + renown + spirit + mood 50 × 0.2
    expect([stageOf(0.4), stageOf(0.5), stageOf(0.8), stageOf(1.2)]).toEqual([0, 1, 2, 3]);
    const docs: Record<string, PlayerDoc> = { owner, m1: member(12) };
    expect(holds("owner", docs, NOW)[0]).toMatchObject({ influence: 48, stage: 3 });
    // Hidden (the default), guilds don't touch the town at all.
    expect(townStage("owner", docs, NOW)).toBe(0);
    setTuning({ "features.intrigue": 1 });
    expect(townStage("owner", docs, NOW)).toBe(3);
    setTuning({});
    expect(blockedBy(3, "build")).toMatch(/runs the town/);
    expect(blockedBy(2, "build")).toBeNull();
    expect(blockedBy(2, "market")).toMatch(/says no/);
    const pushed = crackdown(owner.town!, "m1", 40, NOW);
    expect(pushed.gold).toBe(70);
    expect(() => crackdown(pushed, "m1", 40, NOW + 1000)).toThrow(/rest/);
    const after = { ...docs, owner: { ...owner, town: reclaim(pushed, "m1", 48) } };
    expect(holds("owner", after, NOW)[0]!.stage).toBeLessThan(3);
  });

  it("a tithe skims production", () => {
    let t = town({ buildings: [{ id: "hall", type: "hall" }, { id: "f", type: "farm" }], settlers: [{ id: "a", name: "A", trade: "farmer", from: "", arrivedAt: 0, alignment: "Neutral", mood: 60, mind: "" }] });
    expect(dailyChange(t, titheShare(1)).food).toBe(2.8); // 5 × 0.75 − 1, to one decimal
    const before = t.food;
    for (let i = 0; i < 24; i++) t = produceHour(t, titheShare(1));
    expect(t.food - before).toBe(2); // 3.75 made, 1 eaten
  });
});
