import { parseDice, rollTerms, secureRng, withAdvantage, type Rng, type RollResult, type Term } from "./dice";
import { saveBonus, type AttackAction, type DamagePart, type DamageType, type SaveAction, type StatBlock } from "./statblock";

/**
 * Resolving attacks and saving throws under the 2024 rules. Pure: takes an
 * RNG, returns everything that happened so the caller can apply damage, log
 * it, or animate it.
 */

export type Advantage = "normal" | "adv" | "dis";

export interface Defender {
  ac: number;
  stats?: StatBlock | null;
}

export interface DamageResult {
  type: DamageType;
  roll: RollResult;
  /** After resistance / immunity / vulnerability. */
  amount: number;
  adjustment: "resisted" | "immune" | "vulnerable" | null;
}

export interface AttackOutcome {
  attack: RollResult;
  hit: boolean;
  crit: boolean;
  damage: DamageResult[];
  total: number;
}

export interface SaveOutcome {
  save: RollResult;
  success: boolean;
  damage: DamageResult[];
  total: number;
}

/** Critical hit: roll all of the attack's damage dice twice (modifiers once). */
export function critTerms(terms: readonly Term[]): Term[] {
  return terms.map((t) => (t.kind === "dice" ? { ...t, count: t.count * 2 } : t));
}

/** Immunity → 0, resistance → half (rounded down), vulnerability → double. */
export function adjustDamage(amount: number, type: DamageType, stats?: StatBlock | null): Pick<DamageResult, "amount" | "adjustment"> {
  if (!stats || amount <= 0) return { amount: Math.max(0, amount), adjustment: null };
  if (stats.immunities.includes(type)) return { amount: 0, adjustment: "immune" };
  let result = amount;
  let adjustment: DamageResult["adjustment"] = null;
  if (stats.resistances.includes(type)) {
    result = Math.floor(result / 2);
    adjustment = "resisted";
  }
  if (stats.vulnerabilities.includes(type)) {
    result *= 2;
    adjustment = adjustment ? null : "vulnerable";
  }
  return { amount: result, adjustment };
}

export function rollDamage(parts: readonly DamagePart[], defender: Defender, rng: Rng, crit: boolean): DamageResult[] {
  return parts.map((p) => {
    const terms = parseDice(p.dice);
    const roll = rollTerms(crit ? critTerms(terms) : terms, rng);
    return { type: p.type, roll, ...adjustDamage(Math.max(0, roll.total), p.type, defender.stats) };
  });
}

const sum = (d: DamageResult[]) => d.reduce((n, x) => n + x.amount, 0);

/** Attack roll: natural 20 always hits and crits, natural 1 always misses. */
export function resolveAttack(
  action: AttackAction,
  defender: Defender,
  opts: { advantage?: Advantage; rng?: Rng } = {},
): AttackOutcome {
  const rng = opts.rng ?? secureRng;
  const terms: Term[] = [
    { kind: "dice", sign: 1, count: 1, sides: 20 },
    ...(action.toHit ? [{ kind: "mod" as const, sign: (action.toHit < 0 ? -1 : 1) as 1 | -1, value: Math.abs(action.toHit) }] : []),
  ];
  const attack = rollTerms(withAdvantage(terms, opts.advantage ?? "normal"), rng);
  const crit = attack.natural === 20;
  const hit = crit || (attack.natural !== 1 && attack.total >= defender.ac);
  // An attack "had Advantage" only if two d20s were rolled and the higher kept.
  const hadAdvantage = (opts.advantage ?? "normal") === "adv";
  const parts = hadAdvantage && action.extraDamageOnAdvantage ? [...action.damage, ...action.extraDamageOnAdvantage] : action.damage;
  const damage = hit ? rollDamage(parts, defender, rng, crit) : [];
  return { attack, hit, crit, damage, total: sum(damage) };
}

/** Saving throw against a DC; damage is rolled once and halved (or negated) on a success. */
export function resolveSave(
  action: SaveAction,
  defender: Defender,
  opts: { advantage?: Advantage; rng?: Rng } = {},
): SaveOutcome {
  const rng = opts.rng ?? secureRng;
  const bonus = defender.stats ? saveBonus(defender.stats, action.save) : 0;
  const terms: Term[] = [
    { kind: "dice", sign: 1, count: 1, sides: 20 },
    ...(bonus ? [{ kind: "mod" as const, sign: (bonus < 0 ? -1 : 1) as 1 | -1, value: Math.abs(bonus) }] : []),
  ];
  const save = rollTerms(withAdvantage(terms, opts.advantage ?? "normal"), rng);
  const success = save.total >= action.dc;
  const damage = rollDamage(action.damage, { ...defender, stats: null }, rng, false).map((d) => {
    const base = success ? (action.onSuccess === "half" ? Math.floor(d.roll.total / 2) : 0) : d.roll.total;
    return { ...d, ...adjustDamage(base, d.type, defender.stats) };
  });
  return { save, success, damage, total: sum(damage) };
}
