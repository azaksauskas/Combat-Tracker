import type { Unit } from "./state";

/**
 * Ink miniatures for the battle board: each creature drawn like a pen-and-ink
 * figure on a base, built from its kind (a hero's species and class, or the
 * sort of monster it is). Every figure is a list of parts drawn in passes, the
 * way an ink illustration is: a heavy outer contour, flat tones, hatched shade
 * on the side away from the light, then fine interior lines. The result is an
 * SVG, turned once into an image per kind and side.
 */

export type Species = "human" | "dwarf" | "elf" | "halfling";
export type Calling = "fighter" | "rogue" | "cleric" | "wizard";
export type MiniLook = { kind: "hero"; species: Species; calling: Calling } | { kind: "goblin" | "wolf" | "rat" | "skeleton" | "cultist" | "bandit" };

type Tone = "cloth" | "cloth2" | "skin" | "metal" | "dark" | "wood" | "bone" | "glow" | "paper";
/** A filled shape, a thick stroke (an arm, a haft, a bone), or a fine detail line. */
type Part = { d: string; tone: Tone; w?: number } | { d: string; line: number; tone: Tone } | { d: string; detail: number; tone?: "ink" | "red" | "paper" };

const INK = "#1d1a16";
const RED = "#a8322a";
const DARKRED = "#5e1a15";
const PAPER = "#f6f1e6";
const GLOW = "#f3e3a0";

const TONES: Record<Tone, string> = {
  cloth: "#e7dcc6",
  cloth2: "#d8ccb2",
  skin: "#f6efe2",
  metal: "#f1eee8",
  dark: "#3a332b",
  wood: "#e3d3b4",
  bone: "#f3eddc",
  glow: GLOW,
  paper: PAPER,
};

// --- Shapes -------------------------------------------------------------------------------

const f = (n: number) => n.toFixed(1);
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
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

// --- Heroes: a body by species, dressed by calling ----------------------------------------------

interface Build {
  /** Height (a human is 100), shoulder, waist and hem half-widths, head radius. */
  h: number;
  sw: number;
  ww: number;
  hw: number;
  hr: number;
}
const BUILD: Record<Species, Build> = {
  human: { h: 100, sw: 13, ww: 10, hw: 11, hr: 7.2 },
  dwarf: { h: 78, sw: 16.5, ww: 14, hw: 14.5, hr: 7.6 },
  elf: { h: 104, sw: 11.5, ww: 8.5, hw: 10, hr: 6.6 },
  halfling: { h: 64, sw: 10, ww: 8.5, hw: 9.5, hr: 7 },
};

function hero(species: Species, calling: Calling): Part[] {
  const b = BUILD[species];
  const top = -b.h;
  const headY = top + b.hr + 1;
  const chin = headY + b.hr;
  const sh = chin + 4; // shoulder line
  const waist = -b.h * 0.47;
  const robe = calling === "cleric" || calling === "wizard";
  const p: Part[] = [];

  // Behind: cloak (rogue, cleric), long hair (elf).
  if (calling === "rogue" || calling === "cleric") p.push({ d: `M${-b.sw + 1} ${sh} Q${-b.sw - 9} ${waist} ${-b.hw - 7} -1 Q0 2 ${b.hw + 7} -1 Q${b.sw + 9} ${waist} ${b.sw - 1} ${sh} Z`, tone: "cloth2" });
  if (species === "elf") p.push({ d: `M${-b.hr - 1} ${headY - 2} Q${-b.hr - 5} ${sh + 10} ${-b.hr - 2} ${sh + 22} L${b.hr + 2} ${sh + 22} Q${b.hr + 5} ${sh + 10} ${b.hr + 1} ${headY - 2} Z`, tone: "cloth" });

  // Legs and feet, or a robe to the ground.
  if (robe) {
    p.push({ d: `M${-b.ww} ${waist} Q${-b.hw - 2} ${waist * 0.4} ${-b.hw - 3} -1 Q0 2 ${b.hw + 3} -1 Q${b.hw + 2} ${waist * 0.4} ${b.ww} ${waist} Z`, tone: calling === "wizard" ? "cloth2" : "cloth" });
    p.push({ d: `M${-b.ww * 0.4} ${waist + 4} Q${-b.ww * 0.5} ${waist * 0.4} ${-b.ww * 0.6} -2 M${b.ww * 0.45} ${waist + 4} Q${b.ww * 0.55} ${waist * 0.4} ${b.ww * 0.7} -2`, detail: 0.7 });
  } else {
    const knee = waist * 0.45;
    for (const s of [-1, 1]) {
      p.push({ d: `M${s * 1} ${waist + 2} L${s * (b.ww - 0.5)} ${waist + 1} L${s * (b.ww - 1.5)} ${knee} L${s * (b.ww - 2.5)} -9 L${s * 2} -9 L${s * 1.5} ${knee} Z`, tone: calling === "fighter" ? "cloth2" : "cloth" });
      if (species === "halfling") p.push({ d: ell(s * (b.ww * 0.55), -2.5, 4.6, 2.6), tone: "skin" }, { d: `M${s * (b.ww * 0.3)} -4 l${s * 1} -1.4 M${s * (b.ww * 0.6)} -4 l${s * 1} -1.4`, detail: 0.5 });
      else p.push({ d: `M${s * 1.2} -11 L${s * (b.ww - 1)} -11 L${s * (b.ww + 0.5)} -2 Q${s * (b.ww + 2)} 0 ${s * (b.ww * 0.5)} 0.5 L${s * 1.2} 0 Z`, tone: "dark" });
    }
  }

  // Torso and belt.
  const torsoTone: Tone = calling === "fighter" ? "metal" : calling === "rogue" ? "cloth2" : calling === "cleric" ? "cloth" : "cloth2";
  p.push({ d: `M${-b.sw} ${sh} Q${-b.sw - 1} ${(sh + waist) / 2} ${-b.ww} ${waist + 2} L${b.ww} ${waist + 2} Q${b.sw + 1} ${(sh + waist) / 2} ${b.sw} ${sh} Q0 ${sh - 3} ${-b.sw} ${sh} Z`, tone: torsoTone });
  if (calling === "fighter") {
    // Mail: rows of rings.
    let rows = "";
    for (let y = sh + 4; y < waist; y += 3.2) rows += `M${-b.sw + 2} ${f(y)} Q0 ${f(y + 1.6)} ${b.sw - 2} ${f(y)} `;
    p.push({ d: rows, detail: 0.45 });
    // Tasset below the belt.
    p.push({ d: `M${-b.ww - 1} ${waist + 2} L${-b.ww - 2} ${waist + 11} Q0 ${waist + 14} ${b.ww + 2} ${waist + 11} L${b.ww + 1} ${waist + 2} Z`, tone: "metal" }, { d: `M${-b.ww} ${waist + 6} Q0 ${waist + 9} ${b.ww} ${waist + 6} M0 ${waist + 3} V${waist + 13}`, detail: 0.6 });
  }
  if (calling === "cleric") {
    p.push({ d: `M-5 ${sh + 1} L-6 ${-6} L0 -3 L6 -6 L5 ${sh + 1} Z`, tone: "paper" });
    p.push({ d: `${ell(0, sh + 12, 3, 3)} ${rays(0, sh + 12, 4, 6.5, 8)}`, detail: 0.8 });
  }
  if (calling === "rogue") p.push({ d: `M${-b.sw + 2} ${sh + 2} L${b.ww - 1} ${waist} M${-b.sw + 5} ${sh + 1} L${b.ww + 1} ${waist - 3}`, detail: 0.7 });
  if (calling === "wizard") p.push({ d: `${star(-4, sh + 10, 2.6, 0.9)} ${star(5, sh + 18, 2, 0.7)} ${star(-2, waist * 0.5, 2.4, 0.8)} ${star(5, waist * 0.25, 2, 0.7)}`, detail: 0.6 });
  p.push({ d: `M${-b.ww - 0.5} ${waist - 1} Q0 ${waist + 1} ${b.ww + 0.5} ${waist - 1} L${b.ww + 0.5} ${waist + 2.6} Q0 ${waist + 4.6} ${-b.ww - 0.5} ${waist + 2.6} Z`, tone: "dark" });
  p.push({ d: `M-1.8 ${waist - 0.6} h3.6 v3.6 h-3.6 Z`, detail: 0.7, tone: "paper" });
  if (calling === "rogue") p.push({ d: `M${b.ww - 4} ${waist + 2} h5 v5 h-5 Z`, tone: "cloth" });
  if (calling === "wizard") p.push({ d: `M${b.ww - 5} ${waist + 2} h6 v7 h-6 Z`, tone: "dark" }, { d: `M${b.ww - 4} ${waist + 4} h4`, detail: 0.5, tone: "paper" });

  // Shoulders.
  if (calling === "fighter") for (const s of [-1, 1]) p.push({ d: `M${s * (b.sw - 7)} ${sh - 1} Q${s * (b.sw + 4)} ${sh - 3} ${s * (b.sw + 3)} ${sh + 7} L${s * (b.sw - 6)} ${sh + 6} Z`, tone: "metal" }, { d: `M${s * (b.sw - 5)} ${sh + 2} Q${s * (b.sw + 1)} ${sh} ${s * (b.sw + 2)} ${sh + 5}`, detail: 0.5 });

  // Arms: left side of the picture holds the off hand, right side the weapon hand.
  const armW = b.sw * 0.42;
  const sleeve: Tone = calling === "fighter" ? "metal" : calling === "wizard" ? "cloth2" : calling === "cleric" ? "cloth" : "cloth2";
  const off = calling === "fighter" ? { x: -b.sw + 1, y: sh + 21 } : calling === "rogue" ? { x: -b.sw - 4, y: waist + 3 } : calling === "cleric" ? { x: -b.sw - 6, y: sh - 2 } : { x: -b.sw - 3, y: sh + 10 };
  const main = calling === "fighter" ? { x: b.sw + 4, y: waist - 2 } : calling === "rogue" ? { x: b.sw + 4, y: waist + 1 } : calling === "cleric" ? { x: b.sw + 5, y: sh - 3 } : { x: b.sw + 5, y: waist - 4 };
  for (const [hand, s] of [[off, -1], [main, 1]] as const) {
    p.push({ d: `M${s * (b.sw - 2)} ${sh + 2} Q${s * (b.sw + 3)} ${(sh + hand.y) / 2 + 2} ${hand.x} ${hand.y}`, line: armW, tone: sleeve });
    p.push({ d: ell(hand.x, hand.y, armW * 0.42, armW * 0.42), tone: "skin" });
  }

  // Neck and head.
  p.push({ d: `M-2.6 ${chin - 2} h5.2 v5 h-5.2 Z`, tone: "skin" });
  p.push({ d: ell(0, headY, b.hr * 0.86, b.hr), tone: "skin" });
  if (species === "elf") for (const s of [-1, 1]) p.push({ d: `M${s * (b.hr * 0.75)} ${headY - 1} L${s * (b.hr + 4.5)} ${headY - 5} L${s * (b.hr * 0.8)} ${headY + 2} Z`, tone: "skin" });
  if (species === "halfling") for (const s of [-1, 1]) p.push({ d: `M${s * (b.hr * 0.78)} ${headY - 1} L${s * (b.hr + 2)} ${headY - 3} L${s * (b.hr * 0.82)} ${headY + 2} Z`, tone: "skin" });
  // Face: brows, eyes, nose, mouth.
  const ey = headY - b.hr * 0.05;
  p.push({ d: `M${-b.hr * 0.5} ${ey - 1.8} l${b.hr * 0.3} -0.5 M${b.hr * 0.5} ${ey - 1.8} l${-b.hr * 0.3} -0.5 M${-b.hr * 0.42} ${ey} h${b.hr * 0.2} M${b.hr * 0.42} ${ey} h${-b.hr * 0.2} M0 ${ey + 0.5} l0.8 ${b.hr * 0.38} l-1 0.3 M${-b.hr * 0.22} ${headY + b.hr * 0.55} q${b.hr * 0.22} 0.8 ${b.hr * 0.44} 0`, detail: 0.75 });

  // Hair, beards, braids.
  if (species === "dwarf") {
    p.push({ d: `M${-b.hr * 0.85} ${headY + 1} Q${-b.hr - 1} ${chin + 12} 0 ${chin + 15} Q${b.hr + 1} ${chin + 12} ${b.hr * 0.85} ${headY + 1} Q${b.hr * 0.4} ${headY + b.hr * 0.75} 0 ${headY + b.hr * 0.5} Q${-b.hr * 0.4} ${headY + b.hr * 0.75} ${-b.hr * 0.85} ${headY + 1} Z`, tone: "cloth2" });
    p.push({ d: `M-3 ${chin + 2} Q-3.5 ${chin + 8} -1.5 ${chin + 12} M0 ${chin + 1} V${chin + 14} M3 ${chin + 2} Q3.5 ${chin + 8} 1.5 ${chin + 12} M${-b.hr * 0.35} ${headY + b.hr * 0.55} q${b.hr * 0.35} -1.2 ${b.hr * 0.7} 0`, detail: 0.6 });
  }
  if (species === "halfling") for (const a of [-160, -130, -100, -70, -40, -15, 165]) p.push({ d: ell(Math.cos((a * Math.PI) / 180) * b.hr * 0.85, headY + Math.sin((a * Math.PI) / 180) * b.hr * 0.95, 2.4, 2.4), tone: "cloth2" });
  if (species === "human" && calling !== "fighter" && calling !== "rogue" && calling !== "cleric") p.push({ d: `M${-b.hr * 0.88} ${headY} Q${-b.hr} ${headY - b.hr * 1.2} 0 ${headY - b.hr * 1.1} Q${b.hr} ${headY - b.hr * 1.2} ${b.hr * 0.88} ${headY} Q${b.hr * 0.4} ${headY - b.hr * 0.6} 0 ${headY - b.hr * 0.55} Q${-b.hr * 0.4} ${headY - b.hr * 0.6} ${-b.hr * 0.88} ${headY} Z`, tone: "cloth2" });

  // Headgear by calling.
  if (calling === "fighter") {
    p.push({ d: `M${-b.hr - 0.8} ${headY - 0.5} Q${-b.hr - 0.5} ${headY - b.hr * 1.45} 0 ${headY - b.hr * 1.4} Q${b.hr + 0.5} ${headY - b.hr * 1.45} ${b.hr + 0.8} ${headY - 0.5} Z`, tone: "metal" });
    p.push({ d: `M-1.3 ${headY - b.hr * 1.35} h2.6 v${b.hr * 1.5} h-2.6 Z`, tone: "metal" });
    p.push({ d: `M${-b.hr - 0.8} ${headY - 0.5} H${b.hr + 0.8} M${-b.hr * 0.6} ${headY - b.hr * 0.9} Q0 ${headY - b.hr * 1.15} ${b.hr * 0.6} ${headY - b.hr * 0.9}`, detail: 0.6 });
  }
  if (calling === "rogue") {
    p.push({ d: `M${-b.hr - 2.5} ${chin + 3} Q${-b.hr - 3} ${headY - b.hr * 1.5} 0 ${headY - b.hr * 1.6} Q${b.hr + 3} ${headY - b.hr * 1.5} ${b.hr + 2.5} ${chin + 3} Q${b.hr * 0.9} ${headY - b.hr * 0.3} 0 ${headY - b.hr * 0.75} Q${-b.hr * 0.9} ${headY - b.hr * 0.3} ${-b.hr - 2.5} ${chin + 3} Z`, tone: "cloth2" });
    p.push({ d: `M${-b.hr * 0.8} ${headY - b.hr * 0.45} Q0 ${headY - b.hr * 0.7} ${b.hr * 0.8} ${headY - b.hr * 0.45} L${b.hr * 0.7} ${headY - b.hr * 0.15} Q0 ${headY - b.hr * 0.35} ${-b.hr * 0.7} ${headY - b.hr * 0.15} Z`, tone: "dark" });
  }
  if (calling === "cleric") {
    p.push({ d: `M${-b.hr - 2} ${chin + 4} Q${-b.hr - 2.5} ${headY - b.hr * 1.4} 0 ${headY - b.hr * 1.45} Q${b.hr + 2.5} ${headY - b.hr * 1.4} ${b.hr + 2} ${chin + 4} Q${b.hr * 0.95} ${headY} ${b.hr * 0.8} ${headY - b.hr * 0.55} Q0 ${headY - b.hr * 1.05} ${-b.hr * 0.8} ${headY - b.hr * 0.55} Q${-b.hr * 0.95} ${headY} ${-b.hr - 2} ${chin + 4} Z`, tone: "cloth" });
    if (species === "dwarf") for (const s of [-1, 1]) p.push({ d: `M${s * 4} ${chin + 2} Q${s * 5} ${chin + 10} ${s * 3.5} ${chin + 17}`, line: 2.4, tone: "cloth2" });
  }
  if (calling === "wizard") {
    p.push({ d: `M${-b.hr - 7} ${headY - b.hr * 0.75} Q0 ${headY - b.hr * 1.15} ${b.hr + 7} ${headY - b.hr * 0.75} Q0 ${headY - b.hr * 0.35} ${-b.hr - 7} ${headY - b.hr * 0.75} Z`, tone: "cloth2" });
    p.push({ d: `M${-b.hr * 0.75} ${headY - b.hr * 0.85} Q${-b.hr * 0.4} ${headY - b.hr * 2.6} ${b.hr * 0.9} ${headY - b.hr * 3.6} Q${b.hr * 1.5} ${headY - b.hr * 3.4} ${b.hr * 1.15} ${headY - b.hr * 3} Q${b.hr * 0.5} ${headY - b.hr * 2.2} ${b.hr * 0.75} ${headY - b.hr * 0.85} Z`, tone: "cloth2" });
    p.push({ d: `M${-b.hr * 0.72} ${headY - b.hr * 1.05} Q0 ${headY - b.hr * 1.25} ${b.hr * 0.74} ${headY - b.hr * 1.05}`, detail: 1.2 });
  }

  // Gear.
  if (calling === "fighter") {
    // Sword up from the right hand; heater shield on the left arm.
    p.push({ d: `M${main.x} ${main.y + 4} L${main.x + 6} ${main.y - 36}`, line: 2.8, tone: "metal" });
    p.push({ d: `M${main.x - 4} ${main.y - 1} L${main.x + 5} ${main.y + 1}`, line: 2.2, tone: "dark" });
    const sx = off.x - 2;
    const sy = off.y + 1;
    p.push({ d: `M${sx - 10} ${sy - 12} H${sx + 10} V${sy + 2} Q${sx + 10} ${sy + 14} ${sx} ${sy + 19} Q${sx - 10} ${sy + 14} ${sx - 10} ${sy + 2} Z`, tone: "wood" });
    p.push({ d: `M${sx - 7.5} ${sy - 9.5} H${sx + 7.5} V${sy + 2} Q${sx + 7.5} ${sy + 11.5} ${sx} ${sy + 15.5} Q${sx - 7.5} ${sy + 11.5} ${sx - 7.5} ${sy + 2} Z M${sx} ${sy - 9.5} V${sy + 15.5} M${sx - 7.5} ${sy - 1} H${sx + 7.5}`, detail: 0.8 });
  }
  if (calling === "rogue") {
    p.push({ d: `M${main.x} ${main.y} L${main.x + 10} ${main.y - 12}`, line: 1.8, tone: "metal" }, { d: `M${main.x - 2} ${main.y - 3} L${main.x + 2.5} ${main.y + 2}`, line: 1.6, tone: "dark" });
    p.push({ d: `M${off.x} ${off.y} L${off.x - 3} ${off.y + 13}`, line: 1.8, tone: "metal" }, { d: `M${off.x - 3} ${off.y + 0.5} L${off.x + 3} ${off.y - 0.5}`, line: 1.6, tone: "dark" });
  }
  if (calling === "cleric") {
    p.push({ d: `M${main.x - 1} ${main.y + 6} L${main.x + 3} ${main.y - 20}`, line: 2.4, tone: "wood" });
    p.push({ d: ell(main.x + 3.5, main.y - 23, 4.6, 4.6), tone: "metal" }, { d: `M${main.x + 3.5} ${main.y - 28} V${main.y - 18} M${main.x - 1} ${main.y - 23} H${main.x + 8}`, detail: 0.6 });
    p.push({ d: ell(off.x - 1, off.y - 7, 8.5, 8.5), tone: "glow" });
    p.push({ d: ell(off.x - 1, off.y - 7, 3.4, 3.4), tone: "metal" }, { d: rays(off.x - 1, off.y - 7, 4.5, 7.5, 8), detail: 0.8 });
  }
  if (calling === "wizard") {
    p.push({ d: `M${off.x} ${0} L${off.x} ${top - 6}`, line: 2.6, tone: "wood" });
    p.push({ d: ell(off.x, top - 13, 8, 8), tone: "glow" });
    p.push({ d: `M${off.x} ${top - 6} L${off.x - 3.5} ${top - 12} L${off.x} ${top - 20} L${off.x + 3.5} ${top - 12} Z`, tone: "paper" });
    p.push({ d: `${rays(off.x, top - 13, 6, 9.5, 6)}`, detail: 0.7 });
    p.push({ d: `${star(main.x + 6, main.y - 6, 4, 1.3)} ${star(main.x + 10, main.y + 2, 2.6, 0.9)}`, detail: 0.8 });
  }
  return p;
}

// --- Monsters -------------------------------------------------------------------------------

function goblin(): Part[] {
  const p: Part[] = [];
  // Small round shield behind the left arm, spear in the right hand.
  p.push({ d: `M30 -3 L18 -86`, line: 2.4, tone: "wood" }, { d: `M15.5 -84 L18 -97 L21 -84 Z`, tone: "metal" });
  for (const s of [-1, 1]) {
    p.push({ d: `M${s * 3} -26 L${s * 6} -14 L${s * 5} -2`, line: 4.2, tone: "skin" });
    p.push({ d: `M${s * 2} -2 L${s * 9} -2 L${s * 8} 0.6 L${s * 2} 0.6 Z`, tone: "skin" });
  }
  p.push({ d: `M-10 -42 Q-13 -30 -10 -22 L-7 -18 L-4 -22 L-1 -17 L2 -22 L5 -17 L8 -22 L11 -19 Q13 -30 10 -42 Q0 -46 -10 -42 Z`, tone: "cloth2" });
  p.push({ d: `M-6 -40 L-4 -24 M4 -40 L3 -26 M-9 -33 Q0 -31 9 -33`, detail: 0.6 });
  p.push({ d: `M-10 -32 Q0 -30 10 -32 L10 -29 Q0 -27 -10 -29 Z`, tone: "dark" });
  p.push({ d: `M-10 -41 Q-16 -34 -19 -26`, line: 4, tone: "skin" }, { d: `M10 -41 Q17 -36 20 -30`, line: 4, tone: "skin" });
  p.push({ d: ell(-19, -27, 9, 9), tone: "wood" }, { d: `${ell(-19, -27, 6, 6)} M-19 -36 V-18 M-28 -27 H-10`, detail: 0.6 });
  p.push({ d: ell(20, -30, 2.4, 2.4), tone: "skin" });
  // Head: wide, with big ears and a grin.
  p.push({ d: `M-7 -55 L-23 -63 L-9 -49 Z M7 -55 L23 -63 L9 -49 Z`, tone: "skin" }, { d: `M-10 -55 L-18 -59 M10 -55 L18 -59`, detail: 0.6 });
  p.push({ d: `M-9 -52 Q-10 -62 0 -63 Q10 -62 9 -52 Q9 -45 0 -43 Q-9 -45 -9 -52 Z`, tone: "skin" });
  p.push({ d: `M-6 -56.5 L-2 -54.8 M6 -56.5 L2 -54.8 M-4.5 -53.3 h2 M4.5 -53.3 h-2 M0 -54 L2.5 -50 L-0.5 -49.5 M-5 -47.5 Q0 -44.8 5 -47.5 M-3 -47 l0.8 1.6 M3 -47 l-0.8 1.6`, detail: 0.85 });
  return p;
}

function wolf(scale = 1, rat = false): Part[] {
  const k = (n: number) => n * scale;
  const P = (d: string) => d.replace(/-?\d+(\.\d+)?/g, (m) => f(Number(m) * scale));
  const p: Part[] = [];
  // Far legs (behind), then tail, body, near legs, head.
  p.push({ d: P(`M18 -30 L22 -14 L20 -2 L24 -2 M-26 -30 L-30 -16 L-27 -2 L-23 -2`), line: k(3.6), tone: "cloth2" });
  p.push(
    rat
      ? { d: P(`M-36 -32 Q-56 -30 -60 -14`), line: k(1.6), tone: "skin" }
      : { d: P(`M-34 -38 Q-50 -40 -56 -26 Q-58 -18 -52 -14 Q-50 -24 -44 -28 Q-40 -32 -33 -32 Z`), tone: "cloth" },
  );
  p.push({ d: P(`M-36 -36 Q-34 -48 -16 -48 Q4 -50 16 -48 Q26 -47 30 -40 Q32 -30 26 -24 Q14 -22 6 -26 Q-6 -24 -16 -26 Q-30 -24 -36 -30 Z`), tone: "cloth" });
  // Fur: short strokes along the back and flank.
  p.push({ d: P(`M-28 -44 l4 3 M-18 -46 l4 3 M-8 -47 l4 3 M2 -47 l4 3 M12 -46 l4 3 M-24 -36 l3 3 M-12 -37 l3 3 M0 -37 l3 3 M14 -36 l3 3 M-30 -32 l3 2`), detail: k(0.6) });
  p.push({ d: P(`M24 -30 L28 -14 L26 -2 L31 -2 M-18 -28 L-22 -14 L-19 -2 L-14 -2`), line: k(3.8), tone: "cloth" });
  p.push({ d: P(`M22 -42 Q28 -54 34 -56 L37 -64 L40 -56 Q48 -55 56 -50 Q60 -48 59 -45 L50 -42 Q42 -38 34 -34 Q26 -34 22 -42 Z`), tone: "cloth" });
  if (rat) p.push({ d: ell(k(35), k(-60), k(3.6), k(3.6)), tone: "skin" });
  else p.push({ d: P(`M33 -56 L33 -66 L38 -57 Z M38 -57 L41 -66 L42 -55 Z`), tone: "cloth" });
  p.push({ d: P(`M41 -53 l3 1 M50 -44 l1.5 2 l1.5 -2 l1.5 2 M44 -47 Q50 -46 56 -48 M30 -48 l3 4 M26 -44 l3 4`), detail: k(0.7) });
  p.push({ d: ell(k(59), k(-46.5), k(1.5), k(1.2)), tone: "dark" });
  return p;
}

function skeleton(): Part[] {
  const p: Part[] = [];
  const bone = (d: string, w = 2.6) => p.push({ d, line: w, tone: "bone" });
  // Rusty sword in the right hand, cracked shield on the left.
  p.push({ d: `M19 -46 L27 -92`, line: 2.6, tone: "metal" }, { d: `M14 -50 L24 -46`, line: 2, tone: "dark" }, { d: `M24.5 -80 l2 0.6 M23 -70 l2 0.6`, detail: 0.8 });
  // Legs: thigh, shin, foot; knees as knobs.
  for (const s of [-1, 1]) {
    bone(`M${s * 5} -40 L${s * 6} -21`);
    bone(`M${s * 6} -20 L${s * 6.5} -2`, 2.2);
    bone(`M${s * 6.5} -1 L${s * 11} 0`, 2.2);
    p.push({ d: ell(s * 6, -20.5, 2.2, 2.2), tone: "bone" });
  }
  // Tattered loincloth, pelvis.
  p.push({ d: `M-8 -44 L-9 -30 L-6 -33 L-3 -27 L0 -32 L3 -28 L6 -33 L9 -30 L8 -44 Z`, tone: "cloth2" });
  p.push({ d: `M-9 -45 Q-10 -51 -4 -50 L0 -47 L4 -50 Q10 -51 9 -45 Q5 -40 0 -42 Q-5 -40 -9 -45 Z`, tone: "bone" });
  // Spine and ribcage.
  bone(`M0 -48 L0 -76`, 2);
  let ribs = "";
  for (let i = 0; i < 5; i++) {
    const y = -72 + i * 4.2;
    const w = 10 - Math.abs(i - 1.5) * 1.3;
    ribs += `M-1 ${f(y)} Q${f(-w - 2)} ${f(y + 1)} ${f(-w + 1)} ${f(y + 4)} M1 ${f(y)} Q${f(w + 2)} ${f(y + 1)} ${f(w - 1)} ${f(y + 4)} `;
  }
  p.push({ d: ribs, line: 1.5, tone: "bone" });
  // Collarbones, arms.
  bone(`M-12 -77 L12 -77`, 2);
  bone(`M-12 -77 L-15 -62`);
  bone(`M-15 -61 L-19 -48`, 2.2);
  bone(`M12 -77 L16 -63`);
  bone(`M16 -62 L19 -48`, 2.2);
  p.push({ d: `M-28 -66 L-15 -68 L-13 -53 L-20 -44 L-27 -50 Z`, tone: "wood" }, { d: `M-21 -67 L-20 -58 L-23 -50 M-27 -58 L-14 -60`, detail: 0.7 });
  // Skull and jaw.
  p.push({ d: `M-7.5 -88 Q-8 -99 0 -99.5 Q8 -99 7.5 -88 Q7.5 -83 4 -82 L3.6 -80 H-3.6 L-4 -82 Q-7.5 -83 -7.5 -88 Z`, tone: "bone" });
  p.push({ d: `M-4.5 -80.5 Q0 -77 4.5 -80.5 L4 -78 Q0 -75.5 -4 -78 Z`, tone: "bone" });
  p.push({ d: `${ell(-3, -89, 2.2, 2.5)} ${ell(3, -89, 2.2, 2.5)}`, tone: "dark" });
  p.push({ d: `M0 -86.5 L-1 -84 H1 Z M-2.4 -80.5 V-78.6 M0 -80.6 V-78.4 M2.4 -80.5 V-78.6 M4 -96 L2 -92 L3.5 -90`, detail: 0.7 });
  p.push({ d: `${ell(-3, -89, 0.7, 0.7)} ${ell(3, -89, 0.7, 0.7)}`, detail: 0.9, tone: "red" });
  return p;
}

function robed(kind: "cultist" | "bandit"): Part[] {
  const p: Part[] = [];
  const cult = kind === "cultist";
  if (cult) {
    p.push({ d: `M-12 -1 L-9 -4 L-6 -1 L-3 -4 L0 -1 L3 -4 L6 -1 L9 -4 L12 -1 Q13 -30 12 -62 Q0 -68 -12 -62 Q-13 -30 -12 -1 Z`, tone: "cloth2" });
    p.push({ d: `M-6 -4 Q-5 -26 -5 -48 M6 -4 Q5 -26 4 -48`, detail: 0.7 });
    p.push({ d: `M-5 -58 H5 L0 -49 Z`, detail: 1.2, tone: "red" });
    p.push({ d: `M-12 -40 Q0 -38 12 -40`, line: 1.6, tone: "dark" }, { d: `M4 -39 L5 -28 M6 -39 L8 -30`, detail: 0.8 });
  } else {
    // Bandit: legs, boots, leather coat.
    for (const s of [-1, 1]) {
      p.push({ d: `M${s} -46 L${s * 9.5} -47 L${s * 8.5} -10 L${s * 2} -10 Z`, tone: "cloth" });
      p.push({ d: `M${s * 1.2} -12 L${s * 9.5} -12 L${s * 11} -2 Q${s * 12} 0 ${s * 5} 0.5 L${s * 1.2} 0 Z`, tone: "dark" });
    }
    p.push({ d: `M-13 -72 Q-14 -55 -11 -38 L11 -38 Q14 -55 13 -72 Q0 -75 -13 -72 Z`, tone: "cloth2" });
    p.push({ d: `M-11 -46 Q0 -44 11 -46 L11 -42 Q0 -40 -11 -42 Z`, tone: "dark" }, { d: `M-12 -66 L9 -44 M0 -72 V-46`, detail: 0.7 });
  }
  // Arms.
  p.push({ d: `M-12 -66 Q-17 -56 -17 -46`, line: 5.2, tone: cult ? "cloth2" : "cloth2" }, { d: ell(-17, -45, 2.4, 2.4), tone: "skin" });
  p.push({ d: `M12 -66 Q18 -62 19 -54`, line: 5.2, tone: "cloth2" }, { d: ell(19.5, -53, 2.4, 2.4), tone: "skin" });
  if (cult) {
    p.push({ d: ell(-18, -52, 7, 7), tone: "glow" });
    p.push({ d: `M-20 -50 h4 v8 h-4 Z`, tone: "paper" }, { d: `M-18 -50 Q-20 -54 -18 -57 Q-16 -54 -18 -50 Z`, tone: "paper" }, { d: `M-18 -51 Q-19 -53 -18 -55`, detail: 1.2, tone: "red" });
    p.push({ d: `M19.5 -55 Q22 -60 20 -64 Q23 -68 21 -73`, line: 1.8, tone: "metal" }, { d: `M17 -55 L22.5 -53`, line: 1.6, tone: "dark" });
  } else {
    p.push({ d: `M19 -53 Q30 -62 32 -80`, line: 2.6, tone: "metal" }, { d: `M15.5 -55 L22.5 -50`, line: 2, tone: "dark" });
    p.push({ d: `M-17 -44 L-19 -34`, line: 1.6, tone: "metal" });
  }
  // Head in a hood; the cultist's face is shadow with red eyes, the bandit's masked.
  p.push({ d: `M-10 -66 Q-12 -90 0 -92 Q12 -90 10 -66 Q5 -71 0 -71 Q-5 -71 -10 -66 Z`, tone: "cloth2" });
  p.push({ d: ell(0, -79, 5.8, 7), tone: cult ? "dark" : "skin" });
  if (cult) p.push({ d: `${ell(-2.2, -80, 0.9, 0.9)} ${ell(2.2, -80, 0.9, 0.9)}`, detail: 1.3, tone: "red" });
  else {
    p.push({ d: `M-5.8 -77 Q0 -75 5.8 -77 L5.6 -73 Q0 -71 -5.6 -73 Z`, tone: "dark" });
    p.push({ d: `M-3.6 -80.5 h2 M3.6 -80.5 h-2 M-4 -83 l2.5 0.6 M4 -83 l-2.5 0.6`, detail: 0.8 });
  }
  return p;
}

// --- Drawing the passes -------------------------------------------------------------------------

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
  const parts = partsOf(look);
  const edge = foe ? DARKRED : INK;
  const red = RED;
  const isShape = (p: Part): p is { d: string; tone: Tone; w?: number } => !("line" in p) && !("detail" in p);
  const isLine = (p: Part): p is { d: string; line: number; tone: Tone } => "line" in p;
  let outline = "";
  let base = "";
  let shade = "";
  let detail = "";
  for (const p of parts) {
    if (isShape(p)) {
      outline += `<path d="${p.d}" fill="${edge}" stroke="${edge}" stroke-width="3" stroke-linejoin="round"/>`;
      base += `<path d="${p.d}" fill="${TONES[p.tone]}" stroke="${edge}" stroke-width="0.7" stroke-linejoin="round"/>`;
      if (p.tone !== "glow" && p.tone !== "dark") shade += `<path d="${p.d}" fill="url(#mh)"/>`;
    } else if (isLine(p)) {
      outline += `<path d="${p.d}" fill="none" stroke="${edge}" stroke-width="${p.line + 2.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
      base += `<path d="${p.d}" fill="none" stroke="${TONES[p.tone]}" stroke-width="${p.line}" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (p.tone !== "glow" && p.tone !== "dark") shade += `<path d="${p.d}" fill="none" stroke="url(#mh)" stroke-width="${p.line}" stroke-linecap="round"/>`;
    } else {
      const c = p.tone === "red" ? red : p.tone === "paper" ? PAPER : INK;
      detail += `<path d="${p.d}" fill="none" stroke="${c}" stroke-width="${p.detail}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  const h = (px * 140) / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${f(h)}" viewBox="-64 -132 128 140">
<defs>
<pattern id="mh" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.4" stroke="${INK}" stroke-width="0.55" opacity="0.75"/></pattern>
<clipPath id="ms"><path d="M2 -140 Q10 -60 3 10 L70 10 L70 -140 Z"/></clipPath>
</defs>
<g>${outline}</g><g>${base}</g><g clip-path="url(#ms)" opacity="0.7">${shade}</g><g>${detail}</g>
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
export const heightOf = (look: MiniLook) => (look.kind === "hero" ? BUILD[look.species].h / 100 : look.kind === "goblin" ? 0.95 : look.kind === "wolf" ? 0.7 : look.kind === "rat" ? 0.45 : 1);

// --- Images, made once ---------------------------------------------------------------------------

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
    for (const f of waiting.get(key) ?? []) f();
    waiting.delete(key);
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(miniSvg(look, foe, 256))}`;
  return null;
}
