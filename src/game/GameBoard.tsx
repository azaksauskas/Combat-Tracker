import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import { INK, PAPER, drawInkBoard } from "./inkBoard";
import { lookOf, miniImage } from "./minis";

const INK_RED = "#a8322a";
import { initials } from "../domain/combat";
import { useThemeColors, useUi } from "../store/ui";
import { withAlpha, type ThemeColors } from "../theme/themes";
import { distanceFt, findPath, fromKey, key, type Cell } from "./board";
import { areaCells, checkArea, checkTarget, currentUnit, reachable } from "./engine";
import type { GameState, Unit } from "./state";
import type { Fx, ShotTone } from "./store";

export type BoardMode =
  | { kind: "move" }
  /** Pick a creature; `picked` collects several for spells like Bless. */
  | { kind: "target"; actionId: string; picked?: string[] }
  /** Aim an area spell at a square. */
  | { kind: "area"; actionId: string };

export interface BoardProps {
  game: GameState;
  mode: BoardMode;
  /** Heroes can be commanded; false while monsters act. */
  interactive: boolean;
  fx: Fx[];
  /** The squares each creature last walked through. */
  paths?: Record<string, Cell[]>;
  onMove: (to: Cell) => void;
  onTarget: (unitId: string) => void;
  onArea: (point: Cell) => void;
  onHoverUnit: (unitId: string | null) => void;
}

export function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e!.contentRect.width, height: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** What the board shows for the turn: where the hero can go, the path to the square under the pointer, who can be targeted, an area spell's reach. */
export function useBoardLogic(game: GameState, mode: BoardMode, interactive: boolean, hover: Cell | null) {
  const { board } = game;
  const active = currentUnit(game);
  const heroTurn = interactive && active?.side === "party";
  const reach = useMemo(() => (heroTurn && mode.kind === "move" && active ? reachable(game, active.id) : new Map<string, number>()), [game, heroTurn, mode, active]);
  const path = useMemo(() => {
    if (!hover || !active || mode.kind !== "move" || !reach.has(key(hover)) || key(hover) === key(active.pos)) return null;
    const u = game.units.find((x) => x.id === active.id)!;
    const others = game.units.filter((x) => x.id !== u.id && !x.dead);
    return findPath(board, u.pos, hover, u.turn.movement, {
      blocked: (c) => others.some((x) => x.side !== u.side && x.hp > 0 && x.pos.x === c.x && x.pos.y === c.y),
      noStop: (c) => others.some((x) => x.pos.x === c.x && x.pos.y === c.y),
      costMultiplier: u.conditions.includes("Prone") ? 2 : 1,
    });
  }, [hover, active, mode, reach, game, board]);

  const targets = useMemo(() => {
    if (!heroTurn || mode.kind !== "target" || !active) return new Map<string, boolean>();
    const result = new Map<string, boolean>();
    for (const u of game.units) {
      if (u.dead) continue;
      // Help, Shove and Grapple: an enemy within 5 ft.
      const ok = mode.actionId.startsWith("@") ? u.side !== active.side && u.hp > 0 && distanceFt(u.pos, active.pos) <= 5 : checkTarget(game, active.id, mode.actionId, u.id).ok;
      // Only ring yourself when the spell can be cast on you.
      if (u.id !== active.id || ok) result.set(u.id, ok);
    }
    return result;
  }, [game, heroTurn, mode, active]);

  const area = useMemo(() => {
    if (!heroTurn || mode.kind !== "area" || !active || !hover) return null;
    const check = checkArea(game, active.id, mode.actionId, hover);
    const action = active.stats.actions.find((a) => a.id === mode.actionId);
    if (!action) return null;
    return { ok: check.ok, reason: check.reason, cells: check.ok ? areaCells(game, active.id, action, hover) : [] };
  }, [game, heroTurn, mode, active, hover]);
  const picked = mode.kind === "target" ? (mode.picked ?? []) : [];

  return { active, heroTurn, reach, path, targets, area, picked };
}

/** Tile-based battle board for the game (fixed grid, click to move/target). */
export function GameBoard({ game, mode, interactive, fx, paths = {}, onMove, onTarget, onArea, onHoverUnit }: BoardProps) {
  const colors = useThemeColors();
  const [ref, size] = useSize();
  const { board } = game;
  // Zoomed in over the size that fits the whole map; when it doesn't fit, drag to look around.
  const zoom = useUi((s) => s.boardZoom);
  const fit = Math.min(size.width / board.width, size.height / board.height, 72);
  const cell = Math.max(16, Math.floor(Math.min(110, fit * zoom)));
  const width = cell * board.width;
  const height = cell * board.height;
  const roomy = width <= size.width && height <= size.height;
  const [hover, setHover] = useState<Cell | null>(null);

  const { active, heroTurn, reach, path, targets, area, picked } = useBoardLogic(game, mode, interactive, hover);
  const stage = useRef<Konva.Stage>(null);
  const clampPos = (p: { x: number; y: number }) => ({
    x: width <= size.width ? 0 : Math.min(0, Math.max(size.width - width, p.x)),
    y: height <= size.height ? 0 : Math.min(0, Math.max(size.height - height, p.y)),
  });
  // Keep whoever is acting in view.
  const focus = active ?? game.units.find((u) => u.side === "party" && !u.dead);
  useEffect(() => {
    if (!stage.current || roomy || !focus) return;
    stage.current.position(clampPos({ x: size.width / 2 - (focus.pos.x + 0.5) * cell, y: size.height / 2 - (focus.pos.y + 0.5) * cell }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, size.width, size.height, focus?.id, roomy]);

  const center = (c: Cell) => ({ x: c.x * cell + cell / 2, y: c.y * cell + cell / 2 });
  const ink = useMemo(() => drawInkBoard(board, cell, game.rngSeed), [board, cell, game.rngSeed]);

  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="absolute right-1 bottom-1 z-10 flex flex-col gap-1">
        {(
          [
            ["+", 1.25, "Zoom in"],
            ["−", 1 / 1.25, "Zoom out"],
          ] as const
        ).map(([label, by, title]) => (
          <button
            key={label}
            className="grid h-7 w-7 place-items-center rounded-sm border text-base leading-none"
            style={{ borderColor: INK, background: PAPER, color: INK }}
            onClick={() => useUi.setState((s) => ({ boardZoom: Math.min(4, Math.max(1, s.boardZoom * by)) }))}
            title={title}
            aria-label={title}
          >
            {label}
          </button>
        ))}
      </div>
      {size.width > 0 && (
        <Stage
          ref={stage}
          width={roomy ? width : size.width}
          height={roomy ? height : size.height}
          draggable={!roomy}
          dragDistance={6}
          dragBoundFunc={(p) => clampPos(p)}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const p = e.target.getStage()?.getRelativePointerPosition();
            if (p) setHover({ x: Math.floor(p.x / cell), y: Math.floor(p.y / cell) });
          }}
          onClick={(e) => {
            if (!heroTurn || mode.kind === "target") return;
            const p = e.target.getStage()?.getRelativePointerPosition();
            if (!p) return;
            const c = { x: Math.floor(p.x / cell), y: Math.floor(p.y / cell) };
            if (mode.kind === "area") {
              if (checkArea(game, active!.id, mode.actionId, c).ok) onArea(c);
              return;
            }
            if (reach.has(key(c)) && key(c) !== key(active!.pos)) onMove(c);
          }}
          style={{ cursor: heroTurn ? (mode.kind === "move" ? "pointer" : "crosshair") : "wait" }}
        >
          {/* The map, drawn once in pen and ink */}
          <Layer listening={false}>
            <KonvaImage image={ink} width={width} height={height} />
          </Layer>

          {/* Movement range and path preview */}
          <Layer listening={false}>
            {game.objective?.kind === "escape" &&
              game.objective.cells.map((c) => (
                <Group key={`x${c.x},${c.y}`}>
                  <Rect x={c.x * cell + 1} y={c.y * cell + 1} width={cell - 2} height={cell - 2} fill={withAlpha(colors.heal, 0.25)} stroke={colors.heal} strokeWidth={2} dash={[5, 3]} cornerRadius={3} />
                  <Text x={c.x * cell} y={c.y * cell} width={cell} height={cell} text="⇥" align="center" verticalAlign="middle" fontSize={cell * 0.5} fill={colors.heal} />
                </Group>
              ))}
            {[...reach.keys()].map((k) => {
              const c = fromKey(k);
              return <Rect key={k} x={c.x * cell + 1} y={c.y * cell + 1} width={cell - 2} height={cell - 2} fill={withAlpha(colors.accent, 0.13)} cornerRadius={3} />;
            })}
            {area?.cells.map((c) => (
              <Rect key={`a${c.x},${c.y}`} x={c.x * cell} y={c.y * cell} width={cell} height={cell} fill={withAlpha(colors.danger, 0.3)} stroke={withAlpha(colors.danger, 0.6)} strokeWidth={1} />
            ))}
            {area && !area.ok && hover && (
              <Rect x={hover.x * cell + 2} y={hover.y * cell + 2} width={cell - 4} height={cell - 4} stroke={colors.faint} strokeWidth={2} dash={[4, 4]} />
            )}
            {path && active && (
              <>
                <Line
                  points={[active.pos, ...path.path].flatMap((c) => [center(c).x, center(c).y])}
                  stroke={colors.highlight}
                  strokeWidth={3}
                  dash={[8, 5]}
                  lineCap="round"
                />
                <Text
                  x={center(hover!).x - cell}
                  y={center(hover!).y - cell * 0.95}
                  width={cell * 2}
                  align="center"
                  text={`${path.cost} ft`}
                  fontStyle="bold"
                  fontSize={Math.max(11, cell * 0.28)}
                  fill={colors.highlight}
                  shadowColor="black"
                  shadowBlur={3}
                />
              </>
            )}
          </Layer>

          <Layer>
            {game.units
              // The slain leave the board once they've fallen.
              .filter((u) => !(u.dead && u.side === "enemy" && !fx.some((f) => f.kind === "fall" && f.unitId === u.id)))
              // Figures stand up out of their squares: the ones further down the map in front.
              .slice()
              .sort((a, b) => a.pos.y - b.pos.y)
              .map((u) => (
                <UnitToken
                  key={`${game.rngSeed}:${u.id}`}
                  unit={u}
                  cell={cell}
                  colors={colors}
                  active={u.id === active?.id}
                  targetable={targets.get(u.id)}
                  picked={picked.includes(u.id)}
                  inArea={!!area?.cells.some((c) => c.x === u.pos.x && c.y === u.pos.y)}
                  path={paths[u.id]}
                  fx={fx.filter((f) => "unitId" in f && f.unitId === u.id)}
                  onClick={() => targets.get(u.id) && onTarget(u.id)}
                  onHover={(on) => onHoverUnit(on ? u.id : null)}
                />
              ))}
          </Layer>

          <Layer listening={false}>
            {fx.map((f) => {
              if (f.kind === "shot") return <Shot key={f.id} from={center(f.from)} to={center(f.to)} tone={f.tone} cell={cell} colors={colors} />;
              if (f.kind === "burst") return <Burst key={f.id} at={center(f.at)} tone={f.tone} cell={cell} colors={colors} />;
              return null;
            })}
            {fx.map((f, i) => {
              if (f.kind !== "text") return null;
              const u = game.units.find((x) => x.id === f.unitId);
              if (!u) return null;
              const p = center(u.pos);
              const fill = f.tone === "heal" ? colors.heal : f.tone === "miss" ? colors.muted : f.tone === "crit" ? colors.highlight : colors.danger;
              const crit = f.tone === "crit";
              return <FloatingText key={f.id} x={p.x} y={p.y - cell * (crit ? 0.9 : 0.4) - (i % 2) * cell * 0.25} text={f.text} fill={fill} size={Math.max(crit ? 20 : 14, cell * (crit ? 0.55 : 0.38))} pop={crit} />;
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

export const TONE_COLOR = (c: ThemeColors, tone: ShotTone) =>
  ({ arrow: c.text, magic: "#a78bfa", fire: "#f97316", cold: "#38bdf8", radiant: "#facc15", heal: c.heal })[tone];

function UnitToken({
  unit: u,
  cell,
  colors,
  active,
  targetable,
  picked,
  inArea,
  path,
  fx,
  onClick,
  onHover,
}: {
  unit: Unit;
  cell: number;
  colors: ThemeColors;
  active: boolean;
  targetable: boolean | undefined;
  picked: boolean;
  inArea: boolean;
  path: Cell[] | undefined;
  fx: Fx[];
  onClick: () => void;
  onHover: (on: boolean) => void;
}) {
  const ref = useRef<Konva.Group>(null);
  const body = useRef<Konva.Group>(null);
  const flash = useRef<Konva.Image>(null);
  const x = u.pos.x * cell + cell / 2;
  const y = u.pos.y * cell + cell / 2;
  const first = useRef(true);
  // Walk square by square along the path taken; otherwise slide.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (first.current) {
      node.position({ x, y });
      first.current = false;
      return;
    }
    const steps = path && path.length > 1 && path.at(-1)!.x === u.pos.x && path.at(-1)!.y === u.pos.y ? path.slice(1).map((c) => ({ x: c.x * cell + cell / 2, y: c.y * cell + cell / 2 })) : [{ x, y }];
    const per = Math.min(0.14, 0.6 / steps.length);
    let i = 0;
    const next = () => {
      const s = steps[i++];
      if (s) node.to({ ...s, duration: steps.length > 1 ? per : 0.3, onFinish: next });
    };
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  // Lunges, hits and falls, once each.
  const done = useRef(new Set<number>());
  useEffect(() => {
    const b = body.current;
    if (!b) return;
    for (const f of fx) {
      if (done.current.has(f.id)) continue;
      done.current.add(f.id);
      if (f.kind === "lunge") {
        const dx = (f.to.x - u.pos.x) * cell * 0.35;
        const dy = (f.to.y - u.pos.y) * cell * 0.35;
        b.to({ x: dx, y: dy, duration: 0.1, onFinish: () => b.to({ x: 0, y: 0, duration: 0.15 }) });
      }
      if (f.kind === "hit") {
        const amp = f.crit ? 7 : 4;
        setTimeout(() => {
          flash.current?.to({ shadowBlur: 16, duration: 0.05, onFinish: () => flash.current?.to({ shadowBlur: 0, duration: 0.35 }) });
          b.to({ x: amp, duration: 0.04, onFinish: () => b.to({ x: -amp, duration: 0.06, onFinish: () => b.to({ x: 0, duration: 0.05 }) }) });
        }, 180);
      }
      if (f.kind === "fall") setTimeout(() => b.to({ rotation: -80, opacity: u.side === "enemy" && u.dead ? 0 : 1, duration: 0.5 }), 250);
    }
  }, [fx, u.pos.x, u.pos.y, u.side, u.dead, cell]);
  // Back on their feet: stand up again.
  const down = u.hp <= 0;
  const lying = down || u.conditions.includes("Prone");
  useEffect(() => {
    body.current?.to({ rotation: lying ? -80 : 0, opacity: 1, duration: 0.3 });
  }, [lying]);

  const r = cell * 0.4;
  const hpPct = Math.max(0, u.hp) / Math.max(1, u.hpMax);
  // An ink miniature on a base: the company's bases rimmed black, foes' red.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const look = useMemo(() => lookOf(u), [u.id, u.name, u.side, u.stats.className]);
  const [, setLoaded] = useState(0);
  const foe = u.side === "enemy";
  const img = miniImage(look, foe, () => setLoaded((n) => n + 1));
  const k = (cell * 1.3) / 128;
  const feet = cell * 0.24;
  const rx = cell * (look.kind === "wolf" ? 0.46 : look.kind === "rat" ? 0.3 : 0.37);
  const ry = rx * 0.42;
  const rim = foe ? INK_RED : INK;
  return (
    <Group
      ref={ref}
      onClick={(e) => {
        e.cancelBubble = true;
        onClick();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      opacity={u.dead ? 0.35 : u.conditions.includes("Hidden") ? 0.55 : 1}
    >
      {targetable !== undefined && <Ellipse y={feet} radiusX={rx + 7} radiusY={ry + 5} stroke={targetable ? colors.highlight : colors.faint} strokeWidth={targetable ? 3 : 1} dash={targetable ? undefined : [4, 4]} />}
      {picked && <Ellipse y={feet} radiusX={rx + 10} radiusY={ry + 7} stroke={colors.heal} strokeWidth={4} />}
      {inArea && <Ellipse y={feet} radiusX={rx + 8} radiusY={ry + 6} stroke={colors.danger} strokeWidth={4} dash={[6, 3]} />}
      {active && <Ellipse y={feet} radiusX={rx + 4} radiusY={ry + 3} stroke={colors.accent} strokeWidth={3} shadowColor={colors.accent} shadowBlur={12} />}
      <Ellipse y={feet + 2.5} radiusX={rx} radiusY={ry} fill={rim} shadowColor="black" shadowBlur={3} shadowOffset={{ x: 1.5, y: 1.5 }} shadowOpacity={0.3} />
      <Ellipse y={feet} radiusX={rx} radiusY={ry} fill={PAPER} stroke={rim} strokeWidth={1.6} />
      <Group ref={body} y={feet} rotation={lying ? -80 : 0}>
        {img ? (
          <KonvaImage ref={flash} image={img} x={foe ? 64 * k : -64 * k} y={-132 * k} width={128 * k} height={140 * k} scaleX={foe ? -1 : 1} shadowColor="#ef4444" shadowBlur={0} shadowOpacity={0.95} />
        ) : (
          <Text text={initials(u.name)} width={r * 2} x={-r} y={-r * 1.6} align="center" fontStyle="bold" fontFamily="'IM Fell English', serif" fontSize={r * 0.95} fill={rim} listening={false} />
        )}
      </Group>
      {down && <Text text={u.dead ? "✝" : "💤"} x={rx * 0.4} y={feet - cell * 0.55} fontSize={r * 0.8} listening={false} />}
      {u.conditions.includes("Prone") && !down && <Text text="⤓" x={-rx - r * 0.7} y={feet - cell * 0.62} fontSize={r * 0.8} fontStyle="bold" fill={colors.warn} shadowColor="black" shadowBlur={2} listening={false} />}
      {u.conditions.includes("Grappled") && <Text text="⛓" x={rx * 0.6} y={feet - r * 0.5} fontSize={r * 0.7} listening={false} />}
      {u.conditions.includes("Hidden") && <Text text="🫥" x={rx * 0.5} y={feet - cell * 1.1} fontSize={r * 0.75} listening={false} />}
      {/* HP bar under the base */}
      <Rect x={-r} y={feet + ry + 4} width={r * 2} height={4} fill={colors["surface-3"]} cornerRadius={2} listening={false} />
      <Rect x={-r} y={feet + ry + 4} width={r * 2 * hpPct} height={4} fill={hpPct > 0.5 ? colors.heal : hpPct > 0.25 ? colors.warn : colors.danger} cornerRadius={2} listening={false} />
    </Group>
  );
}

/** An arrow or a bolt of magic flying to its target. */
export function Shot({ from, to, tone, cell, colors }: { from: { x: number; y: number }; to: { x: number; y: number }; tone: ShotTone; cell: number; colors: ThemeColors }) {
  const ref = useRef<Konva.Group>(null);
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    n.to({ x: to.x, y: to.y, duration: Math.min(0.35, 0.08 + dist / (cell * 30)), onFinish: () => n.to({ opacity: 0, duration: 0.1 }) });
  }, [from.x, from.y, to.x, to.y, cell]);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const color = TONE_COLOR(colors, tone);
  return (
    <Group ref={ref} x={from.x} y={from.y} rotation={angle}>
      {tone === "arrow" ? (
        <Line points={[-cell * 0.35, 0, 0, 0]} stroke={color} strokeWidth={3} lineCap="round" />
      ) : (
        <>
          <Circle radius={cell * 0.16} fill={color} shadowColor={color} shadowBlur={16} />
          <Line points={[-cell * 0.4, 0, 0, 0]} stroke={color} strokeWidth={cell * 0.12} opacity={0.4} lineCap="round" />
        </>
      )}
    </Group>
  );
}

/** A ring of light where a spell goes off or healing lands. */
export function Burst({ at, tone, cell, colors }: { at: { x: number; y: number }; tone: ShotTone; cell: number; colors: ThemeColors }) {
  const ref = useRef<Konva.Circle>(null);
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    n.to({ radius: cell * 0.75, opacity: 0, duration: 0.6 });
  }, [cell]);
  const color = TONE_COLOR(colors, tone);
  return <Circle ref={ref} x={at.x} y={at.y} radius={cell * 0.2} stroke={color} strokeWidth={4} fill={color} opacity={0.6} shadowColor={color} shadowBlur={14} />;
}

export function FloatingText({ x, y, text, fill, size, pop }: { x: number; y: number; text: string; fill: string; size: number; pop?: boolean }) {
  const ref = useRef<Konva.Text>(null);
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    if (pop) n.to({ scaleX: 1.4, scaleY: 1.4, duration: 0.15, onFinish: () => n.to({ scaleX: 1, scaleY: 1, duration: 0.15 }) });
    n.to({ y: y - size * 1.6, opacity: 0, duration: 1.3 });
  }, [y, size, pop]);
  return <Text ref={ref} x={x} y={y} offsetX={70} width={140} align="center" text={text} fill={fill} fontSize={size} fontStyle="bold" shadowColor="black" shadowBlur={4} />;
}
