/**
 * The nine alignments (2024 rules), plus "Unaligned" for beasts. In the game
 * alignment is two axes: law (lawful +1 … chaotic −1) and good (good +1 …
 * evil −1). Heroes' deeds move their town's reputation along the same axes,
 * and settlers judge the town by how close it is to what they believe.
 */
export const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

export interface Axes {
  /** +1 lawful, −1 chaotic. */
  law: number;
  /** +1 good, −1 evil. */
  good: number;
}

export function axesOf(a: string | null | undefined): Axes {
  const s = (a ?? "").toLowerCase();
  return {
    law: s.includes("lawful") ? 1 : s.includes("chaotic") ? -1 : 0,
    good: s.includes("good") ? 1 : s.includes("evil") ? -1 : 0,
  };
}

/** The alignment closest to a point on the two axes (each from −1 to +1). */
export function alignmentAt({ law, good }: Axes): Alignment {
  const l = law >= 0.34 ? "Lawful" : law <= -0.34 ? "Chaotic" : "Neutral";
  const g = good >= 0.34 ? "Good" : good <= -0.34 ? "Evil" : "Neutral";
  if (l === "Neutral" && g === "Neutral") return "Neutral";
  return `${l} ${g}` as Alignment;
}

/** How a reputation reads: "kind and law-abiding", "ruthless", "unremarkable"… */
export function reputationText({ law, good }: Axes): string {
  const parts = [
    good >= 3 ? "kind" : good >= 1 ? "decent" : good <= -3 ? "cruel" : good <= -1 ? "ruthless" : "",
    law >= 3 ? "orderly" : law >= 1 ? "law-abiding" : law <= -3 ? "lawless" : law <= -1 ? "free-spirited" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" and ") : "unremarkable";
}
