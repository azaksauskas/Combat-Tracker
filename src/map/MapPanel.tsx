import clsx from "clsx";
import { lazy, Suspense, useState, type ReactNode } from "react";
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

/**
 * The map canvas plus its overlays. Used both docked in the battle order
 * page and inside the floating window.
 */
export function MapSurface({ editable, inspector }: { editable: boolean; inspector: boolean }) {
  const [inspectId, setInspectId] = useState<string | null>(null);
  return (
    <div className="relative min-h-0 flex-1">
      <Suspense fallback={<p className="p-4 text-muted">Unrolling the map…</p>}>
        <BattleMap
          editable={editable}
          onInspect={inspector ? setInspectId : undefined}
          onBackgroundClick={() => setInspectId(null)}
        />
      </Suspense>
      {inspectId && <Inspector id={inspectId} full={editable} onClose={() => setInspectId(null)} />}
      <p className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-faint">
        Scroll to zoom · drag background to pan · {inspector ? "double-click a token for details" : "click a token to select it"}
      </p>
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

export function MapToolbar() {
  const grid = useGame((s) => s.combat.map.grid);
  const { mapTool, drawColor, snapToGrid, mapCenter, selectedShapeId, set } = useUi();
  const setTool = (t: MapTool) => set({ mapTool: mapTool === t ? "select" : t });

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
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
      {selectedShapeId && (
        <ToolButton
          title="Delete selected template (Del)"
          onClick={() => {
            actions.removeShape(selectedShapeId);
            set({ selectedShapeId: null });
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
        <div className={clsx("mb-2 font-bold", c.hpCurrent <= 0 ? "text-danger" : "text-strong")}>
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
