import { axesOf } from "../domain/alignment";
import type { Faction, Threat } from "../domain/faction";
import { MAX_TOWN_LOG, type Town, type TownEvent } from "../domain/town";
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

/** What an undefended (or lost) raid costs. */
function raidLosses(t: Town, f: Faction, h: number): { town: Town; text: string } {
  const gold = Math.round(t.gold * num("region.raidGold"));
  const food = Math.round(t.food * num("region.raidFood"));
  const materials = Math.round(t.materials * num("region.raidMaterials"));
  const town: Town = {
    ...t,
    gold: t.gold - gold,
    food: t.food - food,
    materials: t.materials - materials,
    spirit: clamp(t.spirit - 6, -20, 20),
    lastTheft: h,
  };
  const lost = [gold && `${gold} gold`, food && `${food} food`, materials && `${materials} materials`].filter(Boolean).join(", ");
  return { town, text: `${f.name} raided the town${lost ? ` and carried off ${lost}` : ""}. The settlers are shaken.` };
}

export interface RegionInfo {
  power: number;
  /** A staffed watchtower slows the build-up. */
  watch: boolean;
  renown: number;
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

    // Deadlines.
    if (th.stage === "demanding" && th.dueAt !== undefined && h >= th.dueAt) {
      const notice = num("region.raidNoticeHours");
      th = { ...th, stage: "raiding", dueAt: h + notice, demand: undefined };
      say(`${f.icon} The tribute was never paid. ${f.name} are coming: a raid is expected by ${clock(h + notice)}.`, "bad");
    } else if (th.stage === "raiding" && th.dueAt !== undefined && h >= th.dueAt) {
      const r = raidLosses(t, f, h);
      t = r.town;
      say(`${f.icon} ${r.text}`, "bad");
      th = { faction: f.id, attention: 40, stage: "watching" };
      t = setThreat(t, th);
      continue;
    }

    // Attention grows with power; an offended faction grows hungrier faster.
    const opposed = clamp(-kin, 0, 1);
    const gain = num("region.attentionRate") * (1 + info.power / 15) * (1 + opposed) * (info.watch ? 0.7 : 1) * (0.6 + rng() * 0.8);
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
      setThreat({ ...t, spirit: clamp(t.spirit + 6, -20, 20) }, { faction: f.id, attention: 15, stage: "watching" }),
      t.hours,
      `The heroes drove ${f.name} out of the town!`,
      "good",
    );
  const r = raidLosses(t, f, Math.floor(t.hours));
  return logged(setThreat(r.town, { faction: f.id, attention: 40, stage: "watching" }), t.hours, `The heroes fell back. ${r.text}`, "bad");
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
