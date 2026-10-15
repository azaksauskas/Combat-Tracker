import type { PlayerDoc } from "../domain/players";
import type { Town } from "../domain/town";
import { output } from "./town";
import { num } from "./tuning";

/**
 * Guilds: heroes living in someone else's town band together. Their
 * influence grows day by day; set against the owner's authority it brings a
 * slow takeover. Everything is worked out from what all players can see, so
 * every game agrees on it.
 */

const DAY = 24 * 3_600_000;

export interface Guild {
  id: string;
  name: string;
  /** The town's owner. */
  town: string;
  /** Members living in the town now. */
  members: string[];
}

/** Guilds active in a town: members must live there. */
export function guildsIn(ownerId: string, docs: Record<string, PlayerDoc>): Guild[] {
  const out = new Map<string, Guild>();
  for (const [id, d] of Object.entries(docs)) {
    const g = d.guild;
    if (!g || g.town !== ownerId || d.residence !== ownerId) continue;
    const guild = out.get(g.id) ?? { id: g.id, name: g.name, town: ownerId, members: [] };
    guild.members.push(id);
    out.set(g.id, guild);
  }
  return [...out.values()];
}

/** How much a guild sways the town: time, fame and work of its members, unrest stirred, minus the owner's crackdowns. */
export function influence(guild: Guild, docs: Record<string, PlayerDoc>, now: number): number {
  let total = 0;
  for (const id of guild.members) {
    const d = docs[id];
    if (!d?.guild) continue;
    const days = Math.max(0, now - d.guild.joinedAt) / DAY;
    total += days * num("guild.perDay") * (1 + num("guild.perRenown") * (Math.max(1, d.renown) - 1));
    total += d.guildWork.total * num("guild.perWork");
    total += d.missions.filter((m) => m.kind === "unrest" && m.target === guild.town && m.result && !m.result.caught && m.sentAt >= d.guild!.joinedAt).length * num("guild.perUnrest");
  }
  const town = docs[guild.town]?.town;
  return Math.max(0, Math.round(total - (town?.crackdowns[guild.id] ?? 0)));
}

/** How firmly the owner holds the town. */
export function authority(owner: PlayerDoc | undefined): number {
  const t = owner?.town;
  if (!owner || !t) return 1;
  const mood = t.settlers.length ? t.settlers.reduce((n, s) => n + s.mood, 0) / t.settlers.length : 50;
  return Math.max(1, Math.round(num("guild.authorityBase") + num("guild.authorityPerRenown") * owner.renown + t.spirit + mood * num("guild.authorityPerMood") + output(t, "watchtower") * num("guild.authorityPerTower") + (owner.residence ? -num("guild.authorityAway") : 0)));
}

/** 0: no hold · 1: tithe (less produced) · 2: fewer actions · 3: the guild runs the town. */
export type Stage = 0 | 1 | 2 | 3;
export function stageOf(ratio: number): Stage {
  if (ratio >= 1) return 3;
  if (ratio >= num("guild.stage2")) return 2;
  if (ratio >= num("guild.stage1")) return 1;
  return 0;
}

export const STAGE_INFO: Record<Stage, { title: string; text: string }> = {
  0: { title: "No hold", text: "The guild is just a club for now." },
  1: { title: "Guild tithe", text: "The guild skims the town's work: production is lower." },
  2: { title: "The guild says no", text: "No market, hiring, notices or upgrades without the guild's say." },
  3: { title: "The guild runs the town", text: "The owner can do nothing here until they take the town back." },
};

export interface Hold {
  guild: Guild;
  influence: number;
  authority: number;
  ratio: number;
  stage: Stage;
}

/** Each guild's hold on a town, strongest first. */
export function holds(ownerId: string, docs: Record<string, PlayerDoc>, now: number): Hold[] {
  const auth = authority(docs[ownerId]);
  return guildsIn(ownerId, docs)
    .map((g) => {
      const inf = influence(g, docs, now);
      return { guild: g, influence: inf, authority: auth, ratio: inf / auth, stage: stageOf(inf / auth) };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** The strongest guild's stage in a town (0 when there's none). */
/** Spies, guilds and takeovers are switched on (the DM's balance page; hidden by default). */
export const intrigueOn = () => num("features.intrigue") >= 1;

export const townStage = (ownerId: string, docs: Record<string, PlayerDoc>, now: number): Stage => (intrigueOn() ? (holds(ownerId, docs, now)[0]?.stage ?? 0) : 0);

/** Town actions, and the stage from which a guild stops them. */
export const BLOCKED_FROM: Record<string, Stage> = {
  market: 2,
  hire: 2,
  notice: 2,
  upgrade: 2,
  build: 3,
  assign: 3,
  craft: 3,
  help: 3,
  open: 3,
};

/** Why the owner can't do this now, or null. */
export function blockedBy(stage: Stage, action: keyof typeof BLOCKED_FROM): string | null {
  return stage >= BLOCKED_FROM[action]! ? `${STAGE_INFO[stage].title}: ${STAGE_INFO[stage].text}` : null;
}

/** The share of production the guild skims. */
export const titheShare = (stage: Stage) => (stage >= 1 ? num("guild.tithe") : 0);

/** Gold a founder collects per real day from a town their guild runs. */
export const titheGold = (guild: Guild) => Math.round(num("guild.titheGold") * guild.members.length);
export const canCollect = (lastTithe: number, now: number) => now - lastTithe >= DAY;

/** The owner pushes back: influence taken away, for gold, once in a while. */
export function crackdown(t: Town, guildId: string, auth: number, now: number): Town {
  if (now - t.lastCrackdown < num("guild.crackdownHours") * 3_600_000) throw new Error("The watch needs rest before another crackdown");
  const cost = num("guild.crackdownGold");
  if (t.gold < cost) throw new Error(`Needs ${cost} gold`);
  const amount = Math.round(auth * num("guild.crackdownShare"));
  return { ...t, gold: t.gold - cost, lastCrackdown: now, crackdowns: { ...t.crackdowns, [guildId]: (t.crackdowns[guildId] ?? 0) + amount } };
}

/** After winning the town back in a fight: a large part of the guild's influence is gone. */
export const reclaim = (t: Town, guildId: string, inf: number): Town => ({ ...t, crackdowns: { ...t.crackdowns, [guildId]: (t.crackdowns[guildId] ?? 0) + Math.round(inf * num("guild.reclaimShare")) } });
