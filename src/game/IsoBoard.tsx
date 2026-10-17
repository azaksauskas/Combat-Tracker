import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Line, Path, Rect, Stage, Text } from "react-konva";
import { initials } from "../domain/combat";
import { useThemeColors } from "../store/ui";
import { withAlpha, type ThemeColors } from "../theme/themes";
import { fromKey, key, type Cell } from "./board";
import { checkArea } from "./engine";
import { Burst, FloatingText, Shot, useBoardLogic, useSize, type BoardProps } from "./GameBoard";
import { INK, PAPER } from "./inkBoard";
import { drawIsoBoard, isoGeom, type IsoGeom } from "./isoDraw";
import type { Unit } from "./state";
import type { Fx } from "./store";

const INK_RED = "#a8322a";

/** Four-legged: beasts, and anything named like one. */
const isBeast = (u: Unit) => u.stats.creatureType?.toLowerCase() === "beast" || /wolf|rat\b|boar|bear|hound|hyena|spider|warg|jackal/i.test(u.name);

/**
 * The battle board at an angle, like an isometric dungeon drawn in ink: the
 * map is a cut-away of floor slabs and back walls, and every creature is a
 * flat ink miniature standing on its square (lying down when prone or out).
 */
export function IsoBoard({ game, mode, interactive, fx, paths = {}, onMove, onTarget, onArea, onHoverUnit }: BoardProps) {
  const colors = useThemeColors();
  const [ref, size] = useSize();
  const { board } = game;
  const [hover, setHover] = useState<Cell | null>(null);
  const { active, heroTurn, reach, path, targets, area, picked } = useBoardLogic(game, mode, interactive, hover);

  // The tile size: the whole map fills the panel's height (drag to look along it), zoom in or out from there.
  const maxLevel = Math.max(0, ...Object.values(board.heights ?? {}));
  const span = board.width + board.height;
  const fitW = (size.width - 24) / (span / 2);
  const fitH = (size.height - 24) / (span / 4 + maxLevel * 0.3 + 0.9);
  const [zoom, setZoom] = useState(1);
  const tw = Math.max(24, Math.floor(Math.min(170, Math.max(Math.min(fitW, fitH), fitH * zoom))));
  const g = useMemo(() => isoGeom(board, tw), [board, tw]);
  const stage = useRef<Konva.Stage>(null);
  // Where the view rests: on the creature whose turn it is (or the company), kept on the map.
  const clampPos = (p: { x: number; y: number }) => ({
    x: g.width <= size.width ? (size.width - g.width) / 2 : Math.min(0, Math.max(size.width - g.width, p.x)),
    y: g.height <= size.height ? (size.height - g.height) / 2 : Math.min(0, Math.max(size.height - g.height, p.y)),
  });
  const focus = active ?? game.units.find((u) => u.side === "party" && !u.dead);
  useEffect(() => {
    if (!stage.current || !size.width) return;
    const f = focus ? g.centre(focus.pos) : { x: g.width / 2, y: g.height / 2 };
    stage.current.position(clampPos({ x: size.width / 2 - f.x, y: size.height / 2 - f.y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, size.width, size.height, focus?.id]);
  const ink = useMemo(() => (size.width > 0 ? drawIsoBoard(board, g, game.rngSeed, board.look) : null), [board, g, game.rngSeed, size.width]);
  // Dev-only handle for browser tests: where a square is on the page.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __iso: {
        screen: (c: Cell) => {
          const st = stage.current;
          if (!st) return null;
          const box = st.container().getBoundingClientRect();
          const p = g.centre(c);
          return { x: box.left + st.x() + p.x, y: box.top + st.y() + p.y };
        },
      },
    });
  }, [g]);
  const point = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const p = e.target.getStage()?.getRelativePointerPosition();
    return p ? g.pick(p.x, p.y) : null;
  };
  const center = (c: Cell) => g.centre(c);
  // Where a creature's body is (for shots and numbers): above its square.
  const body = (c: Cell) => ({ x: g.centre(c).x, y: g.centre(c).y - tw * 0.4 });
  const tile = (c: Cell, inset = 0.06) => g.diamond(c, inset);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden rounded-md" style={{ background: PAPER }}>
      <div className="absolute right-1 bottom-1 z-10 flex flex-col gap-1">
        {[
          ["+", () => setZoom((z) => Math.min(2.5, z * 1.25)), "Zoom in"],
          ["−", () => setZoom((z) => Math.max(0.4, z / 1.25)), "Zoom out"],
        ].map(([label, onClick, title]) => (
          <button key={label as string} className="grid h-7 w-7 place-items-center rounded-sm border text-base leading-none" style={{ borderColor: INK, background: PAPER, color: INK }} onClick={onClick as () => void} title={title as string} aria-label={title as string}>
            {label as string}
          </button>
        ))}
      </div>
      {size.width > 0 && ink && (
        <Stage
          ref={stage}
          width={size.width}
          height={size.height}
          draggable={g.width > size.width || g.height > size.height}
          dragDistance={6}
          dragBoundFunc={(p) => clampPos(p)}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const c = point(e);
            if (c?.x !== hover?.x || c?.y !== hover?.y) setHover(c);
          }}
          onClick={(e) => {
            if (!heroTurn || mode.kind === "target") return;
            const c = point(e);
            if (!c) return;
            if (mode.kind === "area") {
              if (checkArea(game, active!.id, mode.actionId, c).ok) onArea(c);
              return;
            }
            if (reach.has(key(c)) && key(c) !== key(active!.pos)) onMove(c);
          }}
          style={{ cursor: heroTurn ? (mode.kind === "move" ? "pointer" : "crosshair") : "wait" }}
        >
          <Layer listening={false}>
            <KonvaImage image={ink} width={g.width} height={g.height} />
          </Layer>

          {/* Movement range, the way there, areas, the way out */}
          <Layer listening={false}>
            {game.objective?.kind === "escape" &&
              game.objective.cells.map((c) => <Line key={`x${c.x},${c.y}`} points={tile(c)} closed fill={withAlpha(colors.heal, 0.3)} stroke={colors.heal} strokeWidth={2} dash={[5, 3]} />)}
            {[...reach.keys()].map((k) => (
              <Line key={k} points={tile(fromKey(k), 0.1)} closed fill={withAlpha(colors.accent, 0.16)} />
            ))}
            {area?.cells.map((c) => (
              <Line key={`a${c.x},${c.y}`} points={tile(c, 0)} closed fill={withAlpha(colors.danger, 0.3)} stroke={withAlpha(colors.danger, 0.6)} strokeWidth={1} />
            ))}
            {hover && <Line points={tile(hover, 0.04)} closed stroke={area && !area.ok ? colors.faint : INK} strokeWidth={1.5} dash={[4, 4]} />}
            {path && active && hover && (
              <>
                <Line points={[active.pos, ...path.path].flatMap((c) => [center(c).x, center(c).y])} stroke={colors.highlight} strokeWidth={3} dash={[8, 5]} lineCap="round" />
                <Text x={center(hover).x - 40} y={center(hover).y - tw * 0.55} width={80} align="center" text={`${path.cost} ft`} fontStyle="bold" fontSize={Math.max(11, tw * 0.2)} fill={colors.highlight} shadowColor="black" shadowBlur={3} />
              </>
            )}
          </Layer>

          {/* The creatures, back to front */}
          <Layer>
            {game.units
              .filter((u) => !(u.dead && u.side === "enemy" && !fx.some((f) => f.kind === "fall" && f.unitId === u.id)))
              .slice()
              .sort((a, b) => a.pos.x + a.pos.y - (b.pos.x + b.pos.y))
              .map((u) => (
                <Miniature
                  key={`${game.rngSeed}:${u.id}`}
                  unit={u}
                  g={g}
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
              if (f.kind === "shot") return <Shot key={f.id} from={body(f.from)} to={body(f.to)} tone={f.tone} cell={tw * 0.6} colors={colors} />;
              if (f.kind === "burst") return <Burst key={f.id} at={center(f.at)} tone={f.tone} cell={tw * 0.7} colors={colors} />;
              return null;
            })}
            {fx.map((f, i) => {
              if (f.kind !== "text") return null;
              const u = game.units.find((x) => x.id === f.unitId);
              if (!u) return null;
              const p = body(u.pos);
              const fill = f.tone === "heal" ? colors.heal : f.tone === "miss" ? colors.muted : f.tone === "crit" ? colors.highlight : colors.danger;
              const crit = f.tone === "crit";
              return <FloatingText key={f.id} x={p.x} y={p.y - tw * (crit ? 0.6 : 0.35) - (i % 2) * tw * 0.18} text={f.text} fill={fill} size={Math.max(crit ? 20 : 14, tw * (crit ? 0.36 : 0.26))} pop={crit} />;
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

// --- The miniatures --------------------------------------------------------------------------

/** Ink silhouettes, 100 units tall, standing on 0,0. */
const SHAPES = {
  // A cloaked figure with a hood.
  folk: {
    body: "M -7 -78 Q -18 -74 -19 -62 Q -22 -34 -25 -3 Q 0 4 25 -3 Q 22 -34 19 -62 Q 18 -74 7 -78 Z",
    head: "M 0 -98 A 11 11 0 1 1 -0.1 -98 Z",
    lines: "M -11 -66 Q 0 -58 11 -66 M -20 -30 Q 0 -24 20 -30 M 0 -58 L 0 -2",
    weapon: "M 23 -66 L 32 -8 M 19 -56 L 28 -58",
  },
  // A four-legged beast: wolves, rats, boars.
  beast: {
    body: "M -40 -30 Q -30 -46 -2 -44 Q 18 -46 26 -40 L 36 -54 L 40 -48 L 48 -46 L 46 -36 Q 40 -28 30 -26 L 28 -2 L 21 -2 L 18 -20 L -18 -20 L -21 -2 L -28 -2 L -30 -22 Q -40 -24 -46 -36 Q -44 -32 -40 -30 Z",
    head: "",
    lines: "M -10 -40 Q 0 -34 12 -40 M 34 -48 L 37 -45",
    weapon: "",
  },
};

function Miniature({
  unit: u,
  g,
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
  g: IsoGeom;
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
  const fig = useRef<Konva.Group>(null);
  const flash = useRef<Konva.Path>(null);
  const { x, y } = g.centre(u.pos);
  const first = useRef(true);
  // Walk square by square along the path taken (up and down the levels); otherwise slide.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (first.current) {
      node.position({ x, y });
      first.current = false;
      return;
    }
    const steps = path && path.length > 1 && path.at(-1)!.x === u.pos.x && path.at(-1)!.y === u.pos.y ? path.slice(1).map((c) => g.centre(c)) : [{ x, y }];
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
    const b = fig.current;
    if (!b) return;
    for (const f of fx) {
      if (done.current.has(f.id)) continue;
      done.current.add(f.id);
      if (f.kind === "lunge") {
        const to = g.centre(f.to);
        b.to({ x: (to.x - x) * 0.35, y: (to.y - y) * 0.35, duration: 0.1, onFinish: () => b.to({ x: 0, y: 0, duration: 0.15 }) });
      }
      if (f.kind === "hit") {
        const amp = f.crit ? 7 : 4;
        setTimeout(() => {
          flash.current?.to({ opacity: 0.75, duration: 0.05, onFinish: () => flash.current?.to({ opacity: 0, duration: 0.35 }) });
          b.to({ x: amp, duration: 0.04, onFinish: () => b.to({ x: -amp, duration: 0.06, onFinish: () => b.to({ x: 0, duration: 0.05 }) }) });
        }, 180);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  // Lying down: out of the fight, or knocked prone.
  const down = u.hp <= 0;
  const lying = down || u.conditions.includes("Prone");
  const enemy = u.side === "enemy";
  const shape = isBeast(u) ? SHAPES.beast : SHAPES.folk;
  const big = 1;
  const k = (g.tw * 0.78 * big) / 100;
  const rx = g.tw * 0.3 * Math.min(1.4, big);
  const ry = rx / 2;
  const tall = (isBeast(u) ? 52 : 100) * k;
  const fill = enemy ? PAPER : INK;
  const lineCol = enemy ? INK : PAPER;
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
      opacity={u.dead ? 0.35 : u.conditions.includes("Hidden") ? 0.55 : 1}
    >
      {/* The base, and rings for turn, targets and areas */}
      <Ellipse radiusX={rx * 1.08} radiusY={ry * 1.08} fill="rgba(29,26,22,0.18)" y={2} />
      <Ellipse radiusX={rx} radiusY={ry} fill={PAPER} stroke={enemy ? INK_RED : INK} strokeWidth={enemy ? 2.4 : 2} />
      {targetable !== undefined && <Ellipse radiusX={rx + 7} radiusY={ry + 4} stroke={targetable ? colors.highlight : colors.faint} strokeWidth={targetable ? 3 : 1} dash={targetable ? undefined : [4, 4]} />}
      {picked && <Ellipse radiusX={rx + 10} radiusY={ry + 6} stroke={colors.heal} strokeWidth={4} />}
      {inArea && <Ellipse radiusX={rx + 8} radiusY={ry + 5} stroke={colors.danger} strokeWidth={4} dash={[6, 3]} />}
      {active && <Ellipse radiusX={rx + 4} radiusY={ry + 2.5} stroke={colors.accent} strokeWidth={3} shadowColor={colors.accent} shadowBlur={12} />}
      {/* The figure */}
      <Group ref={fig}>
        <Group rotation={lying ? -78 : 0} x={lying ? -tall * 0.1 : 0} y={lying ? ry * 0.3 : 0} scaleX={k} scaleY={k}>
          <Path data={shape.body} fill={fill} stroke={enemy ? INK_RED : INK} strokeWidth={2.4 / Math.max(0.3, k)} lineJoin="round" />
          {shape.head && <Path data={shape.head} fill={fill} stroke={enemy ? INK_RED : INK} strokeWidth={2.4 / Math.max(0.3, k)} />}
          <Path data={shape.lines} stroke={lineCol} strokeWidth={1.2 / Math.max(0.3, k)} lineCap="round" />
          {shape.weapon && <Path data={shape.weapon} stroke={INK} strokeWidth={2.2 / Math.max(0.3, k)} lineCap="round" />}
          <Path ref={flash} data={shape.body} fill="#ef4444" opacity={0} />
        </Group>
        {!lying && (
          <Text text={initials(u.name)} x={-20} width={40} align="center" y={-tall * (isBeast(u) ? 0.55 : 0.52)} fontStyle="bold" fontFamily="'IM Fell English', serif" fontSize={Math.max(9, g.tw * 0.15)} fill={lineCol} listening={false} />
        )}
      </Group>
      {/* Hit box: the whole figure */}
      <Rect x={-rx} y={-tall - 6} width={rx * 2} height={tall + ry + 6} fill="transparent" />
      {down && <Text text={u.dead ? "✝" : "💤"} x={rx * 0.3} y={-tall * 0.5} fontSize={g.tw * 0.22} listening={false} />}
      {u.conditions.includes("Prone") && !down && <Text text="⤓ prone" x={-rx * 1.6} y={-tall * 0.45} fontSize={Math.max(10, g.tw * 0.16)} fontStyle="bold" fill={colors.warn} shadowColor="black" shadowBlur={2} listening={false} />}
      {u.conditions.includes("Grappled") && <Text text="⛓" x={rx * 0.5} y={-tall * 0.3} fontSize={g.tw * 0.18} listening={false} />}
      {u.conditions.includes("Hidden") && <Text text="🫥" x={rx * 0.4} y={-tall - 4} fontSize={g.tw * 0.18} listening={false} />}
      {/* HP bar over the head */}
      {!lying && (
        <>
          <Rect x={-rx * 0.8} y={-tall - 10} width={rx * 1.6} height={4} fill={colors["surface-3"]} cornerRadius={2} listening={false} />
          <Rect x={-rx * 0.8} y={-tall - 10} width={rx * 1.6 * hpPct} height={4} fill={hpPct > 0.5 ? colors.heal : hpPct > 0.25 ? colors.warn : colors.danger} cornerRadius={2} listening={false} />
        </>
      )}
    </Group>
  );
}
