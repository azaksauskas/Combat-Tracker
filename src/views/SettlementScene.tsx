import { memo, useMemo, type ReactNode } from "react";
import { create } from "zustand";
import { mulberry32 } from "../game/rng";
import { BUILDING, characterOf, ROLE, type Building, type Role, type Townsfolk } from "../game/settlement";
import { PLAN_H, PLAN_W, planOf, viewOf, type P, type Plan } from "../game/townplan";
import type { Place } from "../game/world";
import { Compass, FONT, INK, InkDefs, PAPER, RED, Smoke, anim } from "./InkMap";

/**
 * A settlement seen from above, like a hand-drawn D&D town map in the same
 * ink as the world map: roads meeting at the market square, the buildings
 * that matter (clickable), houses, trees, fields, a river, walls, and the
 * small life of the place (smoke, people and carts on the roads, a turning
 * mill, flowing water). Townsfolk stand about to be talked to.
 */

/** Which building is open in the side panel, and who the company is talking to. */
export const useTownUi = create<{ building: Building; talk: Townsfolk | null }>(() => ({ building: "board", talk: null }));

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


// --- Drawing from above, in ink -----------------------------------------------------------

const hatch = { stroke: INK, strokeWidth: 0.5, fill: "none" };

/** A roof seen from above: outline, ridge, hatching across it, a chimney, a shadow. */
function Roof({ w, h, hip, chimney }: { w: number; h: number; hip?: boolean; chimney?: boolean }) {
  const inset = hip ? h / 2 : 0;
  let d = "";
  for (let x = -w / 2 + 2.5; x < w / 2 - 1; x += 3) {
    // On a hipped roof the hatching stops at the slopes of the ends.
    const lim = hip ? Math.min(h / 2, w / 2 - Math.abs(x)) : h / 2;
    d += `M ${x.toFixed(1)} ${(-lim).toFixed(1)} V ${lim.toFixed(1)} `;
  }
  return (
    <g>
      <rect x={-w / 2 + 3} y={-h / 2 + 3} width={w} height={h} fill={INK} opacity={0.16} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={PAPER} stroke={INK} strokeWidth={1.3} />
      <path d={d} {...hatch} />
      <path d={hip ? `M ${-w / 2} ${-h / 2} L ${-w / 2 + inset} 0 L ${-w / 2} ${h / 2} M ${w / 2} ${-h / 2} L ${w / 2 - inset} 0 L ${w / 2} ${h / 2} M ${-w / 2 + inset} 0 H ${w / 2 - inset}` : `M ${-w / 2} 0 H ${w / 2}`} stroke={INK} strokeWidth={1.1} fill="none" />
      {chimney && <rect x={w / 4 - 3} y={-h / 4 - 3} width={6} height={6} fill={PAPER} stroke={INK} strokeWidth={1} />}
    </g>
  );
}

/** A tree from above: a bumpy crown with a shadow and a few stipples. */
const TreeTop = memo(function TreeTop({ x, y, r, seed }: { x: number; y: number; r: number; seed: number }) {
  const rng = mulberry32(seed).rng;
  const n = 7 + Math.floor(rng() * 4);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.82 + rng() * 0.25);
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as const;
  });
  const bump = r * 0.42;
  const d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)} ` + pts.map((_, i) => {
    const q = pts[(i + 1) % n]!;
    return `A ${bump.toFixed(1)} ${bump.toFixed(1)} 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }).join(" ");
  return (
    <g>
      <path d={d} transform="translate(3 3)" fill={INK} opacity={0.15} />
      <path d={d} fill={PAPER} stroke={INK} strokeWidth={1.1} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + (rng() - 0.3) * r * 0.9} cy={y + (rng() - 0.3) * r * 0.9} r={0.8} fill={INK} />
      ))}
    </g>
  );
});

/** The buildings that matter, from above, centred at 0,0. */
function KeyArt({ b, place, square }: { b: Building; place: Place; square: number }) {
  switch (b) {
    case "market":
      // Stalls with striped awnings round the square, barrels and crates.
      return (
        <g>
          {Array.from({ length: Math.round(square / 9) }, (_, i) => {
            const a = (i / Math.round(square / 9)) * 360 + 20;
            return (
              <g key={i} transform={`rotate(${a}) translate(${square * 0.62} 0) rotate(90)`}>
                <rect x={-9} y={-6} width={18} height={12} fill={PAPER} stroke={INK} strokeWidth={1} />
                {[-9, -3, 3].map((x, k) => (
                  <rect key={x} x={x} y={-6} width={3} height={12} fill={(i + k) % 2 ? RED : INK} opacity={0.75} />
                ))}
              </g>
            );
          })}
          {place.kind === "village" ? (
            <g>
              <circle r={9} fill={PAPER} stroke={INK} strokeWidth={1.4} />
              <circle r={5} fill={INK} opacity={0.75} />
              <path d="M -11 -11 L 11 -11" stroke={INK} strokeWidth={1.2} />
            </g>
          ) : (
            <g>
              <circle r={14} fill={PAPER} stroke={INK} strokeWidth={1.4} />
              <circle r={9} fill="none" stroke={INK} strokeWidth={0.7} strokeDasharray="2 2" className="ink-anim" style={anim("ink-spin", 14, 0, "linear")} />
              <circle r={3} fill={INK} />
            </g>
          )}
          {[
            [-square * 0.3, square * 0.25],
            [square * 0.32, -square * 0.2],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r={4} fill={PAPER} stroke={INK} strokeWidth={0.9} />
              <circle cx={7} cy={2} r={4} fill={PAPER} stroke={INK} strokeWidth={0.9} />
              <rect x={-4} y={5} width={8} height={7} fill={PAPER} stroke={INK} strokeWidth={0.9} />
            </g>
          ))}
        </g>
      );
    case "board":
      return (
        <g>
          <Roof w={74} h={40} hip chimney />
          <g transform="translate(-22 0)">
            <Roof w={28} h={56} />
          </g>
          {/* The notice board out front */}
          <g transform="translate(18 34)">
            <rect x={-12} y={-3} width={24} height={6} fill={PAPER} stroke={INK} strokeWidth={1} />
            {[-8, -2, 4].map((x, i) => (
              <rect key={x} className="ink-anim" x={x} y={-6} width={5} height={6} fill={PAPER} stroke={INK} strokeWidth={0.6} style={anim("sway", 2 + i * 0.5, i * 0.3)} />
            ))}
          </g>
        </g>
      );
    case "tavern":
      return (
        <g>
          <Roof w={70} h={40} chimney />
          <g transform="translate(26 18)">
            <Roof w={26} h={40} hip />
          </g>
          {/* Tables in the yard, barrels by the door */}
          {[-24, 0].map((x) => (
            <g key={x} transform={`translate(${x} 34)`}>
              <circle r={4.5} fill={PAPER} stroke={INK} strokeWidth={0.9} />
              {[0, 90, 180, 270].map((a) => (
                <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 8} cy={Math.sin((a * Math.PI) / 180) * 8} r={1.4} fill={INK} />
              ))}
            </g>
          ))}
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${-44 + (i % 2) * 7} ${-8 + i * 7})`}>
              <circle r={3.5} fill={PAPER} stroke={INK} strokeWidth={0.9} />
              <circle r={1.6} fill="none" stroke={INK} strokeWidth={0.5} />
            </g>
          ))}
        </g>
      );
    case "temple":
      return place.kind === "village" ? (
        <g>
          <Roof w={56} h={28} />
          <rect x={-40} y={-9} width={16} height={18} fill={PAPER} stroke={INK} strokeWidth={1.2} />
          <path d="M -40 -9 L -24 9 M -24 -9 L -40 9" stroke={INK} strokeWidth={0.7} />
          {/* The churchyard: a few graves */}
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={-14 + i * 9} y={22} width={4} height={7} rx={1.5} fill={PAPER} stroke={INK} strokeWidth={0.7} />
          ))}
        </g>
      ) : (
        <g>
          <Roof w={96} h={38} />
          <g transform="translate(-6 0)">
            <Roof w={30} h={78} />
          </g>
          <path d="M 48 -19 A 19 19 0 0 1 48 19" fill={PAPER} stroke={INK} strokeWidth={1.3} />
          <path d="M 48 0 L 62 -10 M 48 0 L 66 0 M 48 0 L 62 10" stroke={INK} strokeWidth={0.6} />
          <circle cx={-6} cy={0} r={11} fill="#f3e3a0" opacity={0.4} className="ink-anim" style={anim("twinkle", 4)} />
        </g>
      );
    case "farm":
      return (
        <g>
          <Roof w={56} h={30} />
          <g transform="translate(-44 30)">
            <circle r={13} fill={PAPER} stroke={INK} strokeWidth={1.3} />
            <circle r={4} fill={INK} />
            <g className="ink-anim" style={anim("ink-spin", 8, 0, "linear")}>
              {[0, 90, 180, 270].map((a) => (
                <g key={a} transform={`rotate(${a})`}>
                  <path d="M 0 0 L 0 -34" stroke={INK} strokeWidth={1.6} />
                  <rect x={0} y={-33} width={7} height={22} fill={PAPER} stroke={INK} strokeWidth={0.9} />
                  <path d="M 0 -27 h 7 M 0 -21 h 7 M 0 -15 h 7" {...hatch} />
                </g>
              ))}
            </g>
          </g>
          {[
            [30, 26],
            [44, 18],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r={7} fill={PAPER} stroke={INK} strokeWidth={1} />
              <path d="M 0 0 m -4 0 a 4 4 0 1 1 4 4 a 2.5 2.5 0 1 1 -2.5 -2.5" {...hatch} />
            </g>
          ))}
        </g>
      );
    case "lodge":
      return (
        <g>
          <Roof w={60} h={34} chimney />
          {/* Racks of hides, a fire pit */}
          {[-20, 2].map((x, i) => (
            <g key={x} transform={`translate(${x} 32)`}>
              <path d="M -9 0 H 9" stroke={INK} strokeWidth={1.6} />
              <path className="ink-anim" d="M -7 0 Q -9 7 -4 10 L 4 10 Q 9 7 7 0 Z" fill={PAPER} stroke={INK} strokeWidth={0.8} style={{ ...anim("sway", 3 + i), transformOrigin: "50% 0%" }} />
            </g>
          ))}
          <g transform="translate(30 30)">
            <circle r={6} fill={PAPER} stroke={INK} strokeWidth={1} strokeDasharray="2 1.5" />
            <circle r={2.5} fill={RED} className="ink-anim" style={anim("twinkle", 1.2)} />
          </g>
        </g>
      );
    case "forge":
      return (
        <g>
          <Roof w={58} h={34} />
          <g transform="translate(14 -6)">
            <rect x={-5} y={-5} width={10} height={10} fill={INK} />
          </g>
          {/* The open yard: anvil, quench trough, glowing hearth */}
          <g transform="translate(-10 30)">
            <path d="M -8 -3 H 8 L 5 0 L 8 3 H -8 L -5 0 Z" fill={INK} />
            <rect x={14} y={-4} width={14} height={8} fill={PAPER} stroke={INK} strokeWidth={0.9} />
            <path d="M 16 0 h 10" {...hatch} />
            <circle cx={-22} cy={0} r={6} fill={PAPER} stroke={INK} strokeWidth={1} />
            <circle className="ink-anim" cx={-22} cy={0} r={3.5} fill={RED} style={anim("ink-flicker", 0.5)} />
          </g>
        </g>
      );
    case "docks":
      return (
        <g>
          {[-28, 4, 34].map((x, i) => (
            <g key={x} transform={`translate(${x} ${14 + i * 3})`}>
              <rect x={-5} y={-4} width={10} height={40} fill={PAPER} stroke={INK} strokeWidth={1} />
              <path d="M -5 4 h 10 M -5 12 h 10 M -5 20 h 10 M -5 28 h 10" {...hatch} />
            </g>
          ))}
          <g transform="translate(-12 46)">
            <g className="ink-anim" style={anim("ink-bob", 3)}>
              <path d="M -16 0 Q 0 -9 16 0 Q 0 9 -16 0 Z" fill={PAPER} stroke={INK} strokeWidth={1.1} />
              <path d="M -8 0 H 8" stroke={INK} strokeWidth={0.8} />
            </g>
          </g>
          <Roof w={46} h={26} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={26 + (i % 2) * 8} y={-10 + i * 7} width={7} height={7} fill={PAPER} stroke={INK} strokeWidth={0.8} />
          ))}
        </g>
      );
    case "hall":
      return (
        <g>
          <rect x={-56} y={-40} width={112} height={80} fill="none" stroke={INK} strokeWidth={2.6} strokeDasharray="10 2" />
          <g transform="translate(0 -20)">
            <Roof w={100} h={30} hip />
          </g>
          {/* The yard: practice posts */}
          {[-30, -10, 10, 30].map((x) => (
            <g key={x} transform={`translate(${x} 18)`}>
              <circle r={3.5} fill={PAPER} stroke={INK} strokeWidth={0.9} />
              <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" {...hatch} />
            </g>
          ))}
          {[-12, 12].map((x, i) => (
            <g key={x} transform={`translate(${x} 40)`}>
              <circle r={2} fill={INK} />
              <path className="ink-anim" d="M 0 0 L 12 2 L 8 5 L 12 8 L 0 7 Z" fill={RED} style={{ ...anim("sway", 1.6, i * 0.4), transformOrigin: "0% 50%" }} />
            </g>
          ))}
        </g>
      );
    case "college":
      return (
        <g>
          <g transform="translate(-14 0)">
            <Roof w={60} h={34} hip />
          </g>
          <g transform="translate(32 -4)">
            <circle r={22} fill={INK} opacity={0.16} transform="translate(3 3)" />
            <circle r={22} fill={PAPER} stroke={INK} strokeWidth={1.4} />
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M 0 0 L ${(Math.cos((i / 12) * Math.PI * 2) * 22).toFixed(1)} ${(Math.sin((i / 12) * Math.PI * 2) * 22).toFixed(1)}`} {...hatch} />
            ))}
            <circle r={5} fill={PAPER} stroke={INK} strokeWidth={1} />
            <path className="ink-anim" d="M 0 -4 L 1 -1 L 4 0 L 1 1 L 0 4 L -1 1 L -4 0 L -1 -1 Z" fill={INK} style={anim("ink-spin", 12, 0, "linear")} />
          </g>
        </g>
      );
    case "court":
      return (
        <g>
          <rect x={-66} y={-52} width={132} height={104} fill="none" stroke={INK} strokeWidth={3} />
          <rect x={-66} y={-52} width={132} height={104} fill="none" stroke={PAPER} strokeWidth={1} strokeDasharray="4 4" />
          <Roof w={56} h={56} hip chimney />
          {[
            [-66, -52],
            [66, -52],
            [-66, 52],
            [66, 52],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r={12} fill={PAPER} stroke={INK} strokeWidth={1.4} />
              {Array.from({ length: 8 }, (_, k) => (
                <path key={k} d={`M 0 0 L ${(Math.cos((k / 8) * Math.PI * 2) * 12).toFixed(1)} ${(Math.sin((k / 8) * Math.PI * 2) * 12).toFixed(1)}`} {...hatch} />
              ))}
              {i < 2 && <path className="ink-anim" d="M 0 0 L 14 -2 L 10 2 L 14 6 L 0 4 Z" fill={RED} style={{ ...anim("sway", 1.5, i * 0.5), transformOrigin: "0% 50%" }} />}
            </g>
          ))}
          <rect x={-10} y={46} width={20} height={12} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        </g>
      );
  }
}

/** The settlement's walls: a palisade of stakes or stone with round towers. */
function Wall({ c, wall }: { c: P; wall: NonNullable<Plan["wall"]> }) {
  const towers = wall.kind === "stone" ? 14 : 0;
  return (
    <g>
      {wall.kind === "stone" ? (
        <>
          <ellipse cx={c.x} cy={c.y} rx={wall.rx} ry={wall.ry} fill="none" stroke={INK} strokeWidth={9} />
          <ellipse cx={c.x} cy={c.y} rx={wall.rx} ry={wall.ry} fill="none" stroke={PAPER} strokeWidth={5} />
          <ellipse cx={c.x} cy={c.y} rx={wall.rx} ry={wall.ry} fill="none" stroke={INK} strokeWidth={0.6} strokeDasharray="5 3" />
        </>
      ) : (
        <ellipse cx={c.x} cy={c.y} rx={wall.rx} ry={wall.ry} fill="none" stroke={INK} strokeWidth={3.2} strokeDasharray="1.6 2.6" />
      )}
      {Array.from({ length: towers }, (_, i) => {
        const a = (i / towers) * Math.PI * 2 + 0.2;
        return <circle key={i} cx={c.x + Math.cos(a) * wall.rx} cy={c.y + Math.sin(a) * wall.ry} r={9} fill={PAPER} stroke={INK} strokeWidth={1.4} />;
      })}
    </g>
  );
}

/** Everything that doesn't change: drawn once per settlement. */
const PlanArt = memo(function PlanArt({ place, plan }: { place: Place; plan: Plan }) {
  const { centre: c, square } = plan;
  const grass = useMemo(() => {
    const rng = mulberry32(plan.houses.length * 7919 + Math.round(c.x)).rng;
    let d = "";
    for (let i = 0; i < 260; i++) {
      const x = rng() * PLAN_W;
      const y = rng() * PLAN_H;
      d += `M ${x.toFixed(0)} ${y.toFixed(0)} l 1.5 -4 M ${(x + 3).toFixed(0)} ${y.toFixed(0)} l 0 -5 M ${(x + 6).toFixed(0)} ${y.toFixed(0)} l -1.5 -4 `;
    }
    return d;
  }, [plan, c.x]);
  return (
    <g>
      <rect width={PLAN_W} height={PLAN_H} fill={PAPER} />
      <rect width={PLAN_W} height={PLAN_H} fill="url(#ink-dots)" opacity={0.6} />
      <path d={grass} stroke={INK} strokeWidth={0.5} fill="none" opacity={0.45} />
      {/* Fields: fenced, rows of crops */}
      {plan.fields.map((f, i) => {
        let rows = "";
        const n = Math.floor((f.along ? f.h : f.w) / 9);
        for (let k = 1; k < n; k++) rows += f.along ? `M ${-f.w / 2 + 4} ${-f.h / 2 + k * 9} H ${f.w / 2 - 4} ` : `M ${-f.w / 2 + k * 9} ${-f.h / 2 + 4} V ${f.h / 2 - 4} `;
        return (
          <g key={i} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
            <rect x={-f.w / 2} y={-f.h / 2} width={f.w} height={f.h} fill={PAPER} stroke={INK} strokeWidth={0.9} strokeDasharray="3 2" />
            <path d={rows} {...hatch} opacity={0.6} />
          </g>
        );
      })}
      {plan.wall && <Wall c={c} wall={plan.wall} />}
      {/* The river, banks drawn twice, and its bridge */}
      {plan.river && (
        <g>
          <path d={plan.river.d} fill="none" stroke={INK} strokeWidth={50} />
          <path d={plan.river.d} fill="none" stroke={PAPER} strokeWidth={46} />
          <path d={plan.river.d} fill="none" stroke="#dfe6ea" strokeWidth={46} opacity={0.6} />
          {[-14, 0, 14].map((o, i) => (
            <path key={o} d={plan.river!.d} transform={`translate(0 ${o})`} fill="none" stroke={INK} strokeWidth={0.6} strokeDasharray="10 22" className="ink-flow" style={{ animationDuration: `${6 + i * 2}s` }} />
          ))}
        </g>
      )}
      {/* Roads: dotted edges, the wall and grass cut away under them */}
      {plan.roads.map((l, i) => (
        <g key={i}>
          <path d={l.d} fill="none" stroke={PAPER} strokeWidth={30} />
          <path d={l.d} fill="none" stroke={INK} strokeWidth={24} strokeDasharray="1.5 3.5" />
          <path d={l.d} fill="none" stroke={PAPER} strokeWidth={21} />
        </g>
      ))}
      {plan.bridge && (
        <g transform={`translate(${plan.bridge.x} ${plan.bridge.y}) rotate(${plan.bridge.rot})`}>
          <rect x={-34} y={-13} width={68} height={26} fill={INK} opacity={0.15} transform="translate(3 3)" />
          <rect x={-34} y={-13} width={68} height={26} fill={PAPER} stroke={INK} strokeWidth={1.4} />
          <path d={Array.from({ length: 16 }, (_, k) => `M ${-32 + k * 4.2} -13 V 13`).join(" ")} {...hatch} />
          <path d="M -34 -13 H 34 M -34 13 H 34" stroke={INK} strokeWidth={2.2} />
        </g>
      )}
      {/* The square: cobbles */}
      <circle cx={c.x} cy={c.y} r={square} fill={PAPER} stroke={INK} strokeWidth={1.2} strokeDasharray="2 2.5" />
      <circle cx={c.x} cy={c.y} r={square - 4} fill="url(#ink-dots)" opacity={0.9} />
      {plan.houses.map((h, i) => (
        <g key={i} transform={`translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) rotate(${h.rot.toFixed(1)})`}>
          <Roof w={h.w} h={h.h} hip={h.hip} chimney={h.chimney} />
          {h.wing && (
            <g transform={`translate(${(h.w / 2 - h.h / 3).toFixed(1)} ${(h.h / 2).toFixed(1)})`}>
              <Roof w={h.h * 0.66} h={h.h} />
            </g>
          )}
        </g>
      ))}
      {plan.trees.map((t, i) => (
        <TreeTop key={i} {...t} />
      ))}
      {plan.keys.map((k) => (
        <g key={k.b} transform={`translate(${k.x.toFixed(1)} ${k.y.toFixed(1)}) rotate(${k.b === "market" ? 0 : k.rot.toFixed(1)})`}>
          <KeyArt b={k.b} place={place} square={square} />
        </g>
      ))}
    </g>
  );
});

/** People and carts going about their business along the roads. */
function Traffic({ plan, count }: { plan: Plan; count: number }) {
  const rng = mulberry32(count * 31 + Math.round(plan.centre.y)).rng;
  return (
    <g pointerEvents="none">
      {Array.from({ length: count }, (_, i) => {
        const road = plan.roads[i % plan.roads.length]!;
        const dur = 30 + rng() * 40;
        const back = rng() < 0.5;
        const side = (rng() - 0.5) * 12;
        const cart = i % 5 === 4;
        return (
          <g key={i}>
            <g transform={`translate(0 ${side.toFixed(1)})`}>
              {cart ? (
                <g>
                  <rect x={-7} y={-4} width={12} height={8} fill={PAPER} stroke={INK} strokeWidth={0.9} />
                  <ellipse cx={10} cy={0} rx={4} ry={2.5} fill={INK} />
                  <animateMotion dur={`${dur * 1.6}s`} repeatCount="indefinite" path={road.d} rotate="auto" begin={`-${(rng() * dur).toFixed(1)}s`} {...(back ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})} />
                </g>
              ) : (
                <g>
                  <circle r={2.8} fill={PAPER} stroke={INK} strokeWidth={0.9} />
                  <circle r={1.4} fill={INK} />
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={road.d} begin={`-${(rng() * dur).toFixed(1)}s`} {...(back ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})} />
                </g>
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}

export function SettlementScene({ place, folk, onLeave }: { place: Place; folk: Townsfolk[]; onLeave: () => void }) {
  const selected = useTownUi((s) => s.building);
  const plan = useMemo(() => planOf(place), [place]);
  const view = viewOf(place.kind, plan.centre);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const pick = (b: Building) => useTownUi.setState({ building: b });
  const keyOf = (b: Building) => plan.keys.find((k) => k.b === b) ?? plan.keys[0]!;
  // Chimneys that smoke: some of the houses, and the warm buildings.
  const smokes = useMemo(() => {
    const out = plan.houses.filter((h, i) => h.chimney && i % 3 === 0).map((h) => ({ x: h.x, y: h.y - h.h / 4 }));
    for (const k of plan.keys) if (k.b === "tavern" || k.b === "forge" || k.b === "board" || k.b === "lodge") out.push({ x: k.x, y: k.y });
    return out.slice(0, 14);
  }, [plan]);
  // Townsfolk wait by their building, on the side towards the square.
  const spots = new Map<string, number>();
  const placed = folk.map((f) => {
    const k = keyOf(f.at);
    const n = spots.get(f.at) ?? 0;
    spots.set(f.at, n + 1);
    const toward = Math.atan2(plan.centre.y - k.y, plan.centre.x - k.x);
    const d = k.b === "market" ? k.r * 0.35 : k.r * 0.75 + 8;
    const spread = (n - 0.5) * 26;
    return { f, x: k.x + Math.cos(toward) * d - Math.sin(toward) * spread, y: k.y + Math.sin(toward) * d + Math.cos(toward) * spread };
  });

  return (
    <div className="relative self-start overflow-hidden rounded-xl border-2 shadow-inner" style={{ borderColor: INK, background: PAPER }}>
      <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="block aspect-[1000/640] w-full select-none" role="img" aria-label={`The streets of ${place.name}`}>
        <InkDefs />
        <PlanArt place={place} plan={plan} />
        {smokes.map((p, i) => (
          <g key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(2)`}>
            <Smoke x={0} y={0} />
          </g>
        ))}
        {!reduce && <Traffic plan={plan} count={[5, 9, 14][place.kind === "city" ? 2 : place.kind === "town" ? 1 : 0]!} />}
        {/* The buildings that matter: click to go in */}
        {plan.keys.map((k) => {
          const on = selected === k.b;
          return (
            <g
              key={k.b}
              transform={`translate(${k.x.toFixed(1)} ${k.y.toFixed(1)})`}
              role="button"
              tabIndex={0}
              aria-label={BUILDING[k.b].name}
              aria-pressed={on}
              className="cursor-pointer outline-none [&:hover_.ring]:opacity-100 [&:focus-visible_.ring]:opacity-100"
              onClick={() => pick(k.b)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick(k.b)}
            >
              <circle r={k.r + 6} fill="transparent" />
              <circle className="ring" r={k.r + 6} fill="none" stroke={RED} strokeWidth={1.6} strokeDasharray="5 4" opacity={on ? 1 : 0} />
              <text y={k.r + 22} textAnchor="middle" fontFamily={FONT} fontSize={16} fontStyle="italic" fill={on ? RED : INK} stroke={PAPER} strokeWidth={4} paintOrder="stroke">
                {BUILDING[k.b].name}
              </text>
            </g>
          );
        })}
        {/* Townsfolk to talk to */}
        {placed.map(({ f, x, y }, i) => (
          <g
            key={f.id}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            role="button"
            tabIndex={0}
            aria-label={`Talk to ${f.name}, ${ROLE[f.role].title}`}
            className="cursor-pointer outline-none [&:hover_.who]:opacity-100 [&:focus-visible_.who]:opacity-100"
            onClick={() => useTownUi.setState({ talk: f })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && useTownUi.setState({ talk: f })}
          >
            <rect x={-14} y={-40} width={28} height={46} fill="transparent" />
            <ellipse cx={0} cy={1} rx={9} ry={3} fill={INK} opacity={0.2} />
            <g className="ink-anim-base" style={anim("walk-bob", 2.4, i * 0.3)}>
              <Figure role={f.role} s={0.8} />
            </g>
            <g className="ink-anim" transform="translate(4 -10)" style={anim("ink-beckon", 1.8, i * 0.2)}>
              <path d="M 4 -36 h 16 a 3 3 0 0 1 3 3 v 6 a 3 3 0 0 1 -3 3 h -10 l -4 4 v -4 h -2 a 3 3 0 0 1 -3 -3 v -6 a 3 3 0 0 1 3 -3 Z" fill={PAPER} stroke={INK} strokeWidth={0.9} />
              <text x={12} y={-27} textAnchor="middle" fontFamily={FONT} fontSize={10} fill={INK}>
                …
              </text>
            </g>
            <text className="who" y={14} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={INK} stroke={PAPER} strokeWidth={3} paintOrder="stroke" opacity={0.8}>
              {f.name}
            </text>
          </g>
        ))}
      </svg>
      <button className="absolute top-2 left-2 rounded-sm border px-2 py-0.5 text-sm" style={{ borderColor: INK, background: PAPER, color: INK, fontFamily: FONT }} onClick={onLeave}>
        ← Back to the map
      </button>
      <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1 px-28 text-center" style={{ color: INK, fontFamily: FONT }}>
        <span className="border-2 border-double px-8 py-0.5 text-xl" style={{ borderColor: INK, background: PAPER }}>
          {place.name}
        </span>
        <span className="rounded-sm px-2 text-sm italic" style={{ background: `color-mix(in srgb, ${PAPER} 85%, transparent)` }}>
          {characterOf(place).blurb}
        </span>
      </div>
      <div className="pointer-events-none absolute right-2 bottom-2">
        <Compass />
      </div>
    </div>
  );
}
