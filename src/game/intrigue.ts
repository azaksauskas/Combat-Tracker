import type { Mission, MissionKind, PlayerDoc } from "../domain/players";
import { MAX_TOWN_LOG, type Town } from "../domain/town";
import { mulberry32 } from "./rng";
import { built, output } from "./town";
import { num } from "./tuning";

/**
 * Spies between players' towns. Every player writes only their own save, so
 * the sender's game decides what a spy did when it arrives (from what it can
 * see of the target), and the target's game applies it to its own town once.
 */

export const MISSIONS: Record<MissionKind, { name: string; icon: string; text: string }> = {
  scout: { name: "Scout", icon: "🔍", text: "Learn their stores, defences and guilds." },
  sabotage: { name: "Sabotage", icon: "🔥", text: "Burn some of their food and materials." },
  unrest: { name: "Stir unrest", icon: "📢", text: "Sour the townsfolk on their heroes; helps your guild there." },
};

export const missionCost = (kind: MissionKind) => num(`spy.${kind}Gold`);
/** Real time a spy needs to get there and do the job. */
export const missionMs = () => num("spy.minutes") * 60_000;
export const MAX_MISSIONS = 20;

/** How likely the target's watch catches a spy. */
export function catchChance(target: Town): number {
  return Math.min(num("spy.catchMax"), num("spy.catchBase") + num("spy.catchPerTower") * output(target, "watchtower"));
}

export function newMission(kind: MissionKind, target: string, now: number, seed: number): Mission {
  return { id: `m${now.toString(36)}${seed.toString(36)}`, kind, target, sentAt: now, arriveAt: now + missionMs(), seed };
}

/** What a spy did, decided from the target town as it is now. */
export function resolveMission(m: Mission, target: Town | null, now: number): NonNullable<Mission["result"]> {
  if (!target) return { at: now, caught: false, report: { note: "The town was empty: its owner has moved away" } };
  const rng = mulberry32(m.seed).rng;
  const caught = rng() < catchChance(target);
  if (caught) return { at: now, caught: true };
  if (m.kind === "scout") {
    return {
      at: now,
      caught: false,
      report: {
        town: target.name,
        gold: target.gold,
        food: target.food,
        materials: target.materials,
        settlers: target.settlers.length,
        buildings: built(target).length,
        watchtowers: Math.round(output(target, "watchtower") * 10) / 10,
        spirit: target.spirit,
      },
    };
  }
  if (m.kind === "sabotage") {
    const share = num("spy.sabotageShare");
    return { at: now, caught: false, damage: { food: Math.round(target.food * share), materials: Math.round(target.materials * share) } };
  }
  return { at: now, caught: false };
}

/** Missions the sender's game should settle now. */
export const due = (missions: Mission[], now: number) => missions.filter((m) => !m.result && m.arriveAt <= now);

export interface Incoming {
  mission: Mission;
  from: string;
}

/** Settled missions against this player's town not applied yet. */
export function incoming(myId: string, me: PlayerDoc, docs: Record<string, PlayerDoc>): Incoming[] {
  const out: Incoming[] = [];
  for (const [from, d] of Object.entries(docs)) {
    if (from === myId) continue;
    for (const m of d.missions) if (m.target === myId && m.result && !me.seenMissions.includes(m.id)) out.push({ mission: m, from });
  }
  return out;
}

/** What spies did to this town: losses, spirit, and what the watch saw. */
export function applyIncoming(t: Town, list: Incoming[], nameOf: (id: string) => string): { town: Town; news: { text: string; tone: "good" | "bad" }[] } {
  const news: { text: string; tone: "good" | "bad" }[] = [];
  for (const { mission: m, from } of list) {
    const r = m.result!;
    if (r.caught) {
      news.push({ text: `The watch caught a spy sent by ${nameOf(from)} (${MISSIONS[m.kind].name.toLowerCase()}).`, tone: "good" });
      continue;
    }
    if (m.kind === "sabotage" && r.damage) {
      const food = Math.min(t.food, r.damage.food);
      const materials = Math.min(t.materials, r.damage.materials);
      t = { ...t, food: t.food - food, materials: t.materials - materials };
      news.push({ text: `Saboteurs set fire to the stores: ${food} food and ${materials} materials lost. Nobody saw who.`, tone: "bad" });
    } else if (m.kind === "unrest") {
      t = { ...t, spirit: Math.max(-20, t.spirit - num("spy.unrestSpirit")) };
      news.push({ text: "Whispers in the tavern: people say the heroes have forgotten them.", tone: "bad" });
    }
    // A scout that wasn't caught leaves no trace.
  }
  if (!news.length) return { town: t, news };
  return { town: { ...t, log: [...t.log, ...news.map((n) => ({ at: t.hours, text: `🕵 ${n.text}`, tone: n.tone }))].slice(-MAX_TOWN_LOG) }, news };
}
