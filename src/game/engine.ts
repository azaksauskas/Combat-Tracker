import { produce, type Draft } from "immer";
import { adjustDamage, rollDamage, type Advantage } from "../domain/attack";
import { parseDice, rollTerms, withAdvantage, type Rng, type Term } from "../domain/dice";
import {
  ABILITY_NAMES,
  abilityMod,
  saveBonus,
  type AttackAction,
  type BuffAction,
  type HealAction,
  type MissileAction,
  type SaveAction,
  type StatAction,
} from "../domain/statblock";
import { FEET_PER_CELL, coverBetween, distanceFt, findPath, lineOfSight, makeBoardIndex, reachableCells, sameCell, type Board, type Cell, type Cover } from "./board";
import { mulberry32 } from "./rng";
import { GameError, type Effect, type GameEvent, type GameState, type Objective, type Side, type Unit } from "./state";

/**
 * The rules engine: `apply(state, command)` validates a command for the
 * creature whose turn it is, resolves it under the 2024 rules and returns
 * the new state plus everything that happened. Pure and deterministic: all
 * randomness comes from the seed stored in the state.
 */

export type Command =
  | { type: "move"; unitId: string; to: Cell }
  /**
   * Use an action from the stat block. Single-target actions take
   * `targetId`; buffs may take several `targetIds`; area spells take a
   * `point` to aim at.
   */
  | { type: "action"; unitId: string; actionId: string; targetId?: string; targetIds?: string[]; point?: Cell }
  | { type: "dash"; unitId: string; bonus?: boolean }
  | { type: "action-surge"; unitId: string }
  | { type: "turn-undead"; unitId: string }
  | { type: "use-potion"; unitId: string; itemId: string; targetId: string }
  | { type: "disengage"; unitId: string; bonus?: boolean }
  | { type: "dodge"; unitId: string }
  | { type: "second-wind"; unitId: string }
  | { type: "stand-up"; unitId: string }
  | { type: "end-turn"; unitId: string }
  /** Help: the next attack an ally makes against this enemy (within 5 ft of you) has Advantage. */
  | { type: "help"; unitId: string; targetId: string }
  /** Hide: needs heavy cover from every foe that can see you; Dexterity (Stealth) against DC 15. */
  | { type: "hide"; unitId: string; bonus?: boolean }
  /** Shove (one of your attacks): push 5 ft away or knock Prone, unless they save. */
  | { type: "shove"; unitId: string; targetId: string; prone?: boolean }
  /** Grapple (one of your attacks): their speed drops to 0 while you hold them. */
  | { type: "grapple"; unitId: string; targetId: string }
  /** Break free of a grapple (action). */
  | { type: "escape"; unitId: string }
  /** A routed creature on the edge of the board runs off. */
  | { type: "flee"; unitId: string }
  /** A dying hero rolls their death save (the player clicks; the AI does it for monsters' allies). */
  | { type: "death-save"; unitId: string }
  /**
   * The party flees the battle: every enemy next to a conscious hero gets a
   * parting opportunity attack, then the fight is lost (fled).
   */
  | { type: "retreat"; unitId: string };

// --- Rules tables --------------------------------------------------------------

/** "Turned" = Frightened + Incapacitated by Turn Undead, until it takes damage. */
const INCAPACITATING = ["Incapacitated", "Paralyzed", "Petrified", "Stunned", "Unconscious", "Turned"];

/** Consumables the party can carry into a fight. */
export const POTIONS: Record<string, { name: string; dice: string }> = {
  "potion-healing": { name: "Potion of Healing", dice: "2d4+2" },
  "potion-greater-healing": { name: "Potion of Greater Healing", dice: "4d4+4" },
};
const GRANTS_ADVANTAGE_AGAINST = ["Blinded", "Paralyzed", "Petrified", "Restrained", "Stunned", "Unconscious"];
const AUTO_CRIT_WITHIN_5 = ["Paralyzed", "Unconscious"];
const AUTO_FAIL_STR_DEX = ["Paralyzed", "Petrified", "Stunned", "Unconscious"];
const SPEED_ZERO = ["Grappled", "Restrained", "Paralyzed", "Petrified", "Stunned", "Unconscious"];

const has = (u: Unit, c: string) => u.conditions.includes(c);
export const isAlive = (u: Unit) => !u.dead;
/** Conscious and able to act. */
export const canAct = (u: Unit) => !u.dead && u.hp > 0 && !INCAPACITATING.some((c) => has(u, c));
/** Standing creatures occupy their cell; the dead don't. */
const occupies = (u: Unit) => !u.dead;

export const currentUnit = (s: GameState): Unit | undefined => s.units[s.turnIndex];

// --- Public queries for the UI --------------------------------------------------

function pathOptions(s: GameState, mover: Unit) {
  const others = s.units.filter((u) => u.id !== mover.id && occupies(u));
  return {
    // Can't move through a hostile creature's space (unless it's down).
    blocked: (c: Cell) => others.some((u) => u.side !== mover.side && u.hp > 0 && sameCell(u.pos, c)),
    // Can pass allies (and fallen creatures) but not stop on them.
    noStop: (c: Cell) => others.some((u) => sameCell(u.pos, c)),
    costMultiplier: has(mover, "Prone") ? 2 : 1,
  };
}

/** Cells the unit can move to this turn, with their cost in feet. */
export function reachable(s: GameState, unitId: string): Map<string, number> {
  const u = s.units.find((x) => x.id === unitId);
  if (!u) return new Map();
  return reachableCells(s.board, u.pos, u.turn.movement, pathOptions(s, u));
}

export interface TargetCheck {
  ok: boolean;
  reason?: string;
  advantage: Advantage;
  reasons: string[];
  /** AC (or Dex save) bonus the target gets from cover. */
  cover: 0 | 2 | 5;
}

/** Cover between two creatures on the board (other living creatures can be in the way). */
export function coverOf(s: GameState, a: Unit, t: Unit): Cover {
  const others = s.units.filter((u) => u.id !== a.id && u.id !== t.id && !u.dead).map((u) => u.pos);
  return coverBetween(s.board, a.pos, t.pos, others);
}
const COVER_NAME = { 2: "half cover", 5: "three-quarters cover" } as const;

/** Can `attacker` use `action` on `target` right now, and with what advantage? */
export function checkTarget(s: GameState, attackerId: string, actionId: string, targetId: string): TargetCheck {
  const a = s.units.find((u) => u.id === attackerId);
  const t = s.units.find((u) => u.id === targetId);
  const action = a?.stats.actions.find((x) => x.id === actionId);
  const no = (reason: string): TargetCheck => ({ ok: false, reason, advantage: "normal", reasons: [], cover: 0 });
  if (!a || !t || !action) return no("Unknown creature or action");
  if (t.dead) return no(`${t.name} is dead`);
  if (action.slot && (a.resources[`slot${action.slot}`] ?? 0) <= 0) return no(`No level ${action.slot} spell slots left`);
  const friendly = action.kind === "heal" || action.kind === "buff";
  if (friendly && t.side !== a.side) return no(`${action.name} is for your allies`);
  if (!friendly && a.id === t.id) return no("Can't target yourself");
  if (action.kind === "save" && action.area) return no("Aim it at a square");
  const dist = distanceFt(a.pos, t.pos);
  const max =
    action.kind === "attack"
      ? action.attackType === "melee"
        ? action.reach
        : (action.range?.[1] ?? 5)
      : action.kind === "save"
        ? (action.range ?? 60)
        : action.range;
  if (dist > max) return no(`${t.name} is out of range (${dist} ft, max ${max} ft)`);
  if (a.id !== t.id && !lineOfSight(s.board, a.pos, t.pos)) return no(`No line of sight to ${t.name}`);
  const { advantage, reasons } = action.kind === "attack" ? attackAdvantage(s, a, t, action) : { advantage: "normal" as Advantage, reasons: [] };
  // Cover protects against attacks and Dexterity saves, not against help from friends.
  const raw = friendly || a.id === t.id ? 0 : coverOf(s, a, t);
  if (raw === "total") return no(`${t.name} has total cover`);
  const cover = action.kind === "attack" || (action.kind === "save" && action.save === "dex") ? raw : 0;
  if (cover) reasons.push(`− ${COVER_NAME[cover]} (+${cover} ${action.kind === "attack" ? "AC" : "to the save"})`);
  return { ok: true, advantage, reasons, cover };
}

// --- Advantage ----------------------------------------------------------------------

function attackAdvantage(s: GameState, a: Unit, t: Unit, action: AttackAction): { advantage: Advantage; reasons: string[] } {
  const adv: string[] = [];
  const dis: string[] = [];
  const dist = distanceFt(a.pos, t.pos);

  for (const c of ["Blinded", "Poisoned", "Prone", "Restrained", "Frightened", "Fleeing"]) if (has(a, c)) dis.push(`you are ${c}`);
  if (has(a, "Invisible")) adv.push("you are Invisible");
  if (has(a, "Hidden")) adv.push("you are hidden");
  if (has(t, "Hidden")) dis.push("target is hidden");
  const helper = s.effects.find((e) => e.kind === "help" && e.target === t.id && e.source !== a.id && s.units.find((u) => u.id === e.source)?.side === a.side);
  if (helper) adv.push(`${s.units.find((u) => u.id === helper.source)?.name.split(" ")[0] ?? "an ally"} helps`);
  for (const c of GRANTS_ADVANTAGE_AGAINST) if (has(t, c)) adv.push(`target is ${c}`);
  if (t.hp <= 0 && !t.dead && !has(t, "Unconscious")) adv.push("target is down");
  if (has(t, "Prone")) (dist <= 5 ? adv : dis).push(dist <= 5 ? "target is Prone" : "Prone target at range");
  if (has(t, "Invisible")) dis.push("target is Invisible");
  if (t.dodging && canAct(t)) dis.push("target is Dodging");

  if (action.attackType === "ranged") {
    if (action.range && dist > action.range[0]) dis.push("long range");
    const adjacentFoe = s.units.some((u) => u.side !== a.side && canAct(u) && distanceFt(u.pos, a.pos) <= 5);
    if (adjacentFoe) dis.push("enemy within 5 ft");
  }

  for (const e of s.effects) {
    if (e.kind === "vex" && e.source === a.id && e.target === t.id) adv.push("Vex");
    if (e.kind === "sap" && e.target === a.id) dis.push("Sapped");
  }
  if (a.stats.features.includes("pack-tactics") && allyNear(s, a, t)) adv.push("Pack Tactics");
  if (s.effects.some((e) => e.kind === "guided" && e.target === t.id)) adv.push("Guiding Bolt");

  const advantage: Advantage = adv.length && !dis.length ? "adv" : dis.length && !adv.length ? "dis" : "normal";
  return { advantage, reasons: [...adv.map((r) => `+ ${r}`), ...dis.map((r) => `− ${r}`)] };
}

/** An ally of `a` (able to act) within 5 ft of `t`. */
const allyNear = (s: GameState, a: Unit, t: Unit) =>
  s.units.some((u) => u.id !== a.id && u.side === a.side && canAct(u) && distanceFt(u.pos, t.pos) <= 5);

// --- Engine ---------------------------------------------------------------------------

interface Ctx {
  s: Draft<GameState>;
  rng: Rng;
  events: GameEvent[];
}

const unit = (ctx: Ctx, id: string) => {
  const u = ctx.s.units.find((x) => x.id === id);
  if (!u) throw new GameError("Unknown creature");
  return u as Unit;
};

/** Bless adds 1d4 to the attack rolls and saving throws of its targets. */
const blessed = (ctx: Ctx, u: Unit) => ctx.s.effects.some((e) => e.kind === "bless" && e.target === u.id);

function d20(ctx: Ctx, bonus: number, advantage: Advantage = "normal", bless = false) {
  const terms: Term[] = [{ kind: "dice", sign: 1, count: 1, sides: 20 }];
  if (bless) terms.push({ kind: "dice", sign: 1, count: 1, sides: 4 });
  if (bonus) terms.push({ kind: "mod", sign: bonus < 0 ? -1 : 1, value: Math.abs(bonus) });
  return rollTerms(withAdvantage(terms, advantage), ctx.rng);
}

function checkOutcome(ctx: Ctx) {
  if (ctx.s.outcome) return;
  const alive = (side: Side) => ctx.s.units.some((u) => u.side === side && !u.dead && u.hp > 0);
  const goal = ctx.s.objective;
  const standing = ctx.s.units.filter((u) => u.side === "party" && !u.dead && u.hp > 0);
  const met =
    goal?.kind === "survive"
      ? ctx.s.round > goal.rounds
      : goal?.kind === "escape"
        ? standing.length > 0 && standing.every((u) => goal.cells.some((c) => sameCell(c, u.pos)))
        : false;
  const outcome = !alive("party") ? "defeat" : !alive("enemy") || met ? "victory" : null;
  if (outcome) {
    ctx.s.outcome = outcome;
    ctx.events.push({ type: "outcome", outcome });
  }
}

function addCondition(ctx: Ctx, u: Unit, condition: string) {
  if (has(u, condition) || u.stats.conditionImmunities.includes(condition)) return;
  u.conditions.push(condition);
  ctx.events.push({ type: "condition", targetId: u.id, condition, added: true });
}

function removeCondition(ctx: Ctx, u: Unit, condition: string) {
  if (!has(u, condition)) return;
  u.conditions = u.conditions.filter((c) => c !== condition);
  ctx.events.push({ type: "condition", targetId: u.id, condition, added: false });
}

function kill(ctx: Ctx, u: Unit) {
  u.dead = true;
  u.hp = 0;
  ctx.events.push({ type: "dead", unitId: u.id });
}

/**
 * Applies already-adjusted damage: temp HP first, then HP. Handles dropping
 * to 0 (monsters die, characters fall Unconscious), Undead Fortitude,
 * massive damage and death-save failures for damage while at 0 HP.
 */
function takeDamage(ctx: Ctx, u: Unit, amount: number, detail: string, opts: { crit?: boolean; types?: string[] } = {}) {
  if (amount <= 0 || u.dead) return;
  // Turned undead snap out of it when they take damage.
  if (has(u, "Turned")) removeCondition(ctx, u, "Turned");
  // Getting hurt gives a hidden creature away.
  if (has(u, "Hidden")) removeCondition(ctx, u, "Hidden");
  // Concentration: Con save DC 10 or half the damage, whichever is higher.
  if (u.concentration && u.hp > amount) {
    const dc = Math.max(10, Math.floor(amount / 2));
    const roll = d20(ctx, saveBonus(u.stats, "con"), "normal", blessed(ctx, u));
    const kept = roll.total >= dc;
    ctx.events.push({ type: "save", targetId: u.id, action: `Concentration (${u.concentration})`, ability: "Constitution", dc, roll, success: kept });
    if (!kept) dropConcentration(ctx, u);
  } else if (u.concentration) dropConcentration(ctx, u);
  const absorbed = Math.min(u.tempHp, amount);
  u.tempHp -= absorbed;
  let rest = amount - absorbed;

  if (u.hp <= 0) {
    ctx.events.push({ type: "damage", targetId: u.id, amount, detail, hp: 0 });
    if (rest >= u.hpMax) return kill(ctx, u);
    u.death.stable = false;
    u.death.failures += opts.crit ? 2 : 1;
    u.death.worst = Math.max(u.death.worst ?? 0, u.death.failures);
    if (u.death.failures >= 3) kill(ctx, u);
    return;
  }

  const before = u.hp;
  u.hp = Math.max(0, u.hp - rest);
  ctx.events.push({ type: "damage", targetId: u.id, amount, detail, hp: u.hp });
  if (u.hp > 0) return;
  rest -= before;

  if (u.side === "enemy") {
    // Undead Fortitude: Con save DC 5 + damage, unless Radiant or a crit.
    if (u.stats.features.includes("undead-fortitude") && !opts.crit && !opts.types?.includes("radiant")) {
      const dc = 5 + amount;
      const roll = d20(ctx, saveBonus(u.stats, "con"));
      const success = roll.total >= dc;
      ctx.events.push({ type: "fortitude", unitId: u.id, roll, dc, success });
      if (success) {
        u.hp = 1;
        return;
      }
    }
    return kill(ctx, u);
  }

  // Characters: massive damage kills outright, otherwise Unconscious.
  if (rest >= u.hpMax) return kill(ctx, u);
  u.death = { successes: 0, failures: 0, stable: false };
  ctx.events.push({ type: "down", unitId: u.id });
  addCondition(ctx, u, "Unconscious");
  addCondition(ctx, u, "Prone");
}

function dropConcentration(ctx: Ctx, u: Unit) {
  if (!u.concentration) return;
  ctx.events.push({ type: "feature", unitId: u.id, name: "Concentration lost", detail: u.concentration });
  u.concentration = null;
  ctx.s.effects = ctx.s.effects.filter((e) => !(e.kind === "bless" && e.source === u.id));
}

function heal(ctx: Ctx, u: Unit, amount: number) {
  if (u.dead || amount <= 0) return;
  const wasDown = u.hp <= 0;
  u.hp = Math.min(u.hpMax, u.hp + amount);
  ctx.events.push({ type: "heal", targetId: u.id, amount, hp: u.hp });
  if (wasDown) {
    u.death = { successes: 0, failures: 0, stable: false };
    removeCondition(ctx, u, "Unconscious");
  }
}

/** Counts down effects tied to this moment of `unitId`'s turn and drops finished ones. */
function tickEffects(ctx: Ctx, unitId: string, at: "start" | "end") {
  ctx.s.effects = ctx.s.effects.filter((e) => {
    if (e.expires.unit !== unitId || e.expires.at !== at) return true;
    e.expires.turns -= 1;
    return e.expires.turns > 0;
  });
}

function addEffect(ctx: Ctx, e: Omit<Effect, "id">) {
  // One of each kind per source/target pair: refresh rather than stack.
  ctx.s.effects = ctx.s.effects.filter((x) => !(x.kind === e.kind && x.source === e.source && x.target === e.target));
  ctx.s.effects.push({ ...e, id: `e${ctx.s.nextId++}` });
  ctx.events.push({ type: "effect", effect: e.kind, source: e.source, target: e.target });
}

const describeDamage = (d: { amount: number; type: string; adjustment: string | null }[]) =>
  d.map((x) => `${x.amount} ${x.type}${x.adjustment ? ` (${x.adjustment})` : ""}`).join(" + ");

/** Rolls one attack and applies everything that follows from it. */
function makeAttack(ctx: Ctx, a: Unit, t: Unit, action: AttackAction, opts: { opportunity?: boolean } = {}) {
  const { advantage, reasons } = attackAdvantage(ctx.s as GameState, a, t, action);
  const roll = d20(ctx, action.toHit, advantage, blessed(ctx, a));
  const dist = distanceFt(a.pos, t.pos);
  const autoCrit = dist <= 5 && AUTO_CRIT_WITHIN_5.some((c) => has(t, c));
  const natural = roll.natural;
  const cover = coverOf(ctx.s as GameState, a, t);
  const coverBonus = cover === "total" ? 5 : cover;
  if (coverBonus) reasons.push(`− ${COVER_NAME[coverBonus]} (+${coverBonus} AC)`);
  let ac = t.ac + coverBonus + (ctx.s.effects.some((e) => e.kind === "shield" && e.target === t.id) ? 5 : 0);
  let hit = natural === 20 || (natural !== 1 && roll.total >= ac);
  // Shield (reaction): +5 AC until the caster's next turn, if that turns the hit into a miss.
  if (hit && natural !== 20 && roll.total < ac + 5 && castShield(ctx, t)) {
    ac += 5;
    hit = false;
  }
  // Champion's Improved Critical: a 19 on the kept d20 also crits.
  const kept = roll.terms[0]?.kind === "dice" ? roll.terms[0].rolls.find((_, i) => (roll.terms[0] as { kept: boolean[] }).kept[i]) : undefined;
  const critRange = a.stats.features.includes("improved-critical") ? 19 : 20;
  const crit = hit && ((kept ?? 0) >= critRange || natural === 20 || autoCrit);
  ctx.events.push({ type: "attack", attackerId: a.id, targetId: t.id, action: action.name, roll, advantage, reasons, hit, crit, opportunity: opts.opportunity });

  // Advantage/disadvantage effects are used up by the attack.
  const usedHelp = ctx.s.effects.find((e) => e.kind === "help" && e.target === t.id && e.source !== a.id && ctx.s.units.find((u) => u.id === e.source)?.side === a.side);
  ctx.s.effects = ctx.s.effects.filter(
    (e) => !(e.kind === "vex" && e.source === a.id && e.target === t.id) && !(e.kind === "sap" && e.target === a.id) && !(e.kind === "guided" && e.target === t.id) && e !== usedHelp,
  );
  // Attacking gives a hidden creature away.
  if (has(a, "Hidden")) removeCondition(ctx, a, "Hidden");

  if (!hit) {
    // Evoker's Potent Cantrip: a missed cantrip still deals half damage.
    if (action.cantrip && a.stats.features.includes("potent-cantrip")) {
      const damage = rollDamage(action.damage, { ac: t.ac, stats: t.stats }, ctx.rng, false).map((d) => ({
        ...d,
        ...adjustDamage(Math.floor(d.roll.total / 2), d.type, t.stats),
      }));
      const total = damage.reduce((n, d) => n + d.amount, 0);
      ctx.events.push({ type: "feature", unitId: a.id, name: "Potent Cantrip", detail: `half damage on a miss` });
      takeDamage(ctx, t, total, describeDamage(damage), { types: damage.map((d) => d.type) });
      return;
    }
    // Graze: on a miss, deal damage equal to the attack's ability modifier.
    if (action.mastery === "graze" && action.damage[0]) {
      const mod = Math.max(0, action.toHit - a.stats.proficiency);
      const { amount, adjustment } = adjustDamage(mod, action.damage[0].type, t.stats);
      if (amount > 0) {
        ctx.events.push({ type: "feature", unitId: a.id, name: "Graze", detail: `${amount} ${action.damage[0].type} on a miss` });
        takeDamage(ctx, t, amount, `${amount} ${action.damage[0].type}${adjustment ? ` (${adjustment})` : ""}`, { types: [action.damage[0].type] });
      }
    }
    return;
  }

  let parts = [...action.damage];
  if (advantage === "adv" && action.extraDamageOnAdvantage) parts = [...parts, ...action.extraDamageOnAdvantage];

  // Sneak Attack: once per turn, finesse/ranged weapon, with Advantage or an
  // ally next to the target (and no Disadvantage).
  const isFinesse = action.finesse || action.attackType === "ranged";
  if (
    a.stats.features.includes("sneak-attack") &&
    !a.turn.sneakAttackUsed &&
    isFinesse &&
    advantage !== "dis" &&
    (advantage === "adv" || allyNear(ctx.s as GameState, a, t)) &&
    action.damage[0]
  ) {
    const dice = Math.ceil((a.stats.level ?? 1) / 2);
    parts.push({ dice: `${dice}d6`, type: action.damage[0].type });
    a.turn.sneakAttackUsed = true;
    ctx.events.push({ type: "feature", unitId: a.id, name: "Sneak Attack", detail: `+${dice}d6` });
  }

  const damage = rollDamage(parts, { ac: t.ac, stats: t.stats }, ctx.rng, crit);
  let total = damage.reduce((n, d) => n + d.amount, 0);
  // Uncanny Dodge (Rogue 5): a reaction halves the damage of an attack that hits.
  if (total > 0 && t.stats.features.includes("uncanny-dodge") && t.reaction && canAct(t)) {
    t.reaction = false;
    total = Math.floor(total / 2);
    ctx.events.push({ type: "feature", unitId: t.id, name: "Uncanny Dodge", detail: `damage halved to ${total}` });
  }
  takeDamage(ctx, t, total, describeDamage(damage), { crit, types: damage.map((d) => d.type) });

  if (action.onHitCondition && !t.dead && t.hp > 0) addCondition(ctx, t, action.onHitCondition);
  if (action.onHitEffect === "guided" && !t.dead) addEffect(ctx, { kind: "guided", source: a.id, target: t.id, expires: { unit: a.id, at: "end", turns: 2 } });

  // Weapon masteries that trigger on a hit.
  if (action.mastery === "vex" && total > 0) addEffect(ctx, { kind: "vex", source: a.id, target: t.id, expires: { unit: a.id, at: "end", turns: 2 } });
  if (action.mastery === "sap") addEffect(ctx, { kind: "sap", source: a.id, target: t.id, expires: { unit: a.id, at: "start", turns: 1 } });
  if (action.mastery === "slow" && total > 0) addEffect(ctx, { kind: "slow", source: a.id, target: t.id, expires: { unit: a.id, at: "start", turns: 1 } });
  checkOutcome(ctx);
}

function forceSave(ctx: Ctx, t: Unit, action: SaveAction, rolled?: ReturnType<typeof rollDamage>, coverBonus = 0) {
  const autoFail = (action.save === "str" || action.save === "dex") && AUTO_FAIL_STR_DEX.some((c) => has(t, c));
  const disadvantage: Advantage = action.save === "dex" && has(t, "Restrained") ? "dis" : t.dodging && action.save === "dex" && canAct(t) ? "adv" : "normal";
  const roll = d20(ctx, saveBonus(t.stats, action.save) + (action.save === "dex" ? coverBonus : 0), disadvantage, blessed(ctx, t));
  const success = !autoFail && roll.total >= action.dc;
  ctx.events.push({ type: "save", targetId: t.id, action: action.name, ability: ABILITY_NAMES[action.save], dc: action.dc, roll, success, autoFail });
  // Area spells roll their damage once for everyone caught in them.
  const raw = rolled ?? rollDamage(action.damage, { ac: t.ac, stats: null }, ctx.rng, false);
  const damage = raw.map((d) => {
    const base = success ? (action.onSuccess === "half" ? Math.floor(d.roll.total / 2) : 0) : d.roll.total;
    return { ...d, ...adjustDamage(base, d.type, t.stats) };
  });
  const total = damage.reduce((n, d) => n + d.amount, 0);
  takeDamage(ctx, t, total, describeDamage(damage), { types: damage.map((d) => d.type) });
  checkOutcome(ctx);
}

/** Shield: a reaction for creatures that know it, using a 1st-level slot. */
function castShield(ctx: Ctx, t: Unit): boolean {
  if (!t.stats.features.includes("shield-spell") || !t.reaction || !canAct(t) || (t.resources.slot1 ?? 0) <= 0) return false;
  t.reaction = false;
  t.resources.slot1! -= 1;
  addEffect(ctx, { kind: "shield", source: t.id, target: t.id, expires: { unit: t.id, at: "start", turns: 1 } });
  ctx.events.push({ type: "feature", unitId: t.id, name: "Shield", detail: "+5 AC until its next turn (reaction, 1st-level slot)" });
  return true;
}

/** Disciple of Life (Life Domain): healing spells restore 2 + the slot level extra. */
function castHeal(ctx: Ctx, caster: Unit, t: Unit, action: HealAction) {
  const roll = rollTerms(parseDice(action.dice), ctx.rng);
  const mod = action.ability ? abilityMod(caster.stats.abilities[action.ability]) : 0;
  const bonus = action.slot && caster.stats.features.includes("disciple-of-life") ? 2 + action.slot : 0;
  const amount = Math.max(1, roll.total + mod + bonus);
  ctx.events.push({ type: "feature", unitId: caster.id, name: action.name, detail: `${t.id === caster.id ? "self" : t.name}: ${roll.total}${mod ? ` + ${mod}` : ""}${bonus ? ` + ${bonus} (Disciple of Life)` : ""} = ${amount}` });
  heal(ctx, t, amount);
}

function castBuff(ctx: Ctx, caster: Unit, targets: Unit[], action: BuffAction) {
  if (action.concentration) {
    dropConcentration(ctx, caster);
    caster.concentration = action.name;
  }
  for (const t of targets) {
    if (action.buff === "bless") {
      ctx.s.effects.push({ id: `e${ctx.s.nextId++}`, kind: "bless", source: caster.id, target: t.id, expires: { unit: caster.id, at: "start", turns: 10 } });
      ctx.events.push({ type: "effect", effect: "bless", source: caster.id, target: t.id });
    } else {
      t.hpMax += 5;
      ctx.events.push({ type: "feature", unitId: t.id, name: action.name, detail: "+5 max HP" });
      heal(ctx, t, 5);
    }
  }
}

function castMissile(ctx: Ctx, caster: Unit, t: Unit, action: MissileAction) {
  if (castShield(ctx, t)) {
    ctx.events.push({ type: "feature", unitId: t.id, name: "Shield", detail: `blocks ${action.name}` });
    return;
  }
  const parts = Array.from({ length: action.darts }, () => ({ dice: action.dice, type: action.damageType }));
  const damage = rollDamage(parts, { ac: t.ac, stats: t.stats }, ctx.rng, false);
  const total = damage.reduce((n, d) => n + d.amount, 0);
  ctx.events.push({ type: "feature", unitId: caster.id, name: action.name, detail: `${action.darts} darts hit ${t.name}` });
  takeDamage(ctx, t, total, describeDamage(damage), { types: [action.damageType] });
  checkOutcome(ctx);
}

/** Squares covered by an area spell aimed at `point`. */
export function areaCells(s: GameState, casterId: string, action: StatAction, point: Cell): Cell[] {
  const caster = s.units.find((u) => u.id === casterId);
  if (!caster || action.kind !== "save" || !action.area) return [];
  const { shape, size } = action.area;
  const cells: Cell[] = [];
  if (shape === "cone") {
    // The cone starts at the caster; its width at any distance equals that distance.
    const dx = point.x - caster.pos.x;
    const dy = point.y - caster.pos.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];
    for (let y = 0; y < s.board.height; y++)
      for (let x = 0; x < s.board.width; x++) {
        const vx = x - caster.pos.x;
        const vy = y - caster.pos.y;
        const d = Math.hypot(vx, vy);
        if (d === 0 || distanceFt(caster.pos, { x, y }) > size) continue;
        const cos = (vx * dx + vy * dy) / (d * len);
        if (cos >= Math.cos(Math.atan(0.5)) - 0.02 && lineOfSight(s.board, caster.pos, { x, y })) cells.push({ x, y });
      }
  } else {
    for (let y = 0; y < s.board.height; y++)
      for (let x = 0; x < s.board.width; x++)
        if (distanceFt(point, { x, y }) <= size && lineOfSight(s.board, point, { x, y })) cells.push({ x, y });
  }
  return cells.filter((c) => !s.board.walls.includes(`${c.x},${c.y}`));
}

/** Can the caster aim this area spell here? */
export function checkArea(s: GameState, casterId: string, actionId: string, point: Cell): { ok: boolean; reason?: string } {
  const caster = s.units.find((u) => u.id === casterId);
  const action = caster?.stats.actions.find((a) => a.id === actionId);
  if (!caster || !action || action.kind !== "save" || !action.area) return { ok: false, reason: "Not an area spell" };
  if (action.slot && (caster.resources[`slot${action.slot}`] ?? 0) <= 0) return { ok: false, reason: `No level ${action.slot} spell slots left` };
  if (sameCell(point, caster.pos)) return { ok: false, reason: "Aim away from yourself" };
  if (action.area.shape === "sphere") {
    const range = action.range ?? 60;
    if (distanceFt(caster.pos, point) > range) return { ok: false, reason: `Out of range (max ${range} ft)` };
    if (!lineOfSight(s.board, caster.pos, point)) return { ok: false, reason: "No line of sight to that spot" };
  }
  return { ok: true };
}

/** The melee attack a creature uses for opportunity attacks: highest average damage. */
function bestMelee(u: Unit): AttackAction | undefined {
  const avg = (a: AttackAction) =>
    a.damage.reduce((n, p) => {
      try {
        return n + parseDice(p.dice).reduce((m, t) => m + (t.kind === "dice" ? (t.sign * t.count * (t.sides + 1)) / 2 : t.sign * t.value), 0);
      } catch {
        return n;
      }
    }, 0);
  return u.stats.actions
    .filter((x): x is AttackAction => x.kind === "attack" && x.attackType === "melee")
    .sort((x, y) => avg(y) - avg(x))[0];
}

/** Creatures that never break: the undead and the mindless. */
const FEARLESS = ["undead", "construct", "ooze", "plant"];

/**
 * Monsters lose heart: once half their side is down, a badly hurt one (or
 * any, if their strongest has fallen) must pass a DC 10 Wisdom save or flee.
 */
function moraleCheck(ctx: Ctx, u: Unit) {
  if (u.side !== "enemy" || u.hp <= 0 || has(u, "Fleeing") || FEARLESS.includes(u.stats.creatureType ?? "")) return;
  const side = ctx.s.units.filter((x) => x.side === "enemy");
  const lost = side.filter((x) => x.dead || x.hp <= 0).length;
  if (lost * 2 < side.length) return;
  const crOf = (x: Unit) => (x.stats.cr ? Number(eval_cr(x.stats.cr)) : 0);
  const strongest = [...side].sort((a, b) => crOf(b) - crOf(a))[0];
  const leaderDown = strongest && strongest.id !== u.id && (strongest.dead || strongest.hp <= 0);
  if (u.hp * 2 > u.hpMax && !leaderDown) return;
  const roll = d20(ctx, saveBonus(u.stats, "wis"));
  if (roll.total >= 10) {
    ctx.events.push({ type: "feature", unitId: u.id, name: "Morale", detail: `Wisdom ${roll.total} vs 10: holds its ground` });
    return;
  }
  addCondition(ctx, u, "Fleeing");
  ctx.events.push({ type: "feature", unitId: u.id, name: "Morale breaks", detail: `Wisdom ${roll.total} vs 10: it runs for it` });
}
const eval_cr = (cr: string) => (cr.includes("/") ? Number(cr.split("/")[0]) / Number(cr.split("/")[1]) : Number(cr));

export const onEdge = (s: GameState, c: Cell) => c.x === 0 || c.y === 0 || c.x === s.board.width - 1 || c.y === s.board.height - 1;

/** A skill check bonus: the stat block's skill if listed, else the ability modifier. */
function skillBonus(u: Unit, skill: string, ability: (typeof ABILITY_KEYS)[number]): number {
  return u.stats.skills[skill] ?? abilityMod(u.stats.abilities[ability]);
}
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** Shove and Grapple replace one attack of the Attack action. */
function useOneAttack(u: Unit) {
  const per = Math.max(1, u.stats.attacksPerAction ?? 1);
  if (u.turn.attacksLeft && u.turn.attacksLeft > 0 && u.turn.attacksLeft < per) {
    u.turn.attacksLeft -= 1;
    if (u.turn.attacksLeft <= 0) u.turn.action = false;
    return;
  }
  if (!u.turn.action) throw new GameError(`${u.name} has already used their action`);
  if (per > 1) u.turn.attacksLeft = per - 1;
  else u.turn.action = false;
}

/** Five feet straight away from the shover, if the square is free; else they're knocked Prone. */
function pushAway(ctx: Ctx, from: Unit, t: Unit) {
  const dest = { x: t.pos.x + Math.sign(t.pos.x - from.pos.x), y: t.pos.y + Math.sign(t.pos.y - from.pos.y) };
  const idx = makeBoardIndex(ctx.s.board);
  const inside = dest.x >= 0 && dest.y >= 0 && dest.x < ctx.s.board.width && dest.y < ctx.s.board.height;
  const taken = ctx.s.units.some((x) => !x.dead && sameCell(x.pos, dest));
  if (!inside || idx.isWall(dest) || taken) {
    addCondition(ctx, t, "Prone");
    return;
  }
  ctx.events.push({ type: "move", unitId: t.id, path: [dest], cost: 0 });
  t.pos = dest;
  releaseGrapple(ctx, t.id);
}

/** Lets go of a creature (it broke free, was shoved off, or its holder let go). */
function releaseGrapple(ctx: Ctx, targetId: string) {
  ctx.s.effects = ctx.s.effects.filter((e) => !(e.kind === "grapple" && e.target === targetId));
  const t = ctx.s.units.find((x) => x.id === targetId) as Unit | undefined;
  if (t && has(t, "Grappled")) removeCondition(ctx, t, "Grappled");
}

function moveUnit(ctx: Ctx, u: Unit, to: Cell) {
  if (SPEED_ZERO.some((c) => has(u, c))) throw new GameError(`${u.name} can't move`);
  // Standing up from Prone costs half your speed.
  if (has(u, "Prone") && u.turn.movement >= Math.ceil(u.speed / 2)) {
    u.turn.movement -= Math.ceil(u.speed / 2);
    removeCondition(ctx, u, "Prone");
    ctx.events.push({ type: "stand", unitId: u.id });
  }
  const found = findPath(ctx.s.board, u.pos, to, u.turn.movement, pathOptions(ctx.s as GameState, u));
  if (!found) throw new GameError("Can't reach that square");

  const idx = makeBoardIndex(ctx.s.board);
  const mult = has(u, "Prone") ? 2 : 1;
  const travelled: Cell[] = [];
  let spent = 0;
  let from = u.pos;
  for (const step of found.path) {
    // Opportunity attacks from every enemy whose reach this step leaves.
    if (!u.turn.disengaged) {
      for (const e of ctx.s.units as Unit[]) {
        if (e.side === u.side || !canAct(e) || !e.reaction) continue;
        const weapon = bestMelee(e);
        if (!weapon) continue;
        if (distanceFt(e.pos, from) <= weapon.reach && distanceFt(e.pos, step) > weapon.reach) {
          e.reaction = false;
          makeAttack(ctx, e, u, weapon, { opportunity: true });
          if (u.hp <= 0 || u.dead) break;
        }
      }
      if (u.hp <= 0 || u.dead) break;
    }
    travelled.push(step);
    spent += (idx.isDifficult(step) ? 2 : 1) * FEET_PER_CELL * mult;
    from = step;
    u.pos = { ...step };
  }
  u.turn.movement = Math.max(0, u.turn.movement - spent);
  ctx.events.push({ type: "move", unitId: u.id, path: travelled, cost: spent });
  // Walking off lets go of whoever you were holding.
  for (const e of [...ctx.s.effects]) if (e.kind === "grapple" && e.source === u.id && distanceFt(u.pos, unit(ctx, e.target).pos) > 5) releaseGrapple(ctx, e.target);
}

function retreat(ctx: Ctx, u: Unit) {
  if (u.side !== "party") throw new GameError("Only the party can retreat");
  ctx.events.push({ type: "feature", unitId: u.id, name: "Retreat", detail: "the party falls back, carrying the wounded" });
  for (const h of ctx.s.units as Unit[]) {
    if (h.side !== "party" || h.dead || h.hp <= 0) continue;
    for (const e of ctx.s.units as Unit[]) {
      if (e.side === h.side || !canAct(e) || !e.reaction || h.hp <= 0) continue;
      const weapon = bestMelee(e);
      if (!weapon || distanceFt(e.pos, h.pos) > weapon.reach) continue;
      e.reaction = false;
      makeAttack(ctx, e, h, weapon, { opportunity: true });
    }
  }
  ctx.s.fled = true;
  if (!ctx.s.outcome) {
    ctx.s.outcome = "defeat";
    ctx.events.push({ type: "outcome", outcome: "defeat" });
  }
}

function startTurn(ctx: Ctx) {
  const s = ctx.s;
  for (let guard = 0; guard < s.units.length * 2 + 2; guard++) {
    if (s.outcome) return;
    const u = s.units[s.turnIndex] as Unit;
    // Effects that last "until the start of X's next turn".
    tickEffects(ctx, u.id, "start");

    if (u.dead) {
      advance(ctx);
      continue;
    }
    ctx.events.push({ type: "turn", unitId: u.id });
    // A holder who went down or wandered off has let go.
    const hold = s.effects.find((e) => e.kind === "grapple" && e.target === u.id);
    const holder = hold ? (s.units.find((x) => x.id === hold.source) as Unit | undefined) : undefined;
    if (hold && (!holder || !canAct(holder) || distanceFt(holder.pos, u.pos) > 5)) releaseGrapple(ctx, u.id);
    u.reaction = true;
    u.dodging = false;
    moraleCheck(ctx, u);
    const slowed = s.effects.some((e) => e.kind === "slow" && e.target === u.id) ? 10 : 0;
    u.turn = { movement: Math.max(0, u.speed - slowed), action: true, bonusAction: true, disengaged: false, sneakAttackUsed: false };

    if (u.hp <= 0) {
      // A dying hero's turn waits for their death save.
      if (u.side === "party" && !u.death.stable) {
        u.turn.needsDeathSave = true;
        return;
      }
      if (u.hp <= 0) {
        // Can't act at 0 HP: the turn passes.
        endOfTurn(ctx, u);
        advance(ctx);
        continue;
      }
    }
    return;
  }
}

function deathSave(ctx: Ctx, u: Unit) {
  const roll = d20(ctx, 0);
  const n = roll.natural ?? roll.total;
  let result: "success" | "failure" | "stable" | "dead" | "revived";
  if (roll.natural === 20) {
    result = "revived";
  } else if (n === 1) {
    u.death.failures += 2;
    result = u.death.failures >= 3 ? "dead" : "failure";
  } else if (roll.total >= 10) {
    u.death.successes += 1;
    result = u.death.successes >= 3 ? "stable" : "success";
  } else {
    u.death.failures += 1;
    result = u.death.failures >= 3 ? "dead" : "failure";
  }
  u.death.worst = Math.max(u.death.worst ?? 0, u.death.failures);
  ctx.events.push({ type: "death-save", unitId: u.id, roll, successes: u.death.successes, failures: u.death.failures, result });
  if (result === "revived") heal(ctx, u, 1);
  if (result === "stable") u.death.stable = true;
  if (result === "dead") kill(ctx, u);
  checkOutcome(ctx);
}

function endOfTurn(ctx: Ctx, u: Unit) {
  tickEffects(ctx, u.id, "end");
}

function advance(ctx: Ctx) {
  const s = ctx.s;
  s.turnIndex = (s.turnIndex + 1) % s.units.length;
  if (s.turnIndex === 0) {
    s.round += 1;
    ctx.events.push({ type: "round", round: s.round });
    // Holding out long enough wins the day.
    checkOutcome(ctx);
  }
}

function spendSpell(u: Unit, action: StatAction, cost: "action" | "bonusAction") {
  u.turn[cost] = false;
  if (action.slot) u.resources[`slot${action.slot}`]! -= 1;
}

function spend(u: Unit, kind: "action" | "bonusAction") {
  if (!u.turn[kind]) throw new GameError(kind === "action" ? `${u.name} has already used their action` : `${u.name} has already used their bonus action`);
  u.turn[kind] = false;
}

function run(ctx: Ctx, cmd: Command) {
  const s = ctx.s;
  if (s.outcome) throw new GameError("The battle is over");
  const u = currentUnit(s as GameState) as Unit | undefined;
  if (!u || u.id !== cmd.unitId) throw new GameError("It's not that creature's turn");
  if (cmd.type === "retreat") return retreat(ctx, u);
  if (u.turn.needsDeathSave && cmd.type !== "death-save" && cmd.type !== "end-turn") throw new GameError(`${u.name} is dying: roll the death save`);
  if (cmd.type !== "end-turn" && cmd.type !== "death-save" && !canAct(u)) throw new GameError(`${u.name} can't act`);

  switch (cmd.type) {
    case "move":
      moveUnit(ctx, u, cmd.to);
      return;
    case "action": {
      const action: StatAction | undefined = u.stats.actions.find((a) => a.id === cmd.actionId);
      if (!action) throw new GameError("Unknown action");
      // Casting or striking gives a hidden creature away (attacks do it after the roll).
      if (action.kind !== "attack" && has(u, "Hidden")) removeCondition(ctx, u, "Hidden");
      const cost = action.bonusAction ? "bonusAction" : "action";
      if (!u.turn[cost]) throw new GameError(`${u.name} has already used their ${action.bonusAction ? "bonus action" : "action"}`);
      if (action.slot && (u.resources[`slot${action.slot}`] ?? 0) <= 0) throw new GameError(`No level ${action.slot} spell slots left`);

      if (action.kind === "save" && action.area) {
        if (!cmd.point) throw new GameError("Pick a square to aim at");
        const ok = checkArea(s as GameState, u.id, action.id, cmd.point);
        if (!ok.ok) throw new GameError(ok.reason);
        const cells = areaCells(s as GameState, u.id, action, cmd.point);
        spendSpell(u, action, cost);
        ctx.events.push({ type: "feature", unitId: u.id, name: action.name, detail: `${action.area.size}-ft ${action.area.shape}` });
        const rolled = rollDamage(action.damage, { ac: 10, stats: null }, ctx.rng, false);
        for (const t of ctx.s.units as Unit[]) {
          if (t.dead || t.id === u.id || !cells.some((c) => sameCell(c, t.pos))) continue;
          forceSave(ctx, t, action, rolled);
        }
        return;
      }

      if (action.kind === "buff") {
        const ids = cmd.targetIds ?? (cmd.targetId ? [cmd.targetId] : []);
        if (ids.length === 0) throw new GameError("Choose who to help");
        if (ids.length > action.targets) throw new GameError(`${action.name} affects at most ${action.targets} creatures`);
        for (const id of ids) {
          const check = checkTarget(s as GameState, u.id, action.id, id);
          if (!check.ok) throw new GameError(check.reason);
        }
        spendSpell(u, action, cost);
        castBuff(ctx, u, ids.map((id) => unit(ctx, id)), action);
        return;
      }

      if (action.kind === "heal" && (action.targets ?? 1) > 1) {
        const ids = cmd.targetIds ?? (cmd.targetId ? [cmd.targetId] : []);
        if (ids.length === 0) throw new GameError("Choose who to heal");
        if (ids.length > (action.targets ?? 1)) throw new GameError(`${action.name} heals at most ${action.targets} creatures`);
        for (const id of ids) {
          const check = checkTarget(s as GameState, u.id, action.id, id);
          if (!check.ok) throw new GameError(check.reason);
        }
        spendSpell(u, action, cost);
        for (const id of ids) castHeal(ctx, u, unit(ctx, id), action);
        return;
      }

      if (!cmd.targetId) throw new GameError("Choose a target");
      const check = checkTarget(s as GameState, u.id, cmd.actionId, cmd.targetId);
      if (!check.ok) throw new GameError(check.reason);
      // Extra Attack / Multiattack: the action lasts until every attack is made.
      const perAction = u.stats.attacksPerAction ?? 1;
      if (action.kind === "attack" && cost === "action" && !action.slot && !action.cantrip && perAction > 1) {
        const left = (u.turn.attacksLeft || perAction) - 1;
        u.turn.attacksLeft = left;
        if (left <= 0) u.turn.action = false;
      } else spendSpell(u, action, cost);
      const t = unit(ctx, cmd.targetId);
      if (action.kind === "attack") makeAttack(ctx, u, t, action);
      else if (action.kind === "save") {
        const c = coverOf(ctx.s as GameState, u, t);
        forceSave(ctx, t, action, undefined, c === "total" ? 5 : c);
      }
      else if (action.kind === "heal") castHeal(ctx, u, t, action);
      else if (action.kind === "missile") castMissile(ctx, u, t, action);
      return;
    }
    case "dash":
      if (cmd.bonus) {
        if (!u.stats.features.includes("cunning-action")) throw new GameError(`${u.name} can't Dash as a bonus action`);
        spend(u, "bonusAction");
      } else spend(u, "action");
      u.turn.movement += u.speed;
      ctx.events.push({ type: "feature", unitId: u.id, name: cmd.bonus ? "Cunning Action: Dash" : "Dash", detail: `+${u.speed} ft movement` });
      return;
    case "disengage": {
      const via = u.stats.features.includes("nimble-escape") ? "Nimble Escape" : u.stats.features.includes("cunning-action") ? "Cunning Action" : null;
      if (cmd.bonus) {
        if (!via) throw new GameError(`${u.name} can't Disengage as a bonus action`);
        spend(u, "bonusAction");
      } else spend(u, "action");
      u.turn.disengaged = true;
      ctx.events.push({ type: "feature", unitId: u.id, name: cmd.bonus ? `${via}: Disengage` : "Disengage", detail: "no opportunity attacks this turn" });
      return;
    }
    case "action-surge":
      if (!u.stats.features.includes("action-surge") || (u.resources["action-surge"] ?? 0) <= 0) throw new GameError("No Action Surge left");
      if (u.turn.action) throw new GameError("Use your action first, then surge for another");
      u.resources["action-surge"]! -= 1;
      u.turn.action = true;
      ctx.events.push({ type: "feature", unitId: u.id, name: "Action Surge", detail: "one more action this turn" });
      return;
    case "turn-undead": {
      if (!u.stats.features.includes("turn-undead") || (u.resources["channel-divinity"] ?? 0) <= 0) throw new GameError("No Channel Divinity left");
      spend(u, "action");
      u.resources["channel-divinity"]! -= 1;
      const dc = 8 + u.stats.proficiency + abilityMod(u.stats.abilities.wis);
      ctx.events.push({ type: "feature", unitId: u.id, name: "Turn Undead", detail: `Wisdom save DC ${dc} for undead within 30 ft` });
      for (const t of ctx.s.units as Unit[]) {
        if (t.side === u.side || t.dead || t.hp <= 0 || t.stats.creatureType !== "undead" || distanceFt(u.pos, t.pos) > 30) continue;
        const roll = d20(ctx, saveBonus(t.stats, "wis"));
        const success = roll.total >= dc;
        ctx.events.push({ type: "save", targetId: t.id, action: "Turn Undead", ability: "Wisdom", dc, roll, success });
        if (!success) addCondition(ctx, t, "Turned");
      }
      return;
    }
    case "use-potion": {
      const potion = POTIONS[cmd.itemId];
      if (!potion || (s.stash?.[cmd.itemId] ?? 0) <= 0) throw new GameError("No potion of that kind left");
      const t = unit(ctx, cmd.targetId);
      if (t.side !== u.side || t.dead) throw new GameError("Potions are for your allies");
      if (distanceFt(u.pos, t.pos) > 5) throw new GameError(`${t.name} is too far away to hand a potion to`);
      spend(u, "bonusAction");
      s.stash![cmd.itemId]! -= 1;
      const roll = rollTerms(parseDice(potion.dice), ctx.rng);
      ctx.events.push({ type: "feature", unitId: u.id, name: potion.name, detail: `${t.id === u.id ? "drinks" : `gives it to ${t.name}`}: ${roll.expression} = ${roll.total}` });
      heal(ctx, t, roll.total);
      return;
    }
    case "help": {
      const t = unit(ctx, cmd.targetId);
      if (t.side === u.side || t.dead || t.hp <= 0) throw new GameError("Help against an enemy that's still fighting");
      if (distanceFt(u.pos, t.pos) > 5) throw new GameError(`${t.name} is more than 5 ft away`);
      spend(u, "action");
      addEffect(ctx, { kind: "help", source: u.id, target: t.id, expires: { unit: u.id, at: "start", turns: 1 } });
      ctx.events.push({ type: "feature", unitId: u.id, name: "Help", detail: `the next ally to attack ${t.name} has Advantage` });
      return;
    }
    case "hide": {
      if (cmd.bonus) {
        if (!u.stats.features.includes("cunning-action")) throw new GameError(`${u.name} can't Hide as a bonus action`);
        spend(u, "bonusAction");
      } else spend(u, "action");
      const seenBy = ctx.s.units.filter((e) => e.side !== u.side && !e.dead && canAct(e as Unit)).find((e) => {
        const c = coverOf(ctx.s as GameState, e as Unit, u);
        return c !== "total" && c < 5;
      });
      if (seenBy) {
        ctx.events.push({ type: "feature", unitId: u.id, name: "Hide", detail: `can't: ${seenBy.name} can see them (needs three-quarters cover or more)` });
        return;
      }
      const roll = d20(ctx, skillBonus(u, "Stealth", "dex"));
      const ok = roll.total >= 15;
      ctx.events.push({ type: "feature", unitId: u.id, name: "Hide", detail: `Stealth ${roll.total} vs 15: ${ok ? "hidden" : "spotted"}` });
      if (ok) addCondition(ctx, u, "Hidden");
      return;
    }
    case "shove":
    case "grapple": {
      const t = unit(ctx, cmd.targetId);
      if (t.side === u.side || t.dead) throw new GameError("Pick an enemy");
      if (distanceFt(u.pos, t.pos) > 5) throw new GameError(`${t.name} is more than 5 ft away`);
      useOneAttack(u);
      const dc = 8 + abilityMod(u.stats.abilities.str) + u.stats.proficiency;
      const ability = saveBonus(t.stats, "dex") > saveBonus(t.stats, "str") ? "dex" : "str";
      const autoFail = AUTO_FAIL_STR_DEX.some((c) => has(t, c)) || t.hp <= 0;
      const roll = d20(ctx, saveBonus(t.stats, ability));
      const success = !autoFail && roll.total >= dc;
      const what = cmd.type === "grapple" ? "Grapple" : cmd.prone ? "Shove (Prone)" : "Shove (push)";
      ctx.events.push({ type: "save", targetId: t.id, action: what, ability: ABILITY_NAMES[ability], dc, roll, success, autoFail });
      if (success) return;
      if (cmd.type === "grapple") {
        addCondition(ctx, t, "Grappled");
        addEffect(ctx, { kind: "grapple", source: u.id, target: t.id, expires: { unit: u.id, at: "end", turns: 1000 } });
      } else if (cmd.prone) addCondition(ctx, t, "Prone");
      else pushAway(ctx, u, t);
      return;
    }
    case "flee": {
      if (!onEdge(ctx.s as GameState, u.pos)) throw new GameError(`${u.name} isn't at the edge of the field`);
      u.fled = true;
      u.dead = true;
      releaseGrapple(ctx, u.id);
      ctx.events.push({ type: "feature", unitId: u.id, name: "Flees", detail: "runs off the field" });
      endOfTurn(ctx, u);
      advance(ctx);
      startTurn(ctx);
      return;
    }
    case "escape": {
      if (!has(u, "Grappled")) throw new GameError(`${u.name} isn't grappled`);
      spend(u, "action");
      const holder = ctx.s.effects.find((e) => e.kind === "grapple" && e.target === u.id);
      const g = holder ? (ctx.s.units.find((x) => x.id === holder.source) as Unit | undefined) : undefined;
      const dc = g ? 8 + abilityMod(g.stats.abilities.str) + g.stats.proficiency : 10;
      const best = Math.max(skillBonus(u, "Athletics", "str"), skillBonus(u, "Acrobatics", "dex"));
      const roll = d20(ctx, best);
      const ok = roll.total >= dc;
      ctx.events.push({ type: "feature", unitId: u.id, name: "Escape", detail: `${roll.total} vs DC ${dc}: ${ok ? "breaks free" : "still held"}` });
      if (ok) releaseGrapple(ctx, u.id);
      return;
    }
    case "dodge":
      spend(u, "action");
      u.dodging = true;
      ctx.events.push({ type: "feature", unitId: u.id, name: "Dodge", detail: "attacks against it have Disadvantage" });
      return;
    case "second-wind": {
      if (!u.stats.features.includes("second-wind") || (u.resources["second-wind"] ?? 0) <= 0) throw new GameError("No Second Wind left");
      spend(u, "bonusAction");
      u.resources["second-wind"]! -= 1;
      const roll = rollTerms([{ kind: "dice", sign: 1, count: 1, sides: 10 }, { kind: "mod", sign: 1, value: u.stats.level ?? 1 }], ctx.rng);
      ctx.events.push({ type: "feature", unitId: u.id, name: "Second Wind", detail: `${roll.expression} = ${roll.total}` });
      heal(ctx, u, roll.total);
      return;
    }
    case "stand-up":
      if (!has(u, "Prone")) throw new GameError(`${u.name} isn't Prone`);
      if (u.turn.movement < Math.ceil(u.speed / 2)) throw new GameError("Not enough movement left to stand up");
      u.turn.movement -= Math.ceil(u.speed / 2);
      removeCondition(ctx, u, "Prone");
      ctx.events.push({ type: "stand", unitId: u.id });
      return;
    case "death-save": {
      if (!u.turn.needsDeathSave) throw new GameError(`${u.name} isn't dying`);
      u.turn.needsDeathSave = false;
      deathSave(ctx, u);
      if (u.hp > 0 || ctx.s.outcome) return;
      // Still down: the turn passes.
      endOfTurn(ctx, u);
      advance(ctx);
      startTurn(ctx);
      return;
    }
    case "end-turn":
      // Ending the turn doesn't skip the death save.
      if (u.turn.needsDeathSave) {
        u.turn.needsDeathSave = false;
        deathSave(ctx, u);
        if (ctx.s.outcome) return;
      }
      endOfTurn(ctx, u);
      advance(ctx);
      startTurn(ctx);
      return;
  }
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Applies one command. Throws GameError (state unchanged) if it isn't
 * allowed. Pass `rng` only in tests; normally the stored seed is used.
 */
export function apply(state: GameState, cmd: Command, opts: { rng?: Rng } = {}): ApplyResult {
  const events: GameEvent[] = [];
  const seeded = mulberry32(state.rngSeed);
  const next = produce(state, (draft) => {
    const ctx: Ctx = { s: draft, rng: opts.rng ?? seeded.rng, events };
    run(ctx, cmd);
    // Whatever happened (a kill by Graze, an opportunity attack, a failed
    // death save…), check for victory/defeat after every command.
    checkOutcome(ctx);
    if (!opts.rng) draft.rngSeed = seeded.seed();
  });
  return { state: next, events };
}

// --- Setup --------------------------------------------------------------------------

export interface UnitSetup {
  id: string;
  name: string;
  side: Side;
  image?: string | null;
  stats: Unit["stats"];
  ac: number;
  /** Current HP (carried over between fights in an adventure). */
  hp: number;
  /** Defaults to `hp`. */
  hpMax?: number;
  speed: number;
  pos: Cell;
  /** Remaining uses of limited features; defaults to full. */
  resources?: Record<string, number>;
}

/** Full uses of each limited feature a creature has. */
export function defaultResources(stats: Unit["stats"]): Record<string, number> {
  const r: Record<string, number> = {};
  if (stats.features.includes("second-wind")) r["second-wind"] = 2;
  if (stats.features.includes("action-surge")) r["action-surge"] = 1;
  if (stats.features.includes("turn-undead")) r["channel-divinity"] = 2;
  if (stats.features.includes("arcane-recovery")) r["arcane-recovery"] = 1;
  stats.spellSlots.forEach((n, i) => {
    if (n > 0) r[`slot${i + 1}`] = n;
  });
  return r;
}

export interface GameOptions {
  /** What winning means here, besides beating every foe. */
  objective?: Objective;
  /** This side was caught off guard: Disadvantage on initiative (2024). */
  surprised?: Side;
  /** Party consumables available in the fight. */
  stash?: Record<string, number>;
}

/** Rolls initiative (d20 + Dex, ties to higher Dex) and starts round 1. */
export function createGame(board: Board, setups: UnitSetup[], seed: number, opts: GameOptions = {}): ApplyResult {
  const seeded = mulberry32(seed);
  const events: GameEvent[] = [];
  const units: Unit[] = setups.map((x) => {
    const dex = abilityMod(x.stats.abilities.dex);
    const d20 = () => Math.floor(seeded.rng() * 20) + 1;
    const roll = opts.surprised === x.side ? Math.min(d20(), d20()) : d20();
    const init = roll + dex;
    return {
      id: x.id,
      name: x.name,
      side: x.side,
      image: x.image ?? null,
      stats: x.stats,
      ac: x.ac,
      hp: x.hp,
      hpMax: x.hpMax ?? x.hp,
      tempHp: 0,
      speed: x.speed,
      pos: { ...x.pos },
      initiative: init,
      conditions: [],
      dead: false,
      death: { successes: 0, failures: 0, stable: false },
      turn: { movement: x.speed, action: true, bonusAction: true, disengaged: false, sneakAttackUsed: false },
      reaction: true,
      dodging: false,
      concentration: null,
      resources: { ...defaultResources(x.stats), ...x.resources },
    };
  });
  units.sort((a, b) => b.initiative - a.initiative || b.stats.abilities.dex - a.stats.abilities.dex);
  const initial: GameState = { board, units, turnIndex: 0, round: 1, effects: [], rngSeed: seeded.seed(), outcome: null, nextId: 1, stash: { ...opts.stash }, ...(opts.objective ? { objective: opts.objective } : {}) };
  const state = produce(initial, (draft) => {
    events.push({ type: "round", round: 1 });
    const ctx: Ctx = { s: draft, rng: mulberry32(draft.rngSeed).rng, events };
    startTurn(ctx);
  });
  return { state, events };
}

/** Builds a board from ASCII rows: "#" wall, "~" difficult terrain, anything else open. */
export function boardFromAscii(rows: string[]): Board {
  const walls: string[] = [];
  const difficult: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "#") walls.push(`${x},${y}`);
      if (ch === "~") difficult.push(`${x},${y}`);
    }),
  );
  return { width: Math.max(...rows.map((r) => r.length)), height: rows.length, walls, difficult };
}
