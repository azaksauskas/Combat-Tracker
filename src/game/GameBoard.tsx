import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { initials } from "../domain/combat";
import { useThemeColors } from "../store/ui";
import { GRID_ALPHA, withAlpha, type ThemeColors } from "../theme/themes";
import { findPath, fromKey, key, type Cell } from "./board";
import { areaCells, checkArea, checkTarget, currentUnit, reachable } from "./engine";
import type { GameState, Unit } from "./state";
import type { Fx } from "./store";

export type BoardMode =
  | { kind: "move" }
  /** Pick a creature; `picked` collects several for spells like Bless. */
  | { kind: "target"; actionId: string; picked?: string[] }
  /** Aim an area spell at a square. */
  | { kind: "area"; actionId: string };

interface Props {
  game: GameState;
  mode: BoardMode;
  /** Heroes can be commanded; false while monsters act. */
  interactive: boolean;
  fx: Fx[];
  onMove: (to: Cell) => void;
  onTarget: (unitId: string) => void;
  onArea: (point: Cell) => void;
  onHoverUnit: (unitId: string | null) => void;
}

function useSize() {
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

/** Tile-based battle board for the game (fixed grid, click to move/target). */
export function GameBoard({ game, mode, interactive, fx, onMove, onTarget, onArea, onHoverUnit }: Props) {
  const colors = useThemeColors();
  const [ref, size] = useSize();
  const { board } = game;
  const cell = Math.max(16, Math.floor(Math.min(size.width / board.width, size.height / board.height, 72)));
  const width = cell * board.width;
  const height = cell * board.height;
  const [hover, setHover] = useState<Cell | null>(null);

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
      const ok = checkTarget(game, active.id, mode.actionId, u.id).ok;
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

  const center = (c: Cell) => ({ x: c.x * cell + cell / 2, y: c.y * cell + cell / 2 });
  const walls = useMemo(() => new Set(board.walls), [board]);
  const difficult = useMemo(() => new Set(board.difficult), [board]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      {size.width > 0 && (
        <Stage
          width={width}
          height={height}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const p = e.target.getStage()?.getPointerPosition();
            if (p) setHover({ x: Math.floor(p.x / cell), y: Math.floor(p.y / cell) });
          }}
          onClick={(e) => {
            if (!heroTurn || mode.kind === "target") return;
            const p = e.target.getStage()?.getPointerPosition();
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
          <Layer listening={false}>
            <Rect width={width} height={height} fill={colors["map-bg"]} />
            {Array.from({ length: board.height }, (_, y) =>
              Array.from({ length: board.width }, (_, x) => {
                const k = `${x},${y}`;
                if (walls.has(k)) return <Rect key={k} x={x * cell} y={y * cell} width={cell} height={cell} fill={colors["surface-3"]} stroke={colors.line} strokeWidth={1} />;
                if (difficult.has(k))
                  return (
                    <Group key={k}>
                      <Rect x={x * cell} y={y * cell} width={cell} height={cell} fill={withAlpha(colors.heal, 0.18)} />
                      <Text x={x * cell} y={y * cell} width={cell} height={cell} text="〃" align="center" verticalAlign="middle" fontSize={cell * 0.4} fill={withAlpha(colors.heal, 0.6)} />
                    </Group>
                  );
                return null;
              }),
            )}
            {Array.from({ length: board.width + 1 }, (_, x) => (
              <Line key={`v${x}`} points={[x * cell, 0, x * cell, height]} stroke={withAlpha(colors["grid-line"], GRID_ALPHA)} strokeWidth={1} />
            ))}
            {Array.from({ length: board.height + 1 }, (_, y) => (
              <Line key={`h${y}`} points={[0, y * cell, width, y * cell]} stroke={withAlpha(colors["grid-line"], GRID_ALPHA)} strokeWidth={1} />
            ))}
          </Layer>

          {/* Movement range and path preview */}
          <Layer listening={false}>
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
              .filter((u) => !(u.dead && u.side === "enemy"))
              .map((u) => (
                <UnitToken
                  key={u.id}
                  unit={u}
                  cell={cell}
                  colors={colors}
                  active={u.id === active?.id}
                  targetable={targets.get(u.id)}
                  picked={picked.includes(u.id)}
                  inArea={!!area?.cells.some((c) => c.x === u.pos.x && c.y === u.pos.y)}
                  onClick={() => targets.get(u.id) && onTarget(u.id)}
                  onHover={(on) => onHoverUnit(on ? u.id : null)}
                />
              ))}
          </Layer>

          <Layer listening={false}>
            {fx.map((f, i) => {
              const u = game.units.find((x) => x.id === f.unitId);
              if (!u) return null;
              const p = center(u.pos);
              const fill = f.tone === "heal" ? colors.heal : f.tone === "miss" ? colors.muted : f.tone === "crit" ? colors.highlight : colors.danger;
              return <FloatingText key={f.id} x={p.x} y={p.y - cell * 0.4 - (i % 2) * cell * 0.25} text={f.text} fill={fill} size={Math.max(14, cell * 0.38)} />;
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

function UnitToken({
  unit: u,
  cell,
  colors,
  active,
  targetable,
  picked,
  inArea,
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
  onClick: () => void;
  onHover: (on: boolean) => void;
}) {
  const ref = useRef<Konva.Group>(null);
  const x = u.pos.x * cell + cell / 2;
  const y = u.pos.y * cell + cell / 2;
  const first = useRef(true);
  // Slide to the new square instead of jumping.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (first.current) {
      node.position({ x, y });
      first.current = false;
      return;
    }
    node.to({ x, y, duration: 0.3 });
  }, [x, y]);

  const r = cell * 0.4;
  const down = u.hp <= 0;
  const hpPct = Math.max(0, u.hp) / Math.max(1, u.hpMax);
  return (
    <Group
      ref={ref}
      onClick={(e) => {
        e.cancelBubble = true;
        onClick();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      opacity={u.dead ? 0.35 : 1}
    >
      {targetable !== undefined && (
        <Circle radius={r + 6} stroke={targetable ? colors.highlight : colors.faint} strokeWidth={targetable ? 3 : 1} dash={targetable ? undefined : [4, 4]} />
      )}
      {picked && <Circle radius={r + 9} stroke={colors.heal} strokeWidth={4} />}
      {inArea && <Circle radius={r + 7} stroke={colors.danger} strokeWidth={4} dash={[6, 3]} />}
      {active && <Circle radius={r + 4} stroke={colors.accent} strokeWidth={3} shadowColor={colors.accent} shadowBlur={12} />}
      <Circle radius={r} fill={u.side === "enemy" ? colors["token-monster"] : colors["token-player"]} stroke={u.side === "enemy" ? colors.danger : colors.temp} strokeWidth={2} />
      <Text text={initials(u.name)} width={r * 2} height={r * 2} x={-r} y={-r} align="center" verticalAlign="middle" fontStyle="bold" fontSize={r * 0.9} fill="white" listening={false} />
      {down && <Text text={u.dead ? "✝" : "💤"} x={r * 0.3} y={-r * 1.2} fontSize={r * 0.8} listening={false} />}
      {u.conditions.includes("Prone") && !down && <Text text="⤓" x={-r * 1.25} y={-r * 1.2} fontSize={r * 0.8} fill={colors.warn} listening={false} />}
      {/* HP bar */}
      <Rect x={-r} y={r + 3} width={r * 2} height={4} fill={colors["surface-3"]} cornerRadius={2} listening={false} />
      <Rect x={-r} y={r + 3} width={r * 2 * hpPct} height={4} fill={hpPct > 0.5 ? colors.heal : colors.warn} cornerRadius={2} listening={false} />
    </Group>
  );
}

function FloatingText({ x, y, text, fill, size }: { x: number; y: number; text: string; fill: string; size: number }) {
  const ref = useRef<Konva.Text>(null);
  useEffect(() => {
    ref.current?.to({ y: y - size * 1.6, opacity: 0, duration: 1.3 });
  }, [y, size]);
  return <Text ref={ref} x={x - 60} y={y} width={120} align="center" text={text} fill={fill} fontSize={size} fontStyle="bold" shadowColor="black" shadowBlur={4} />;
}
