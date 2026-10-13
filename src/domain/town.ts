import { z } from "zod";

/**
 * A player's town: buildings, settlers, stores and its own clock. Kept in the
 * owner's player document; the rules that run it are in src/game/town.ts.
 */

export const BUILDING_TYPES = ["hall", "house", "farm", "lumber", "market", "tavern", "apothecary", "watchtower", "smithy"] as const;
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
  /** Other players may move in. */
  open: z.boolean().catch(true),
  seed: z.number().catch(1),
});
export type Town = z.infer<typeof TownSchema>;
