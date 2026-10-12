import { Rnd } from "react-rnd";
import { useUi } from "../store/ui";
import { MapSurface, MapToolbar } from "./MapPanel";

/** Floating, draggable, resizable window that hosts the battle map. */
export function MapWindow({ editable }: { editable: boolean }) {
  const { mapOpen, mapMinimized, mapRect, set } = useUi();
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
        {editable && !mapMinimized && <MapToolbar />}
        <button className="btn btn-ghost px-2" onClick={() => set({ mapMinimized: !mapMinimized })} aria-label={mapMinimized ? "Restore map" : "Minimise map"}>
          {mapMinimized ? "▢" : "_"}
        </button>
        <button className="btn btn-ghost px-2 hover:text-danger" onClick={() => set({ mapOpen: false })} aria-label="Close map">
          ✕
        </button>
      </div>
      {!mapMinimized && <MapSurface editable={editable} inspector />}
    </Rnd>
    </div>
  );
}
