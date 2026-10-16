import type { CSSProperties, ReactNode } from "react";
import { create } from "zustand";
import { mulberry32 } from "../game/rng";
import { BUILDING, buildingsOf, characterOf, ROLE, type Building, type Role, type Townsfolk } from "../game/settlement";
import type { Place } from "../game/world";
import { FONT, INK, PAPER, RED, Smoke, anim } from "./InkMap";

/**
 * A settlement seen from the street, drawn in ink (Battle Brothers style):
 * its buildings along a road, each one clickable, townsfolk to talk to, and
 * the small life of the place (smoke, walkers, a turning mill, swinging signs).
 */

/** Which building is open in the side panel, and who the company is talking to. */
export const useTownUi = create<{ building: Building; talk: Townsfolk | null }>(() => ({ building: "board", talk: null }));

const W = 1000;
const H = 490;
const GROUND = 352;

const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);

const line = { stroke: INK, strokeWidth: 1.6, fill: PAPER, strokeLinejoin: "round" as const };
const thin = { stroke: INK, strokeWidth: 0.9, fill: "none" };

/** A pitched-roof house, bottom centre at 0,0. */
function House({ w = 70, h = 50, roof = 34, x = 0, chimney, door = true }: { w?: number; h?: number; roof?: number; x?: number; chimney?: boolean; door?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {chimney && <rect x={w / 4} y={-h - roof + 4} width={8} height={20} {...line} />}
      <rect x={-w / 2} y={-h} width={w} height={h} {...line} />
      <path d={`M ${-w / 2 - 6} ${-h} L 0 ${-h - roof} L ${w / 2 + 6} ${-h} Z`} {...line} />
      {/* Thatch strokes */}
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d={`M ${-w / 2 + i * (w / 6)} ${-h - 2} l 6 -${roof * 0.5}`} {...thin} />
      ))}
      {door && <path d={`M -7 0 L -7 -20 Q 0 -27 7 -20 L 7 0`} {...line} />}
      <rect x={-w / 2 + 8} y={-h + 12} width={12} height={11} {...line} strokeWidth={1} />
      <path d={`M ${-w / 2 + 14} ${-h + 12} v 11 M ${-w / 2 + 8} ${-h + 17.5} h 12`} {...thin} />
      {chimney && (
        <g transform={`translate(${w / 4 + 4} ${-h - roof})`}>
          <g transform="scale(3)">
            <Smoke x={0} y={0} />
          </g>
        </g>
      )}
    </g>
  );
}

function Pine({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} 0) scale(${s})`}>
      <g className="ink-anim-base" style={anim("sway", 5 + (x % 3), (x % 7) / 3)}>
        <path d="M 0 -70 L -16 -30 L -8 -30 L -20 0 L 20 0 L 8 -30 L 16 -30 Z" {...line} strokeWidth={1.3} />
        <path d="M -8 -18 l 6 -6 M 4 -40 l 5 -5 M -3 -52 l 4 -4" {...thin} />
      </g>
      <rect x={-2.5} y={0} width={5} height={8} fill={INK} />
    </g>
  );
}

/** Each building, bottom centre at 0,0, about 150 wide. */
function BuildingArt({ kind, place }: { kind: Building; place: Place }) {
  switch (kind) {
    case "board":
      return (
        <g>
          <House w={110} h={62} roof={40} chimney />
          {/* The notice board in front, papers flapping */}
          <g transform="translate(70 0)">
            <path d="M -18 0 V -46 M 18 0 V -46" stroke={INK} strokeWidth={3} />
            <rect x={-24} y={-62} width={48} height={30} {...line} />
            <path d="M -28 -62 L 0 -72 L 28 -62" {...line} />
            {[-14, 0, 12].map((x, i) => (
              <rect key={x} className="ink-anim-base" x={x - 5} y={-58 + (i % 2) * 4} width={10} height={13} fill={PAPER} stroke={INK} strokeWidth={0.8} style={anim("sway", 2 + i * 0.4, i * 0.3)} />
            ))}
          </g>
        </g>
      );
    case "market":
      return (
        <g>
          {[-50, 10, 68].map((x, i) => (
            <g key={x} transform={`translate(${x} 0)`}>
              <path d="M -26 0 V -44 M 26 0 V -44" stroke={INK} strokeWidth={2} />
              <rect x={-26} y={-20} width={52} height={20} {...line} />
              <path d="M -32 -44 L 32 -44 L 26 -58 L -26 -58 Z" {...line} />
              {[-26, -13, 0, 13].map((s) => (
                <path key={s} d={`M ${s} -44 L ${s + 6.5} -44 L ${s + 5} -58 L ${s + 1.5} -58 Z`} fill={i % 2 ? RED : INK} opacity={0.85} />
              ))}
              <circle cx={-10} cy={-24} r={5} {...line} strokeWidth={1} />
              <circle cx={2} cy={-25} r={5} {...line} strokeWidth={1} />
              <rect x={10} y={-30} width={10} height={10} {...line} strokeWidth={1} />
            </g>
          ))}
          <path d="M -80 0 L -60 -14 L -40 0" {...line} strokeWidth={1.2} />
        </g>
      );
    case "tavern":
      return (
        <g>
          <rect x={-62} y={-104} width={124} height={50} {...line} />
          <House w={124} h={54} roof={46} chimney door />
          <rect x={-50} y={-94} width={14} height={14} {...line} strokeWidth={1} />
          <rect x={36} y={-94} width={14} height={14} {...line} strokeWidth={1} />
          <path d="M -62 -104 L 0 -150 L 62 -104" {...line} />
          {/* Swinging sign */}
          <path d="M 62 -70 h 26" stroke={INK} strokeWidth={2.5} />
          <g transform="translate(80 -70)">
            <g className="ink-anim" style={{ ...anim("sway", 2.4), transformOrigin: "50% 0%" }}>
              <path d="M -1 0 v 6 M 13 0 v 6" stroke={INK} strokeWidth={1} />
              <rect x={-6} y={6} width={26} height={18} {...line} strokeWidth={1.2} />
              <path d="M 2 10 h 8 v 10 h -8 Z M 10 12 h 3 v 5 h -3" {...thin} />
            </g>
          </g>
          <ellipse cx={-80} cy={-8} rx={10} ry={8} {...line} strokeWidth={1.2} />
          <path d="M -90 -8 h 20" {...thin} />
        </g>
      );
    case "temple":
      return place.kind === "village" ? (
        <g>
          <rect x={-40} y={-60} width={80} height={60} {...line} />
          <path d="M -46 -60 L 0 -96 L 46 -60 Z" {...line} />
          <rect x={-10} y={-130} width={20} height={36} {...line} />
          <path d="M -14 -130 L 0 -150 L 14 -130 Z" {...line} />
          <g className="ink-anim" style={{ ...anim("sway", 1.6), transformOrigin: "50% 0%" }}>
            <path d="M -5 -110 Q 0 -124 5 -110 Z" fill={INK} />
          </g>
          <path d="M -8 0 V -28 Q 0 -38 8 -28 V 0" {...line} />
          <path d="M 0 -150 v -10 M -5 -156 h 10" stroke={INK} strokeWidth={1.4} />
        </g>
      ) : (
        <g>
          <rect x={-70} y={-80} width={140} height={80} {...line} />
          {[-50, -25, 25, 50].map((x) => (
            <rect key={x} x={x - 5} y={-80} width={10} height={80} {...line} strokeWidth={1.1} />
          ))}
          <path d="M -78 -80 L 0 -112 L 78 -80 Z" {...line} />
          <path d="M -36 -112 Q 0 -190 36 -112" {...line} />
          <path d="M 0 -170 v -18 M -7 -180 h 14" stroke={INK} strokeWidth={1.6} />
          <path d="M -12 0 V -40 Q 0 -54 12 -40 V 0" fill={INK} />
          <circle cx={0} cy={-136} r={22} fill="#f3e3a0" opacity={0.35} className="ink-anim" style={anim("twinkle", 4)} />
        </g>
      );
    case "farm":
      return (
        <g>
          {/* Field rows */}
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M -95 ${-4 - i * 5} L 0 ${-4 - i * 5}`} {...thin} />
          ))}
          {/* Windmill */}
          <g transform="translate(40 0)">
            <path d="M -22 0 L -14 -90 L 14 -90 L 22 0 Z" {...line} />
            <path d="M -18 -90 L 0 -108 L 18 -90 Z" {...line} />
            <path d="M -6 0 V -18 H 6 V 0" {...line} strokeWidth={1.2} />
            <g transform="translate(0 -88)">
              <g className="ink-anim" style={anim("ink-spin", 9, 0, "linear")}>
                {[0, 90, 180, 270].map((a) => (
                  <g key={a} transform={`rotate(${a})`}>
                    <path d="M 0 0 L 0 -62" stroke={INK} strokeWidth={2} />
                    <rect x={0} y={-60} width={11} height={44} fill={PAPER} stroke={INK} strokeWidth={1} />
                    <path d="M 0 -50 h 11 M 0 -40 h 11 M 0 -30 h 11" {...thin} strokeWidth={0.6} />
                  </g>
                ))}
                <circle r={4} fill={INK} />
              </g>
            </g>
          </g>
          <path d="M -80 0 L -76 -18 M -72 0 L -70 -16 M -64 0 L -62 -14" {...thin} />
        </g>
      );
    case "lodge":
      return (
        <g>
          <rect x={-55} y={-48} width={110} height={48} {...line} />
          {[-36, -24, -12, 0, 12, 24, 36].map((y, i) => i < 4 && <path key={y} d={`M -55 ${-12 * (i + 1)} h 110`} {...thin} />)}
          <path d="M -64 -48 L 0 -86 L 64 -48 Z" {...line} />
          {/* Antlers over the door */}
          <path d="M 0 -60 q -12 -4 -16 -16 M -8 -64 l -4 -8 M 0 -60 q 12 -4 16 -16 M 8 -64 l 4 -8" {...thin} strokeWidth={1.4} />
          <path d="M -8 0 V -26 H 8 V 0" {...line} />
          {/* Hides on a frame, swaying */}
          <g transform="translate(78 0)">
            <path d="M -18 0 V -54 M 18 0 V -54 M -22 -50 H 22" stroke={INK} strokeWidth={2} />
            <g className="ink-anim" style={{ ...anim("sway", 3.2), transformOrigin: "50% 0%" }}>
              <path d="M -12 -50 Q -16 -30 -10 -16 L 10 -16 Q 16 -30 12 -50 Z" fill={PAPER} stroke={INK} strokeWidth={1.1} />
              <path d="M -6 -40 l 4 6 M 4 -34 l 3 5" {...thin} />
            </g>
          </g>
        </g>
      );
    case "forge":
      return (
        <g>
          <rect x={-58} y={-56} width={116} height={56} {...line} />
          <path d="M -66 -56 L 66 -56 L 54 -78 L -54 -78 Z" {...line} />
          <rect x={30} y={-108} width={16} height={34} {...line} />
          <g transform="translate(38 -108)">
            <g transform="scale(4)">
              <Smoke x={0} y={0} />
            </g>
          </g>
          {/* The open front, fire glowing */}
          <rect x={-46} y={-44} width={60} height={44} fill={INK} />
          <path className="ink-anim-base" d="M -26 0 Q -30 -16 -18 -26 Q -14 -14 -6 -24 Q 0 -10 -4 0 Z" fill={RED} style={anim("ink-flicker", 0.45)} />
          <path d="M 70 0 L 70 -14 L 56 -14 L 60 -20 L 90 -20 L 86 -14 L 76 -14 L 76 0 Z" {...line} />
        </g>
      );
    case "docks":
      return (
        <g>
          <path d="M -100 6 Q -50 0 0 6 T 100 6" {...thin} />
          <path d="M -100 14 Q -50 8 0 14 T 100 14" {...thin} />
          <rect x={-90} y={-8} width={100} height={8} {...line} />
          {[-80, -50, -20].map((x) => (
            <path key={x} d={`M ${x} 0 V 14`} stroke={INK} strokeWidth={2.5} />
          ))}
          <g transform="translate(50 4)">
            <g className="ink-anim" style={anim("ink-bob", 3)}>
              <path d="M -34 -6 Q 0 10 34 -6 L 30 -14 L -30 -14 Z" {...line} />
              <path d="M 0 -14 V -80" stroke={INK} strokeWidth={2} />
              <path d="M 2 -78 Q 30 -50 2 -22 Z" fill={PAPER} stroke={INK} strokeWidth={1.2} />
              <path d="M 0 -80 l 12 4 l -12 4" fill={RED} />
            </g>
          </g>
          <rect x={-70} y={-24} width={14} height={16} {...line} strokeWidth={1} />
          <rect x={-52} y={-20} width={12} height={12} {...line} strokeWidth={1} />
        </g>
      );
    case "hall":
      return (
        <g>
          <rect x={-70} y={-70} width={140} height={70} {...line} />
          {[-70, -46, -22, 2, 26, 50].map((x) => (
            <rect key={x} x={x} y={-80} width={14} height={10} {...line} strokeWidth={1.1} />
          ))}
          <path d="M -12 0 V -34 Q 0 -46 12 -34 V 0" fill={INK} />
          {[-48, 48].map((x, i) => (
            <g key={x} transform={`translate(${x} -80)`}>
              <path d="M 0 0 V -40" stroke={INK} strokeWidth={1.6} />
              <g className="ink-anim" style={{ ...anim("sway", 1.8, i * 0.4), transformOrigin: "0% 50%" }}>
                <path d="M 0 -40 L 24 -36 L 18 -30 L 24 -24 L 0 -22 Z" fill={RED} stroke={INK} strokeWidth={0.8} />
              </g>
            </g>
          ))}
          <path d="M -40 -40 l 10 10 M -30 -40 l -10 10 M 30 -40 l 10 10 M 40 -40 l -10 10" stroke={INK} strokeWidth={1.4} />
        </g>
      );
    case "college":
      return (
        <g>
          <rect x={-60} y={-60} width={90} height={60} {...line} />
          <path d="M -66 -60 L -15 -86 L 36 -60 Z" {...line} />
          <rect x={30} y={-150} width={40} height={150} {...line} />
          <path d="M 24 -150 L 50 -196 L 76 -150 Z" {...line} />
          {[-130, -100, -70].map((y) => (
            <path key={y} d={`M 42 ${y} v 14 q 8 -8 16 0 v -14 q -8 -8 -16 0`} {...line} strokeWidth={1} />
          ))}
          {[
            [10, -190],
            [90, -210],
            [-20, -170],
          ].map(([x, y], i) => (
            <path key={i} className="ink-anim" d={`M ${x} ${y! - 5} L ${x! + 1.5} ${y! - 1.5} L ${x! + 5} ${y} L ${x! + 1.5} ${y! + 1.5} L ${x} ${y! + 5} L ${x! - 1.5} ${y! + 1.5} L ${x! - 5} ${y} L ${x! - 1.5} ${y! - 1.5} Z`} fill={INK} style={anim("twinkle", 2 + i, i * 0.7)} />
          ))}
          <path d="M -24 0 V -26 Q -15 -34 -6 -26 V 0" {...line} />
        </g>
      );
    case "court":
      return (
        <g>
          <rect x={-50} y={-120} width={100} height={120} {...line} />
          {[-50, -30, -10, 10, 30].map((x) => (
            <rect key={x} x={x} y={-132} width={12} height={12} {...line} strokeWidth={1.1} />
          ))}
          <rect x={-80} y={-80} width={30} height={80} {...line} />
          <rect x={50} y={-80} width={30} height={80} {...line} />
          <path d="M -84 -80 L -65 -110 L -46 -80 Z M 46 -80 L 65 -110 L 84 -80 Z" {...line} />
          <path d="M -16 0 V -40 Q 0 -58 16 -40 V 0" fill={INK} />
          {[-65, 65].map((x, i) => (
            <g key={x} transform={`translate(${x} -110)`}>
              <path d="M 0 0 V -26" stroke={INK} strokeWidth={1.4} />
              <g className="ink-anim" style={{ ...anim("sway", 1.5, i * 0.5), transformOrigin: "0% 50%" }}>
                <path d="M 0 -26 L 22 -22 L 0 -16 Z" fill={RED} />
              </g>
            </g>
          ))}
        </g>
      );
  }
}

/** A person standing in the street, drawn by their trade. */
export function Figure({ role, s = 1 }: { role: Role; s?: number }) {
  const tool: Record<Role, ReactNode> = {
    elder: <path d="M 9 -34 V 2 M 7 -34 q 2 -4 4 0" stroke={INK} strokeWidth={1.6} fill="none" />,
    merchant: <rect x={7} y={-20} width={9} height={8} fill={PAPER} stroke={INK} strokeWidth={1} />,
    guard: <path d="M 10 -44 V 2 M 7 -40 L 10 -48 L 13 -40" stroke={INK} strokeWidth={1.4} fill={PAPER} />,
    farmer: <path d="M 10 -36 V 2 M 6 -36 h 8 M 7 -36 v -4 M 10 -36 v -4 M 13 -36 v -4" stroke={INK} strokeWidth={1.2} fill="none" />,
    priest: <path d="M 0 -22 v 8 M -3 -19 h 6" stroke={PAPER} strokeWidth={1.4} />,
    hunter: <path d="M 10 -36 Q 18 -18 10 0 M 10 -36 V 0" stroke={INK} strokeWidth={1.2} fill="none" />,
    bard: <path d="M 6 -20 q 10 -2 10 8 q -6 4 -10 -2 Z M 14 -18 l 6 -10" stroke={INK} strokeWidth={1.1} fill={PAPER} />,
    child: null,
    smith: <path d="M 8 -18 L 14 -26 M 11 -30 l 6 4" stroke={INK} strokeWidth={2} />,
    sage: <path d="M -5 -42 L 0 -56 L 5 -42 Z" fill={INK} />,
  };
  const small = role === "child" ? 0.7 : 1;
  const robe = role === "priest" || role === "sage" ? INK : PAPER;
  return (
    <g transform={`scale(${s * small})`}>
      <path d="M -8 0 L -5 -26 Q 0 -30 5 -26 L 8 0 Z" fill={robe} stroke={INK} strokeWidth={1.3} />
      <circle cx={0} cy={-34} r={6} fill={PAPER} stroke={INK} strokeWidth={1.3} />
      {role === "farmer" && <path d="M -10 -38 h 20 M -6 -38 q 6 -10 12 0" stroke={INK} strokeWidth={1.2} fill={PAPER} />}
      {role === "guard" && <path d="M -6 -38 q 6 -10 12 0 Z" fill={INK} />}
      {tool[role]}
    </g>
  );
}

/** Someone walking along the road, back and forth. */
function Passer({ x, walk, dur, delay, s }: { x: number; walk: number; dur: number; delay: number; s: number }) {
  return (
    <g transform={`translate(${x} ${GROUND + 34})`}>
      <g className="ink-anim-base" style={{ ...anim("ink-walk", dur, delay, "linear"), animationDirection: "alternate", "--walk": `${walk}px` } as CSSProperties}>
        <g className="ink-anim-base" style={anim("walk-bob", 0.7, delay)}>
          <g transform={`scale(${s})`}>
            <path d="M -5 0 L -3 -16 Q 0 -18 3 -16 L 5 0 Z" fill={PAPER} stroke={INK} strokeWidth={1.1} />
            <circle cx={0} cy={-21} r={3.6} fill={INK} />
          </g>
        </g>
      </g>
    </g>
  );
}

export function SettlementScene({ place, folk, onLeave }: { place: Place; folk: Townsfolk[]; onLeave: () => void }) {
  const selected = useTownUi((s) => s.building);
  const buildings = buildingsOf(place);
  const rng = mulberry32(hashOf(place.id)).rng;
  const slot = (i: number) => 115 + (i * (W - 230)) / Math.max(1, buildings.length - 1);
  // Townsfolk stand beside their building, a step apart from each other.
  const spots = new Map<string, number>();
  const placed = folk.map((f) => {
    const n = spots.get(f.at) ?? 0;
    spots.set(f.at, n + 1);
    const bi = Math.max(0, buildings.indexOf(f.at));
    return { f, x: Math.max(28, Math.min(W - 28, slot(bi) + [-62, 62, -24, 24][n % 4]!)) };
  });
  const pick = (b: Building) => useTownUi.setState({ building: b });
  // Filler houses behind the street: more of them the bigger the place.
  const filler = Array.from({ length: place.kind === "city" ? 9 : place.kind === "town" ? 6 : 3 }, (_, i) => ({ x: 60 + rng() * (W - 120), s: 0.75 + rng() * 0.25, chimney: rng() < 0.5, i }));
  const trees = Array.from({ length: place.kind === "village" ? 7 : 3 }, () => ({ x: 20 + rng() * (W - 40), s: 0.6 + rng() * 0.5 }));
  const passers = Array.from({ length: place.kind === "city" ? 6 : place.kind === "town" ? 4 : 2 }, () => ({ x: 40 + rng() * 500, walk: 200 + rng() * 380, dur: 18 + rng() * 20, delay: -rng() * 20, s: 1 + rng() * 0.3 }));

  return (
    <div className="relative self-start overflow-hidden rounded-xl border-2 shadow-inner" style={{ borderColor: INK, background: PAPER }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block aspect-[1000/490] w-full select-none" role="img" aria-label={`The streets of ${place.name}`}>
        <rect width={W} height={H} fill={PAPER} />
        {/* Sky: drifting clouds and birds */}
        {[0, 1, 2].map((i) => (
          <g key={i} className="ink-anim" style={{ ...anim("ink-drift", 70 + i * 25, -i * 30, "linear") }}>
            <path d={`M 0 ${60 + i * 34} q 10 -18 28 -10 q 12 -16 30 -4 q 20 -6 22 14 Z`} fill={PAPER} stroke={INK} strokeWidth={1} />
          </g>
        ))}
        {[0, 1].map((i) => (
          <g key={i} className="ink-anim" style={{ ...anim("ink-drift", 30 + i * 12, -i * 9, "linear") }}>
            <path d={`M 0 ${110 + i * 40} q 5 -5 9 0 q 4 -5 9 0`} {...thin} strokeWidth={1.2} />
            <path d={`M 22 ${100 + i * 40} q 4 -4 7 0 q 3 -4 7 0`} {...thin} />
          </g>
        ))}
        {/* Hills behind */}
        <path d={`M 0 ${GROUND - 120} Q 160 ${GROUND - 190} 330 ${GROUND - 130} T 680 ${GROUND - 150} T ${W} ${GROUND - 120}`} fill="none" stroke={INK} strokeWidth={1.2} />
        {Array.from({ length: 40 }, (_, i) => (
          <path key={i} d={`M ${i * 25 + 5} ${GROUND - 128 + Math.sin(i) * 10} l 6 10`} {...thin} opacity={0.5} />
        ))}
        {/* Walls: a palisade for a town, stone for a city */}
        {place.kind === "city" && (
          <g>
            <rect x={0} y={GROUND - 120} width={W} height={50} {...line} strokeWidth={1.3} />
            {Array.from({ length: 34 }, (_, i) => (
              <rect key={i} x={i * 30} y={GROUND - 132} width={16} height={12} {...line} strokeWidth={1.1} />
            ))}
            {Array.from({ length: 30 }, (_, i) => (
              <path key={i} d={`M ${i * 34 + (i % 2) * 17} ${GROUND - 104 + (i % 3) * 12} h 18`} {...thin} />
            ))}
          </g>
        )}
        {place.kind === "town" && Array.from({ length: 70 }, (_, i) => <path key={i} d={`M ${i * 15} ${GROUND - 70} V ${GROUND - 112} l 5 -8 l 5 8 V ${GROUND - 70}`} {...line} strokeWidth={1} />)}
        {/* Back rows of houses and trees */}
        {filler.map((f) => (
          <g key={f.i} transform={`translate(${f.x} ${GROUND - 54}) scale(${f.s})`}>
            <House w={70} h={46} roof={30} chimney={f.chimney} />
          </g>
        ))}
        {trees.map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${GROUND - 30})`}>
            <Pine x={0} s={t.s} />
          </g>
        ))}
        {/* The ground and the road */}
        <rect x={0} y={GROUND - 4} width={W} height={H - GROUND + 4} fill={PAPER} />
        <path d={`M 0 ${GROUND} H ${W}`} stroke={INK} strokeWidth={1.4} />
        <path d={`M 0 ${GROUND + 18} Q ${W / 2} ${GROUND + 10} ${W} ${GROUND + 18}`} {...thin} strokeDasharray="2 6" />
        <path d={`M 0 ${GROUND + 54} Q ${W / 2} ${GROUND + 62} ${W} ${GROUND + 54}`} {...thin} strokeDasharray="2 6" />
        {Array.from({ length: 60 }, (_, i) => (
          <path key={i} d={`M ${(i * 97) % W} ${GROUND + 70 + ((i * 13) % 50)} l 3 -6 l 3 6`} {...thin} opacity={0.5} />
        ))}
        {/* The buildings that matter: click to go in */}
        {buildings.map((b, i) => {
          const x = slot(i);
          const on = selected === b;
          return (
            <g
              key={b}
              transform={`translate(${x} ${GROUND})`}
              role="button"
              tabIndex={0}
              aria-label={BUILDING[b].name}
              aria-pressed={on}
              className="cursor-pointer outline-none [&:hover_.bld]:opacity-100 [&:focus-visible_.bld]:opacity-100"
              onClick={() => pick(b)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick(b)}
            >
              <rect x={-100} y={-250} width={200} height={250} fill="transparent" />
              <ellipse className="bld" cx={0} cy={-2} rx={100} ry={9} fill={RED} opacity={on ? 0.35 : 0} />
              <g transform="scale(1.3)">
                <BuildingArt kind={b} place={place} />
              </g>
              <g transform="translate(0 26)">
                <path d="M -64 -10 H 64 L 58 0 L 64 10 H -64 L -58 0 Z" fill={on ? INK : PAPER} stroke={INK} strokeWidth={1.2} />
                <text y={5} textAnchor="middle" fontFamily={FONT} fontSize={14} fill={on ? PAPER : INK}>
                  {BUILDING[b].name}
                </text>
              </g>
            </g>
          );
        })}
        {/* Passers-by */}
        {passers.map((p, i) => (
          <Passer key={i} {...p} />
        ))}
        {/* Townsfolk to talk to */}
        {placed.map(({ f, x }, i) => {
          return (
            <g
              key={f.id}
              transform={`translate(${x} ${GROUND + 106})`}
              role="button"
              tabIndex={0}
              aria-label={`Talk to ${f.name}, ${ROLE[f.role].title}`}
              className="cursor-pointer outline-none [&:hover_.who]:opacity-100 [&:focus-visible_.who]:opacity-100"
              onClick={() => useTownUi.setState({ talk: f })}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && useTownUi.setState({ talk: f })}
            >
              <rect x={-22} y={-74} width={44} height={82} fill="transparent" />
              <ellipse cx={0} cy={2} rx={14} ry={3} fill={INK} opacity={0.15} />
              <g className="ink-anim-base" style={anim("walk-bob", 2.4, i * 0.3)}>
                <Figure role={f.role} s={1.45} />
              </g>
              <g className="ink-anim" transform="translate(0 -12)" style={anim("ink-beckon", 1.8, i * 0.2)}>
                <path d="M 6 -66 h 22 a 4 4 0 0 1 4 4 v 8 a 4 4 0 0 1 -4 4 h -14 l -6 5 v -5 h -2 a 4 4 0 0 1 -4 -4 v -8 a 4 4 0 0 1 4 -4 Z" fill={PAPER} stroke={INK} strokeWidth={1} />
                <text x={17} y={-55} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK}>
                  …
                </text>
              </g>
              <text className="who" y={20} textAnchor="middle" fontFamily={FONT} fontSize={13} fill={INK} stroke={PAPER} strokeWidth={3} paintOrder="stroke" opacity={0.75}>
                {f.name}
              </text>
            </g>
          );
        })}
        {/* The settlement's name, like a map cartouche */}
        <g transform={`translate(${W / 2} 34)`}>
          <path d="M -150 -20 H 150 L 138 0 L 150 20 H -150 L -138 0 Z" fill={PAPER} stroke={INK} strokeWidth={1.4} />
          <text y={7} textAnchor="middle" fontFamily={FONT} fontSize={24} fill={INK}>
            {place.name}
          </text>
        </g>
        <text x={W / 2} y={74} textAnchor="middle" fontFamily={FONT} fontSize={14} fontStyle="italic" fill={INK}>
          {characterOf(place).blurb}
        </text>
      </svg>
      <button className="absolute top-2 left-2 rounded-sm border px-2 py-0.5 text-sm" style={{ borderColor: INK, background: PAPER, color: INK, fontFamily: FONT }} onClick={onLeave}>
        ← Back to the map
      </button>
    </div>
  );
}
