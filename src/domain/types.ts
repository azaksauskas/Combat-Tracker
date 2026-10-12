import { z } from "zod";

/**
 * Data model shared by every client. Schemas double as validators for
 * whatever comes back from the sync backend, so malformed or older data is
 * coerced into a usable shape instead of crashing the UI.
 */

export const CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;

export const SIZES = [
  { value: 0.5, label: "Tiny" },
  { value: 1, label: "Small / Medium" },
  { value: 2, label: "Large" },
  { value: 3, label: "Huge" },
  { value: 4, label: "Gargantuan" },
] as const;

const id = z.union([z.string(), z.number()]).transform(String);
const int = z.coerce.number().catch(0).transform((n) => (Number.isFinite(n) ? Math.trunc(n) : 0));
const str = z.string().catch("");

export const CombatantSchema = z.object({
  id,
  name: str,
  isMonster: z.boolean().catch(false),
  image: z.string().nullable().catch(null),
  size: z.coerce.number().positive().catch(1),
  group: str,
  initiative: int,
  ac: int,
  speed: int,
  hpMax: int,
  hpCurrent: int,
  hpTemp: int,
  attributes: str,
  saves: str,
  /** Sanitised-on-render HTML from the rich text editor. */
  actions: str,
  notes: str,
  conditions: z.array(z.string()).catch([]),
  /** Map position in world pixels (token centre). */
  x: z.number().catch(1000),
  y: z.number().catch(1000),
});
export type Combatant = z.infer<typeof CombatantSchema>;

export const LineSchema = z.object({
  id,
  /** Flat [x0, y0, x1, y1, ...] list, the format Konva expects. */
  points: z.array(z.number()),
  color: z.string().catch("#ef4444"),
  width: z.number().catch(4),
});
export type MapLine = z.infer<typeof LineSchema>;

export const SHAPE_TYPES = ["square", "circle", "triangle"] as const;
export const ShapeSchema = z.object({
  id,
  type: z.enum(SHAPE_TYPES).catch("square"),
  x: z.number(),
  y: z.number(),
  /** Edge length in grid cells. */
  size: z.number().positive().catch(2),
  rotation: z.number().catch(0),
  color: z.string().catch("#ffffff"),
});
export type MapShape = z.infer<typeof ShapeSchema>;

export const GRID_TYPES = ["square", "hex"] as const;
export type GridType = (typeof GRID_TYPES)[number];

export const MapStateSchema = z.object({
  grid: z.enum(GRID_TYPES).catch("square"),
  lines: z.array(LineSchema).catch([]),
  shapes: z.array(ShapeSchema).catch([]),
});
export type MapState = z.infer<typeof MapStateSchema>;

/** Live combat: initiative order, turn tracking and the battle map. */
export const CombatDocSchema = z.object({
  combatants: z.array(CombatantSchema).catch([]),
  activeId: z.string().nullable().catch(null),
  round: int,
  map: MapStateSchema.catch({ grid: "square", lines: [], shapes: [] }),
});
export type CombatDoc = z.infer<typeof CombatDocSchema>;

export const EncounterSchema = z.object({
  id,
  name: str,
  combatants: z.array(CombatantSchema).catch([]),
});
export type Encounter = z.infer<typeof EncounterSchema>;

/** Reusable content: the stat-block roster and saved encounters. */
export const LibraryDocSchema = z.object({
  roster: z.array(CombatantSchema).catch([]),
  encounters: z.array(EncounterSchema).catch([]),
});
export type LibraryDoc = z.infer<typeof LibraryDocSchema>;

export const NotesDocSchema = z.object({
  campaign: str,
});
export type NotesDoc = z.infer<typeof NotesDocSchema>;

export interface Docs {
  combat: CombatDoc;
  library: LibraryDoc;
  notes: NotesDoc;
}
export type DocKey = keyof Docs;

export const DOC_SCHEMAS = {
  combat: CombatDocSchema,
  library: LibraryDocSchema,
  notes: NotesDocSchema,
} satisfies Record<DocKey, z.ZodType>;

export function parseDoc<K extends DocKey>(key: K, raw: unknown): Docs[K] {
  const result = DOC_SCHEMAS[key].safeParse(raw ?? {});
  if (result.success) return result.data as Docs[K];
  console.warn(`Discarding invalid "${key}" document`, result.error);
  return DOC_SCHEMAS[key].parse({}) as Docs[K];
}

export const emptyDocs = (): Docs => ({
  combat: parseDoc("combat", {}),
  library: parseDoc("library", {}),
  notes: parseDoc("notes", {}),
});
