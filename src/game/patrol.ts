import { SRD_MONSTERS } from "../content/srd";
import { XP_BY_CR } from "./party";
import { mulberry32 } from "./rng";
import type { Scenario } from "./scenarios";
import { num } from "./tuning";

/**
 * Small fights around the town: patrols and contracts. Each is built from a
 * kind of foe and the heroes' level, on a random patch of countryside, sized
 * by the 2024 encounter budget (XP per hero).
 */

export interface Foe {
  name: string;
  /** Monster keys; stronger ones join from a minimum level. */
  monsters: { key: string; fromLevel?: number }[];
  places: string[];
}

export const FOES: Record<string, Foe> = {
  wolves: { name: "Wolves", monsters: [{ key: "wolf" }], places: ["the sheepfold", "a frozen meadow", "the forest edge"] },
  bandits: { name: "Bandits", monsters: [{ key: "bandit" }, { key: "bandit-captain", fromLevel: 3 }], places: ["the timber road", "a toll bridge", "an abandoned farmstead"] },
  goblins: { name: "Goblins", monsters: [{ key: "goblin-warrior" }, { key: "wolf" }, { key: "bugbear-warrior", fromLevel: 3 }], places: ["the old mill", "a briar thicket", "the river ford"] },
  undead: { name: "The restless dead", monsters: [{ key: "skeleton" }, { key: "zombie" }], places: ["the churchyard", "a barrow", "the plague pits"] },
  vermin: { name: "Giant rats", monsters: [{ key: "giant-rat" }], places: ["the granary", "the cellars", "the sewers"] },
  cultists: { name: "Cultists", monsters: [{ key: "cultist" }], places: ["the marsh", "a standing stone", "a shrine in the woods"] },
  gnolls: { name: "Gnolls", monsters: [{ key: "gnoll-warrior" }], places: ["the hills", "a burned hamlet"] },
};
/** Foes a patrol can run into. */
export const PATROL_FOES = ["wolves", "bandits", "goblins", "undead", "vermin", "cultists", "gnolls"];

/** 2024 XP budget per hero. */
const BUDGET = {
  low: [50, 100, 150, 250, 500, 600],
  moderate: [75, 150, 225, 375, 750, 1000],
};

const xpOf = (key: string) => {
  const m = SRD_MONSTERS.find((e) => e.key === key);
  return XP_BY_CR[m?.build().stats?.cr ?? ""] ?? 50;
};

/** The monsters for one fight: random picks that fit the budget, at least one, at most eight. */
export function pickMonsters(foe: Foe, level: number, heroes: number, difficulty: keyof typeof BUDGET, rng: () => number): string[] {
  const lvl = Math.min(Math.max(1, level), BUDGET[difficulty].length);
  let left = BUDGET[difficulty][lvl - 1]! * Math.max(1, heroes) * num(difficulty === "low" ? "patrol.difficulty" : "contract.difficulty");
  const pool = foe.monsters.filter((m) => (m.fromLevel ?? 1) <= lvl).map((m) => ({ key: m.key, xp: xpOf(m.key) }));
  const out: string[] = [];
  while (out.length < 8) {
    const fits = pool.filter((m) => m.xp <= left);
    if (!fits.length) break;
    const m = fits[Math.floor(rng() * fits.length)]!;
    out.push(m.key);
    left -= m.xp;
  }
  if (!out.length) out.push([...pool].sort((a, b) => a.xp - b.xp)[0]!.key);
  return out;
}

/** A patch of countryside: heroes on the left, foes on the right, some brush and rocks between. */
function field(rng: () => number, monsters: number): string[] {
  const w = 16;
  const h = 9;
  const rows = Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
  for (let n = 0; n < 14; n++) {
    const x = 3 + Math.floor(rng() * (w - 7));
    const y = Math.floor(rng() * h);
    rows[y]![x] = rng() < 0.3 ? "#" : "~";
  }
  for (let i = 0; i < 4; i++) rows[2 + i]![0] = "P";
  for (let i = 0; i < monsters; i++) rows[1 + (i % 7)]![w - 2 - Math.floor(i / 7)] = String(i + 1);
  return rows.map((r) => r.join(""));
}

/** A fight against a kind of foe, the same every time for the same seed. */
export function foeBattle(foeId: string, level: number, heroes: number, difficulty: "low" | "moderate", seed: number, name?: string): Scenario {
  const foe = FOES[foeId] ?? FOES.bandits!;
  const { rng } = mulberry32(seed);
  const monsters = pickMonsters(foe, level, heroes, difficulty, rng);
  const place = foe.places[Math.floor(rng() * foe.places.length)]!;
  return {
    id: `${difficulty === "low" ? "patrol" : "contract"}:${foeId}:${seed}`,
    name: name ?? `Patrol: ${foe.name.toLowerCase()} near ${place}`,
    blurb: `${monsters.length} foes near ${place}.`,
    map: field(rng, monsters.length),
    monsters,
    difficulty: difficulty === "low" ? "Low" : "Moderate",
  };
}
