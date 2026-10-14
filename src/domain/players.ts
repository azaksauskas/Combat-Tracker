import { z } from "zod";
import { CharacterSpecSchema } from "./character";
import { TownSchema } from "./town";

/**
 * Players of the between-session game. Each player signs in with an account;
 * their document (id = account id) holds who they are and all their saves.
 * Security rules let only them (and the DM) write it (see firestore.rules).
 * The old shared directory (PlayersDoc) only lists saves from before logins,
 * so their owners can claim them.
 */

const id = z.union([z.string(), z.number()]).transform(String);

export const PROFILE_COLORS = ["#b45309", "#1d4ed8", "#047857", "#7c3aed", "#be123c", "#0e7490", "#4d7c0f", "#a16207"] as const;

export const ProfileSchema = z.object({
  id,
  name: z.string().catch("Player"),
  color: z.string().catch(PROFILE_COLORS[0]),
  /** The DM can use every tool and see everyone's saves; players play. */
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

/** Who a player is, kept in their own document (the document id is their account id). */
export const AccountProfileSchema = z.object({
  name: z.string().catch("Player"),
  color: z.string().catch(PROFILE_COLORS[0]),
  createdAt: z.number().catch(0),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

export const MISSION_KINDS = ["scout", "sabotage", "unrest"] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

/** A spy sent to another player's town (kept by the sender; the target applies what it did). */
export const MissionSchema = z.object({
  id,
  kind: z.enum(MISSION_KINDS).catch("scout"),
  /** The target town's owner. */
  target: z.string(),
  /** Real time (ms). */
  sentAt: z.number().catch(0),
  arriveAt: z.number().catch(0),
  seed: z.number().catch(1),
  /** Filled in by the sender's game when the spy arrives. */
  result: z
    .object({
      at: z.number().catch(0),
      caught: z.boolean().catch(false),
      /** What a scout saw. */
      report: z.record(z.string(), z.union([z.number(), z.string()])).optional().catch(undefined),
      /** What saboteurs destroyed. */
      damage: z.object({ food: z.number().catch(0), materials: z.number().catch(0) }).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});
export type Mission = z.infer<typeof MissionSchema>;

/** Membership of a guild in someone's town. The guild's id is its founder's account id. */
export const GuildMembershipSchema = z.object({
  id: z.string(),
  name: z.string().catch("A guild"),
  /** The town's owner. */
  town: z.string(),
  /** Real time (ms) they joined. */
  joinedAt: z.number().catch(0),
});
export type GuildMembership = z.infer<typeof GuildMembershipSchema>;

/** One player's document: their characters, chosen party, saves and chronicle. */
export const PlayerDocSchema = z.object({
  /** Absent on saves from before logins (they can be claimed by an account). */
  profile: AccountProfileSchema.optional().catch(undefined),
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
  /** Mods fitted at the smithy, per hero (content key): they stay with the hero. */
  gear: z.record(z.string(), z.array(z.string())).catch({}),
  /** Each hero's level and XP (content key → progress): heroes keep growing between adventures. */
  progress: z.record(z.string(), z.object({ level: z.number().catch(1), xp: z.number().catch(0) })).catch({}),
  /** Lasting injuries per hero (content key → injury ids, see game/injuries.ts). */
  injuries: z.record(z.string(), z.array(z.string())).catch({}),
  /** Heroes who died and haven't been raised (content keys). */
  fallen: z.array(z.string()).catch([]),
  /** Adventures this player has completed (ids): they move to "Completed" and replay without rewards. */
  completed: z.array(z.string()).catch([]),
  /** Spies this player sent (newest last). */
  missions: lenient(MissionSchema),
  /** Missions against this player's town that have already been applied. */
  seenMissions: z.array(z.string()).catch([]),
  /** The guild this player belongs to, if any. */
  guild: GuildMembershipSchema.nullable().catch(null),
  /** Days of work for the guild: the last real day worked, and the total. */
  guildWork: z.object({ day: z.string().catch(""), total: z.number().catch(0) }).catch({ day: "", total: 0 }),
  /** When a guild founder last collected the tithe of a town their guild runs (real ms). */
  lastTithe: z.number().catch(0),
  /** Each hero's weapons and armour (content key → loadout); absent: their starting kit. */
  loadouts: z
    .record(z.string(), z.object({ main: z.string().optional(), off: z.string().optional(), spare: z.string().optional(), armor: z.string().optional() }).catch({}))
    .catch({}),
  /** Heroes in the infirmary: content key → the town hour they're back on their feet. */
  recovery: z.record(z.string(), z.number()).catch({}),
  /** Each caster's prepared cantrips and spells (content key → spell ids); absent: their built-in list. */
  spells: z.record(z.string(), z.array(z.string()).catch([])).catch({}),
  /** Weapons and armour in the town's armoury, not carried by anyone: item id → count. */
  armory: z.record(z.string(), z.number()).catch({}),
  /** Renown = the highest level any of the player's heroes has reached. */
  renown: z.number().catch(1),
  /** Which open page wrote last, so a page ignores the echo of its own save. */
  savedBy: z.string().catch(""),
  rev: z.number().catch(0),
  updatedAt: z.number().catch(0),
});
export type PlayerDoc = z.infer<typeof PlayerDocSchema>;

export const emptyPlayerDoc = (): PlayerDoc => PlayerDocSchema.parse({});
