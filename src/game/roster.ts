import { CLASS_NAMES, SPECIES_NAMES, type CharacterSpec, type ClassName, type SpeciesName } from "../domain/character";
import type { StatAction } from "../domain/statblock";
import type { Building, BuildingType, Town } from "../domain/town";
import type { CombatantDraft } from "../store/actions";
import { suggestedSpec } from "./builder";
import { mulberry32 } from "./rng";
import { num } from "./tuning";

/**
 * The heroes' roster: their traits, the personal quest each is on, the
 * buildings they look after while at home, and the heroes for hire at the
 * tavern, more and better the more the town draws them. Pure functions.
 */

// --- Traits -----------------------------------------------------------------------------

export interface TraitDef {
  name: string;
  icon: string;
  text: string;
}

export const TRAITS: Record<string, TraitDef> = {
  tough: { name: "Tough", icon: "🪨", text: "+1 maximum HP per level." },
  brawler: { name: "Brawler", icon: "👊", text: "+1 damage with melee weapon attacks." },
  "keen-eyed": { name: "Keen-eyed", icon: "🎯", text: "+1 to ranged weapon attack rolls." },
  quick: { name: "Quick", icon: "💨", text: "+5 ft speed." },
  stalwart: { name: "Stalwart", icon: "🗿", text: "+1 to every saving throw." },
  studious: { name: "Studious", icon: "📚", text: "+1 to spell attacks and spell save DCs." },
  veteran: { name: "Scarred veteran", icon: "🎖", text: "+1 AC." },
  "quick-healer": { name: "Quick healer", icon: "🌱", text: "Half the time in the infirmary." },
  homebody: { name: "Homebody", icon: "🏡", text: "As a building's patron, it makes a quarter more." },
  merchant: { name: "Merchant's eye", icon: "🪙", text: "As a building's patron, +2 gold a day." },
};

/** The ready-made heroes' traits. */
export const DEFAULT_TRAITS: Record<string, string[]> = { fighter: ["tough"], rogue: ["quick"], cleric: ["stalwart"], wizard: ["studious"] };
export const traitsOf = (traits: Record<string, string[]> | undefined, key: string) => traits?.[key] ?? DEFAULT_TRAITS[key] ?? [];

const isSpell = (a: StatAction) => !!a.slot || !!a.cantrip;

/** A hero's sheet with their traits. */
export function applyTraits<T extends Pick<CombatantDraft, "ac" | "stats" | "hpMax" | "hpCurrent" | "speed">>(c: T, traits: string[]): T {
  if (!c.stats || !traits.length) return c;
  const has = (t: string) => traits.includes(t);
  const actions = c.stats.actions.map((a): StatAction => {
    if (a.kind === "attack" && !isSpell(a)) {
      if (has("brawler") && a.attackType === "melee") return { ...a, damage: a.damage.map((d, i) => (i === 0 ? { ...d, dice: bump(d.dice, 1) } : d)) };
      if (has("keen-eyed") && a.attackType === "ranged") return { ...a, toHit: a.toHit + 1 };
    }
    if (has("studious") && isSpell(a)) {
      if (a.kind === "attack") return { ...a, toHit: a.toHit + 1 };
      if (a.kind === "save") return { ...a, dc: a.dc + 1 };
    }
    return a;
  });
  const hp = has("tough") ? (c.stats.level ?? 1) : 0;
  return {
    ...c,
    ac: c.ac + (has("veteran") ? 1 : 0),
    hpMax: c.hpMax + hp,
    hpCurrent: c.hpCurrent + hp,
    speed: c.speed + (has("quick") ? 5 : 0),
    stats: { ...c.stats, actions, allSaves: (c.stats.allSaves ?? 0) + (has("stalwart") ? 1 : 0) },
  };
}

/** "1d8+3" + 1 → "1d8+4". */
function bump(dice: string, n: number): string {
  const m = /^(.*?)([+-]\d+)$/.exec(dice);
  const total = (m ? Number(m[2]) : 0) + n;
  const base = m ? m[1]! : dice;
  return total ? `${base}${total > 0 ? "+" : ""}${total}` : base;
}

// --- Personal quests --------------------------------------------------------------------

/** What a hero has done in battle, all told. */
export interface HeroDeeds {
  battles: number;
  wins: number;
  dealt: number;
  taken: number;
  healed: number;
  felled: number;
}
export const NO_DEEDS: HeroDeeds = { battles: 0, wins: 0, dealt: 0, taken: 0, healed: 0, felled: 0 };

export interface QuestDef {
  name: string;
  /** What counts. */
  stat: keyof HeroDeeds;
  /** "foes felled" */
  unit: string;
  stages: [number, number, number];
  /** The trait the second stage brings. */
  trait: string;
  /** The unique treasure at the end of the road. */
  unique: string;
  text: string;
}

export const QUESTS: Record<ClassName, QuestDef> = {
  Fighter: { name: "The Champion's Road", stat: "felled", unit: "foes felled", stages: [5, 15, 30], trait: "veteran", unique: "emberbrand", text: "Prove yourself where the fighting is thickest." },
  Rogue: { name: "A Name in the Shadows", stat: "dealt", unit: "damage dealt", stages: [80, 250, 600], trait: "keen-eyed", unique: "wolfsong", text: "Make the region whisper your name." },
  Cleric: { name: "The Path of Mercy", stat: "healed", unit: "HP healed", stages: [30, 100, 250], trait: "quick-healer", unique: "crypt-wardens-mantle", text: "Bring the fallen back to their feet, again and again." },
  Wizard: { name: "The Arcane Ladder", stat: "dealt", unit: "damage dealt", stages: [80, 250, 600], trait: "stalwart", unique: "staff-of-the-last-dawn", text: "Master the art one battle at a time." },
};
export const questOf = (className: string | null | undefined) => QUESTS[(className ?? "Fighter") as ClassName] ?? QUESTS.Fighter;

/** Add a battle's tally to a hero's deeds. */
export function addDeeds(d: HeroDeeds | undefined, t: { dealt: number; taken: number; healed: number; downed: number }, won: boolean): HeroDeeds {
  const x = d ?? NO_DEEDS;
  return { battles: x.battles + 1, wins: x.wins + (won ? 1 : 0), dealt: x.dealt + t.dealt, taken: x.taken + t.taken, healed: x.healed + t.healed, felled: x.felled + t.downed };
}

/** How many stages of the quest these deeds have reached (0–3). */
export function questStage(q: QuestDef, d: HeroDeeds | undefined): number {
  const v = (d ?? NO_DEEDS)[q.stat];
  return q.stages.filter((n) => v >= n).length;
}

// --- Patrons ----------------------------------------------------------------------------

/** Buildings each class looks after best. */
export const AFFINITY: Record<ClassName, BuildingType[]> = {
  Fighter: ["watchtower", "smithy", "lumber"],
  Rogue: ["market", "tavern"],
  Cleric: ["shrine", "farm", "apothecary"],
  Wizard: ["tower", "apothecary"],
};

export interface Patron {
  key: string;
  name: string;
  className: string;
  traits: string[];
}

/** How much more a building makes with its patron (0: none). */
export function patronBoost(b: Building, p: Patron | undefined): number {
  if (!p) return 0;
  const fits = AFFINITY[p.className as ClassName]?.includes(b.type);
  return num("patron.bonus") + (fits ? num("patron.affinityBonus") : 0) + (p.traits.includes("homebody") ? 0.25 : 0);
}

// --- The tavern ------------------------------------------------------------------------

export interface Candidate {
  id: string;
  spec: CharacterSpec;
  level: number;
  traits: string[];
  fee: number;
  pitch: string;
}

/** Why heroes come: what the town has going for it. */
export function attraction(t: Town, renown: number, patrons: number): { score: number; lines: [string, number][] } {
  const tavern = t.buildings.find((b) => b.type === "tavern");
  const lines: [string, number][] = [
    [`Renown ${renown}`, renown * 10],
    ["The town's spirit", Math.round(t.spirit)],
    ["The tavern", tavern ? 10 * (tavern.level ?? 1) : 0],
    ["Heroes at home looking after the town", patrons * 5],
    ["Settlers", Math.floor(t.settlers.length / 2)],
  ];
  return { score: Math.max(0, lines.reduce((n, [, v]) => n + v, 0)), lines };
}

const NAMES: Record<SpeciesName, string[]> = {
  Human: ["Aldric", "Mira", "Tomas", "Rowena", "Garrick", "Elsbeth", "Corin", "Yvaine", "Bram", "Isolde"],
  Dwarf: ["Thora", "Durgan", "Hilda", "Borin", "Ragna", "Torvald"],
  Elf: ["Aelar", "Sariel", "Theren", "Liria", "Faelan", "Naivara"],
  Halfling: ["Rosie", "Milo", "Pervin", "Lavinia", "Cade", "Merla"],
};
const SURNAMES = ["of the Ford", "Ashdown", "Brightwater", "Hollow", "Thornwick", "Greycloak", "Underbough", "Stonefoot", "Wren", "Marrow"];
const PITCHES = [
  "A caravan guard tired of other people's roads.",
  "Says they once held a bridge alone. The scars agree.",
  "Looking for a town worth fighting for.",
  "Heard the songs about your heroes and came to see.",
  "Owes no one, fears little, drinks less than you'd think.",
  "A wanderer with a light purse and a heavy past.",
  "Wants a roof, a cause, and a share of the treasure.",
];

/** Which batch of candidates is up (a new one every few days). */
export const tavernBatch = (hours: number) => Math.floor(hours / 24 / Math.max(1, num("tavern.refreshDays")));

/** The heroes looking for work at the tavern now (fixed for the batch; hired ones leave). */
export function candidates(t: Town, renown: number, partyLevel: number, patrons: number): Candidate[] {
  if (!t.buildings.some((b) => b.type === "tavern")) return [];
  const batch = tavernBatch(t.hours);
  const rng = mulberry32((t.seed ^ (batch * 7919 + 13)) >>> 0).rng;
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
  const { score } = attraction(t, renown, patrons);
  const count = Math.min(4, 1 + Math.floor(score / Math.max(1, num("tavern.attractionPerHero"))));
  const out: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const className = pick(CLASS_NAMES);
    const species = pick(SPECIES_NAMES);
    const name = `${pick(NAMES[species])} ${pick(SURNAMES)}`;
    const id = `tavern-${batch}-${i}`;
    // Stronger towns draw stronger heroes.
    const level = Math.max(1, Math.min(partyLevel, partyLevel - 1 + (rng() < score / 100 ? 1 : 0)));
    const traitIds = Object.keys(TRAITS);
    const traits = [pick(traitIds)];
    if (rng() < score / 150) {
      const second = pick(traitIds);
      if (!traits.includes(second)) traits.push(second);
    }
    const spec = { ...suggestedSpec(className, id, name), species };
    const fee = Math.round(num("tavern.feeBase") + num("tavern.feePerLevel") * (level - 1) + 15 * (traits.length - 1));
    out.push({ id, spec, level, traits, fee, pitch: pick(PITCHES) });
  }
  return out.filter((c) => !(t.tavernHired ?? []).includes(c.id));
}
