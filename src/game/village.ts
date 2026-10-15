import type { Settler, Town } from "../domain/town";
import { BUILDINGS, assignments, isBuilt } from "./town";

/**
 * The town as a living picture: where each settler is at this hour (asleep
 * at home, at work, at the tavern in the evening) and what the sky looks
 * like. Pure, so the scene only has to draw it.
 */

export type Phase = "night" | "morning" | "work" | "evening";

export function phaseOf(hours: number): Phase {
  const h = ((hours % 24) + 24) % 24;
  if (h < 6 || h >= 22) return "night";
  if (h < 8) return "morning";
  if (h < 18) return "work";
  return "evening";
}

/** Each settler's bed: houses first (in order, as many as they hold), then the town hall. */
export function homes(t: Town): Map<string, string> {
  const out = new Map<string, string>();
  const beds: string[] = [];
  const sleeping = t.buildings.filter((b) => isBuilt(b) && (b.type === "house" || b.type === "hall")).sort((a, b) => Number(a.type === "hall") - Number(b.type === "hall"));
  for (const b of sleeping) {
    for (let i = 0; i < (BUILDINGS[b.type].beds ?? 0) + (b.type === "house" ? (b.level ?? 1) - 1 : 0); i++) beds.push(b.id);
  }
  const hall = t.buildings.find((b) => b.type === "hall")?.id ?? t.buildings[0]?.id ?? "";
  t.settlers.forEach((s, i) => out.set(s.id, beds[i] ?? hall));
  return out;
}

export interface Whereabouts {
  settler: Settler;
  /** The building they're at (or heading to). */
  at: string;
  asleep: boolean;
}

/** Where everyone is at this hour. */
export function whereabouts(t: Town, hours: number): Whereabouts[] {
  const phase = phaseOf(hours);
  const home = homes(t);
  const work = new Map<string, string>();
  for (const [bid, sid] of assignments(t)) work.set(sid, bid);
  const tavern = t.buildings.find((b) => b.type === "tavern" && isBuilt(b))?.id;
  const square = t.buildings.find((b) => b.type === "market" && isBuilt(b))?.id ?? t.buildings.find((b) => b.type === "hall")?.id ?? "";
  return t.settlers.map((s) => {
    const bed = home.get(s.id) ?? square;
    const job = work.get(s.id);
    let at = bed;
    if (phase === "work" || phase === "morning") at = job ?? square;
    // In the evening the tavern fills up; those with a tavern job are working anyway.
    if (phase === "evening") at = tavern ?? bed;
    return { settler: s, at, asleep: phase === "night" };
  });
}

export interface Sky {
  /** Top and bottom of the sky strip. */
  top: string;
  bottom: string;
  /** 0–1 across the sky; null when it's down. */
  sun: number | null;
  moon: number | null;
  stars: number;
  /** A wash over the village: night blue, evening amber. */
  tint: string;
}

const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * k));
const rgb = (c: number[], alpha = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;

/** The sky at this hour (smoothly through dawn and dusk). */
export function skyAt(hours: number): Sky {
  const h = ((hours % 24) + 24) % 24;
  const NIGHT = [[22, 28, 58], [44, 52, 92]];
  const DAWN = [[250, 170, 120], [255, 214, 165]];
  const DAY = [[120, 180, 230], [200, 228, 245]];
  const DUSK = [[238, 120, 90], [250, 190, 140]];
  // Key frames through the day.
  const keys: [number, number[][]][] = [
    [0, NIGHT],
    [5, NIGHT],
    [6.5, DAWN],
    [8.5, DAY],
    [17, DAY],
    [19, DUSK],
    [21, NIGHT],
    [24, NIGHT],
  ];
  let i = 0;
  while (i < keys.length - 2 && h >= keys[i + 1]![0]) i++;
  const [h0, c0] = keys[i]!;
  const [h1, c1] = keys[i + 1]!;
  const k = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
  const top = mix(c0[0]!, c1[0]!, k);
  const bottom = mix(c0[1]!, c1[1]!, k);
  const sun = h >= 5.5 && h <= 19.5 ? (h - 5.5) / 14 : null;
  const moon = h >= 19 || h <= 6 ? ((h >= 19 ? h - 19 : h + 5) / 11) : null;
  const dark = h < 5 || h > 21 ? 1 : h < 7 ? (7 - h) / 2 : h > 19 ? (h - 19) / 2 : 0;
  const tint = dark > 0 ? rgb([18, 24, 64], 0.32 * dark) : h > 16.5 ? rgb([255, 140, 60], 0.1 * Math.min(1, (h - 16.5) / 2)) : rgb([0, 0, 0], 0);
  return { top: rgb(top), bottom: rgb(bottom), sun, moon, stars: dark, tint };
}
