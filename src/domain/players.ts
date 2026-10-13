import { z } from "zod";
import { CharacterSpecSchema } from "./character";
import { TownSchema } from "./town";

/**
 * Players of the between-session game. A small shared directory lists the
 * profiles; each player's saves live in a document of their own. When logins
 * arrive, a profile id becomes the signed-in user's id and security rules can
 * say "only you write your own document" (see firestore.rules.draft).
 */

const id = z.union([z.string(), z.number()]).transform(String);

export const PROFILE_COLORS = ["#b45309", "#1d4ed8", "#047857", "#7c3aed", "#be123c", "#0e7490", "#4d7c0f", "#a16207"] as const;

export const ProfileSchema = z.object({
  id,
  name: z.string().catch("Player"),
  color: z.string().catch(PROFILE_COLORS[0]),
  /** The DM can see everyone's saves and the chronicle; players see their own. */
  role: z.enum(["dm", "player"]).catch("player"),
  createdAt: z.number().catch(0),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PlayersDocSchema = z.object({
  profiles: z.array(ProfileSchema).catch([]),
});
export type PlayersDoc = z.infer<typeof PlayersDocSchema>;

export const CHRONICLE_KINDS = ["adventure", "fight", "loot", "level", "story", "death"] as const;

/** Something that happened in a player's game that the DM may want at the table. */
export const ChronicleEntrySchema = z.object({
  id,
  /** Real time (ms since epoch). */
  at: z.number().catch(0),
  kind: z.enum(CHRONICLE_KINDS).catch("story"),
  text: z.string().catch(""),
  /** The adventure it happened in, if any. */
  adventure: z.string().optional(),
  gold: z.number().optional(),
  xp: z.number().optional(),
  items: z.record(z.string(), z.number()).optional(),
  flags: z.array(z.string()).optional(),
  /** "new" until the DM has looked at it. */
  status: z.enum(["new", "applied", "dismissed"]).catch("new"),
});
export type ChronicleEntry = z.infer<typeof ChronicleEntrySchema>;
export const MAX_CHRONICLE = 300;

const lenient = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.flatMap((x) => {
      const r = item.safeParse(x);
      return r.success ? [r.data as z.infer<T>] : [];
    }));

/** One player's document: their characters, chosen party, saves and chronicle. */
export const PlayerDocSchema = z.object({
  characters: lenient(CharacterSpecSchema),
  /** Content keys of the heroes going on the next adventure (empty: the ready-made party). */
  picks: z.array(z.string()).catch([]),
  /** The adventure in progress (CampaignState); trusted as written by the game. */
  campaign: z.unknown().nullable().catch(null),
  /** The battle in progress: { game, scenario, mode, log }. */
  battle: z.unknown().nullable().catch(null),
  chronicle: lenient(ChronicleEntrySchema),
  /** The player's own town (null until founded). */
  town: TownSchema.nullable().catch(null),
  /** Whose town the player lives in: another profile's id, or null for their own. */
  residence: z.string().nullable().catch(null),
  /** Renown = the highest level any of the player's heroes has reached. */
  renown: z.number().catch(1),
  /** Which open page wrote last, so a page ignores the echo of its own save. */
  savedBy: z.string().catch(""),
  rev: z.number().catch(0),
  updatedAt: z.number().catch(0),
});
export type PlayerDoc = z.infer<typeof PlayerDocSchema>;

export const emptyPlayerDoc = (): PlayerDoc => PlayerDocSchema.parse({});
