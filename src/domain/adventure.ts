import { z } from "zod";
import { ABILITIES } from "./statblock";

/**
 * Adventures as data: scenes with choices. A choice may need a skill check
 * and leads to an outcome (narration, effects, and the next step: a scene,
 * a fight or the end). Built-in adventures are written in TypeScript; the
 * DM's own are stored in the synced library and parsed with these schemas.
 */

/** Keeps the valid items of a list instead of throwing the whole list away. */
const lenientArray = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) => items.flatMap((i) => {
      const r = item.safeParse(i);
      return r.success ? [r.data as z.infer<T>] : [];
    }));

export const EffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("xp"), amount: z.number() }),
  /** Milestone levelling: brings everyone up to at least this level. */
  z.object({ type: z.literal("milestone"), level: z.number() }),
  z.object({ type: z.literal("gold"), amount: z.number() }),
  z.object({ type: z.literal("item"), id: z.string(), count: z.number().optional() }),
  z.object({ type: z.literal("flag"), name: z.string() }),
  /** Each living hero takes damage; a save halves it. Traps leave at least 1 HP. */
  z.object({
    type: z.literal("damage"),
    dice: z.string(),
    damageType: z.string(),
    save: z.object({ ability: z.enum(ABILITIES), dc: z.number() }).optional(),
  }),
  z.object({ type: z.literal("rest"), kind: z.enum(["short", "long"]) }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const NextSchema = z.union([
  z.object({ scene: z.string() }),
  z.object({
    /** A built-in scenario id, or "encounter:<id>" for a saved encounter. */
    fight: z.object({ scenarioId: z.string(), surprised: z.enum(["party", "enemy"]).optional() }),
    victory: z.string(),
    defeat: z.string().optional(),
  }),
  z.object({ end: z.enum(["victory", "defeat"]) }),
]);
export type Next = z.infer<typeof NextSchema>;

export const OutcomeSchema = z.object({
  text: z.string().optional(),
  effects: lenientArray(EffectSchema).optional(),
  next: NextSchema.catch({ end: "victory" }),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const CheckSchema = z.object({
  skill: z.string(),
  dc: z.number().catch(12),
  /** "choose": you pick who tries. "group": everyone rolls, half must succeed. */
  mode: z.enum(["choose", "group"]).catch("choose"),
});
export type Check = z.infer<typeof CheckSchema>;

export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string().catch(""),
  /** Only shown once this flag is set / until it's set. */
  requiresFlag: z.string().optional(),
  hideIfFlag: z.string().optional(),
  /** Needs this much gold (and spends it). */
  costGold: z.number().optional(),
  /** Disappears after being picked once. */
  once: z.boolean().optional(),
  check: CheckSchema.optional(),
  success: OutcomeSchema,
  failure: OutcomeSchema.optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const SceneSchema = z.object({
  id: z.string(),
  title: z.string().catch(""),
  text: z.string().catch(""),
  /** Applied the first time the party arrives here. */
  onEnter: lenientArray(EffectSchema).optional(),
  choices: lenientArray(ChoiceSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const AdventureSchema = z.object({
  id: z.string(),
  title: z.string().catch("Untitled adventure"),
  blurb: z.string().catch(""),
  start: z.string().catch(""),
  startingGold: z.number().catch(0),
  scenes: z.record(z.string(), SceneSchema).catch({}),
});
export type Adventure = z.infer<typeof AdventureSchema>;
