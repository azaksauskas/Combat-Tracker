import { z } from "zod";
import { ABILITIES, type Ability } from "./statblock";

/**
 * A player character as the builder stores it: the choices, not the result.
 * `buildCharacter` (src/game/builder.ts) turns it into a stat block, so a
 * rules fix updates every saved character.
 */

export const CLASS_NAMES = ["Fighter", "Rogue", "Cleric", "Wizard"] as const;
export const SPECIES_NAMES = ["Human", "Dwarf", "Elf", "Halfling"] as const;
export const BACKGROUND_NAMES = ["Acolyte", "Criminal", "Sage", "Soldier"] as const;
export type ClassName = (typeof CLASS_NAMES)[number];
export type SpeciesName = (typeof SPECIES_NAMES)[number];
export type BackgroundName = (typeof BACKGROUND_NAMES)[number];

/** The 2024 standard array. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

const scores = z.object(Object.fromEntries(ABILITIES.map((a) => [a, z.number().catch(10)])) as Record<Ability, z.ZodCatch<z.ZodNumber>>);

export const CharacterSpecSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().catch("Hero"),
  className: z.enum(CLASS_NAMES).catch("Fighter"),
  species: z.enum(SPECIES_NAMES).catch("Human"),
  background: z.enum(BACKGROUND_NAMES).catch("Soldier"),
  /** Standard-array scores before the background's increases. */
  base: scores.catch({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }),
  /** Background ability increases: +2 to one, +1 to another. */
  plus2: z.enum(ABILITIES).catch("str"),
  plus1: z.enum(ABILITIES).catch("con"),
});
export type CharacterSpec = z.infer<typeof CharacterSpecSchema>;
