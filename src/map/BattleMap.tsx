import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Label, Layer, Line, Stage, Tag, Text, Transformer } from "react-konva";
import { tokenColor } from "../domain/combat";
import { MAP_SIZE, clamp, distanceFeet, hitsPolyline, snapToGrid, type Point } from "../domain/grid";
import type { Combatant } from "../domain/types";
import * as actions from "../store/actions";
import { useGame } from "../store/game";
import { setHover, useUi } from "../store/ui";
import { GridLayer } from "./GridLayer";
import { MapShapeNode } from "./MapShapeNode";
import { Token } from "./Token";

interface Props {
  /** DM: full editing. Players: may move their own (non-monster) tokens only. */
  editable: boolean;
  /** Double-click / double-tap on a token. */
  onInspect?: (id: string) => void;
  /** Click on empty map. */
  onBackgroundClick?: () => void;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Reads theme colours from CSS so the canvas follows light/dark mode. */
function useCanvasColors(theme: string) {
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    return { bg: css.getPropertyValue("--map-bg").trim(), grid: css.getPropertyValue("--grid-line").trim() };
  }, [theme]);
}

export function BattleMap({ editable, onInspect, onBackgroundClick }: Props) {
  const { combatants, activeId, map } = useGame((s) => s.combat);
  const { mapTool, drawColor, snapToGrid: snap, theme, mapCenter, pinnedId, hoverId, selectedShapeId, set: setUi } = useUi();
  const selectShape = (id: string | null) => setUi({ selectedShapeId: id });
  const tool = editable ? mapTool : "select";
  const colors = useCanvasColors(theme);
  const [containerRef, size] = useSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [erased, setErased] = useState<Set<string>>(new Set());
  const [ruler, setRuler] = useState<{ from: Point; to: Point } | null>(null);
  const pointerDown = useRef(false);

  // Centre on the last known viewport once the container has a size.
  useEffect(() => {
    if (!view && size.width > 0) setView({ x: size.width / 2 - mapCenter.x, y: size.height / 2 - mapCenter.y, scale: 1 });
  }, [size, view, mapCenter]);

  // When the map area is resized (sidebar, window, docking), keep the same
  // spot in the middle instead of anchoring to the top-left corner. Hidden
  // panes report 0×0, so only real sizes count.
  const lastSize = useRef(size);
  useEffect(() => {
    const prev = lastSize.current;
    if (!size.width || !size.height) return;
    lastSize.current = size;
    if (!prev.width || !prev.height || (prev.width === size.width && prev.height === size.height)) return;
    setView((v) => v && { ...v, x: v.x + (size.width - prev.width) / 2, y: v.y + (size.height - prev.height) / 2 });
  }, [size]);

  // Remember where we're looking: new combatants spawn there.
  useEffect(() => {
    if (!view || !size.width) return;
    const t = setTimeout(() => {
      setUi({
        mapCenter: {
          x: Math.round(clamp((size.width / 2 - view.x) / view.scale, 0, MAP_SIZE)),
          y: Math.round(clamp((size.height / 2 - view.y) / view.scale, 0, MAP_SIZE)),
        },
      });
    }, 250);
    return () => clearTimeout(t);
  }, [view, size, setUi]);

  // Attach the rotate/scale handles to the selected shape.
  useEffect(() => {
    const tr = trRef.current;
    const node = selectedShapeId ? stageRef.current?.findOne(`#shape-${selectedShapeId}`) : undefined;
    tr?.nodes(node ? [node] : []);
  }, [selectedShapeId, map.shapes]);

  // Delete / Backspace removes the selected template.
  useEffect(() => {
    if (!editable || !selectedShapeId) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        actions.removeShape(selectedShapeId);
        setUi({ selectedShapeId: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, selectedShapeId, setUi]);

  const worldPointer = (): Point | null => stageRef.current?.getRelativePointerPosition() ?? null;

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!view || !pointer) return;
    const scale = clamp(view.scale * (e.evt.deltaY > 0 ? 1 / 1.1 : 1.1), MIN_SCALE, MAX_SCALE);
    const world = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale });
  };

  const eraseAt = (p: Point) => {
    const hits = map.lines.filter((l) => !erased.has(l.id) && hitsPolyline(p, l.points, 12 / (view?.scale ?? 1)));
    if (hits.length) setErased((s) => new Set([...s, ...hits.map((l) => l.id)]));
  };

  const onPointerDown = (e: KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    const onEmpty = e.target === stage;
    if (onEmpty) {
      selectShape(null);
      onBackgroundClick?.();
    }
    if (!editable) return;
    const p = worldPointer();
    if (!p) return;
    pointerDown.current = true;
    if (tool === "draw") setDraft([p.x, p.y]);
    if (tool === "erase") eraseAt(p);
  };

  const onPointerMove = () => {
    if (!pointerDown.current || !editable) return;
    const p = worldPointer();
    if (!p) return;
    if (tool === "draw") setDraft((d) => (d ? [...d, p.x, p.y] : d));
    if (tool === "erase") eraseAt(p);
  };

  const onPointerUp = () => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    if (draft && draft.length >= 4) actions.addLine({ points: draft.map(Math.round), color: drawColor, width: 4 });
    setDraft(null);
    if (erased.size) {
      actions.removeLines([...erased]);
      setErased(new Set());
    }
  };

  const canMove = (c: Combatant) => tool === "select" && (editable || !c.isMonster);

  const onTokenDragEnd = (c: Combatant, node: Konva.Group) => {
    setRuler(null);
    const raw = { x: clamp(node.x(), 0, MAP_SIZE), y: clamp(node.y(), 0, MAP_SIZE) };
    const p = snap ? snapToGrid(raw, map.grid, c.size) : raw;
    node.position(p);
    actions.moveToken(c.id, Math.round(p.x), Math.round(p.y));
  };

  const bounds = view
    ? { x0: -view.x / view.scale, y0: -view.y / view.scale, x1: (size.width - view.x) / view.scale, y1: (size.height - view.y) / view.scale }
    : { x0: 0, y0: 0, x1: 0, y1: 0 };

  const cursor = tool === "draw" ? "crosshair" : tool === "erase" ? "cell" : "default";

  return (
    <div ref={containerRef} className="absolute inset-0 touch-none overflow-hidden" style={{ cursor, background: colors.bg }}>
      {view && size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={tool === "select"}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) setView((v) => v && { ...v, x: e.target.x(), y: e.target.y() });
          }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <GridLayer grid={map.grid} bounds={bounds} bg={colors.bg} line={colors.grid} />

          <Layer listening={tool !== "draw"}>
            {map.lines
              .filter((l) => !erased.has(l.id))
              .map((l) => (
                <Line
                  key={l.id}
                  points={l.points}
                  stroke={l.color}
                  strokeWidth={l.width}
                  hitStrokeWidth={16}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.3}
                  draggable={editable && tool === "select"}
                  listening={editable && tool === "select"}
                  onDragEnd={(e) => {
                    const { x, y } = e.target.position();
                    e.target.position({ x: 0, y: 0 });
                    actions.updateLine(l.id, { points: l.points.map((v, i) => Math.round(v + (i % 2 ? y : x))) });
                  }}
                />
              ))}
            {draft && <Line points={draft} stroke={drawColor} strokeWidth={4} lineCap="round" lineJoin="round" tension={0.3} listening={false} />}
          </Layer>

          <Layer>
            {map.shapes.map((s) => (
              <MapShapeNode
                key={s.id}
                shape={s}
                editable={editable && tool === "select"}
                onSelect={() => selectShape(s.id)}
                onChange={(patch) => actions.updateShape(s.id, patch)}
              />
            ))}
            {editable && (
              <Transformer
                ref={trRef}
                keepRatio
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 ? oldBox : newBox)}
              />
            )}
          </Layer>

          <Layer>
            {combatants.map((c) => (
              <Token
                key={c.id}
                combatant={c}
                ring={tokenColor(c, combatants)}
                active={c.id === activeId}
                selected={c.id === pinnedId}
                hovered={c.id === hoverId}
                draggable={canMove(c)}
                onSelect={(c) => setUi({ pinnedId: c.id })}
                onHover={(c, on) => setHover(c.id, on)}
                onDragStart={(c) => setRuler({ from: { x: c.x, y: c.y }, to: { x: c.x, y: c.y } })}
                onDragMove={(_, to) => setRuler((r) => r && { ...r, to })}
                onDragEnd={onTokenDragEnd}
                onInspect={(c) => onInspect?.(c.id)}
              />
            ))}
            {ruler && (
              <Group listening={false}>
                <Line points={[ruler.from.x, ruler.from.y, ruler.to.x, ruler.to.y]} stroke="#facc15" strokeWidth={2} dash={[8, 6]} />
                <Label x={ruler.to.x + 18} y={ruler.to.y - 34}>
                  <Tag fill="rgba(0,0,0,0.75)" cornerRadius={4} />
                  <Text text={`${distanceFeet(ruler.from, ruler.to, map.grid)} ft`} fill="#facc15" padding={4} fontStyle="bold" fontSize={14} />
                </Label>
              </Group>
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
