import { produce, type Draft } from "immer";
import { adjustDamage, rollDamage, type Advantage } from "../domain/attack";
import { parseDice, rollTerms, withAdvantage, type Rng, type Term } from "../domain/dice";
import { ABILITY_NAMES, abilityMod, saveBonus, type AttackAction, type SaveAction, type StatAction } from "../domain/statblock";
import { FEET_PER_CELL, distanceFt, findPath, lineOfSight, makeBoardIndex, reachableCells, sameCell, type Board, type Cell } from "./board";
import { mulberry32 } from "./rng";
import { GameError, type Effect, type GameEvent, type GameState, type Side, type Unit } from "./state";

/**
 * The rules engine: `apply(state, command)` validates a command for the
 * creature whose turn it is, resolves it under the 2024 rules and returns
 * the new state plus everything that happened. Pure and deterministic: all
 * randomness comes from the seed stored in the state.
 */

export type Command =
  | { type: "move"; unitId: string; to: Cell }
  | { type: "action"; unitId: string; actionId: string; targetId: string }
  | { type: "dash"; unitId: string }
  | { type: "disengage"; unitId: string; bonus?: boolean }
  | { type: "dodge"; unitId: string }
  | { type: "second-wind"; unitId: string }
  | { type: "stand-up"; unitId: string }
  | { type: "end-turn"; unitId: string };

// --- Rules tables --------------------------------------------------------------

const INCAPACITATING = ["Incapacitated", "Paralyzed", "Petrified", "Stunned", "Unconscious"];
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
}

/** Can `attacker` use `action` on `target` right now, and with what advantage? */
export function checkTarget(s: GameState, attackerId: string, actionId: string, targetId: string): TargetCheck {
  const a = s.units.find((u) => u.id === attackerId);
  const t = s.units.find((u) => u.id === targetId);
  const action = a?.stats.actions.find((x) => x.id === actionId);
  const no = (reason: string): TargetCheck => ({ ok: false, reason, advantage: "normal", reasons: [] });
  if (!a || !t || !action) return no("Unknown creature or action");
  if (t.dead) return no(`${t.name} is dead`);
  if (a.id === t.id) return no("Can't target yourself");
  const dist = distanceFt(a.pos, t.pos);
  if (action.kind === "attack") {
    const max = action.attackType === "melee" ? action.reach : (action.range?.[1] ?? 5);
    if (dist > max) return no(`${t.name} is out of range (${dist} ft, max ${max} ft)`);
  }
  if (!lineOfSight(s.board, a.pos, t.pos)) return no(`No line of sight to ${t.name}`);
  const { advantage, reasons } = action.kind === "attack" ? attackAdvantage(s, a, t, action) : { advantage: "normal" as Advantage, reasons: [] };
  return { ok: true, advantage, reasons };
}

// --- Advantage ----------------------------------------------------------------------

function attackAdvantage(s: GameState, a: Unit, t: Unit, action: AttackAction): { advantage: Advantage; reasons: string[] } {
  const adv: string[] = [];
  const dis: string[] = [];
  const dist = distanceFt(a.pos, t.pos);

  for (const c of ["Blinded", "Poisoned", "Prone", "Restrained", "Frightened"]) if (has(a, c)) dis.push(`you are ${c}`);
  if (has(a, "Invisible")) adv.push("you are Invisible");
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

function d20(ctx: Ctx, bonus: number, advantage: Advantage = "normal") {
  const terms: Term[] = [{ kind: "dice", sign: 1, count: 1, sides: 20 }];
  if (bonus) terms.push({ kind: "mod", sign: bonus < 0 ? -1 : 1, value: Math.abs(bonus) });
  return rollTerms(withAdvantage(terms, advantage), ctx.rng);
}

function checkOutcome(ctx: Ctx) {
  if (ctx.s.outcome) return;
  const alive = (side: Side) => ctx.s.units.some((u) => u.side === side && !u.dead && u.hp > 0);
  const outcome = !alive("enemy") ? "victory" : !alive("party") ? "defeat" : null;
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
  const absorbed = Math.min(u.tempHp, amount);
  u.tempHp -= absorbed;
  let rest = amount - absorbed;

  if (u.hp <= 0) {
    ctx.events.push({ type: "damage", targetId: u.id, amount, detail, hp: 0 });
    if (rest >= u.hpMax) return kill(ctx, u);
    u.death.stable = false;
    u.death.failures += opts.crit ? 2 : 1;
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
  const roll = d20(ctx, action.toHit, advantage);
  const dist = distanceFt(a.pos, t.pos);
  const autoCrit = dist <= 5 && AUTO_CRIT_WITHIN_5.some((c) => has(t, c));
  const natural = roll.natural;
  const hit = natural === 20 || (natural !== 1 && roll.total >= t.ac);
  const crit = hit && (natural === 20 || autoCrit);
  ctx.events.push({ type: "attack", attackerId: a.id, targetId: t.id, action: action.name, roll, advantage, reasons, hit, crit, opportunity: opts.opportunity });

  // Advantage/disadvantage effects are used up by the attack.
  ctx.s.effects = ctx.s.effects.filter((e) => !(e.kind === "vex" && e.source === a.id && e.target === t.id) && !(e.kind === "sap" && e.target === a.id));

  if (!hit) {
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
  const total = damage.reduce((n, d) => n + d.amount, 0);
  takeDamage(ctx, t, total, describeDamage(damage), { crit, types: damage.map((d) => d.type) });

  if (action.onHitCondition && !t.dead && t.hp > 0) addCondition(ctx, t, action.onHitCondition);

  // Weapon masteries that trigger on a hit.
  if (action.mastery === "vex" && total > 0) addEffect(ctx, { kind: "vex", source: a.id, target: t.id, expires: { unit: a.id, at: "end", turns: 2 } });
  if (action.mastery === "sap") addEffect(ctx, { kind: "sap", source: a.id, target: t.id, expires: { unit: a.id, at: "start", turns: 1 } });
  if (action.mastery === "slow" && total > 0) addEffect(ctx, { kind: "slow", source: a.id, target: t.id, expires: { unit: a.id, at: "start", turns: 1 } });
  checkOutcome(ctx);
}

function forceSave(ctx: Ctx, t: Unit, action: SaveAction) {
  const autoFail = (action.save === "str" || action.save === "dex") && AUTO_FAIL_STR_DEX.some((c) => has(t, c));
  const disadvantage: Advantage = action.save === "dex" && has(t, "Restrained") ? "dis" : t.dodging && action.save === "dex" && canAct(t) ? "adv" : "normal";
  const roll = d20(ctx, saveBonus(t.stats, action.save), disadvantage);
  const success = !autoFail && roll.total >= action.dc;
  ctx.events.push({ type: "save", targetId: t.id, action: action.name, ability: ABILITY_NAMES[action.save], dc: action.dc, roll, success, autoFail });
  const raw = rollDamage(action.damage, { ac: t.ac, stats: null }, ctx.rng, false);
  const damage = raw.map((d) => {
    const base = success ? (action.onSuccess === "half" ? Math.floor(d.roll.total / 2) : 0) : d.roll.total;
    return { ...d, ...adjustDamage(base, d.type, t.stats) };
  });
  const total = damage.reduce((n, d) => n + d.amount, 0);
  takeDamage(ctx, t, total, describeDamage(damage), { types: damage.map((d) => d.type) });
  checkOutcome(ctx);
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
    u.reaction = true;
    u.dodging = false;
    const slowed = s.effects.some((e) => e.kind === "slow" && e.target === u.id) ? 10 : 0;
    u.turn = { movement: Math.max(0, u.speed - slowed), action: true, bonusAction: true, disengaged: false, sneakAttackUsed: false };

    if (u.hp <= 0) {
      if (u.side === "party" && !u.death.stable) deathSave(ctx, u);
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
  }
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
  if (cmd.type !== "end-turn" && !canAct(u)) throw new GameError(`${u.name} can't act`);

  switch (cmd.type) {
    case "move":
      moveUnit(ctx, u, cmd.to);
      return;
    case "action": {
      const action: StatAction | undefined = u.stats.actions.find((a) => a.id === cmd.actionId);
      if (!action) throw new GameError("Unknown action");
      const check = checkTarget(s as GameState, u.id, cmd.actionId, cmd.targetId);
      if (!check.ok) throw new GameError(check.reason);
      spend(u, "action");
      const t = unit(ctx, cmd.targetId);
      if (action.kind === "attack") makeAttack(ctx, u, t, action);
      else forceSave(ctx, t, action);
      return;
    }
    case "dash":
      spend(u, "action");
      u.turn.movement += u.speed;
      ctx.events.push({ type: "feature", unitId: u.id, name: "Dash", detail: `+${u.speed} ft movement` });
      return;
    case "disengage":
      if (cmd.bonus) {
        if (!u.stats.features.includes("nimble-escape")) throw new GameError(`${u.name} can't Disengage as a bonus action`);
        spend(u, "bonusAction");
      } else spend(u, "action");
      u.turn.disengaged = true;
      ctx.events.push({ type: "feature", unitId: u.id, name: cmd.bonus ? "Nimble Escape" : "Disengage", detail: "no opportunity attacks this turn" });
      return;
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
    case "end-turn":
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
  hp: number;
  speed: number;
  pos: Cell;
}

/** Rolls initiative (d20 + Dex, ties to higher Dex) and starts round 1. */
export function createGame(board: Board, setups: UnitSetup[], seed: number): ApplyResult {
  const seeded = mulberry32(seed);
  const events: GameEvent[] = [];
  const units: Unit[] = setups.map((x) => {
    const dex = abilityMod(x.stats.abilities.dex);
    const init = Math.floor(seeded.rng() * 20) + 1 + dex;
    return {
      id: x.id,
      name: x.name,
      side: x.side,
      image: x.image ?? null,
      stats: x.stats,
      ac: x.ac,
      hp: x.hp,
      hpMax: x.hp,
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
      resources: (x.stats.features.includes("second-wind") ? { "second-wind": 2 } : {}) as Record<string, number>,
    };
  });
  units.sort((a, b) => b.initiative - a.initiative || b.stats.abilities.dex - a.stats.abilities.dex);
  const initial: GameState = { board, units, turnIndex: 0, round: 1, effects: [], rngSeed: seeded.seed(), outcome: null, nextId: 1 };
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
