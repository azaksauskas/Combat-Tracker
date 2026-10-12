/**
 * Dice notation: "1d20+5", "2d6 + 1d4 - 1", "d%", "4d6kh3" (keep highest 3),
 * "2d20kl1" (keep lowest, i.e. disadvantage). Pure and RNG-injectable so
 * rolls can be tested, replayed or later run on a game server.
 */

export type Rng = () => number;

/** Uniform [0, 1) from the platform CSPRNG: fair dice, no Math.random bias worries. */
export const secureRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

export interface DiceTerm {
  kind: "dice";
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: "high" | "low"; n: number };
}
export interface ModTerm {
  kind: "mod";
  sign: 1 | -1;
  value: number;
}
export type Term = DiceTerm | ModTerm;

export interface RolledDice extends DiceTerm {
  rolls: number[];
  /** Same length as rolls: false for dice dropped by kh/kl. */
  kept: boolean[];
}
export type RolledTerm = RolledDice | ModTerm;

export interface RollResult {
  expression: string;
  terms: RolledTerm[];
  total: number;
  /** A single kept d20 that came up 20 or 1. */
  natural?: 20 | 1;
}

const LIMITS = { terms: 20, count: 100, sides: 1000 };

/** Parses notation into terms, or throws an Error with a readable message. */
export function parseDice(input: string): Term[] {
  // Spaces are fine around + and -, but not inside a term ("1d20 5" is not "1d205").
  const src = input.trim().toLowerCase().replace(/\s*([+-])\s*/g, "$1");
  if (!src) throw new Error("Enter dice, e.g. 1d20+5");
  if (/\s/.test(src)) throw new Error(`Can't read "${input.trim()}": use + or - between parts`);
  const re = /([+-]?)(?:(\d*)d(\d+|%)(?:(kh|kl|k)(\d+))?|(\d+))/y;
  const terms: Term[] = [];
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || (terms.length > 0 && !m[1])) throw new Error(`Can't read "${input.trim()}" near "${src.slice(pos)}"`);
    pos = re.lastIndex;
    const sign = m[1] === "-" ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ kind: "mod", sign, value: Number(m[6]) });
      continue;
    }
    const count = m[2] ? Number(m[2]) : 1;
    const sides = m[3] === "%" ? 100 : Number(m[3]);
    if (count < 1 || count > LIMITS.count) throw new Error(`Roll between 1 and ${LIMITS.count} dice`);
    if (sides < 2 || sides > LIMITS.sides) throw new Error(`Dice need 2–${LIMITS.sides} sides`);
    const term: DiceTerm = { kind: "dice", sign, count, sides };
    if (m[4]) {
      const n = Number(m[5]);
      if (n < 1 || n > count) throw new Error(`Can only keep 1–${count} of ${count}d${sides}`);
      term.keep = { mode: m[4] === "kl" ? "low" : "high", n };
    }
    terms.push(term);
  }
  if (terms.length > LIMITS.terms) throw new Error(`At most ${LIMITS.terms} parts per roll`);
  return terms;
}

export function formatTerms(terms: readonly Term[]): string {
  return terms
    .map((t, i) => {
      const body =
        t.kind === "mod" ? String(t.value) : `${t.count}d${t.sides}${t.keep ? (t.keep.mode === "high" ? "kh" : "kl") + t.keep.n : ""}`;
      return (t.sign < 0 ? "-" : i === 0 ? "" : "+") + body;
    })
    .join("");
}

export function rollTerms(terms: readonly Term[], rng: Rng = secureRng): RollResult {
  let total = 0;
  const rolled: RolledTerm[] = terms.map((t) => {
    if (t.kind === "mod") {
      total += t.sign * t.value;
      return { ...t };
    }
    const rolls = Array.from({ length: t.count }, () => Math.floor(rng() * t.sides) + 1);
    let kept = rolls.map(() => true);
    if (t.keep) {
      const order = rolls.map((v, i) => [v, i] as const).sort((a, b) => (t.keep!.mode === "high" ? b[0] - a[0] : a[0] - b[0]));
      const keepIdx = new Set(order.slice(0, t.keep.n).map(([, i]) => i));
      kept = rolls.map((_, i) => keepIdx.has(i));
    }
    total += t.sign * rolls.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
    return { ...t, rolls, kept };
  });

  const dice = rolled.filter((t): t is RolledDice => t.kind === "dice");
  let natural: RollResult["natural"];
  if (dice.length === 1 && dice[0]!.sides === 20) {
    const keptRolls = dice[0]!.rolls.filter((_, i) => dice[0]!.kept[i]);
    if (keptRolls.length === 1 && (keptRolls[0] === 20 || keptRolls[0] === 1)) natural = keptRolls[0];
  }
  return { expression: formatTerms(terms), terms: rolled, total, natural };
}

export const roll = (input: string, rng: Rng = secureRng) => rollTerms(parseDice(input), rng);

/**
 * Turns a plain 1d20 roll into advantage (2d20kh1) or disadvantage
 * (2d20kl1). Anything else is returned unchanged.
 */
export function withAdvantage(terms: readonly Term[], mode: "normal" | "adv" | "dis"): Term[] {
  if (mode === "normal") return [...terms];
  return terms.map((t) =>
    t.kind === "dice" && t.sides === 20 && t.count === 1 && !t.keep
      ? { ...t, count: 2, keep: { mode: mode === "adv" ? "high" : "low", n: 1 } }
      : t,
  );
}

/** "[17, ~~5~~] + 4" style breakdown parts, for display. */
export function describeRoll(r: RollResult): string {
  return r.terms
    .map((t, i) => {
      const sign = t.sign < 0 ? "− " : i === 0 ? "" : "+ ";
      if (t.kind === "mod") return `${sign}${t.value}`;
      return `${sign}[${t.rolls.map((v, j) => (t.kept[j] ? String(v) : `~${v}~`)).join(", ")}]`;
    })
    .join(" ");
}

/**
 * Finds rollable text in stat blocks: dice expressions ("2d6+3") and bare
 * modifiers ("+4 to hit", "Dex +5", "(+3)") which roll as a d20 check.
 */
export const ROLLABLE_PATTERN = /\b\d*d(?:\d+|%)(?:\s*[+-]\s*\d+(?!\s*d))*|(?<![\w\d])[+-]\d+\b/gi;

export function rollableToExpression(text: string): string {
  const t = text.replace(/\s+/g, "");
  return /d/i.test(t) ? t : `1d20${t}`;
}

const splitParts = (expr: string) => expr.replace(/\s+/g, "").match(/[+-]?[^+-]+/g) ?? ([] as string[]);

/** Dice-button helper: "1d6" + d6 → "2d6"; "1d20+4" + d8 → "1d20+4+1d8". */
export function addDieToExpression(expr: string, sides: number): string {
  const parts = splitParts(expr);
  const re = new RegExp(`^([+-]?)(\\d*)d${sides}$`, "i");
  const i = parts.findIndex((p) => re.test(p));
  if (i < 0) return [...parts, `${parts.length ? "+" : ""}1d${sides}`].join("");
  const [, sign, n] = re.exec(parts[i]!)!;
  parts[i] = `${sign}${Number(n || 1) + 1}d${sides}`;
  return parts.join("");
}

/** ±1 button helper: adjusts a trailing flat modifier, adding or removing it. */
export function addModifierToExpression(expr: string, delta: number): string {
  const parts = splitParts(expr);
  const last = parts.at(-1);
  let value = delta;
  if (last && /^[+-]?\d+$/.test(last) && parts.length > 1) {
    value += Number(last);
    parts.pop();
  }
  if (value !== 0) parts.push(value < 0 ? String(value) : parts.length ? `+${value}` : String(value));
  return parts.join("");
}
