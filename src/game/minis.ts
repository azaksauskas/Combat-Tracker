import type { Unit } from "./state";

/**
 * Ink miniatures for the battle board: each creature drawn like a pen-and-ink
 * illustration of a figure on a scenic base, built from its kind (a hero's
 * species and class, or the sort of monster it is).
 *
 * A figure is a list of parts drawn in passes, as an ink illustration is: a
 * heavy outer contour, flat tones with thin inner contours, hatched shade on
 * the side away from the light (and cross-hatching deeper in), then the fine
 * lines and dots: mail rings, rivets, stitching, folds, faces. A hero's body is
 * drawn once for a human and stretched for the other species, with the head,
 * hands and gear kept in proportion; the class dresses and arms it.
 */

export type Species = "human" | "dwarf" | "elf" | "halfling";
export type Calling = "fighter" | "rogue" | "cleric" | "wizard";
export type MiniLook = { kind: "hero"; species: Species; calling: Calling } | { kind: "goblin" | "wolf" | "rat" | "skeleton" | "cultist" | "bandit" };

type Tone = "cloth" | "cloth2" | "leather" | "skin" | "metal" | "dark" | "wood" | "bone" | "glow" | "paper" | "stone";
/** A filled shape, a thick stroke (a limb, a haft, a bone), a fine line, or a dot. */
type Part = { d: string; t?: string } & ({ tone: Tone } | { line: number; tone: Tone } | { detail: number; ink?: "ink" | "red" | "paper" } | { dot: "ink" | "red" | "paper" });

const INK = "#1d1a16";
const RED = "#a8322a";
const DARKRED = "#5e1a15";
const PAPER = "#f6f1e6";
const GLOW = "#f3e3a0";

const TONES: Record<Tone, string> = {
  cloth: "#e9dfca",
  cloth2: "#d6c9ad",
  leather: "#cdb894",
  skin: "#f6eee0",
  metal: "#eeebe4",
  dark: "#3a332b",
  wood: "#dfcca9",
  bone: "#f2ebd8",
  glow: GLOW,
  paper: PAPER,
  stone: "#e2dccf",
};

// --- Building blocks ------------------------------------------------------------------------------

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const S = (d: string, tone: Tone, t?: string): Part => ({ d, tone, t });
const L = (d: string, line: number, tone: Tone, t?: string): Part => ({ d, line, tone, t });
const D = (d: string, detail = 0.6, ink?: "ink" | "red" | "paper", t?: string): Part => ({ d, detail, ink, t });
const dots = (pts: [number, number][], r = 0.55, ink: "ink" | "red" | "paper" = "ink", t?: string): Part => ({ d: pts.map(([x, y]) => ell(x, y, r, r)).join(" "), dot: ink, t });
function ell(cx: number, cy: number, rx: number, ry: number) {
  return `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
}
const star = (cx: number, cy: number, R: number, r: number, n = 4) => {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)} `;
  }
  return d + "Z";
};
const rays = (cx: number, cy: number, r1: number, r2: number, n: number) => {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d += `M${f(cx + Math.cos(a) * r1)} ${f(cy + Math.sin(a) * r1)} L${f(cx + Math.cos(a) * r2)} ${f(cy + Math.sin(a) * r2)} `;
  }
  return d;
};
/** Rows of rings, for mail, between two widths. */
const mailRows = (x0: number, x1: number, y0: number, y1: number, step = 2.4) => {
  let d = "";
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1 - 1; x += 2.2) d += `M${f(x + ((Math.round((y - y0) / step) % 2) * 1.1))} ${f(y)} q1.1 1.3 2.2 0 `;
  }
  return d;
};
/** Overlapping scales, row on row. */
const scaleRows = (x0: number, x1: number, y0: number, y1: number) => {
  let d = "";
  let r = 0;
  for (let y = y0; y < y1; y += 2.6, r++) for (let x = x0 + (r % 2) * 1.5; x < x1 - 1; x += 3) d += `M${f(x)} ${f(y)} q1.5 2.4 3 0 `;
  return d;
};

// --- Heroes ------------------------------------------------------------------------------------------

/** How a species stretches the human figure: body in x and y, head, and gear. */
const SPECIES: Record<Species, { sx: number; sy: number; hs: number; gs: number; h: number }> = {
  human: { sx: 1, sy: 1, hs: 1, gs: 1, h: 1 },
  dwarf: { sx: 1.25, sy: 0.74, hs: 1.12, gs: 0.88, h: 0.8 },
  elf: { sx: 0.9, sy: 1.05, hs: 0.94, gs: 1, h: 1.05 },
  halfling: { sx: 0.88, sy: 0.63, hs: 1, gs: 0.74, h: 0.66 },
};

function hero(species: Species, calling: Calling): Part[] {
  const sp = SPECIES[species];
  const body = `scale(${sp.sx} ${sp.sy})`;
  const at = (x: number, y: number) => `translate(${f(x * sp.sx)} ${f(y * sp.sy)})`;
  // The head sits on the neck at (0, −84) of the human figure.
  const head = `translate(${f(0.6 * sp.sx)} ${f(-84 * sp.sy - 7 * sp.hs)}) scale(${sp.hs})`;
  const gear = (x: number, y: number, rot: number) => `${at(x, y)} scale(${sp.gs}) rotate(${rot})`;
  const B = (d: string, tone: Tone) => S(d, tone, body);
  const BL = (d: string, w: number, tone: Tone) => L(d, w, tone, body);
  const BD = (d: string, w = 0.6, ink?: "ink" | "red" | "paper") => D(d, w, ink, body);
  const H = (d: string, tone: Tone) => S(d, tone, head);
  const HD = (d: string, w = 0.6, ink?: "ink" | "red" | "paper") => D(d, w, ink, head);
  const robe = calling === "cleric" || calling === "wizard";
  const p: Part[] = [];

  // --- Behind the figure ---
  if (calling === "rogue") {
    p.push(B(`M-12 -78 Q-21 -48 -20 -5 L-16 -7.5 L-13 -3 L-9 -6 L9 -6 L13 -3 L16 -7.5 L20 -5 Q21 -48 12 -78 Z`, "cloth2"));
    p.push(BD(`M-15 -66 Q-17 -40 -17.5 -9 M-11 -60 Q-12.5 -36 -13 -6 M15 -66 Q17 -40 17.5 -9 M11 -62 Q12.5 -36 13 -6`, 0.5));
  }
  if (calling === "cleric") p.push(B(`M-12.5 -79 Q-19 -46 -18 -2 Q0 1.6 18 -2 Q19 -46 12.5 -79 Z`, "cloth2"), BD(`M-15 -60 Q-16.5 -32 -16 -4 M15 -60 Q16.5 -32 16 -4`, 0.5));
  if (species === "elf") p.push(H(`M-5.8 -2 Q-7.4 9 -6.2 18 L6.2 18 Q7.4 9 5.8 -2 Q0 -9 -5.8 -2 Z`, "cloth"), HD(`M-4 4 Q-4.8 11 -4.2 17 M0 6 V17.5 M4 4 Q4.8 11 4.2 17`, 0.45));

  // --- Legs and feet, or a robe to the ground ---
  if (robe) {
    p.push(B(`M-8.5 -1.2 Q-6 -3.4 -1.6 -1.8 L-1.6 0.6 L-9.5 0.6 Z M2.6 -1.8 Q7 -3.6 10.5 -1.2 L11 0.6 L2.6 0.6 Z`, species === "halfling" ? "skin" : "dark"));
    p.push(B(`M-10 -50 Q-13 -26 -15.5 -1.2 Q-8 1.2 0 0.4 Q8 1.2 15.5 -1.2 Q13 -26 10 -50 Z`, calling === "wizard" ? "cloth2" : "cloth"));
    p.push(BD(`M-6 -46 Q-7.6 -24 -9.6 -1 M-1.2 -46 Q-1.6 -22 -2.4 0 M4.6 -46 Q5.8 -24 7.6 -0.6 M10.2 -40 Q12 -22 13.4 -1.4 M-11 -36 Q-12.5 -20 -13.6 -1.6`, 0.5));
  } else {
    const legTone: Tone = calling === "fighter" ? "cloth2" : "leather";
    p.push(B(`M-1.5 -44 L-9.5 -45 Q-10.6 -34 -9.2 -24 Q-8.6 -14 -8.2 -7 L-3 -7 Q-2.6 -15 -2.4 -24 Q-1.8 -34 -1.5 -44 Z`, legTone));
    p.push(B(`M1.5 -44 L9.5 -45 Q11 -34 10.6 -24 Q11.2 -14 12.2 -7 L7 -7 Q5.8 -15 4.7 -24 Q2.8 -34 1.5 -44 Z`, legTone));
    p.push(BD(`M-8.8 -36 Q-6 -34.6 -3 -36 M5 -36 Q8 -34.4 10.6 -36 M-6 -44 L-5.6 -26 M6.4 -44 L7.4 -26`, 0.45));
    if (calling === "fighter") p.push(B(`${ell(-5.8, -24.5, 3.4, 2.6)} ${ell(7.6, -24.5, 3.4, 2.6)}`, "metal"), BD(`M-8.4 -24.5 h5.2 M5 -24.5 h5.2`, 0.5));
    if (species === "halfling") {
      // Bare, hairy feet below rolled cuffs.
      p.push(B(`M-9.2 -11 L-2.4 -11 L-2.6 -8 L-9 -8 Z M5.6 -11 L12.4 -11 L12.6 -8 L5.8 -8 Z`, "cloth"));
      p.push(B(`M-8.6 -8 L-2.8 -8 Q-2 -2 -3 0.4 L-13 0.4 Q-14 -2 -9.4 -3 Z M6 -8 L12 -8 Q13 -4 17 -2.4 Q18 0.4 15 0.4 L6.4 0.4 Q5.4 -2 6 -8 Z`, "skin"));
      p.push(BD(`M-11 -1.5 l0.6 -1.6 M-9 -1.5 l0.6 -1.8 M-7 -1.3 l0.6 -1.8 M13 -1.4 l0.6 -1.6 M15 -1.2 l0.6 -1.6 M-7 -6 q1 -1 2 0 M8 -6 q1 -1 2 0`, 0.5));
    } else {
      const top = calling === "rogue" ? -27 : -17;
      p.push(B(`M-9 ${top} L-2.3 ${top} L-2.5 -2 Q-2.3 0 -5 0.4 L-12 0.4 Q-13 -1.4 -9.3 -2.6 Z`, "dark"));
      p.push(B(`M5 ${top} L11.8 ${top} L12.8 -2.6 Q16.2 -1.6 15.8 0.4 L7.4 0.4 Q5.4 0 5.6 -2 Z`, "dark"));
      p.push(B(`M-9.6 ${top - 1.5} L-1.8 ${top - 1.5} L-2 ${top + 2} L-9.4 ${top + 2} Z M4.7 ${top - 1.5} L12.4 ${top - 1.5} L12.6 ${top + 2} L5 ${top + 2} Z`, "leather"));
      p.push(BD(`M-8.6 -9 h5.6 M6.2 -9 h5.8 M-8.4 -5 h5 M6.6 -5 h5.4`, 0.45, "paper"));
      if (calling === "rogue") p.push(BD(`M-9 -20 h6.6 M5.2 -20 h6.8`, 0.9, "paper"), dots([[-4.2, -20], [9.4, -20]], 0.55, "paper", body));
    }
  }

  // --- The body ---
  const torsoTone: Tone = calling === "fighter" ? "metal" : calling === "rogue" ? "leather" : calling === "cleric" ? "cloth" : "cloth2";
  if (calling === "fighter") {
    // A mail hauberk to mid-thigh under a surcoat.
    p.push(B(`M-10.5 -52 L-12.8 -32.5 Q0 -30.5 12.8 -32.5 L10.5 -52 Z`, "metal"), BD(mailRows(-12, 12, -50, -33), 0.35), BD(`M0 -40 V-31.5`, 0.6));
  }
  if (calling === "rogue") p.push(B(`M-10.5 -51 L-12.4 -38 L-6.2 -39 L-4.6 -51 Z M-4 -51 L-3.2 -37.5 L3.2 -37.5 L4 -51 Z M4.6 -51 L6.2 -39 L12.4 -38 L10.5 -51 Z`, "leather"), BD(`M-9.6 -40.6 l5 -0.6 M-2.6 -39.4 h5.2 M5.6 -40.8 l5.2 0.8`, 0.4));
  p.push(B(`M-12.5 -78 Q-14.2 -64 -10.2 -50 L10.2 -50 Q14.2 -64 12.5 -78 Q0 -81.5 -12.5 -78 Z`, torsoTone));
  if (calling === "fighter") {
    p.push(BD(mailRows(-12, 12, -76, -51), 0.35));
    p.push(B(`M-6.8 -76 L-7.6 -33.5 L-1.8 -31 L0 -33.5 L1.8 -31 L7.6 -33.5 L6.8 -76 Q0 -78 -6.8 -76 Z`, "cloth"));
    p.push(BD(`M-5.6 -74.6 L-6.3 -35 M5.6 -74.6 L6.3 -35`, 0.45), BD(`M0 -71 V-57 M-4.6 -66.5 H4.6`, 1.8));
  }
  if (calling === "rogue") {
    p.push(BD(`M-11 -74 Q-4 -72 0 -66 Q4 -72 11 -74 M-10.8 -63 Q0 -61.5 10.8 -63 M-1 -66 V-51`, 0.5));
    // A bandolier of throwing knives.
    p.push(BL(`M-11.5 -76 L10 -52`, 2.6, "dark"));
    for (const k of [0.25, 0.45, 0.65]) {
      const x = -11.5 + 21.5 * k;
      const y = -76 + 24 * k;
      p.push(S(`M${f(x - 0.9)} ${f(y - 3.4)} h1.8 v3.4 h-1.8 Z`, "metal", body));
    }
  }
  if (calling === "cleric") {
    p.push(B(`M-6 -64 L-6.8 -5.5 L0 -2.6 L6.8 -5.5 L6 -64 Z`, "paper"));
    p.push(BD(`M-4.8 -62.6 L-5.5 -7 L0 -4.2 L5.5 -7 L4.8 -62.6`, 0.45), BD(`${ell(0, -42, 2.8, 2.8)} ${rays(0, -42, 3.8, 6.2, 8)}`, 0.7));
    p.push(BD(`M-4 -24 h8 M-4 -20 h8`, 0.35));
  }
  if (calling === "wizard") {
    p.push(BD(`M-1 -76 Q-1.8 -60 -2.4 -50 M2 -76 Q2.8 -60 3.4 -50`, 0.9), BD(`${star(-6, -66, 2.2, 0.7)} ${star(6.5, -59, 1.8, 0.6)} ${star(-7, -30, 2.2, 0.7)} ${star(6, -18, 2, 0.65)} ${star(-9.5, -10, 1.8, 0.6)}`, 0.55));
    p.push(BD(`M-1.6 -50 Q-2.8 -26 -3.6 0 M2.6 -50 Q3.6 -26 4.6 0`, 0.9));
  }

  // --- Belt and what hangs from it ---
  if (calling === "cleric") {
    p.push(BL(`M-10.5 -51 Q0 -49 10.5 -51`, 1.7, "wood"), BL(`M4 -50 Q5 -44 4.6 -38`, 1.2, "wood"));
    p.push(B(`M-9.8 -48 h5.4 v6.8 h-5.4 Z`, "dark"), BD(`M-9 -46.4 h3.8`, 0.5, "paper"), BD(`M-7 -50 V-48`, 0.5));
  } else if (calling === "wizard") {
    p.push(B(`M-11 -53 Q0 -51 11 -53 L11 -49 Q0 -47 -11 -49 Z`, "dark"));
    p.push(BL(`M6.5 -49 L7.6 -40`, 1.2, "cloth"), BL(`M8.6 -49 L10 -41.5`, 1.2, "cloth"));
    p.push(S(`M-1.4 -1.6 h2.8 v14 h-2.8 Z`, "wood", `${at(-8, -49)} rotate(18)`), D(`M-1.4 1.6 h2.8 M-1.4 9.4 h2.8`, 0.45, "ink", `${at(-8, -49)} rotate(18)`));
  } else {
    p.push(B(`M-11 -52.5 Q0 -50.5 11 -52.5 L11 -49 Q0 -47 -11 -49 Z`, "dark"));
    p.push(BD(`M-1.8 -52.2 h3.6 v3.6 h-3.6 Z`, 0.7, "paper"));
    p.push(B(`M5 -49.5 h5 v5.6 q-2.5 1.4 -5 0 Z`, "leather"), BD(`M5 -47.6 h5`, 0.45));
    if (calling === "fighter") p.push(B(`M-8.6 -51 L-11 -51 L-17.2 -27 L-15 -26.2 Z`, "dark"), BD(`M-15.8 -29.5 l1.6 0.6`, 0.6, "paper"));
    if (calling === "rogue") p.push(B(`M-10 -49.5 h4.6 v5 q-2.3 1.3 -4.6 0 Z`, "leather"));
  }

  // --- Neck, collar ---
  p.push(B(`M-2.4 -86 h4.8 v6.4 h-4.8 Z`, "skin"));
  if (calling === "fighter") p.push(B(`M-7.2 -85.5 Q-11.5 -80 -13.4 -76.8 Q0 -73.4 13.4 -76.8 Q11.5 -80 7.2 -85.5 Q0 -82 -7.2 -85.5 Z`, "metal"), BD(mailRows(-12, 12, -83, -76), 0.35));
  if (calling === "cleric") {
    p.push(B(`M-13.8 -79 Q-15.8 -66 -12 -62 Q0 -58.5 12 -62 Q15.8 -66 13.8 -79 Q0 -82.5 -13.8 -79 Z`, "metal"), BD(scaleRows(-13, 13, -79, -62), 0.4));
    p.push(B(`M-8 -87 Q-12 -81 -11 -77 Q0 -74 11 -77 Q12 -81 8 -87 Q0 -82 -8 -87 Z`, "cloth2"));
  }
  if (calling === "wizard") p.push(B(`M-9.4 -87 L-11.6 -76 Q0 -72.6 11.6 -76 L9.4 -87 Q5 -80.6 0 -80.6 Q-5 -80.6 -9.4 -87 Z`, "cloth"), BD(`M-8.6 -85 L-10.4 -77 M8.6 -85 L10.4 -77`, 0.45));
  if (calling === "rogue") p.push(B(`M-6.5 -86 Q-9 -80 -10 -77 Q0 -74.6 10 -77 Q9 -80 6.5 -86 Q0 -82.6 -6.5 -86 Z`, "cloth2"));

  // --- The arms. Off hand on the left of the picture, weapon hand on the right. ---
  type Arm = { up: string; fore: string; hand: [number, number]; tone: Tone; w: number };
  const ARMS: Record<Calling, [Arm, Arm]> = {
    fighter: [
      { up: `M-12 -76 L-16 -64`, fore: `M-16 -64 L-10 -58`, hand: [-9.4, -57.6], tone: "metal", w: 4.8 },
      { up: `M12 -76 L17 -63`, fore: `M17 -63 L15.6 -53.5`, hand: [15.6, -52.5], tone: "metal", w: 4.8 },
    ],
    rogue: [
      { up: `M-12 -76 L-16.5 -63`, fore: `M-16.5 -63 L-15 -50.5`, hand: [-15, -49.5], tone: "leather", w: 4.4 },
      { up: `M12 -76 L16.5 -64`, fore: `M16.5 -64 L19.5 -53`, hand: [19.8, -52], tone: "leather", w: 4.4 },
    ],
    cleric: [
      { up: `M-12 -76 L-17.5 -66`, fore: `M-17.5 -66 L-20.6 -73`, hand: [-20.8, -74.5], tone: "cloth", w: 5.6 },
      { up: `M12 -76 L18 -66`, fore: `M18 -66 L19.4 -77`, hand: [19.4, -78.5], tone: "cloth", w: 5.6 },
    ],
    wizard: [
      { up: `M-11.5 -76 L-17 -66`, fore: `M-17 -66 L-16.6 -59`, hand: [-16.4, -58.4], tone: "cloth2", w: 5.6 },
      { up: `M11.5 -76 L18.5 -68`, fore: `M18.5 -68 L22.5 -60`, hand: [23, -59.4], tone: "cloth2", w: 5.6 },
    ],
  };
  const [offArm, mainArm] = ARMS[calling];
  const drawArm = (a: Arm) => {
    p.push(BL(a.up, a.w, a.tone), BL(a.fore, a.w * 0.9, a.tone));
    if (calling === "fighter") {
      const [ex, ey] = a.fore.slice(1).split(" ").map(Number);
      p.push(B(ell(ex!, ey!, 2.7, 2.7), "metal"));
    }
    if (calling === "rogue") {
      const [x, y] = a.hand;
      p.push(S(`M-2.2 -6 h4.4 v5.6 h-4.4 Z`, "cloth2", `${at(x, y)}`), D(`M-2.2 -4.6 l4.4 1.4 M-2.2 -2.6 l4.4 1.4`, 0.4, "ink", at(x, y)));
    }
    const [hx, hy] = a.hand;
    p.push(S(calling === "fighter" ? `M-2.6 -2.4 h5.2 v5 h-5.2 Z` : ell(0, 0, 2.3, 2.3), calling === "fighter" ? "metal" : "skin", `${at(hx, hy)} scale(${sp.gs})`));
  };
  // Cuffs and wide sleeves.
  drawArm(offArm);

  // --- The head ---
  // Hair under any headgear; the face; then beard, braids, curls; then the headgear.
  const helmet = calling === "fighter";
  const hood = calling === "rogue";
  if (!helmet && !hood) {
    if (species === "halfling") for (const a of [-170, -140, -110, -80, -50, -20, 10]) p.push(H(ell(Math.cos((a * Math.PI) / 180) * 5.4, -1 + Math.sin((a * Math.PI) / 180) * 6.2, 2.4, 2.4), "cloth2"));
  }
  p.push(H(ell(0.3, 0.6, 5.2, 6.5), "skin"));
  if (species === "elf") p.push(H(`M-4.8 0 L-10.5 -5.5 L-5 3.4 Z M5.2 0 L11 -5.5 L5.4 3.4 Z`, "skin"), HD(`M-5.6 0.8 L-9 -3.4 M6 0.8 L9.4 -3.4`, 0.4));
  else if (species === "halfling") p.push(H(`M-4.9 0 L-7.6 -2.6 L-5 3 Z M5.3 0 L8 -2.6 L5.4 3 Z`, "skin"));
  else if (!helmet && !hood) p.push(H(`${ell(-5.2, 1.2, 1.3, 2)} ${ell(5.6, 1.2, 1.3, 2)}`, "skin"));
  // Face: brows, eyes, nose, mouth; a little turned to the right.
  p.push(HD(`M-3.7 -1.5 q1.5 -0.9 2.9 0 M1.4 -1.5 q1.5 -0.9 2.9 0`, 0.7), HD(`M-3.3 0.3 q0.9 -0.6 1.8 0 M1.7 0.3 q0.9 -0.6 1.8 0`, 0.75));
  p.push(dots([[-2.4, 0.4], [2.6, 0.4]], 0.45, "ink", head));
  p.push(HD(`M0.7 0.6 Q2 3.1 0.4 3.6 M-1.6 5 q1.6 0.8 3.2 0 M-3.6 2.4 q0.4 1.6 1.2 2.4 M4.2 2.4 q-0.4 1.6 -1.2 2.4`, 0.55));
  if (species === "human" && !helmet && !hood && calling !== "wizard") p.push(H(`M-5.5 -0.4 Q-6.2 -7.8 0.3 -8.2 Q6.8 -7.8 6 -0.4 Q4.3 -4.8 0.3 -4.6 Q-3.3 -5 -5.5 -0.4 Z`, "cloth2"), HD(`M-3 -6.6 q1 2 0.6 3.6 M0.4 -7.4 q0.6 2 0.4 3 M3 -6.8 q0.4 1.8 -0.2 3.2`, 0.4));
  if (species === "elf" && !hood) p.push(H(`M-5.6 -0.6 Q-6.4 -8.2 0.3 -8.6 Q7 -8.2 6 -0.6 Q3 -5.4 -1 -5 Q-3.6 -4.6 -5.6 -0.6 Z`, "cloth"), HD(`M-3.6 -6.4 q-0.8 2.6 -1.4 4.6 M1 -7.6 q-1.6 1.4 -2.4 2.4`, 0.4));
  if (species === "dwarf" && !helmet && !hood) p.push(H(`M-5.5 -0.4 Q-6.2 -7.8 0.3 -8.2 Q6.8 -7.8 6 -0.4 Q4.3 -4.8 0.3 -4.6 Q-3.3 -5 -5.5 -0.4 Z`, "cloth2"));
  const beard = (species === "dwarf" && (calling === "fighter" || calling === "wizard")) || (species === "human" && calling === "wizard");
  if (beard) {
    p.push(H(`M-5.4 2 Q-7.6 12 -3.2 19.5 L0.3 22.6 L3.8 19.5 Q8.2 12 6 2 Q3.4 5.6 0.3 5 Q-2.8 5.6 -5.4 2 Z`, calling === "wizard" ? "paper" : "cloth2"));
    p.push(HD(`M-3 6 Q-4.4 12 -2.2 18 M0.3 6.2 V21 M3.6 6 Q5 12 2.8 18 M-1.6 4.8 q1.9 -1.4 3.8 0`, 0.5), HD(`M-2.6 14 h1.6 M2.2 14 h1.6`, 0.9));
  } else if (species === "dwarf") {
    for (const s of [-1, 1]) p.push(L(`M${s * 4.6} 2 Q${s * 6} 9 ${s * 4.4} 16`, 2.6, "cloth2", head), D(`M${s * 4.2} 5 l${s * 1.6} 0.6 M${s * 4.8} 8.6 l${s * 1.6} 0.6 M${s * 4.8} 12 l${s * 1.6} 0.6`, 0.45, "ink", head));
  }
  if (helmet) {
    p.push(H(`M-6.6 -1.4 Q-6.9 -11 0.3 -11.3 Q7.5 -11 7.2 -1.4 Z`, "metal"));
    p.push(H(`M-7 -2.8 H7.6 V-0.4 H-7 Z`, "metal"), H(`M-0.6 -2.2 h1.8 v6.8 l-0.9 1 l-0.9 -1 Z`, "metal"));
    p.push(H(`M-6.6 -0.4 L-6.4 5.4 L-4 3.4 L-4.2 -0.4 Z M7.2 -0.4 L7 5.4 L4.6 3.4 L4.8 -0.4 Z`, "metal"));
    p.push(HD(`M-4.4 -9.4 Q0.3 -10.8 5 -9.4 M0.3 -11.2 V-3`, 0.45), dots([[-5.4, -1.6], [-2.7, -1.6], [3.3, -1.6], [6, -1.6]], 0.45, "ink", head));
    p.push(H(`M-4 -0.3 Q0.3 1.2 4.6 -0.3 L4.4 1 Q0.3 2 -3.8 1 Z`, "dark"));
    if (!beard) p.push(HD(`M-2.4 4.6 q2.7 -1.6 5.4 0`, 0.9));
  }
  if (hood) {
    p.push(H(`M-8.6 6.4 Q-9.8 -9.4 0.3 -12 Q10.4 -9.4 9.2 6.4 Q6 3 5.2 -1 Q2.6 -4.8 0.3 -4.8 Q-2.2 -4.8 -4.8 -1 Q-5.4 3 -8.6 6.4 Z`, "cloth2"));
    p.push(HD(`M-6.6 -2 Q-7 -8 -2 -10 M7 -2 Q7.4 -8 2.6 -10`, 0.45));
    p.push(H(`M-4.8 -1 Q0.3 -5.4 5.2 -1 L5 1.4 Q0.3 -1.6 -4.6 1.4 Z`, "dark"));
    p.push(H(`M-5.2 2.4 Q0.3 4.4 5.6 2.4 L6.2 6.8 Q0.3 9 -5.8 6.8 Z`, "dark"), HD(`M-3.6 4.8 q3.9 1.4 7.8 0 M-2 6.6 q2.3 0.8 4.6 0`, 0.4, "paper"));
    p.push(dots([[-2.2, 0.6], [2.6, 0.6]], 0.42, "paper", head));
  }
  if (calling === "cleric") p.push(HD(`M-5.4 -3.6 Q0.3 -5.4 6 -3.6`, 1.1), dots([[0.3, -4.6]], 0.7, "red", head));
  if (calling === "wizard") {
    p.push(H(`M-12 -3.4 Q0.3 -7.8 12.6 -3.4 Q0.3 0.6 -12 -3.4 Z`, "cloth2"));
    p.push(H(`M-6 -4.6 Q-4 -16 3.4 -25.4 Q8.4 -26.2 7.4 -22 Q2.4 -15 6.6 -4.6 Z`, "cloth2"));
    p.push(H(`M-6.2 -6.4 Q0.3 -8 6.8 -6.4 L6.6 -4.4 Q0.3 -6 -6 -4.4 Z`, "dark"), HD(`M-1 -6.8 h2.6 v2 h-2.6 Z`, 0.45, "paper"), HD(`M-3.6 -10 Q0 -15 2.4 -19 M-9 -3.6 Q0.3 -6.4 9.6 -3.6`, 0.45));
  }

  // Pauldrons over the shoulders (fighter), then the weapon arm.
  if (calling === "fighter") {
    for (const s of [-1, 1]) {
      p.push(B(`M${s * 7} -79 Q${s * 17.5} -82.5 ${s * 18.8} -71 L${s * 11} -70.4 Q${s * 11} -76 ${s * 7} -79 Z`, "metal"));
      p.push(BD(`M${s * 16.6} -77.4 Q${s * 13} -75.6 ${s * 9} -77.4 M${s * 18.2} -74 Q${s * 14.6} -72.4 ${s * 10.6} -73.6`, 0.45));
      p.push(dots([[s * 15, -79.4], [s * 17.2, -76.8]], 0.45, "ink", body));
    }
  }
  drawArm(mainArm);

  // --- Gear in hand ---
  const [ox, oy] = offArm.hand;
  const [mx, my] = mainArm.hand;
  if (calling === "fighter") {
    const sw = gear(mx, my, 16);
    p.push(S(`M-1.2 -1 h2.4 v7.4 h-2.4 Z`, "dark", sw), S(ell(0, 7.8, 2, 2), "metal", sw));
    p.push(S(`M-1.8 -2 L-1.8 -38 L0 -42.5 L1.8 -38 L1.8 -2 Z`, "metal", sw), D(`M0 -4 V-36`, 0.5, "ink", sw));
    p.push(S(`M-6.4 -2.6 Q0 -1 6.4 -2.6 L6.6 -0.6 Q0 0.8 -6.6 -0.6 Z`, "metal", sw), dots([[-6, -1.6], [6, -1.6]], 0.6, "ink", sw));
    const sh = gear(ox, oy, 6);
    p.push(S(`M-11.4 -15 H11.4 V-2 Q11.4 12.4 0 19.6 Q-11.4 12.4 -11.4 -2 Z`, "wood", sh));
    p.push(S(`M-11.4 -9 L0 -1.6 L11.4 -9 L11.4 -4 L0 3.4 L-11.4 -4 Z`, "dark", sh));
    p.push(D(`M-9.4 -13 H9.4 V-2 Q9.4 10.6 0 16.8 Q-9.4 10.6 -9.4 -2 Z`, 0.5, "ink", sh), D(`M-6 -13 V-6 M-2 -13 V-3.6 M2 -13 V-3.6 M6 -13 V-6 M-5 6 Q-3 10 0 12.4 M5 6 Q3 10 0 12.4`, 0.35, "ink", sh));
    p.push(dots([[-10.2, -13.8], [10.2, -13.8], [-10.2, 0], [10.2, 0], [-6, 11.6], [6, 11.6], [0, 17.6]], 0.6, "ink", sh));
  }
  if (calling === "rogue") {
    const dagger = (t: string) => {
      p.push(S(`M-0.9 0 h1.8 v5 h-1.8 Z`, "dark", t), S(ell(0, 5.6, 1.2, 1.2), "metal", t), S(`M-3.2 -1.2 h6.4 v1.4 h-6.4 Z`, "metal", t));
      p.push(S(`M-1.3 -1.2 L-1.3 -12.6 L0 -16 L1.3 -12.6 L1.3 -1.2 Z`, "metal", t), D(`M0 -3 V-12`, 0.4, "ink", t));
    };
    dagger(gear(mx, my, 38));
    dagger(gear(ox, oy, 168));
  }
  if (calling === "cleric") {
    const m = gear(mx, my, 8);
    p.push(L(`M0 7 L0 -15`, 2.3, "wood", m), D(`M-1.2 1 l2.4 1 M-1.2 3 l2.4 1 M-1.2 5 l2.4 1`, 0.4, "ink", m));
    p.push(S(ell(0, -18.6, 4.4, 4.8), "metal", m), S(`M-0.9 -25.4 h1.8 v4 h-1.8 Z M-0.9 -16 h1.8 v4 h-1.8 Z`, "metal", m));
    p.push(D(`M-4.4 -18.6 H4.4 M-3 -21.8 L3 -15.4 M3 -21.8 L-3 -15.4`, 0.5, "ink", m));
    const h = gear(ox, oy, 0);
    p.push(S(ell(0, -6, 9, 9), "glow", h), S(ell(0, -6, 3.6, 3.6), "metal", h), D(`${rays(0, -6, 4.6, 7.6, 8)} M0 -2.4 V1`, 0.75, "ink", h));
  }
  if (calling === "wizard") {
    // A gnarled staff from the ground, a crystal held in its claws.
    p.push(BL(`M${ox - 0.6} 0 Q${ox + 1.4} -40 ${ox} -70 Q${ox - 1.6} -96 ${ox + 1.4} -108`, 2.6, "wood"));
    p.push(BD(`M${ox - 1.4} -20 q1.4 -2 2.6 -4 M${ox + 0.6} -46 q-1.2 -2 -2.4 -3.6 M${ox - 1.2} -62 l2.4 1 M${ox - 1.2} -60 l2.4 1 M${ox - 1.2} -58 l2.4 1`, 0.45));
    const top = gear(ox + 1.4, -108, 0);
    p.push(S(ell(0, -7, 8.6, 8.6), "glow", top), S(`M0 0 L-3.6 -6.6 L0 -15.4 L3.6 -6.6 Z`, "paper", top));
    p.push(D(`M0 0 L0 -15.4 M-3.6 -6.6 L3.6 -6.6`, 0.4, "ink", top), D(`M-2.6 0.6 Q-4.8 -3 -3.8 -6.6 M2.6 0.6 Q4.8 -3 3.8 -6.6 ${rays(0, -7, 6.4, 9.4, 6)}`, 0.6, "ink", top));
    const spark = gear(mx, my, 0);
    p.push(D(`${star(5, -5, 3.6, 1.1)} ${star(8.4, 2.6, 2.4, 0.8)} ${star(2.2, -10.4, 1.8, 0.6)} M1.6 -1 l2 -1.4 M1.8 0.8 l2.4 -0.2 M1.2 2.4 l2 0.8`, 0.7, "ink", spark));
  }
  return p;
}

// --- Monsters --------------------------------------------------------------------------------------

function goblin(): Part[] {
  const p: Part[] = [];
  // Crooked legs in a wide crouch, rag-wrapped feet.
  p.push(L(`M-3 -26 L-8 -14 L-6 -3`, 4, "skin"), L(`M3 -26 L9 -15 L8 -3`, 4, "skin"));
  p.push(S(`M-10 -4.6 L-3 -4.6 L-2.4 0.4 L-11.6 0.4 Z M5.6 -4.6 L12 -4.6 L13.6 0.4 L5 0.4 Z`, "cloth2"), D(`M-9.6 -2.4 h6 M6.4 -2.4 h6`, 0.4));
  // Ragged kilt, leather jerkin with a spiked pauldron.
  p.push(S(`M-10 -33 L-12 -21 L-8.4 -23.6 L-5.6 -19 L-2.6 -23 L0.6 -18.6 L3.4 -23 L6.6 -19.4 L9.4 -23.4 L12 -21 L10 -33 Z`, "cloth2"), D(`M-6 -31 L-6.6 -22 M0 -31 V-21 M6 -31 L6.8 -22`, 0.4));
  p.push(S(`M-10.6 -54 Q-13 -42 -10 -32 L10 -32 Q13 -42 10.6 -54 Q0 -58 -10.6 -54 Z`, "leather"));
  p.push(D(`M-9.6 -46 Q0 -44.4 9.6 -46 M-9 -40 Q0 -38.4 9 -40 M-4 -55 L-3 -33 M4 -55 L3 -33`, 0.45), dots([[-6, -50], [-2, -50.6], [2, -50.6], [6, -50], [-6, -43], [6, -43]], 0.45));
  p.push(S(`M-10 -35 Q0 -33 10 -35 L10 -31.6 Q0 -29.6 -10 -31.6 Z`, "dark"));
  p.push(S(`M-14.4 -53 Q-16 -60 -8 -58 L-9 -50 Z`, "metal"), S(`M-15 -57 L-19 -62 L-14 -59 Z M-12.6 -59.4 L-14 -65 L-11 -59.6 Z`, "metal"));
  // Round shield studded with nails, scimitar.
  p.push(L(`M-10.6 -52 Q-15 -46 -17 -40`, 4, "skin"));
  p.push(S(ell(-17.6, -38, 9.4, 9.4), "wood"), D(`${ell(-17.6, -38, 7, 7)} M-24 -42 L-11 -34 M-25 -36 L-12 -30`, 0.45), dots([[-17.6, -38], [-24, -38], [-11.2, -38], [-17.6, -44.4], [-17.6, -31.6]], 0.75));
  p.push(L(`M10.6 -52 Q16 -48 18 -42`, 4, "skin"), S(ell(18.4, -41.4, 2.3, 2.3), "skin"));
  p.push(S(`M17 -43 Q24 -56 21.6 -72 Q27.6 -60 23.6 -46 Z`, "metal", "rotate(8 18 -42)"), S(`M15 -42.6 h7 v1.6 h-7 Z`, "dark", "rotate(8 18 -42)"), D(`M19 -46 Q23 -56 22 -66`, 0.4, "ink", "rotate(8 18 -42)"));
  // A big head jutting forward: long ears, hooked nose, underbite with fangs.
  p.push(S(`M-6 -66 L-21.6 -73 L-12.6 -64 L-19 -63.4 L-7.6 -59 Z M7 -66 L22.6 -73 L13.6 -64 L20 -63.4 L8.6 -59 Z`, "skin"), D(`M-9 -64.6 L-17.6 -69.6 M10 -64.6 L18.6 -69.6`, 0.45));
  p.push(S(`M-8.4 -61 Q-9.8 -72 0.4 -73 Q10.6 -72 9.2 -61 Q8.6 -54.4 0.4 -52.6 Q-7.8 -54.4 -8.4 -61 Z`, "skin"));
  p.push(D(`M-6 -66.4 L-2 -64.4 M6.8 -66.4 L2.8 -64.4 M-1 -70.6 q1.4 -1.4 2.8 0`, 0.85), dots([[-3.4, -63.4], [4.2, -63.4]], 0.85, "red"));
  p.push(D(`M0.4 -63 Q3.6 -59.4 1 -58 M-4.4 -56.2 Q0.4 -54 5.2 -56.2 M-6.8 -61 q0.6 2.6 2 4`, 0.6));
  p.push(S(`M-2.8 -56 l1 -2.4 l1 2.2 Z M3 -56 l1 -2.4 l1 2.2 Z`, "bone"));
  return p;
}

function wolf(scale = 1, rat = false): Part[] {
  const P = (d: string) => d.replace(/-?\d+(\.\d+)?/g, (m) => f(Number(m) * scale));
  const k = (n: number) => n * scale;
  const p: Part[] = [];
  // Far legs (in shadow), then the tail, body, near legs, head.
  p.push(L(P(`M17 -30 L22 -15 L19 -2 L23.6 -1.6`), k(3.6), "cloth2"), L(P(`M-24 -31 L-30 -18 L-26 -2 L-21.6 -1.6`), k(3.8), "cloth2"));
  p.push(
    rat
      ? L(P(`M-34 -30 Q-52 -30 -58 -14 Q-60 -8 -56 -4`), k(1.6), "skin")
      : S(P(`M-33 -38 Q-49 -42 -56 -28 Q-58 -18 -51 -12 Q-50 -21 -45 -25 Q-48 -16 -45 -10 Q-41 -21 -39 -27 Q-36 -31 -32 -31 Z`), "cloth"),
  );
  // Deep chest, tucked belly, raised hackles.
  p.push(S(P(`M-35 -34 Q-36 -46 -24 -48 Q-10 -46 2 -50 Q14 -54 22 -50 Q30 -46 30 -38 Q30 -28 24 -24 Q18 -21 10 -24 Q0 -27 -10 -25 Q-22 -23 -30 -27 Q-35 -29 -35 -34 Z`), "cloth"));
  p.push(D(P(`M-26 -45 l3 3 M-20 -46 l3 3 M-14 -46 l3 3 M-8 -47 l3 3 M-2 -48.6 l3 3 M4 -50.4 l3 3 M10 -51.4 l3 3 M16 -51 l3 3 M-28 -36 l3 2 M-18 -35 l3 2 M-8 -36 l3 2 M2 -38 l3 2 M12 -40 l3 2 M22 -42 l3 2`), k(0.55)));
  p.push(D(P(`M-22 -30 Q-14 -34 -6 -30 M14 -30 Q20 -34 26 -30 M-30 -36 Q-26 -40 -22 -38`), k(0.5)));
  // Near legs: shoulder and haunch, paws with claws.
  p.push(S(P(`M16 -42 Q26 -42 26 -30 L28 -14 L26 -3 L31.6 -2.4 L32 0.4 L22 0.4 L22 -14 L18 -28 Z`), "cloth"));
  p.push(S(P(`M-30 -40 Q-18 -42 -18 -30 L-20 -14 L-16 -3 L-11 -2.4 L-11 0.4 L-22 0.4 L-24 -14 L-30 -28 Z`), "cloth"));
  p.push(D(P(`M27 -1 l0.8 1.4 M29 -1 l0.8 1.4 M31 -1 l0.8 1.4 M-15 -1 l0.8 1.4 M-13 -1 l0.8 1.4 M20 -36 q2 4 0 8 M-24 -36 q-2 4 0 8`), k(0.5)));
  // Head and neck ruff.
  p.push(S(P(`M18 -50 Q24 -60 32 -61 L34 -69 L38.6 -61 Q46 -60 55 -55 Q60 -52 59 -49 Q56 -46.6 51 -46 Q45 -44 38 -40 Q30 -38 24 -38 Q20 -42 18 -50 Z`), "cloth"));
  p.push(S(P(`M20 -46 L16 -44 L20 -42 L15 -39 L21 -38.6 L18 -35 L24 -36.6 Z`), "cloth"));
  if (rat) p.push(S(ell(k(34), k(-63), k(3.6), k(3.6)), "skin"), D(ell(k(34), k(-63), k(2), k(2)), k(0.4)));
  else p.push(S(P(`M31 -60 L31.6 -70 L37 -60.6 Z M37 -61 L41 -70 L41.6 -58.6 Z`), "cloth"), D(P(`M33 -62 l0.4 -4 M39.6 -61 l0.8 -4`), k(0.4)));
  p.push(D(P(`M40 -56 q2 -1.4 4 0 M47 -49.6 l1.2 2 l1.2 -2 l1.2 2 l1.2 -2 M43 -51 Q50 -49.4 57 -51.4 M28 -54 l3 4 M24 -50 l3 4 M33 -48 l3 3`), k(0.65)));
  p.push(dots([[k(42.2), k(-55.6)]], k(0.75), "ink"), S(ell(k(59), k(-50), k(1.5), k(1.2)), "dark"));
  return p;
}

function skeleton(): Part[] {
  const p: Part[] = [];
  const bone = (d: string, w = 2.6) => p.push(L(d, w, "bone"));
  // A notched, rusty sword; a cracked shield.
  p.push(S(`M-1.6 -2 L-1.6 -40 L0 -43.6 L1.6 -40 L1.6 -2 Z`, "metal", "translate(20 -46) rotate(14)"), D(`M0 -4 V-37 M-1.6 -16 l1 0.6 M1.6 -26 l-1 0.6`, 0.45, "ink", "translate(20 -46) rotate(14)"));
  p.push(S(`M-5.4 -2.2 h10.8 v1.8 h-10.8 Z`, "dark", "translate(20 -46) rotate(14)"));
  // Legs: thigh, shin, feet; kneecaps.
  for (const s of [-1, 1]) {
    bone(`M${s * 4.6} -40 L${s * 6} -22`);
    bone(`M${s * 5.6} -20.6 L${s * 6.4} -3`, 2.2);
    bone(`M${s * 6.6} -1.6 L${s * 12} -0.4`, 2);
    p.push(S(ell(s * 6, -21.4, 2.2, 2.4), "bone"), D(`M${s * 5.2} -19 L${s * 5.8} -4`, 0.4));
  }
  // Rotted loincloth, pelvis, spine with vertebrae, ribcage, sternum.
  p.push(S(`M-8.4 -45 L-9.4 -30 L-6.6 -33.4 L-3.6 -26.6 L-0.6 -32.6 L2.6 -27.4 L5.6 -33.4 L9.4 -30 L8.4 -45 Z`, "cloth2"), D(`M-5 -43 L-5.6 -33 M3 -43 L3.4 -32`, 0.4));
  p.push(S(`M-9.4 -46 Q-10.4 -52 -4 -51 L0 -47.6 L4 -51 Q10.4 -52 9.4 -46 Q5.4 -40.6 0 -42.6 Q-5.4 -40.6 -9.4 -46 Z`, "bone"), D(`${ell(-4.6, -47, 1.4, 1.6)} ${ell(4.6, -47, 1.4, 1.6)}`, 0.45));
  bone(`M0 -49 L0 -77`, 2.2);
  p.push(D(`M-1.3 -52 h2.6 M-1.3 -55.6 h2.6 M-1.3 -59.2 h2.6 M-1.3 -62.8 h2.6`, 0.5));
  let ribs = "";
  for (let i = 0; i < 6; i++) {
    const y = -74 + i * 3.6;
    const w = 10.4 - Math.abs(i - 1.8) * 1.2;
    ribs += `M-1 ${f(y)} Q${f(-w - 2.4)} ${f(y + 0.6)} ${f(-w + 1)} ${f(y + 4)} M1 ${f(y)} Q${f(w + 2.4)} ${f(y + 0.6)} ${f(w - 1)} ${f(y + 4)} `;
  }
  p.push(L(ribs, 1.5, "bone"), S(`M-1.4 -76 h2.8 v12 l-1.4 1.6 l-1.4 -1.6 Z`, "bone"));
  // Collarbones, shoulder knobs, arms, hands.
  bone(`M-12.6 -78 Q0 -80 12.6 -78`, 2);
  p.push(S(`${ell(-13, -77.6, 2.4, 2.4)} ${ell(13, -77.6, 2.4, 2.4)}`, "bone"));
  bone(`M-13 -77 L-16.4 -62`);
  bone(`M-16.4 -61 L-19.6 -48`, 2);
  bone(`M13 -77 L17 -63`);
  bone(`M17 -62 L19.6 -48`, 2);
  p.push(S(`${ell(-16.4, -61.6, 1.8, 1.8)} ${ell(17, -62.6, 1.8, 1.8)}`, "bone"), D(`M18.6 -47 l2.6 1.4 M18.6 -45.6 l2.2 1.8 M-20 -47 l-1.6 2`, 0.6));
  p.push(S(`M-29 -67 L-15.6 -69 L-13.6 -53 L-20.6 -44 L-27.6 -50 Z`, "wood"), D(`M-21.6 -68 L-20.6 -59 L-23.6 -50 M-28 -59 L-14.6 -61 M-26 -63 l2 6`, 0.55), dots([[-27, -65.4], [-17, -67], [-15.4, -55]], 0.6));
  // Skull with a rusted half-helm, a jaw that hangs open.
  p.push(S(`M-7.6 -89 Q-8.2 -100.4 0 -101 Q8.2 -100.4 7.6 -89 Q7.6 -84 4 -83 L3.6 -81 H-3.6 L-4 -83 Q-7.6 -84 -7.6 -89 Z`, "bone"));
  p.push(S(`M-4.6 -81.4 Q0 -77.4 4.6 -81.4 L4.2 -78.6 Q0 -75.8 -4.2 -78.6 Z`, "bone"));
  p.push(S(`${ell(-3, -90, 2.2, 2.6)} ${ell(3.2, -90, 2.2, 2.6)}`, "dark"), dots([[-3, -90], [3.2, -90]], 0.7, "red"));
  p.push(D(`M0 -87.6 L-1 -85 H1 Z M-2.4 -81.4 V-79.4 M0 -81.4 V-79 M2.4 -81.4 V-79.4 M5 -97 L2.6 -93 L4.4 -91`, 0.55));
  p.push(S(`M-8.4 -93 Q-8.6 -104.6 0 -105 Q8.6 -104.6 8.4 -93 L5 -94.4 Q0 -96 -5 -94.4 Z`, "metal"), D(`M-6 -100 Q0 -102.6 6 -100 M-2 -103 l1 3 M4 -101 l-0.6 2`, 0.45), dots([[-6, -95], [6.4, -95]], 0.5));
  return p;
}

function robed(kind: "cultist" | "bandit"): Part[] {
  const p: Part[] = [];
  const cult = kind === "cultist";
  if (cult) {
    p.push(S(`M-12.4 -1 L-9.4 -4.4 L-6.2 -0.6 L-3 -4 L0 -0.6 L3.2 -4 L6.4 -0.6 L9.6 -4.4 L12.6 -1 Q13.6 -30 12.4 -62 Q0 -68 -12.4 -62 Q-13.6 -30 -12.4 -1 Z`, "cloth2"));
    p.push(D(`M-7 -5 Q-6 -26 -5.6 -48 M-1.6 -3 Q-2 -26 -2 -48 M3 -3 Q3.4 -26 3 -48 M8 -5 Q8 -26 7 -48 M-10.4 -10 Q-10.6 -30 -9.4 -50 M11 -12 Q11 -30 10 -50`, 0.5));
    p.push(S(`M-5.4 -46 h10.8 v40 l-5.4 3 l-5.4 -3 Z`, "dark"), D(`M-3 -40 l3 4 l3 -4 M-3 -30 l3 4 l3 -4 M-3 -20 l3 4 l3 -4`, 0.6, "red"));
    p.push(S(`M-12.6 -50 Q0 -47.6 12.6 -50 L12.6 -46.6 Q0 -44.4 -12.6 -46.6 Z`, "dark"), D(`M5 -46 L6 -36 M7 -46 L9 -38`, 0.8));
    p.push(D(`M-5.6 -60 H5.6 L0 -51 Z`, 1.2, "red"), dots([[0, -57.4]], 0.9, "red"));
  } else {
    for (const s of [-1, 1]) {
      p.push(S(`M${s * 1.2} -46 L${s * 9.6} -47 L${s * 8.6} -14 L${s * 2.2} -14 Z`, "leather"));
      p.push(S(`M${s * 1.4} -18 L${s * 9.6} -18 L${s * 11} -2 Q${s * 12} 0 ${s * 5} 0.4 L${s * 1.4} 0 Z`, "dark"));
      p.push(S(`M${s * 1} -19.6 L${s * 10.2} -19.6 L${s * 10.4} -15.6 L${s * 1.2} -15.6 Z`, "leather"));
    }
    p.push(S(`M-13 -73 Q-14.4 -55 -11.6 -36 L-6 -34 L0 -36.4 L6 -34 L11.6 -36 Q14.4 -55 13 -73 Q0 -76 -13 -73 Z`, "leather"));
    p.push(D(`M-12 -66 L9.6 -44 M0 -73 V-37 M-11 -58 h22 M-11.6 -48 h23`, 0.5), dots([[-8, -62], [-4, -62], [4, -62], [8, -62], [-8, -53], [-4, -53], [4, -53], [8, -53]], 0.5));
    p.push(S(`M-11.6 -46 Q0 -44 11.6 -46 L11.6 -42 Q0 -40 -11.6 -42 Z`, "dark"), S(`M4.6 -42 h5 v5.4 q-2.5 1.4 -5 0 Z`, "leather"));
  }
  // Arms in sleeves.
  p.push(L(`M-12 -66 Q-17.6 -56 -17.4 -46`, 5.4, "cloth2"), S(ell(-17.4, -45, 2.4, 2.4), "skin"));
  p.push(L(`M12 -66 Q18.6 -62 19.4 -54`, 5.4, "cloth2"), S(ell(19.8, -53, 2.4, 2.4), "skin"));
  if (cult) {
    p.push(S(ell(-18, -53, 7.6, 7.6), "glow"));
    p.push(S(`M-20.2 -50.6 h4.4 v8.6 h-4.4 Z`, "paper"), S(`M-18 -50.6 Q-20.4 -54.6 -18 -58 Q-15.6 -54.6 -18 -50.6 Z`, "paper"), D(`M-18 -51.6 Q-19 -54 -18 -56`, 1.2, "red"), D(`M-20.2 -46 q2.2 1.4 4.4 0`, 0.4));
    p.push(L(`M19.6 -55 Q22.4 -60.6 20.2 -64.6 Q23.4 -69 21.2 -74`, 1.9, "metal"), S(`M16.8 -56.4 h6.2 v1.8 h-6.2 Z`, "dark"));
  } else {
    p.push(S(`M18 -53 Q30 -63 32 -84 Q35 -66 22 -50 Z`, "metal"), S(`M15.4 -55.4 L23.4 -50.4 L22.4 -49 L14.4 -54 Z`, "dark"), D(`M21 -56 Q29 -66 31 -80`, 0.4));
    p.push(L(`M-17.4 -44 L-19.6 -33`, 1.7, "metal"), S(`M-19.6 -45.4 h4.4 v1.4 h-4.4 Z`, "dark"));
  }
  // The hood: a cultist's face is shadow with red eyes; a bandit masked to the nose.
  p.push(S(`M-10.4 -65 Q-12.6 -90 0 -92.6 Q12.6 -90 10.4 -65 Q5.4 -70.6 0 -70.6 Q-5.4 -70.6 -10.4 -65 Z`, "cloth2"), D(`M-8 -70 Q-8.6 -84 -3 -88 M8.4 -70 Q9 -84 3.4 -88`, 0.45));
  if (cult) p.push(D(`M-10.4 -65 Q-5.4 -70.6 0 -70.6 Q5.4 -70.6 10.4 -65`, 1.1, "red"));
  p.push(S(ell(0, -79, 5.8, 7), cult ? "dark" : "skin"));
  if (cult) p.push(dots([[-2.2, -80], [2.2, -80]], 0.95, "red"));
  else {
    p.push(S(`M-5.8 -77 Q0 -75 5.8 -77 L5.6 -72.6 Q0 -70.6 -5.6 -72.6 Z`, "dark"), D(`M-3.6 -75 q3.6 1.2 7.2 0`, 0.4, "paper"));
    p.push(D(`M-4 -83.4 l2.6 0.7 M4 -83.4 l-2.6 0.7 M-3.6 -80.6 h2 M3.6 -80.6 h-2 M0.6 -80 Q1.6 -78.4 0.4 -77.6`, 0.75));
  }
  return p;
}

// --- The base --------------------------------------------------------------------------------------

/** Scenery on the base: rocks and grass, bones for the dead and their servants. */
function scenery(look: MiniLook, behind: boolean): Part[] {
  const grim = look.kind === "skeleton" || look.kind === "cultist";
  if (behind) {
    return [
      S(`M-24 2 L-22 -3.6 L-17.4 -4.6 L-14 -1 L-15 2.6 Z`, "stone"),
      D(`M-21 -2 l2 1.4 M-18 -3.4 l1 2`, 0.4),
      S(`M13 1 L15 -3 L20 -3.6 L23 0.4 L21 2.6 Z`, "stone"),
      D(`M-11 1 l-1 -4 M-10 1 l0.4 -4.6 M-9 1 l1.4 -3.6 M9 1.6 l-1 -3.4 M10 1.6 l0.6 -4 M26 0.4 l-0.8 -3 M27 0.6 l1 -3`, 0.5),
    ];
  }
  if (grim)
    return [
      S(`M-21 6 Q-21.4 0.6 -17 0.4 Q-12.6 0.6 -13 6 L-14.6 7.4 H-19.4 Z`, "bone"),
      S(`${ell(-18.8, 3.6, 1.2, 1.3)} ${ell(-15.2, 3.6, 1.2, 1.3)}`, "dark"),
      L(`M12 6 L22 4`, 1.6, "bone"),
    ];
  return [S(`M-6 6.4 L-4 3.6 L0 3.2 L2 6.4 Z`, "stone"), D(`M14 6 l-0.6 -3 M15 6 l0.6 -3.4 M16 6 l1.4 -2.6`, 0.5)];
}

// --- Drawing the passes ----------------------------------------------------------------------------

export function partsOf(look: MiniLook): Part[] {
  switch (look.kind) {
    case "hero": return hero(look.species, look.calling);
    case "goblin": return goblin();
    case "wolf": return wolf(0.9);
    case "rat": return wolf(0.55, true);
    case "skeleton": return skeleton();
    case "cultist": return robed("cultist");
    case "bandit": return robed("bandit");
  }
}

/** The SVG of a figure: x from −64 to 64, y from −132 (top) to 8 (feet at 0). */
export function miniSvg(look: MiniLook, foe: boolean, px = 128): string {
  const parts = [...scenery(look, true), ...partsOf(look), ...scenery(look, false)];
  const edge = foe ? DARKRED : INK;
  let outline = "";
  let base = "";
  let shade = "";
  let detail = "";
  const tr = (p: Part) => (p.t ? ` transform="${p.t}"` : "");
  for (const p of parts) {
    if ("dot" in p) {
      detail += `<path d="${p.d}"${tr(p)} fill="${p.dot === "red" ? RED : p.dot === "paper" ? PAPER : INK}"/>`;
    } else if ("detail" in p) {
      const c = p.ink === "red" ? RED : p.ink === "paper" ? PAPER : INK;
      detail += `<path d="${p.d}"${tr(p)} fill="none" stroke="${c}" stroke-width="${p.detail}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if ("line" in p) {
      outline += `<path d="${p.d}"${tr(p)} fill="none" stroke="${edge}" stroke-width="${p.line + 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
      base += `<path d="${p.d}"${tr(p)} fill="none" stroke="${TONES[p.tone]}" stroke-width="${p.line}" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (p.tone !== "glow" && p.tone !== "dark") shade += `<path d="${p.d}"${tr(p)} fill="none" stroke="url(#mh)" stroke-width="${p.line}" stroke-linecap="round"/>`;
    } else {
      outline += `<path d="${p.d}"${tr(p)} fill="${edge}" stroke="${edge}" stroke-width="2.6" stroke-linejoin="round"/>`;
      base += `<path d="${p.d}"${tr(p)} fill="${TONES[p.tone]}" stroke="${edge}" stroke-width="0.6" stroke-linejoin="round"/>`;
      if (p.tone !== "glow" && p.tone !== "dark") shade += `<path d="${p.d}"${tr(p)} fill="url(#mh)"/>`;
    }
  }
  const h = (px * 140) / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${f(h)}" viewBox="-64 -132 128 140">
<defs>
<pattern id="mh" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.2" stroke="${INK}" stroke-width="0.5" opacity="0.8"/></pattern>
<pattern id="mx" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="2.2" stroke="${INK}" stroke-width="0.45" opacity="0.8"/></pattern>
<clipPath id="ms"><path d="M1 -140 Q9 -60 2 12 L80 12 L80 -140 Z"/></clipPath>
<clipPath id="mt"><path d="M8 -140 Q15 -60 10 12 L80 12 L80 -140 Z"/></clipPath>
</defs>
<g>${outline}</g><g>${base}</g>
<g clip-path="url(#ms)" opacity="0.62">${shade}</g>
<g clip-path="url(#mt)" opacity="0.5">${shade.replaceAll("url(#mh)", "url(#mx)")}</g>
<g>${detail}</g>
</svg>`;
}

/** What a creature looks like, from its sheet: a hero's species and class, or a kind of monster. */
export function lookOf(u: Unit): MiniLook {
  const name = u.name.toLowerCase();
  const type = (u.stats.creatureType ?? "").toLowerCase();
  if (u.side === "party") {
    const traits = u.stats.traits.map((t) => t.name).join(" ");
    const species: Species = /Dwarven/.test(traits) ? "dwarf" : /Fey Ancestry|Trance|Keen Senses/.test(traits) ? "elf" : /Halfling|Luck|Brave/.test(traits) ? "halfling" : "human";
    const cls = (u.stats.className ?? "").toLowerCase();
    const calling: Calling = /rogue|ranger|monk/.test(cls) ? "rogue" : /cleric|paladin|druid/.test(cls) ? "cleric" : /wizard|sorcerer|warlock|bard/.test(cls) ? "wizard" : "fighter";
    return { kind: "hero", species, calling };
  }
  if (/\brat\b|rats/.test(name)) return { kind: "rat" };
  if (/wolf|hound|jackal|hyena|warg|dog/.test(name) || type === "beast") return { kind: "wolf" };
  if (/skeleton|zombie|ghoul|wight|bones/.test(name) || type === "undead") return { kind: "skeleton" };
  if (/cultist|acolyte|priest|fanatic|imp|fiend/.test(name) || type === "fiend") return { kind: "cultist" };
  if (/goblin|kobold|hobgoblin/.test(name) || /goblinoid/.test(type)) return { kind: "goblin" };
  return { kind: "bandit" };
}

/** How tall a figure stands, relative to a human. */
export const heightOf = (look: MiniLook) => (look.kind === "hero" ? SPECIES[look.species].h : look.kind === "goblin" ? 0.75 : look.kind === "wolf" ? 0.7 : look.kind === "rat" ? 0.45 : 1);

// --- Images, made once -------------------------------------------------------------------------------

const cache = new Map<string, HTMLImageElement>();
const waiting = new Map<string, (() => void)[]>();

/** The figure as an image (ready or not yet: `onReady` is called once it is). */
export function miniImage(look: MiniLook, foe: boolean, onReady: () => void): HTMLImageElement | null {
  const key = `${JSON.stringify(look)}|${foe}`;
  const have = cache.get(key);
  if (have?.complete && have.naturalWidth) return have;
  if (have) {
    waiting.get(key)?.push(onReady);
    return null;
  }
  const img = new Image();
  cache.set(key, img);
  waiting.set(key, [onReady]);
  img.onload = () => {
    for (const fn of waiting.get(key) ?? []) fn();
    waiting.delete(key);
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(miniSvg(look, foe, 320))}`;
  return null;
}
