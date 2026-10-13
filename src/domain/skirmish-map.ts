import { z } from "zod";

/**
 * A battle map for the game, drawn in the map editor: walls, difficult
 * terrain, where the heroes start, and which monsters wait where. Cells are
 * "x,y" keys, as on the engine's board.
 */

export const MAP_LIMITS = { minWidth: 6, maxWidth: 30, minHeight: 6, maxHeight: 20 } as const;
export const MAX_STARTS = 4;

const cellKey = z.string().regex(/^\d+,\d+$/);
const cells = z
  .array(z.unknown())
  .catch([])
  .transform((xs) => xs.filter((x): x is string => cellKey.safeParse(x).success));

export const MapMonsterSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  cell: cellKey,
  /** A built-in SRD monster (content key) or a roster entry with a stat block (its id). */
  source: z.enum(["srd", "roster"]).catch("srd"),
  ref: z.string(),
});
export type MapMonster = z.infer<typeof MapMonsterSchema>;

export const SkirmishMapSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().catch("Untitled map"),
  blurb: z.string().catch(""),
  width: z.number().int().min(MAP_LIMITS.minWidth).max(MAP_LIMITS.maxWidth).catch(16),
  height: z.number().int().min(MAP_LIMITS.minHeight).max(MAP_LIMITS.maxHeight).catch(10),
  walls: cells,
  difficult: cells,
  /** Hero start squares, in order (up to four). */
  starts: cells,
  monsters: z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.flatMap((x) => {
      const r = MapMonsterSchema.safeParse(x);
      return r.success ? [r.data] : [];
    })),
});
export type SkirmishMap = z.infer<typeof SkirmishMapSchema>;
