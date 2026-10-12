import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CELL, MAP_SIZE } from "../domain/grid";

/**
 * Per-device preferences. Unlike the original app these are NOT synced, so
 * the DM changing their layout no longer flips every player's screen.
 */
export type MapTool = "select" | "draw" | "erase";
export type CombatTab = "order" | "map" | "details";

interface UiState {
  theme: "light" | "dark";
  /** Battle order page: show the map docked between the list and details. */
  dockMap: boolean;
  /** Battle order page on narrow screens: which pane is showing. */
  combatTab: CombatTab;
  /** Combatant pinned in the details panel; null = follow the active turn. */
  pinnedId: string | null;
  /** Combatant hovered in the list or on the map, highlighted in both. */
  hoverId: string | null;
  /** Area template with rotate/scale handles showing. */
  selectedShapeId: string | null;
  mapOpen: boolean;
  mapMinimized: boolean;
  mapRect: { x: number; y: number; width: number; height: number };
  mapTool: MapTool;
  drawColor: string;
  snapToGrid: boolean;
  /** World coordinate at the centre of the map viewport; new tokens spawn here. */
  mapCenter: { x: number; y: number };
  set: (patch: Partial<Omit<UiState, "set">>) => void;
}

/** Hover in from the list or the map; only clears if it's still the hovered one. */
export function setHover(id: string, on: boolean) {
  const { hoverId, set } = useUi.getState();
  if (on) set({ hoverId: id });
  else if (hoverId === id) set({ hoverId: null });
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      dockMap: true,
      combatTab: "order",
      pinnedId: null,
      hoverId: null,
      selectedShapeId: null,
      mapOpen: false,
      mapMinimized: false,
      mapRect: { x: 80, y: 80, width: 820, height: 600 },
      mapTool: "select",
      drawColor: "#ef4444",
      snapToGrid: true,
      mapCenter: { x: Math.round(MAP_SIZE / 3 / CELL) * CELL, y: Math.round(MAP_SIZE / 3 / CELL) * CELL },
      set: (patch) => set(patch),
    }),
    {
      name: "combat-tracker:ui",
      storage: createJSONStorage(() => localStorage),
      // Transient selection state isn't worth restoring after a reload.
      partialize: ({ set: _set, mapTool: _tool, pinnedId: _pin, hoverId: _hover, combatTab: _tab, selectedShapeId: _shape, ...rest }) => rest,
    },
  ),
);
