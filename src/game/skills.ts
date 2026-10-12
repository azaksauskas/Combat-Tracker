import type { Ability } from "../domain/statblock";

/** The 18 skills and the ability each one uses. */
export const SKILL_ABILITY: Record<string, Ability> = {
  Athletics: "str",
  Acrobatics: "dex",
  "Sleight of Hand": "dex",
  Stealth: "dex",
  Arcana: "int",
  History: "int",
  Investigation: "int",
  Nature: "int",
  Religion: "int",
  "Animal Handling": "wis",
  Insight: "wis",
  Medicine: "wis",
  Perception: "wis",
  Survival: "wis",
  Deception: "cha",
  Intimidation: "cha",
  Performance: "cha",
  Persuasion: "cha",
};
export type Skill = keyof typeof SKILL_ABILITY;
export const SKILLS = Object.keys(SKILL_ABILITY) as Skill[];
