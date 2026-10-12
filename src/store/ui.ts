import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CELL, MAP_SIZE } from "../domain/grid";

/**
 * Per-device preferences. Unlike the original app these are NOT synced, so
 * the DM switching to card view no longer flips every player's screen.
 */
export type MapTool = "select" | "draw" | "erase";

interface UiState {
  theme: "light" | "dark";
  viewMode: "rows" | "cards";
  showCreate: boolean;
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

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      viewMode: "rows",
      showCreate: true,
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
      partialize: ({ set: _set, mapTool: _tool, ...rest }) => rest,
    },
  ),
);
