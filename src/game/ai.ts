import type { Advantage } from "../domain/attack";
import { parseDice } from "../domain/dice";
import { actionDamage, type DamagePart, type StatAction } from "../domain/statblock";
import { distanceFt, fromKey, key, lineOfSight, type Cell } from "./board";
import { apply, canAct, checkTarget, currentUnit, reachable, type Command } from "./engine";
import { GameError, type GameState, type Unit } from "./state";

/**
 * Simple, readable monster tactics, one command at a time:
 * 1. attack the best target in reach (expected damage, finish off the weak);
 * 2. otherwise move to a square to attack from (melee: next to the nearest
 *    foe; ranged: in normal range, not next to anyone);
 * 3. otherwise Dash towards the enemy;
 * 4. end the turn.
 * Goblins with Nimble Escape slip away before shooting if cornered.
 */

export function averageDamage(parts: readonly DamagePart[]): number {
  return parts.reduce((n, p) => {
    try {
      return n + parseDice(p.dice).reduce((m, t) => m + (t.kind === "dice" ? (t.sign * t.count * (t.sides + 1)) / 2 : t.sign * t.value), 0);
    } catch {
      return n;
    }
  }, 0);
}

/** Probability that an attack roll hits (natural 1 misses, natural 20 hits). */
export function hitChance(toHit: number, ac: number, advantage: Advantage = "normal"): number {
  const p = Math.min(0.95, Math.max(0.05, (21 - (ac - toHit)) / 20));
  return advantage === "adv" ? 1 - (1 - p) ** 2 : advantage === "dis" ? p * p : p;
}

const foesOf = (s: GameState, u: Unit) => s.units.filter((x) => x.side !== u.side && !x.dead && x.hp > 0);

function expected(s: GameState, u: Unit, action: StatAction, target: Unit): number {
  // The AI doesn't aim area spells or cast support spells, and saves its slots.
  if (action.kind === "heal" || action.kind === "buff" || (action.kind === "save" && action.area)) return -1;
  if (action.slot && (u.resources[`slot${action.slot}`] ?? 0) <= 0) return -1;
  const check = checkTarget(s, u.id, action.id, target.id);
  if (!check.ok) return -1;
  const dmg = averageDamage(actionDamage(action));
  const value = action.kind === "attack" ? dmg * hitChance(action.toHit, target.ac, check.advantage) : action.kind === "missile" ? dmg : dmg * 0.6;
  // Prefer finishing off a wounded foe.
  return value + (dmg >= target.hp ? 3 : 0);
}

/** Does this creature fight better up close or at range? */
function prefersRanged(u: Unit): boolean {
  const best = (melee: boolean) =>
    Math.max(
      0,
      ...u.stats.actions
        .filter((a) => !a.slot && (a.kind === "attack" ? (a.attackType === "melee") === melee : a.kind !== "heal" && a.kind !== "buff" && !melee))
        .map((a) => averageDamage(actionDamage(a))),
    );
  return best(false) > best(true);
}

function canStrikeFrom(s: GameState, u: Unit, from: Cell, ranged: boolean): boolean {
  return foesOf(s, u).some((f) =>
    u.stats.actions.some((a) => {
      if (a.kind === "heal" || a.kind === "buff" || a.slot) return false;
      if (a.kind === "save") return ranged && !a.area && distanceFt(from, f.pos) <= (a.range ?? 60) && lineOfSight(s.board, from, f.pos);
      if (a.kind === "missile") return ranged && distanceFt(from, f.pos) <= a.range && lineOfSight(s.board, from, f.pos);
      if (a.attackType === "melee") return !ranged && distanceFt(from, f.pos) <= a.reach && lineOfSight(s.board, from, f.pos);
      return ranged && distanceFt(from, f.pos) <= (a.range?.[0] ?? 0) && lineOfSight(s.board, from, f.pos);
    }),
  );
}

const nearestFoeDistance = (s: GameState, u: Unit, from: Cell) => Math.min(...foesOf(s, u).map((f) => distanceFt(from, f.pos)));
const foeAdjacent = (s: GameState, u: Unit, at: Cell) => foesOf(s, u).some((f) => canAct(f) && distanceFt(at, f.pos) <= 5);

/** Picks the best cell to move to, or null if staying put is as good. */
function bestDestination(s: GameState, u: Unit): Cell | null {
  const ranged = prefersRanged(u);
  const score = (c: Cell, cost: number) => {
    let v = canStrikeFrom(s, u, c, ranged) ? 1000 : canStrikeFrom(s, u, c, !ranged) ? 500 : 0;
    if (ranged && foeAdjacent(s, u, c)) v -= 400;
    v -= nearestFoeDistance(s, u, c) * (ranged ? 0 : 1);
    return v - cost / 100;
  };
  const here = score(u.pos, 0);
  let best: Cell | null = null;
  let bestScore = here;
  for (const [k, cost] of reachable(s, u.id)) {
    const c = fromKey(k);
    if (k === key(u.pos)) continue;
    const v = score(c, cost);
    if (v > bestScore + 0.001) {
      bestScore = v;
      best = c;
    }
  }
  return best;
}

export function nextAiCommand(s: GameState): Command {
  const u = currentUnit(s);
  if (!u) throw new Error("No creature to act");
  const end: Command = { type: "end-turn", unitId: u.id };
  if (u.turn.needsDeathSave) return { type: "death-save", unitId: u.id };
  if (!canAct(u) || foesOf(s, u).length === 0) return end;

  if (u.turn.action) {
    // Cornered archer with Nimble Escape: slip away first.
    if (prefersRanged(u) && foeAdjacent(s, u, u.pos) && u.turn.bonusAction && !u.turn.disengaged && u.stats.features.includes("nimble-escape")) {
      return { type: "disengage", unitId: u.id, bonus: true };
    }
    let best: { action: StatAction; target: Unit; value: number } | null = null;
    for (const action of u.stats.actions)
      for (const target of foesOf(s, u)) {
        const value = expected(s, u, action, target);
        if (value > 0 && (!best || value > best.value)) best = { action, target, value };
      }
    // An archer next to a foe would rather step away than shoot with Disadvantage.
    const awkward = best && best.action.kind === "attack" && best.action.attackType === "ranged" && foeAdjacent(s, u, u.pos) && u.turn.movement > 0 && u.turn.disengaged;
    if (best && !awkward) return { type: "action", unitId: u.id, actionId: best.action.id, targetId: best.target.id };
  }

  if (u.turn.movement > 0) {
    const dest = bestDestination(s, u);
    if (dest) return { type: "move", unitId: u.id, to: dest };
  }

  // Can't reach anyone this turn: Dash to close the distance.
  if (u.turn.action && !canStrikeFrom(s, u, u.pos, prefersRanged(u)) && !canStrikeFrom(s, u, u.pos, !prefersRanged(u))) {
    return { type: "dash", unitId: u.id };
  }
  return end;
}

/** Lets the AI play both sides until someone wins (tests, balance checks, the map editor's trial runs). */
export function autoplay(state: GameState, limit = 2000): GameState {
  let s = state;
  for (let i = 0; i < limit && !s.outcome; i++) {
    const cmd = nextAiCommand(s);
    try {
      s = apply(s, cmd).state;
    } catch (err) {
      if (err instanceof GameError) throw new Error(`AI issued an invalid command ${JSON.stringify(cmd)}: ${err.message}`);
      throw err;
    }
  }
  return s;
}
