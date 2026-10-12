import type { Rng } from "../domain/dice";

/**
 * Seeded PRNG (mulberry32). The game keeps the seed in its state, so a
 * saved game, a replay or a test produces exactly the same rolls.
 */
export function mulberry32(seed: number): { rng: Rng; seed: () => number } {
  let s = seed >>> 0;
  return {
    rng: () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seed: () => s,
  };
}

export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
