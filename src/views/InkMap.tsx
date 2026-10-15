import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mulberry32 } from "../game/rng";
import { EXPLORE_CELL, EXPLORE_COLS, EXPLORE_ROWS, WORLD_H, WORLD_W, dist, inPatch, onRoad, type Band, type Patch, type Place, type Pt, type World } from "../game/world";

/**
 * The world drawn in pen and ink: paper with a dot grid, scalloped forests,
 * hatched mountains, marsh tufts, a stippled lake shore, dotted roads, and
 * little hand-drawn settlements in hexagon frames. Colour only where it
 * matters: water, the company's banner, danger. Unexplored land stays blank
 * paper and fills in as the company sees it.
 */

export const INK = "#1d1a16";
export const PAPER = "#f6f1e6";
const WASH = "#d5e4ec";
export const RED = "#a8322a";
const FONT = "'IM Fell English', 'Cinzel', serif";

/** Points spread over an area (jittered grid), kept where `keep` says. */
function scatter(rng: () => number, x0: number, y0: number, x1: number, y1: number, step: number, keep: (p: Pt) => boolean): Pt[] {
  const out: Pt[] = [];
  for (let y = y0; y < y1; y += step) {
    for (let x = x0 + ((Math.round(y / step) % 2) * step) / 2; x < x1; x += step) {
      const p = { x: x + (rng() - 0.5) * step * 0.7, y: y + (rng() - 0.5) * step * 0.7 };
      if (keep(p)) out.push(p);
    }
  }
  return out;
}

/** The bumpy outline of a patch as points. */
function outline(p: Patch, scale = 1, n = 40): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = p.bumps.length;
    const t = (i / n) * k;
    const b = p.bumps[Math.floor(t) % k]! * (1 - (t % 1)) + p.bumps[(Math.floor(t) + 1) % k]! * (t % 1);
    return { x: p.x + Math.cos(a) * p.r * b * scale, y: p.y + Math.sin(a) * p.r * b * scale };
  });
}

const smooth = (pts: Pt[]) => {
  const n = pts.length;
  const mid = (i: number) => ({ x: (pts[i % n]!.x + pts[(i + 1) % n]!.x) / 2, y: (pts[i % n]!.y + pts[(i + 1) % n]!.y) / 2 });
  let d = `M ${mid(0).x} ${mid(0).y}`;
  for (let i = 1; i <= n; i++) d += ` Q ${pts[i % n]!.x} ${pts[i % n]!.y} ${mid(i).x} ${mid(i).y}`;
  return d + " Z";
};

/** A cloud-like edge of little arcs, for forests. */
const scalloped = (pts: Pt[]) => {
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[(i - 1) % pts.length]!;
    const b = pts[i % pts.length]!;
    const r = dist(a, b) * 0.6;
    d += ` A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
  }
  return d + " Z";
};

interface Scenery {
  trees: Pt[];
  peaks: (Pt & { s: number })[];
  tufts: Pt[];
  grass: Pt[];
  stipple: (Pt & { r: number })[];
}

function scenery(w: World): Scenery {
  const rng = mulberry32((w.seed ^ 0x1a2b3c) >>> 0).rng;
  const near = (p: Pt) => w.places.some((q) => dist(q, p) < 26);
  const trees: Pt[] = [];
  const peaks: (Pt & { s: number })[] = [];
  const tufts: Pt[] = [];
  const stipple: (Pt & { r: number })[] = [];
  for (const p of w.patches) {
    const inside = (q: Pt) => inPatch(q, { ...p, r: p.r * 0.9 }) && !onRoad(w, q) && !near(q);
    if (p.terrain === "forest") trees.push(...scatter(rng, p.x - p.r * 1.2, p.y - p.r * 1.2, p.x + p.r * 1.2, p.y + p.r * 1.2, 12, inside));
    if (p.terrain === "hills") peaks.push(...scatter(rng, p.x - p.r * 1.2, p.y - p.r * 1.2, p.x + p.r * 1.2, p.y + p.r * 1.2, 22, inside).map((q) => ({ ...q, s: 0.8 + rng() * 0.6 })));
    if (p.terrain === "marsh") tufts.push(...scatter(rng, p.x - p.r * 1.2, p.y - p.r * 1.2, p.x + p.r * 1.2, p.y + p.r * 1.2, 13, inside));
    // Stippling just outside the edge: dense near it, thinning out.
    const ring = p.terrain === "water" ? 90 : 45;
    for (let i = 0; i < ring; i++) {
      const a = rng() * Math.PI * 2;
      const k = p.bumps[Math.floor((a / (Math.PI * 2)) * p.bumps.length) % p.bumps.length]!;
      const r = p.r * k * (1.02 + rng() ** 2 * (p.terrain === "water" ? 0.35 : 0.22));
      stipple.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, r: 0.6 + rng() * 0.7 });
    }
  }
  const grass = scatter(rng, 10, 10, WORLD_W - 10, WORLD_H - 10, 34, (q) => !w.patches.some((p) => inPatch(q, { ...p, r: p.r * 1.15 })) && !onRoad(w, q) && !near(q));
  return { trees, peaks, tufts, grass, stipple };
}

export function InkDefs() {
  return (
    <defs>
      <pattern id="ink-dots" width={EXPLORE_CELL} height={EXPLORE_CELL} patternUnits="userSpaceOnUse">
        <circle cx={EXPLORE_CELL / 2} cy={EXPLORE_CELL / 2} r={0.9} fill="#b9b1a0" />
      </pattern>
      <pattern id="ink-foliage" width={9} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
        <path d="M 0 6 q 2 -4 4.5 0 q 2 -4 4.5 0" fill="none" stroke={INK} strokeWidth={0.5} opacity={0.55} />
      </pattern>
      <pattern id="ink-hatch" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={4} stroke={INK} strokeWidth={0.7} />
      </pattern>
      {/* A slight hand-drawn wobble on every line. */}
      <filter id="ink-wobble" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={4} />
        <feDisplacementMap in="SourceGraphic" scale={2.6} />
      </filter>
      <filter id="ink-soft">
        <feGaussianBlur stdDeviation={9} />
      </filter>
    </defs>
  );
}

/** The land: everything that is drawn only where the company has been. */
export function InkLand({ world: w }: { world: World }) {
  const sc = useMemo(() => scenery(w), [w]);
  return (
    <g filter="url(#ink-wobble)">
      {/* Grass strokes on open ground */}
      {sc.grass.map((g, i) => (
        <path key={`g${i}`} d={`M ${g.x - 2.5} ${g.y} l 1 -3 M ${g.x} ${g.y} l 0 -4 M ${g.x + 2.5} ${g.y} l -1 -3`} stroke={INK} strokeWidth={0.6} opacity={0.5} />
      ))}
      {sc.stipple.map((s, i) => (
        <circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill={INK} opacity={0.7} />
      ))}
      {w.patches.map((p) => {
        if (p.terrain === "water") {
          return (
            <g key={p.id}>
              <path d={smooth(outline(p))} fill={WASH} stroke={INK} strokeWidth={2} />
              <path d={smooth(outline(p, 0.82))} fill="none" stroke={INK} strokeWidth={0.7} strokeDasharray="6 5" opacity={0.6} />
              <path d={smooth(outline(p, 0.62))} fill="none" stroke={INK} strokeWidth={0.6} strokeDasharray="3 7" opacity={0.45} />
              <path d={`M ${p.x - 12} ${p.y} q 4 -4 8 0 t 8 0 M ${p.x + 4} ${p.y + 12} q 4 -4 8 0`} fill="none" stroke={INK} strokeWidth={0.8} opacity={0.6} />
            </g>
          );
        }
        if (p.terrain === "forest") {
          return (
            <g key={p.id}>
              <path d={scalloped(outline(p, 1, 34))} fill={PAPER} stroke={INK} strokeWidth={1.6} />
              <path d={scalloped(outline(p, 1, 34))} fill="url(#ink-foliage)" />
            </g>
          );
        }
        if (p.terrain === "marsh") return <path key={p.id} d={smooth(outline(p))} fill="none" stroke={INK} strokeWidth={0.7} strokeDasharray="2 4" opacity={0.6} />;
        return null;
      })}
      {sc.trees.map((t, i) => (
        <g key={`t${i}`} transform={`translate(${t.x} ${t.y})`}>
          <line x1={0} y1={2} x2={0} y2={6} stroke={INK} strokeWidth={0.9} />
          <path d="M -4 3 Q -5.5 -1 -2.5 -2.5 Q -1 -6 1.5 -4 Q 5 -3.5 4 0.5 Q 4.5 3 1 3 Z" fill={PAPER} stroke={INK} strokeWidth={0.9} />
          <path d="M 1.5 -1 q 1 1.5 0.5 3" fill="none" stroke={INK} strokeWidth={0.5} />
        </g>
      ))}
      {sc.peaks.map((p, i) => (
        <g key={`p${i}`} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
          <path d="M -12 7 L -2 -10 L 3 -4 L 6 -8 L 13 7" fill={PAPER} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          {/* Shade on the east face */}
          <path d="M -2 -10 L 1 7 M 0 -6 L 4 7 M 1.5 -3 L 7 7 M 6 -8 L 8 7 M 7 -5 L 11 7" stroke={INK} strokeWidth={0.6} />
          <path d="M -12 7 L 13 7" stroke={INK} strokeWidth={0.6} opacity={0.4} />
        </g>
      ))}
      {sc.tufts.map((t, i) => (
        <path key={`m${i}`} d={`M ${t.x - 4} ${t.y + 1} h 8 M ${t.x - 2} ${t.y} l -0.5 -4 M ${t.x} ${t.y} l 0 -5 M ${t.x + 2} ${t.y} l 0.5 -4`} stroke={INK} strokeWidth={0.6} opacity={0.75} />
      ))}
    </g>
  );
}

/** Roads, dotted. */
export function InkRoads({ world: w }: { world: World }) {
  return (
    <g filter="url(#ink-wobble)">
      {w.roads.map((r, i) => {
        const d = `M ${r[0]!.x} ${r[0]!.y} Q ${r[1]!.x} ${r[1]!.y} ${r[2]!.x} ${r[2]!.y}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={PAPER} strokeWidth={7} />
            <path d={d} fill="none" stroke={INK} strokeWidth={1.8} strokeDasharray="0.5 5" strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}

/** The explored cells as a small blurred picture (made only when a new cell is seen): scaled up, it gives the fog soft edges for free. */
export function useFogImage(explored: string): string {
  return useMemo(() => {
    const k = 4;
    const cells = document.createElement("canvas");
    cells.width = EXPLORE_COLS * k;
    cells.height = EXPLORE_ROWS * k;
    const c = cells.getContext("2d")!;
    c.fillStyle = "black";
    c.fillRect(0, 0, cells.width, cells.height);
    c.fillStyle = "white";
    for (let i = 0; i < explored.length; i++) if (explored[i] === "1") c.fillRect((i % EXPLORE_COLS) * k - 1, Math.floor(i / EXPLORE_COLS) * k - 1, k + 2, k + 2);
    const soft = document.createElement("canvas");
    soft.width = cells.width;
    soft.height = cells.height;
    const s = soft.getContext("2d")!;
    s.filter = "blur(3px)";
    s.drawImage(cells, 0, 0);
    return soft.toDataURL();
  }, [explored]);
}

/** The explored land as a mask: the fog picture, plus a soft circle for what the company sees right now. */
export function ExploredMask({ fog, sight, pos }: { fog: string; sight: number; pos: Pt }) {
  return (
    <>
      <radialGradient id="ink-sight">
        <stop offset="0.75" stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity={0} />
      </radialGradient>
      <mask id="ink-explored" maskUnits="userSpaceOnUse" x={0} y={0} width={WORLD_W} height={WORLD_H}>
        <rect width={WORLD_W} height={WORLD_H} fill="black" />
        <image href={fog} x={0} y={0} width={WORLD_W} height={WORLD_H} preserveAspectRatio="none" />
        <circle cx={pos.x} cy={pos.y} r={sight * 1.1} fill="url(#ink-sight)" />
      </mask>
    </>
  );
}

/** How many pixels per map unit the land is baked at (sharp up to the closest zoom). */
const BAKE = 3;

/**
 * The land (terrain and roads, with their hand-drawn wobble) drawn once into a
 * picture: the map then shows one image instead of thousands of filtered
 * shapes, so marching and panning stay smooth. The baker draws the land into
 * a hidden SVG, turns it into a picture and goes away.
 */
export function useBakedLand(world: World | null): { url: string | null; baker: ReactNode } {
  const [url, setUrl] = useState<string | null>(null);
  const [bakedFor, setBakedFor] = useState<World | null>(null);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const baker =
    world && bakedFor !== world ? (
      <LandBaker
        key={world.seed}
        world={world}
        onBaked={(u) => {
          setUrl(u);
          setBakedFor(world);
        }}
      />
    ) : null;
  return { url: bakedFor === world ? url : null, baker };
}

function LandBaker({ world, onBaked }: { world: World; onBaked: (url: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    // The copy for the picture must not carry the "hidden" style of the baker itself.
    const copy = el.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute("style");
    copy.removeAttribute("aria-hidden");
    const markup = new XMLSerializer().serializeToString(copy);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = WORLD_W * BAKE;
      canvas.height = WORLD_H * BAKE;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob && alive) onBaked(URL.createObjectURL(blob));
      });
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    return () => {
      alive = false;
    };
    // Baked once per world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={WORLD_W * BAKE} height={WORLD_H * BAKE} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", visibility: "hidden" }} aria-hidden>
      <InkDefs />
      <rect width={WORLD_W} height={WORLD_H} fill={PAPER} />
      <InkLand world={world} />
      <InkRoads world={world} />
    </svg>
  );
}

// --- Places -----------------------------------------------------------------------------

function House({ x, y, s = 1, flip }: { x: number; y: number; s?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <rect x={-5} y={-1} width={10} height={6} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <path d="M -6.5 -1 L 0 -7 L 6.5 -1 Z" fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <path d="M -4 -1 L 0 -5 M -1.5 -1 L 1.5 -4 M 1 -1 L 3 -3" stroke={INK} strokeWidth={0.5} />
      <rect x={-1} y={1.5} width={2} height={3.5} fill={INK} />
    </g>
  );
}

function Tower({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-2.5} y={-8} width={5} height={13} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <path d="M -3.5 -8 L 0 -13 L 3.5 -8 Z" fill={INK} />
      <rect x={-0.7} y={-5} width={1.4} height={2.2} fill={INK} />
    </g>
  );
}

const hexagon = (r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return `${Math.cos(a) * r},${Math.sin(a) * r}`;
  }).join(" ");

/** A place drawn in ink, framed; unknown places are a question mark. */
export const InkPlace = memo(function InkPlace({ place: p, known, here }: { place: Place; known: boolean; here: boolean }) {
  const settlement = p.kind === "village" || p.kind === "town" || p.kind === "city";
  const r = p.kind === "city" ? 20 : settlement ? 17 : 14;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      {settlement || p.kind === "home" ? (
        <polygon points={hexagon(r)} fill={PAPER} stroke={INK} strokeWidth={here ? 2.6 : 1.6} />
      ) : (
        <circle r={r} fill={PAPER} stroke={p.kind === "lair" && known ? RED : INK} strokeWidth={here ? 2.6 : 1.4} strokeDasharray={known ? undefined : "3 3"} />
      )}
      {!known ? (
        <text y={5} textAnchor="middle" fontFamily={FONT} fontSize={15} fill={INK}>
          ?
        </text>
      ) : p.kind === "home" ? (
        <g>
          <path d="M -9 7 L 0 -8 L 9 7 Z" fill={PAPER} stroke={INK} strokeWidth={1} />
          <path d="M 0 -8 L 0 7 M -3 7 L 0 1 L 3 7" stroke={INK} strokeWidth={0.8} fill="none" />
          <path d="M -4.5 -0.5 L -7 5 M 4.5 -0.5 L 7 5" stroke={INK} strokeWidth={0.5} />
          <line x1={0} y1={-8} x2={0} y2={-14} stroke={INK} strokeWidth={0.8} />
          <path d="M 0 -14 L 6 -12.5 L 0 -11 Z" fill={RED} />
        </g>
      ) : p.kind === "village" ? (
        <g>
          <House x={-4} y={2} />
          <House x={6} y={-3} s={0.8} flip />
        </g>
      ) : p.kind === "town" ? (
        <g>
          <House x={-6} y={4} />
          <House x={5} y={5} s={0.85} flip />
          <Tower x={1} y={-3} />
        </g>
      ) : p.kind === "city" ? (
        <g>
          <circle r={14} fill="none" stroke={INK} strokeWidth={1.4} strokeDasharray="3 1.5" />
          <House x={-6} y={5} s={0.9} />
          <House x={6} y={5} s={0.8} flip />
          <Tower x={-6} y={-4} s={0.8} />
          <Tower x={4} y={-3} s={1.1} />
        </g>
      ) : p.kind === "lair" ? (
        <g>
          <path d="M -10 7 Q -9 -9 0 -9 Q 9 -9 10 7 Z" fill={PAPER} stroke={INK} strokeWidth={1} />
          <path d="M -6 7 Q -5 -4 0 -4 Q 5 -4 6 7 Z" fill={INK} />
          <path d="M -4 -1 l 1 3 l 1 -3 M 1 -1 l 1 3 l 1 -3" stroke={PAPER} strokeWidth={0.8} fill="none" />
          <path d="M -10 7 L -12 3 M 10 7 L 12 2" stroke={INK} strokeWidth={0.7} />
        </g>
      ) : (
        <g>
          <rect x={-8} y={-6} width={3.5} height={12} fill={PAPER} stroke={INK} strokeWidth={0.9} />
          <path d="M -1.5 6 L -1.5 -2 L 0 -4 L 2 -1 L 2 6 Z" fill={PAPER} stroke={INK} strokeWidth={0.9} />
          <rect x={5} y={0} width={3.5} height={6} fill={PAPER} stroke={INK} strokeWidth={0.9} />
          <path d="M -10 6 L 10 6" stroke={INK} strokeWidth={0.9} />
          <path d="M -7 -3 h 2 M -7 0 h 2 M 5.5 2.5 h 2" stroke={INK} strokeWidth={0.4} />
        </g>
      )}
      {known && (
        <text y={r + 13} textAnchor="middle" fontFamily={FONT} fontSize={settlement ? 14 : 12} fontStyle={p.kind === "lair" || p.kind === "site" ? "italic" : undefined} fill={INK} stroke={PAPER} strokeWidth={3.5} paintOrder="stroke">
          {p.name}
        </text>
      )}
    </g>
  );
});

/** The company: a banner on a pole, swaying while it marches, and its footprints. */
export function InkCompany({ pos, trail, marching, count }: { pos: Pt; trail: Pt[]; marching: boolean; count: number }) {
  return (
    <g>
      {trail.map((t, i) => {
        const prev = trail[i - 1] ?? t;
        const a = Math.atan2(t.y - prev.y, t.x - prev.x);
        const side = i % 2 ? 1.6 : -1.6;
        return <ellipse key={i} cx={t.x - Math.sin(a) * side} cy={t.y + Math.cos(a) * side} rx={1.6} ry={1} transform={`rotate(${(a * 180) / Math.PI} ${t.x - Math.sin(a) * side} ${t.y + Math.cos(a) * side})`} fill={INK} opacity={0.2 + (0.6 * i) / trail.length} />;
      })}
      <g transform={`translate(${pos.x} ${pos.y})`}>
        <ellipse rx={9} ry={3} cy={4} fill={INK} opacity={0.18} />
        <g className={marching ? "motion-village [animation:walk-bob_0.5s_ease-in-out_infinite]" : undefined}>
          <line x1={0} y1={4} x2={0} y2={-22} stroke={INK} strokeWidth={1.6} />
          <path d="M 0 -22 Q 7 -24 13 -21 Q 9 -18 13 -14 Q 7 -16 0 -14 Z" fill={RED} stroke={INK} strokeWidth={0.9} />
          <circle cy={-23} r={1.5} fill={INK} />
          <text x={-3} y={-1} textAnchor="end" fontFamily={FONT} fontSize={10} fill={INK} stroke={PAPER} strokeWidth={3} paintOrder="stroke">
            {count}
          </text>
        </g>
      </g>
    </g>
  );
}

/** A band on the move: crossed blades in a red ring; a dashed line when it's after the company. */
export function InkBand({ band: b, chasing, pos }: { band: Band; chasing: boolean; pos: Pt }) {
  return (
    <g>
      {chasing && <line x1={b.x} y1={b.y} x2={pos.x} y2={pos.y} stroke={RED} strokeWidth={1.2} strokeDasharray="2 4" />}
      <g transform={`translate(${b.x} ${b.y})`}>
        <circle r={9} fill={PAPER} stroke={RED} strokeWidth={1.6} />
        <path d="M -5 -5 L 5 5 M 5 -5 L -5 5 M -6 -2 L -2 -6 M 6 -2 L 2 -6" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
        {b.contract && (
          <g transform="translate(9 -12)">
            <path d="M 0 0 L 0 -12 L 8 -9 L 0 -6" fill={RED} stroke={INK} strokeWidth={0.8} />
            <text x={2.5} y={-7.5} fontSize={6} fontWeight={700} fill={PAPER}>
              !
            </text>
          </g>
        )}
        <text y={21} textAnchor="middle" fontFamily={FONT} fontStyle="italic" fontSize={11} fill={RED} stroke={PAPER} strokeWidth={3} paintOrder="stroke">
          {b.name}
        </text>
      </g>
    </g>
  );
}

/** A compass rose for the corner. */
export function Compass() {
  return (
    <svg viewBox="-30 -30 60 60" className="h-16 w-16" aria-hidden>
      <circle r={18} fill={PAPER} stroke={INK} strokeWidth={1} />
      <circle r={14} fill="none" stroke={INK} strokeWidth={0.5} strokeDasharray="1 2" />
      <path d="M 0 -26 L 4 0 L 0 26 L -4 0 Z" fill={PAPER} stroke={INK} strokeWidth={1} />
      <path d="M 0 -26 L 4 0 L 0 0 Z M 0 26 L -4 0 L 0 0 Z" fill={INK} />
      <path d="M -26 0 L 0 3 L 26 0 L 0 -3 Z" fill={PAPER} stroke={INK} strokeWidth={0.8} />
      <path d="M 26 0 L 0 -3 L 0 0 Z M -26 0 L 0 3 L 0 0 Z" fill={INK} />
      <text y={-20} textAnchor="middle" fontFamily={FONT} fontSize={9} fill={RED} stroke={PAPER} strokeWidth={2} paintOrder="stroke">
        N
      </text>
    </svg>
  );
}
