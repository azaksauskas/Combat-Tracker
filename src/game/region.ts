import { axesOf } from "../domain/alignment";
import type { Faction, Threat } from "../domain/faction";
import { MAX_TOWN_LOG, type RaidNews, type Town, type TownEvent } from "../domain/town";
import { num } from "./tuning";

/**
 * The region around a town: factions that notice it as it grows. Each day
 * their attention rises with the town's power, faster when the town's
 * reputation offends them; they send scouts, demand tribute, and raid.
 * Factions that share the town's outlook turn friendly instead.
 * Pure; the town simulation calls `regionDay` every morning.
 */

export const BUILTIN_FACTIONS: Faction[] = [
  {
    id: "red-fang",
    name: "The Red Fang",
    icon: "🐺",
    alignment: "Chaotic Evil",
    description: "Goblin raiders and their wolves, out of the briars. They take what isn't nailed down, then the nails.",
    raid: "goblin-ambush",
    lair: "goblin-ambush",
    tribute: 15,
    minRenown: 1,
    milestone: 2,
  },
  {
    id: "river-road",
    name: "River Road Bandits",
    icon: "🗡",
    alignment: "Neutral Evil",
    description: "Toll-takers who've worked out that towns pay better than travellers.",
    raid: "bandit-camp",
    lair: "bandit-camp",
    tribute: 25,
    minRenown: 1,
    milestone: 3,
  },
  {
    id: "restless-dead",
    name: "The Restless Dead",
    icon: "💀",
    alignment: "Lawful Evil",
    description: "Something under the hill keeps sending the dead out. They want no gold; they want the living.",
    raid: "crypt",
    lair: "crypt-depths",
    tribute: 0,
    minRenown: 2,
    milestone: 4,
  },
  {
    id: "hollow-eye",
    name: "Cult of the Hollow Eye",
    icon: "👁",
    alignment: "Neutral Evil",
    description: "A cult that recruits the desperate and punishes the defiant. They notice heroes whose names travel.",
    raid: "cult-cellar",
    lair: "hollow-sanctum",
    tribute: 40,
    minRenown: 3,
    milestone: 5,
  },
  {
    id: "gnoll-pack",
    name: "The Gnoll Pack",
    icon: "🦴",
    alignment: "Chaotic Evil",
    description: "A hungry warband with a bugbear chieftain. Only famous towns are worth the long march.",
    raid: "gnoll-warband",
    lair: "gnoll-warband",
    tribute: 60,
    minRenown: 4,
    milestone: 5,
  },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clock = (h: number) => `Day ${Math.floor(h / 24) + 1}, ${String(Math.floor(h % 24)).padStart(2, "0")}:00`;

/** How a faction's outlook matches the town's reputation: −2 (opposed) … +2 (kindred). */
export function kinship(f: Faction, t: Town): number {
  const a = axesOf(f.alignment);
  return (a.law * t.reputation.law + a.good * t.reputation.good) / 10;
}
export const FRIENDLY_AT = 0.6;

export const threatOf = (t: Town, factionId: string): Threat => t.threats.find((x) => x.faction === factionId) ?? { faction: factionId, attention: 0, stage: "quiet" };

function setThreat(t: Town, th: Threat): Town {
  const others = t.threats.filter((x) => x.faction !== th.faction);
  return { ...t, threats: [...others, th] };
}

const logged = (t: Town, at: number, text: string, tone: TownEvent["tone"]): Town => ({ ...t, log: [...t.log, { at, text, tone }].slice(-MAX_TOWN_LOG) });

/** What a raid costs: `share` of the full losses (1 when nobody stopped them). */
function raidLosses(t: Town, f: Faction, h: number, share = 1): { town: Town; text: string; lost: string } {
  const gold = Math.round(t.gold * num("region.raidGold") * share);
  const food = Math.round(t.food * num("region.raidFood") * share);
  const materials = Math.round(t.materials * num("region.raidMaterials") * share);
  const town: Town = {
    ...t,
    gold: t.gold - gold,
    food: t.food - food,
    materials: t.materials - materials,
    spirit: clamp(t.spirit - Math.round(6 * share), -20, 20),
    lastTheft: h,
  };
  const lost = [gold && `${gold} gold`, food && `${food} food`, materials && `${materials} materials`].filter(Boolean).join(", ");
  return { town, lost, text: `${f.name} raided the town${lost ? ` and carried off ${lost}` : ""}. The settlers are shaken.` };
}

// --- The militia: who defends the town while the heroes are away --------------------------

/** How hard a faction's raiders hit: tougher factions turn up later. */
export const raidStrength = (f: Faction) => Math.round(num("militia.strengthBase") + num("militia.strengthPerRenown") * Math.max(1, f.minRenown));

export interface Militia {
  total: number;
  /** "4 settlers +4", "1 watchtower +5", "spirit +1". */
  parts: string[];
}

/** The town's own defence: its settlers, staffed watchtowers and spirit. */
export function militia(t: Town, towers: number): Militia {
  const settlers = Math.round(t.settlers.length * num("militia.perSettler"));
  const tower = Math.round(towers * num("militia.perTower"));
  const spirit = Math.round(t.spirit / 4);
  const parts = [`${t.settlers.length} settler${t.settlers.length === 1 ? "" : "s"} +${settlers}`];
  if (towers) parts.push(`${towers} staffed watchtower${towers === 1 ? "" : "s"} +${tower}`);
  if (spirit) parts.push(`spirit ${spirit > 0 ? "+" : ""}${spirit}`);
  return { total: settlers + tower + spirit, parts };
}

export type RaidOdds = { repel: number; hold: number; plunder: number };

/** Chances of each outcome of a raid the militia faces alone (defence + d6 against the raiders' strength). */
export function raidOdds(m: Militia, strength: number): RaidOdds {
  const odds = { repel: 0, hold: 0, plunder: 0 };
  for (let d = 1; d <= 6; d++) odds[raidOutcome(m.total + d, strength)] += 1 / 6;
  return odds;
}

function raidOutcome(total: number, strength: number): "repel" | "hold" | "plunder" {
  return total >= strength ? "repel" : total >= strength * num("militia.holdShare") ? "hold" : "plunder";
}

/** Raiders arrive and the heroes aren't there: the militia fights them. */
function militiaDefends(t: Town, f: Faction, h: number, towers: number, rng: () => number): { town: Town; text: string } {
  const m = militia(t, towers);
  const strength = raidStrength(f);
  const d = 1 + Math.floor(rng() * 6);
  const total = m.total + d;
  const how = `${[...m.parts, `luck ${d}`].join(", ")} = ${total} against the raiders' ${strength}`;
  const outcome = raidOutcome(total, strength);
  if (outcome === "repel") {
    const town = { ...t, spirit: clamp(t.spirit + 3, -20, 20), stats: { ...t.stats, raidsRepelled: (t.stats.raidsRepelled ?? 0) + 1 } };
    return { town: news(town, { at: h, faction: f.id, result: "repelled", by: "militia", detail: how, lost: "" }), text: `${f.name} attacked, but the militia drove them off.` };
  }
  const r = raidLosses(t, f, h, outcome === "hold" ? num("militia.heldLoss") : 1);
  return {
    town: news(r.town, { at: h, faction: f.id, result: outcome === "hold" ? "held" : "plundered", by: "militia", detail: how, lost: r.lost }),
    text: outcome === "hold" ? `${f.name} attacked. The militia held the gate, but they got away with ${r.lost || "little"}.` : r.text,
  };
}

const news = (t: Town, n: RaidNews): Town => ({ ...t, raidNews: [...t.raidNews, n].slice(-10) });

export interface RegionInfo {
  power: number;
  /** Staffed watchtowers: they slow the build-up and stiffen the militia. */
  towers: number;
  renown: number;
}

/** Every hour: tribute deadlines run out and raiders arrive on time. */
export function regionHour(t: Town, h: number, rng: () => number, factions: Faction[], info: Pick<RegionInfo, "towers">, say: (text: string, tone: TownEvent["tone"]) => void): Town {
  for (const f of factions) {
    let th = threatOf(t, f.id);
    if (th.dueAt === undefined || h < th.dueAt) continue;
    if (th.stage === "demanding") {
      const notice = num("region.raidNoticeHours");
      th = { ...th, stage: "raiding", dueAt: h + notice, demand: undefined };
      say(`${f.icon} The tribute was never paid. ${f.name} are coming: a raid is expected by ${clock(h + notice)}.`, "bad");
      t = setThreat(t, th);
    } else if (th.stage === "raiding") {
      const r = militiaDefends(t, f, h, info.towers, rng);
      say(`${f.icon} ${r.text}`, "bad");
      t = setThreat(r.town, { faction: f.id, attention: 40, stage: "watching" });
    }
  }
  return t;
}

/** One morning in the region, for one town. */
export function regionDay(t: Town, h: number, rng: () => number, factions: Faction[], info: RegionInfo, say: (text: string, tone: TownEvent["tone"]) => void): Town {
  for (const f of factions) {
    let th = threatOf(t, f.id);
    if (th.stage === "defeated" || info.renown < f.minRenown) continue;

    // Kindred spirits make friends, not demands.
    const kin = kinship(f, t);
    if (kin >= FRIENDLY_AT) {
      if (th.stage !== "friendly") {
        th = { faction: f.id, attention: 0, stage: "friendly" };
        say(`${f.icon} ${f.name} sent an envoy: they like how this town is run.`, "info");
      } else if (rng() < 0.06) {
        const gift = 5 + Math.floor(rng() * 11);
        t = { ...t, gold: t.gold + gift };
        say(`${f.icon} Traders from ${f.name} brought goods: +${gift} gold.`, "good");
      }
      t = setThreat(t, th);
      continue;
    }
    if (th.stage === "friendly") th = { faction: f.id, attention: 10, stage: "quiet" };

    // Their spies come to look the town over; a watch may catch them.
    if (th.stage === "watching" && rng() < num("spy.factionChance")) {
      if (info.towers > 0 && rng() < Math.min(0.9, 0.4 * info.towers)) {
        th = { ...th, attention: clamp(th.attention - 10, 0, 100) };
        say(`${f.icon} The watch caught a spy of ${f.name} counting the town's spears. They'll think twice.`, "good");
      } else {
        th = { ...th, attention: clamp(th.attention + 5, 0, 100) };
        say(`${f.icon} Strangers were asking about the town's defences. ${f.name} know more than they did.`, "info");
      }
    }

    // Attention grows with power; an offended faction grows hungrier faster.
    const opposed = clamp(-kin, 0, 1);
    const gain = num("region.attentionRate") * (1 + info.power / 15) * (1 + opposed) * (info.towers ? 0.7 : 1) * (0.6 + rng() * 0.8);
    th = { ...th, attention: clamp(th.attention + gain, 0, 100) };
    if (th.stage === "quiet" && th.attention >= num("region.scoutsAt")) {
      th = { ...th, stage: "watching" };
      say(`${f.icon} Scouts of ${f.name} were seen watching the town.`, "info");
    } else if (th.stage === "watching" && th.attention >= num("region.demandAt")) {
      const notice = num("region.raidNoticeHours");
      if (f.tribute > 0) {
        const demand = Math.round(f.tribute * num("region.tributeMultiplier") * (1 + info.power / 40));
        const due = num("region.deadlineHours");
        th = { ...th, stage: "demanding", demand, dueAt: h + due };
        say(`${f.icon} ${f.name} demand ${demand} gold by ${clock(h + due)}, or they will take it.`, "bad");
      } else {
        th = { ...th, stage: "raiding", dueAt: h + notice };
        say(`${f.icon} ${f.name} are gathering. They will strike by ${clock(h + notice)}.`, "bad");
      }
    }
    t = setThreat(t, th);
  }
  return t;
}

// --- The heroes' answers --------------------------------------------------------------

export function payTribute(t: Town, f: Faction): Town {
  const th = threatOf(t, f.id);
  if (th.stage !== "demanding" || th.demand === undefined) throw new Error("Nobody is asking for tribute");
  if (t.gold < th.demand) throw new Error(`Needs ${th.demand} gold`);
  return logged(setThreat({ ...t, gold: t.gold - th.demand }, { faction: f.id, attention: 20, stage: "watching" }), t.hours, `Paid ${th.demand} gold to ${f.name}. They'll be back.`, "info");
}

export function refuseTribute(t: Town, f: Faction): Town {
  const th = threatOf(t, f.id);
  if (th.stage !== "demanding") throw new Error("Nobody is asking for tribute");
  const due = Math.floor(t.hours) + num("region.raidNoticeHours");
  return logged(setThreat(t, { ...th, stage: "raiding", dueAt: due, demand: undefined }), t.hours, `Refused ${f.name}'s demand. They will come by ${clock(due)}.`, "bad");
}

/** Heroes famous enough to know of a faction can seek out its lair, unless it's broken or friendly. */
export const canStrike = (th: Threat, f: Faction, renown: number) => renown >= f.minRenown && th.stage !== "defeated" && th.stage !== "friendly";

/** After the heroes fought the raiders in the town. */
export function raidResult(t: Town, f: Faction, won: boolean): Town {
  if (won)
    return logged(
      setThreat({ ...t, spirit: clamp(t.spirit + 6, -20, 20), stats: { ...t.stats, raidsRepelled: (t.stats.raidsRepelled ?? 0) + 1 } }, { faction: f.id, attention: 15, stage: "watching" }),
      t.hours,
      `The heroes drove ${f.name} out of the town!`,
      "good",
    );
  const h = Math.floor(t.hours);
  const r = raidLosses(t, f, h);
  const town = news(r.town, { at: h, faction: f.id, result: "plundered", by: "heroes", detail: "", lost: r.lost });
  return logged(setThreat(town, { faction: f.id, attention: 40, stage: "watching" }), t.hours, `The heroes fell back. ${r.text}`, "bad");
}

/** After the heroes struck the faction's lair. */
export function lairResult(t: Town, f: Faction, won: boolean): Town {
  const th = threatOf(t, f.id);
  if (won) {
    const loot = 20 + f.tribute;
    return logged(
      setThreat({ ...t, gold: t.gold + loot, spirit: clamp(t.spirit + 10, -20, 20) }, { faction: f.id, attention: 0, stage: "defeated" }),
      t.hours,
      `The heroes broke ${f.name} in their lair and came back with ${loot} gold. They won't trouble this town again.`,
      "good",
    );
  }
  return logged(
    setThreat({ ...t, spirit: clamp(t.spirit - 5, -20, 20) }, { ...th, attention: clamp(th.attention + 20, 0, 100) }),
    t.hours,
    `The attack on ${f.name}'s lair failed, and now they're angry.`,
    "bad",
  );
}

export const STAGE_TEXT: Record<Threat["stage"], string> = {
  quiet: "Hasn't noticed the town",
  watching: "Watching the town",
  demanding: "Demanding tribute",
  raiding: "Raid coming",
  defeated: "Broken",
  friendly: "Friendly",
};
