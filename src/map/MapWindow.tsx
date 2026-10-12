import clsx from "clsx";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Rnd } from "react-rnd";
import { ConditionChip } from "../components/Conditions";
import { RichText } from "../components/RichText";
import { healthStatus } from "../domain/combat";
import { SHAPE_TYPES, type MapShape } from "../domain/types";
import * as actions from "../store/actions";
import { useGame } from "../store/game";
import { useUi, type MapTool } from "../store/ui";

// Konva is only downloaded the first time someone opens the map.
const BattleMap = lazy(() => import("./BattleMap").then((m) => ({ default: m.BattleMap })));

const SHAPE_ICONS: Record<MapShape["type"], string> = { square: "■", circle: "●", triangle: "▲" };

/** Floating, draggable, resizable window that hosts the battle map. */
export function MapWindow({ editable }: { editable: boolean }) {
  const { mapOpen, mapMinimized, mapRect, set } = useUi();
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);

  useEffect(() => {
    if (!editable || !selectedShape) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && !(e.target instanceof HTMLInputElement)) {
        actions.removeShape(selectedShape);
        setSelectedShape(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, selectedShape]);

  if (!mapOpen) return null;

  // A fixed, click-through layer gives Rnd a viewport-sized parent, so the
  // window stays put while the page scrolls underneath it.
  return (
    <div className="pointer-events-none fixed inset-0 z-[150]">
    <Rnd
      position={{ x: mapRect.x, y: mapRect.y }}
      size={{ width: mapRect.width, height: mapMinimized ? 48 : mapRect.height }}
      minWidth={320}
      minHeight={mapMinimized ? 48 : 280}
      enableResizing={!mapMinimized}
      bounds="parent"
      dragHandleClassName="map-drag-handle"
      onDragStop={(_, d) => set({ mapRect: { ...mapRect, x: d.x, y: d.y } })}
      onResizeStop={(_, __, el, ___, pos) =>
        set({ mapRect: { x: pos.x, y: pos.y, width: el.offsetWidth, height: el.offsetHeight } })
      }
      // react-rnd sets display: inline-block by default.
      style={{ display: "flex" }}
      className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-2">
        <div className="map-drag-handle flex h-full flex-1 cursor-move items-center gap-2 select-none" title="Drag window">
          <span className="text-muted">⠿</span>
          <span className="hidden text-sm font-bold text-accent uppercase sm:inline">Battle map</span>
        </div>
        {editable && !mapMinimized && <Toolbar selectedShape={selectedShape} onClearSelection={() => setSelectedShape(null)} />}
        <button className="btn btn-ghost px-2" onClick={() => set({ mapMinimized: !mapMinimized })} aria-label={mapMinimized ? "Restore map" : "Minimise map"}>
          {mapMinimized ? "▢" : "_"}
        </button>
        <button className="btn btn-ghost px-2 hover:text-red-500" onClick={() => set({ mapOpen: false })} aria-label="Close map">
          ✕
        </button>
      </div>
      {!mapMinimized && (
        <div className="relative flex-1">
          <Suspense fallback={<p className="p-4 text-muted">Unrolling the map…</p>}>
            <BattleMap editable={editable} selectedShapeId={selectedShape} onSelectShape={setSelectedShape} onInspect={setInspectId} />
          </Suspense>
          {inspectId && <Inspector id={inspectId} full={editable} onClose={() => setInspectId(null)} />}
          <p className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-faint">
            Scroll to zoom · drag background to pan · double-click a token for details
          </p>
        </div>
      )}
    </Rnd>
    </div>
  );
}

function ToolButton({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={clsx("rounded px-2 py-1 text-xs", active ? "bg-accent-strong text-accent-fg" : "bg-surface-3 text-muted hover:text-strong")}
    >
      {children}
    </button>
  );
}

function Toolbar({ selectedShape, onClearSelection }: { selectedShape: string | null; onClearSelection: () => void }) {
  const grid = useGame((s) => s.combat.map.grid);
  const { mapTool, drawColor, snapToGrid, mapCenter, set } = useUi();
  const setTool = (t: MapTool) => set({ mapTool: mapTool === t ? "select" : t });

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      <ToolButton active={grid === "square"} onClick={() => actions.setGrid("square")} title="Square grid">
        ▦
      </ToolButton>
      <ToolButton active={grid === "hex"} onClick={() => actions.setGrid("hex")} title="Hex grid">
        ⬡
      </ToolButton>
      <ToolButton active={snapToGrid} onClick={() => set({ snapToGrid: !snapToGrid })} title="Snap tokens to grid">
        Snap
      </ToolButton>
      <span className="mx-1 h-6 w-px bg-line" />
      <input
        type="color"
        value={drawColor}
        onChange={(e) => set({ drawColor: e.target.value })}
        className="size-6 cursor-pointer border-0 bg-transparent p-0"
        title="Colour for drawings and templates"
        aria-label="Drawing colour"
      />
      {SHAPE_TYPES.map((type) => (
        <ToolButton
          key={type}
          title={`Add ${type} template`}
          onClick={() => actions.addShape({ type, x: mapCenter.x, y: mapCenter.y, size: 3, rotation: 0, color: drawColor })}
        >
          {SHAPE_ICONS[type]}
        </ToolButton>
      ))}
      <span className="mx-1 h-6 w-px bg-line" />
      <ToolButton active={mapTool === "draw"} onClick={() => setTool("draw")} title="Draw">
        ✎
      </ToolButton>
      <ToolButton active={mapTool === "erase"} onClick={() => setTool("erase")} title="Erase lines">
        ⌫
      </ToolButton>
      {selectedShape && (
        <ToolButton
          title="Delete selected template (Del)"
          onClick={() => {
            actions.removeShape(selectedShape);
            onClearSelection();
          }}
        >
          🗑
        </ToolButton>
      )}
      <button
        className="rounded bg-danger px-2 py-1 text-[10px] text-white"
        onClick={() => confirm("Clear all drawings and templates?") && actions.clearDrawings()}
      >
        Clear
      </button>
    </div>
  );
}

function Inspector({ id, full, onClose }: { id: string; full: boolean; onClose: () => void }) {
  const c = useGame((s) => s.combat.combatants.find((x) => x.id === id));
  if (!c) return null;
  const status = healthStatus(c);

  return (
    <aside className="absolute top-2 left-2 max-h-[calc(100%-1rem)] w-[min(24rem,calc(100%-1rem))] overflow-y-auto rounded-lg border border-accent bg-surface-2/95 p-4 text-sm shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-start justify-between border-b border-line pb-1">
        <strong className="font-display text-lg text-accent">{c.name}</strong>
        <button className="text-faint hover:text-strong" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </div>
      {full || !c.isMonster ? (
        <div className={clsx("mb-2 font-bold", c.hpCurrent <= 0 ? "text-red-500" : "text-strong")}>
          HP {c.hpCurrent} / {c.hpMax}
          {c.hpTemp > 0 && <span className="text-temp"> +{c.hpTemp}</span>} · AC {c.ac} · {c.speed} ft
        </div>
      ) : (
        <div className="mb-2 font-bold capitalize text-strong">{status}</div>
      )}
      {c.conditions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {c.conditions.map((x) => (
            <ConditionChip key={x} label={x} />
          ))}
        </div>
      )}
      {full && (
        <div className="space-y-2">
          {c.actions && (
            <div>
              <strong className="block text-xs text-faint uppercase">Actions</strong>
              <RichText html={c.actions} />
            </div>
          )}
          {c.notes && (
            <div>
              <strong className="block text-xs text-faint uppercase">Notes</strong>
              <RichText html={c.notes} />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
