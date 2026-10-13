import { z } from "zod";

/**
 * Factions of the region: who might come for a growing town. Built-in ones
 * live in src/game/region.ts; the DM's own are stored in the library. Their
 * fights point at a built-in skirmish ("goblin-ambush"), a DM map ("map:<id>")
 * or a saved encounter ("encounter:<id>").
 */
export const FactionSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().catch("A faction"),
  icon: z.string().catch("⚑"),
  alignment: z.string().catch("Neutral Evil"),
  description: z.string().catch(""),
  /** The battle when they raid the town. */
  raid: z.string().catch("goblin-ambush"),
  /** The battle when the heroes strike their lair. */
  lair: z.string().catch("goblin-ambush"),
  /** Base tribute they demand (grows with the town). */
  tribute: z.number().catch(20),
  /** They only notice heroes with at least this renown (hero level). */
  minRenown: z.number().catch(1),
});
export type Faction = z.infer<typeof FactionSchema>;

export const THREAT_STAGES = ["quiet", "watching", "demanding", "raiding", "defeated", "friendly"] as const;

/** One faction's interest in one town. */
export const ThreatSchema = z.object({
  faction: z.string(),
  /** 0–100: how much they want what the town has. */
  attention: z.number().catch(0),
  stage: z.enum(THREAT_STAGES).catch("quiet"),
  /** Game hour by which the tribute must be paid, or the raid comes. */
  dueAt: z.number().optional(),
  /** Gold demanded. */
  demand: z.number().optional(),
});
export type Threat = z.infer<typeof ThreatSchema>;
