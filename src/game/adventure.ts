import { parseDice, rollTerms, withAdvantage, type Term } from "../domain/dice";
import { ABILITY_NAMES, abilityMod, saveBonus, type Ability } from "../domain/statblock";
import { mulberry32, randomSeed } from "./rng";
import { ITEMS, XP_FOR_LEVEL, applyFight, createParty, gainXp, longRest, shortRest, type Hero, type LevelUpReport, type Party } from "./party";
import type { GameState } from "./state";

/**
 * Adventures: scenes with choices. A choice may need a skill check (one
 * hero of your choosing, or the whole group), and leads to an outcome:
 * narration, effects (XP, gold, items, traps, rests, story flags) and the
 * next step (a scene, a fight, or the end). Pure and seeded like the engine.
 */

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

export type Effect =
  | { type: "xp"; amount: number }
  /** Milestone levelling: brings everyone up to at least this level. */
  | { type: "milestone"; level: number }
  | { type: "gold"; amount: number }
  | { type: "item"; id: string; count?: number }
  | { type: "flag"; name: string }
  /** Each living hero takes damage; a save halves it. Traps leave at least 1 HP. */
  | { type: "damage"; dice: string; damageType: string; save?: { ability: Ability; dc: number } }
  | { type: "rest"; kind: "short" | "long" };

export type Next =
  | { scene: string }
  | { fight: { scenarioId: string; surprised?: "party" | "enemy" }; victory: string; defeat?: string }
  | { end: "victory" | "defeat" };

export interface Outcome {
  text?: string;
  effects?: Effect[];
  next: Next;
}

export interface Check {
  skill: Skill;
  dc: number;
  /** "choose": you pick who tries. "group": everyone rolls, half must succeed. */
  mode: "choose" | "group";
}

export interface Choice {
  id: string;
  label: string;
  /** Only shown once this flag is set / until it's set. */
  requiresFlag?: string;
  hideIfFlag?: string;
  /** Needs this much gold (and spends it). */
  costGold?: number;
  /** Disappears after being picked once. */
  once?: boolean;
  check?: Check;
  success: Outcome;
  failure?: Outcome;
}

export interface Scene {
  id: string;
  title: string;
  text: string;
  /** Applied the first time the party arrives here. */
  onEnter?: Effect[];
  choices: Choice[];
}

export interface Adventure {
  id: string;
  title: string;
  blurb: string;
  start: string;
  startingGold: number;
  scenes: Record<string, Scene>;
}

export type Pending =
  | { kind: "levelup"; reports: LevelUpReport[] }
  | { kind: "short-rest" }
  | { kind: "fight"; scenarioId: string; surprised?: "party" | "enemy"; victory: string; defeat?: string };

export interface StoryEntry {
  id: number;
  kind: "scene" | "narration" | "check" | "reward" | "danger" | "levelup";
  text: string;
}

export interface CampaignState {
  adventureId: string;
  sceneId: string;
  party: Party;
  flags: string[];
  usedChoices: string[];
  story: StoryEntry[];
  /** Things to resolve before the next choice (level-ups, rests, a fight). */
  pending: Pending[];
  ended: null | "victory" | "defeat";
  rngSeed: number;
  nextId: number;
}

// --- Helpers ------------------------------------------------------------------------

export function skillBonus(hero: Hero, skill: Skill): number {
  return hero.stats.skills[skill] ?? abilityMod(hero.stats.abilities[SKILL_ABILITY[skill]!]);
}

/** Chance that a d20 + bonus meets the DC. */
export const checkChance = (bonus: number, dc: number) => Math.min(1, Math.max(0, (21 - (dc - bonus)) / 20));

const living = (p: Party) => p.heroes.filter((h) => !h.dead);

export function visibleChoices(state: CampaignState, adv: Adventure): Choice[] {
  const scene = adv.scenes[state.sceneId];
  if (!scene) return [];
  return scene.choices.filter(
    (c) =>
      (!c.requiresFlag || state.flags.includes(c.requiresFlag)) &&
      (!c.hideIfFlag || !state.flags.includes(c.hideIfFlag)) &&
      !(c.once && state.usedChoices.includes(`${scene.id}/${c.id}`)),
  );
}

// --- Running ---------------------------------------------------------------------------

export function startAdventure(adv: Adventure, seed = randomSeed()): CampaignState {
  const s: CampaignState = {
    adventureId: adv.id,
    sceneId: adv.start,
    party: { ...createParty(), gold: adv.startingGold },
    flags: [],
    usedChoices: [],
    story: [],
    pending: [],
    ended: null,
    rngSeed: seed,
    nextId: 1,
  };
  const seeded = mulberry32(seed);
  enterScene(s, adv, adv.start, seeded.rng);
  s.rngSeed = seeded.seed();
  return s;
}

function say(s: CampaignState, kind: StoryEntry["kind"], text: string) {
  s.story = [...s.story, { id: s.nextId++, kind, text }].slice(-200);
}

function enterScene(s: CampaignState, adv: Adventure, id: string, rng: () => number) {
  const scene = adv.scenes[id];
  if (!scene) throw new Error(`Unknown scene "${id}"`);
  // Choices that keep you in the same scene don't repeat its heading.
  if (s.sceneId !== id || s.story.length === 0) say(s, "scene", scene.title);
  s.sceneId = id;
  const marker = `entered:${id}`;
  if (scene.onEnter && !s.flags.includes(marker)) {
    s.flags = [...s.flags, marker];
    applyEffects(s, scene.onEnter, rng);
  }
}

function addXp(s: CampaignState, amount: number) {
  if (amount <= 0) return;
  const { party, reports } = gainXp(s.party, amount);
  s.party = party;
  say(s, "reward", `+${amount} XP each`);
  if (reports.length) {
    s.pending.push({ kind: "levelup", reports });
    say(s, "levelup", `Level up! The party reaches level ${reports[0]!.level}.`);
  }
}

function applyEffects(s: CampaignState, effects: Effect[], rng: () => number) {
  for (const e of effects) {
    switch (e.type) {
      case "xp":
        addXp(s, e.amount);
        break;
      case "milestone": {
        const needed = (XP_FOR_LEVEL[e.level] ?? 0) - s.party.xp;
        if (needed > 0) {
          say(s, "reward", `Milestone reached: level ${e.level}`);
          addXp(s, needed);
        }
        break;
      }
      case "gold":
        s.party = { ...s.party, gold: s.party.gold + e.amount };
        say(s, "reward", `+${e.amount} gp`);
        break;
      case "item": {
        const n = e.count ?? 1;
        s.party = { ...s.party, items: { ...s.party.items, [e.id]: (s.party.items[e.id] ?? 0) + n } };
        say(s, "reward", `Found: ${n > 1 ? `${n} × ` : ""}${ITEMS[e.id]?.name ?? e.id}`);
        break;
      }
      case "flag":
        if (!s.flags.includes(e.name)) s.flags = [...s.flags, e.name];
        break;
      case "damage": {
        const heroes = s.party.heroes.map((h) => {
          if (h.dead) return h;
          let dmg = rollTerms(parseDice(e.dice), rng).total;
          let note = "";
          if (e.save) {
            const save = d20(rng, saveBonus(h.stats, e.save.ability));
            const ok = save >= e.save.dc;
            note = ` (${ABILITY_NAMES[e.save.ability]} save ${save}: ${ok ? "half" : "failed"})`;
            if (ok) dmg = Math.floor(dmg / 2);
          }
          const hp = Math.max(1, h.hp - dmg);
          say(s, "danger", `${h.name} takes ${h.hp - hp} ${e.damageType} damage${note} → ${hp} HP`);
          return { ...h, hp };
        });
        s.party = { ...s.party, heroes };
        break;
      }
      case "rest":
        if (e.kind === "long") {
          const r = longRest(s.party);
          s.party = r.party;
          r.lines.forEach((l) => say(s, "narration", l));
        } else s.pending.push({ kind: "short-rest" });
        break;
    }
  }
}

function d20(rng: () => number, bonus: number, adv: "normal" | "adv" | "dis" = "normal") {
  const terms: Term[] = [{ kind: "dice", sign: 1, count: 1, sides: 20 }];
  if (bonus) terms.push({ kind: "mod", sign: bonus < 0 ? -1 : 1, value: Math.abs(bonus) });
  return rollTerms(withAdvantage(terms, adv), rng).total;
}

function follow(s: CampaignState, adv: Adventure, outcome: Outcome, rng: () => number) {
  if (outcome.text) say(s, "narration", outcome.text);
  if (outcome.effects) applyEffects(s, outcome.effects, rng);
  const next = outcome.next;
  if ("scene" in next) enterScene(s, adv, next.scene, rng);
  else if ("fight" in next) s.pending.push({ kind: "fight", ...next.fight, victory: next.victory, defeat: next.defeat });
  else {
    s.ended = next.end;
  }
}

export class StoryError extends Error {}

/**
 * Picks a choice. For "choose" checks pass the hero who tries. Returns the
 * new state; throws StoryError if the choice isn't available right now.
 */
export function choose(prev: CampaignState, adv: Adventure, choiceId: string, heroKey?: string): CampaignState {
  if (prev.ended) throw new StoryError("The adventure is over");
  if (prev.pending.length) throw new StoryError("Finish what's in front of you first");
  const choice = visibleChoices(prev, adv).find((c) => c.id === choiceId);
  if (!choice) throw new StoryError("That choice isn't available");
  if (choice.costGold && prev.party.gold < choice.costGold) throw new StoryError(`You need ${choice.costGold} gp`);

  const s: CampaignState = structuredClone(prev);
  const seeded = mulberry32(s.rngSeed);
  const rng = seeded.rng;
  s.usedChoices = [...s.usedChoices, `${s.sceneId}/${choice.id}`];
  if (choice.costGold) {
    s.party = { ...s.party, gold: s.party.gold - choice.costGold };
    say(s, "reward", `−${choice.costGold} gp`);
  }

  let success = true;
  if (choice.check) {
    const { skill, dc, mode } = choice.check;
    if (mode === "choose") {
      const hero = living(s.party).find((h) => h.key === heroKey);
      if (!hero) throw new StoryError("Pick a hero to make the check");
      const bonus = skillBonus(hero, skill);
      const total = d20(rng, bonus);
      success = total >= dc;
      say(s, "check", `${hero.name}: ${skill} ${total} vs DC ${dc} — ${success ? "success" : "failure"}`);
    } else {
      const heroes = living(s.party);
      const results = heroes.map((h) => ({ h, total: d20(rng, skillBonus(h, skill)) }));
      const passed = results.filter((r) => r.total >= dc).length;
      success = passed * 2 >= heroes.length;
      say(s, "check", `Group ${skill} vs DC ${dc}: ${results.map((r) => `${r.h.name.split(" ")[0]} ${r.total}`).join(", ")} — ${passed}/${heroes.length} pass, ${success ? "success" : "failure"}`);
    }
  }
  follow(s, adv, success ? choice.success : (choice.failure ?? choice.success), rng);
  s.rngSeed = seeded.seed();
  return s;
}

/** Closes the level-up screen (or any non-fight pending item at the front). */
export function acknowledge(prev: CampaignState): CampaignState {
  const s = structuredClone(prev);
  if (s.pending[0]?.kind === "levelup") s.pending = s.pending.slice(1);
  return s;
}

/** Finishes a short rest, spending the chosen hit dice. */
export function finishShortRest(prev: CampaignState, spend: Record<string, number>): CampaignState {
  if (prev.pending[0]?.kind !== "short-rest") return prev;
  const s = structuredClone(prev);
  const seeded = mulberry32(s.rngSeed);
  const r = shortRest(s.party, spend, seeded.rng);
  s.party = r.party;
  r.lines.forEach((l) => say(s, "narration", l));
  s.pending = s.pending.slice(1);
  s.rngSeed = seeded.seed();
  return s;
}

/** Brings a finished battle back into the story. */
export function finishFight(prev: CampaignState, adv: Adventure, game: GameState): CampaignState {
  const fight = prev.pending[0];
  if (fight?.kind !== "fight" || !game.outcome) return prev;
  const s = structuredClone(prev);
  const seeded = mulberry32(s.rngSeed);
  s.pending = s.pending.slice(1);
  const r = applyFight(s.party, game);
  s.party = r.party;
  r.fallen.forEach((n) => say(s, "danger", `${n} has fallen.`));
  if (living(s.party).length === 0) {
    say(s, "danger", "The whole party has fallen. The adventure ends here.");
    s.ended = "defeat";
  } else if (game.outcome === "victory") {
    say(s, "narration", "Victory!");
    addXp(s, r.xpEach);
    enterScene(s, adv, fight.victory, seeded.rng);
  } else if (fight.defeat) {
    say(s, "danger", "Defeat…");
    // Survivors are left for dead but wake up later with 1 HP.
    s.party = { ...s.party, heroes: s.party.heroes.map((h) => (h.dead ? h : { ...h, hp: Math.max(1, h.hp) })) };
    enterScene(s, adv, fight.defeat, seeded.rng);
  } else {
    say(s, "danger", "The party has fallen. The adventure ends here.");
    s.ended = "defeat";
  }
  s.rngSeed = seeded.seed();
  return s;
}

/** Problems in an adventure's scene graph (missing scenes, unknown fights). */
export function validateAdventure(adv: Adventure, scenarioIds: string[]): string[] {
  const errs: string[] = [];
  const has = (id: string) => id in adv.scenes;
  if (!has(adv.start)) errs.push(`start scene "${adv.start}" missing`);
  for (const scene of Object.values(adv.scenes))
    for (const c of scene.choices)
      for (const o of [c.success, c.failure].filter(Boolean) as Outcome[]) {
        const n = o.next;
        if ("scene" in n && !has(n.scene)) errs.push(`${scene.id}/${c.id} → missing scene "${n.scene}"`);
        if ("fight" in n) {
          if (!scenarioIds.includes(n.fight.scenarioId)) errs.push(`${scene.id}/${c.id} → unknown fight "${n.fight.scenarioId}"`);
          if (!has(n.victory)) errs.push(`${scene.id}/${c.id} → missing victory scene "${n.victory}"`);
          if (n.defeat && !has(n.defeat)) errs.push(`${scene.id}/${c.id} → missing defeat scene "${n.defeat}"`);
        }
        for (const e of o.effects ?? []) if (e.type === "item" && !ITEMS[e.id]) errs.push(`${scene.id}/${c.id} → unknown item "${e.id}"`);
      }
  return errs;
}
