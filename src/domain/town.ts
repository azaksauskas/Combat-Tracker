import { z } from "zod";
import { ThreatSchema } from "./faction";

/**
 * A player's town: buildings, settlers, stores and its own clock. Kept in the
 * owner's player document; the rules that run it are in src/game/town.ts.
 */

export const BUILDING_TYPES = ["hall", "house", "farm", "lumber", "market", "tavern", "apothecary", "watchtower", "smithy", "shrine"] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

const id = z.union([z.string(), z.number()]).transform(String);

const lenient = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.flatMap((x) => {
      const r = item.safeParse(x);
      return r.success ? [r.data as z.infer<T>] : [];
    }));

export const BuildingSchema = z.object({
  id,
  type: z.enum(BUILDING_TYPES),
  /** Game hour when construction finishes; absent once built. */
  readyAt: z.number().optional(),
});
export type Building = z.infer<typeof BuildingSchema>;

export const SettlerSchema = z.object({
  id,
  name: z.string().catch("Settler"),
  /** Flavour: "miller", "hunter"… */
  trade: z.string().catch(""),
  /** Where they came from: "Rescued in The Goblin Trail", "Arrived with a caravan". */
  from: z.string().catch(""),
  arrivedAt: z.number().catch(0),
  /** What they believe in (see domain/alignment.ts). */
  alignment: z.string().catch("Neutral"),
  /** 0 (about to leave) … 100 (couldn't be happier). */
  mood: z.number().catch(60),
  /** What's on their mind, in their words. */
  mind: z.string().catch(""),
  /** Where the player put them: a building id, or "rest". Absent: they take whatever job needs them. */
  job: z.string().optional().catch(undefined),
});
export type Settler = z.infer<typeof SettlerSchema>;

export const TownEventSchema = z.object({
  /** Game hour. */
  at: z.number().catch(0),
  text: z.string().catch(""),
  tone: z.enum(["good", "bad", "info"]).catch("info"),
});
export type TownEvent = z.infer<typeof TownEventSchema>;
export const MAX_TOWN_LOG = 120;

/** A job posted on the town's notice board: a fight, for a reward. */
export const ContractSchema = z.object({
  id,
  title: z.string().catch("A job"),
  text: z.string().catch(""),
  /** Which kind of foe (see game/patrol.ts). */
  foe: z.string().catch("bandits"),
  reward: z
    .object({ gold: z.number().catch(0), food: z.number().catch(0), materials: z.number().catch(0), herbs: z.number().catch(0), dust: z.number().catch(0) })
    .catch({ gold: 0, food: 0, materials: 0, herbs: 0, dust: 0 }),
  /** Game hour when it's no longer needed. */
  expiresAt: z.number().catch(0),
  /** Fixes the battle for this contract. */
  seed: z.number().catch(1),
});
export type Contract = z.infer<typeof ContractSchema>;

/** A raid the player hasn't read about yet (shown once, then cleared). */
export const RaidNewsSchema = z.object({
  /** Game hour. */
  at: z.number().catch(0),
  faction: z.string().catch(""),
  result: z.enum(["repelled", "held", "plundered"]).catch("plundered"),
  /** Who stood against them: the militia (heroes away) or the heroes. */
  by: z.enum(["militia", "heroes"]).catch("militia"),
  /** How the fight went: "4 settlers +4, luck 3 = 7 against the raiders' 11". */
  detail: z.string().catch(""),
  /** "12 gold, 3 food". */
  lost: z.string().catch(""),
});
export type RaidNews = z.infer<typeof RaidNewsSchema>;

export const TownSchema = z.object({
  name: z.string().catch("New town"),
  /** Game hours since the town was founded (fractional while the clock runs). */
  hours: z.number().catch(0),
  /** Real time (ms) at which `hours` was true. */
  at: z.number().catch(0),
  /** Whole game hours simulated so far. */
  simulated: z.number().catch(0),
  gold: z.number().catch(0),
  food: z.number().catch(0),
  materials: z.number().catch(0),
  /** Crafting components: iron (salvaged weapons), herbs, arcane dust. */
  components: z
    .object({ iron: z.number().catch(0), herbs: z.number().catch(0), dust: z.number().catch(0) })
    .catch({ iron: 0, herbs: 0, dust: 0 }),
  /** "Help out" uses today (real calendar day): at most one per bed. */
  helps: z.object({ day: z.string().catch(""), used: z.number().catch(0) }).catch({ day: "", used: 0 }),
  /** Potions brewed by the apothecary, waiting for the next adventure. */
  stash: z.record(z.string(), z.number()).catch({}),
  buildings: lenient(BuildingSchema),
  settlers: lenient(SettlerSchema),
  log: lenient(TownEventSchema),
  /** How the town is known, from its heroes' deeds: law (−10 chaotic … +10 lawful), good (−10 evil … +10 good). */
  reputation: z.object({ law: z.number().catch(0), good: z.number().catch(0) }).catch({ law: 0, good: 0 }),
  /** Pride in the heroes (−20 … +20): up after triumphs, down after defeats and deaths; fades day by day. */
  spirit: z.number().catch(0),
  /** Game hour of the last theft (safety). */
  lastTheft: z.number().catch(-1000),
  /** The region's factions and how interested each is in this town. */
  threats: lenient(ThreatSchema),
  /** A notice calling for someone of a trade, until this game hour. */
  call: z.object({ trade: z.string(), until: z.number() }).optional().catch(undefined),
  /** Patrols the heroes went on this game day (bounties shrink with each). */
  patrols: z.object({ day: z.number().catch(0), count: z.number().catch(0) }).catch({ day: 0, count: 0 }),
  /** Work posted on the town's board: fights for pay. */
  contracts: lenient(ContractSchema),
  /** Raids to tell the player about. */
  raidNews: lenient(RaidNewsSchema),
  /** Other players may move in. */
  open: z.boolean().catch(true),
  seed: z.number().catch(1),
});
export type Town = z.infer<typeof TownSchema>;
