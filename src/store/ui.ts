import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useMemo } from "react";
import { CELL, MAP_SIZE } from "../domain/grid";
import { applyTheme, resolveTheme, type BaseTheme, type ThemeOverrides } from "../theme/themes";

/**
 * Per-device preferences. Unlike the original app these are NOT synced, so
 * the DM changing their layout no longer flips every player's screen.
 */
export type MapTool = "select" | "draw" | "erase";
export type CombatTab = "order" | "map" | "details";

interface UiState {
  theme: BaseTheme;
  /** The user's colour picks, kept separately for each base theme. */
  themeOverrides: Record<BaseTheme, ThemeOverrides>;
  themeEditorOpen: boolean;
  diceOpen: boolean;
  /** New rolls are shown on the player screen. */
  rollShown: boolean;
  /** DM sidebar shown (desktop) / menu expanded (mobile). */
  sidebarOpen: boolean;
  /** Battle order page: show the map docked between the list and details. */
  dockMap: boolean;
  /** The game's battle board: drawn at an angle (isometric) or from straight above. */
  boardView: "iso" | "flat";
  /** The board from above: zoom over the size that fits the whole map (drag to look around). */
  boardZoom: number;
  /** Exploring: the rest of the party walks along behind the hero you move. */
  partyFollows: boolean;
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
      themeOverrides: { light: {}, dark: {} },
      themeEditorOpen: false,
      diceOpen: false,
      rollShown: false,
      sidebarOpen: true,
      dockMap: true,
      boardView: "flat",
      boardZoom: 1.6,
      partyFollows: true,
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
      partialize: ({ set: _set, mapTool: _tool, pinnedId: _pin, hoverId: _hover, combatTab: _tab, selectedShapeId: _shape, themeEditorOpen: _editor, diceOpen: _dice, ...rest }) => rest,
    },
  ),
);

/** Resolved colours of the current theme, for code that can't use CSS (the map canvas). */
export function useThemeColors() {
  const theme = useUi((s) => s.theme);
  const overrides = useUi((s) => s.themeOverrides[s.theme]);
  return useMemo(() => resolveTheme(theme, overrides), [theme, overrides]);
}

/**
 * Keeps the page's CSS variables in step with the store. The subscription
 * runs synchronously inside `set`, before React re-renders, so CSS and the
 * canvas always switch together.
 */
export function syncThemeToDocument() {
  const apply = ({ theme, themeOverrides }: UiState) => applyTheme(theme, resolveTheme(theme, themeOverrides[theme]));
  apply(useUi.getState());
  return useUi.subscribe((state, prev) => {
    if (state.theme !== prev.theme || state.themeOverrides !== prev.themeOverrides) apply(state);
  });
}
