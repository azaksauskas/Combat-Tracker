/**
 * Single source of truth for theme colours. CSS reads them as variables
 * (applied by `applyTheme`), and the canvas map reads them from here
 * directly, so both always change in the same frame.
 */

export type BaseTheme = "light" | "dark";

export const TOKEN_GROUPS = [
  {
    label: "Page",
    tokens: [
      ["bg", "Background"],
      ["surface", "Panels"],
      ["surface-2", "Inputs & insets"],
      ["surface-3", "Buttons & raised"],
      ["line", "Borders"],
    ],
  },
  {
    label: "Text",
    tokens: [
      ["text", "Body text"],
      ["text-strong", "Headings & names"],
      ["muted", "Secondary text"],
      ["faint", "Labels & hints"],
    ],
  },
  {
    label: "Accent",
    tokens: [
      ["accent", "Accent & active turn"],
      ["accent-strong", "Primary buttons"],
      ["accent-fg", "Text on primary buttons"],
    ],
  },
  {
    label: "Health & status",
    tokens: [
      ["heal", "Healthy / heal"],
      ["warn", "Bloodied"],
      ["danger", "Damage, down & conditions"],
      ["temp", "Temporary HP"],
    ],
  },
  {
    label: "Combatants",
    tokens: [
      ["card-player", "Player card"],
      ["card-monster", "Monster card"],
      ["monster-line", "Monster card border"],
      ["token-player", "Player token"],
      ["token-monster", "Monster token"],
    ],
  },
  {
    label: "Map",
    tokens: [
      ["map-bg", "Map background"],
      ["grid-line", "Grid lines"],
      ["highlight", "Selection & ruler"],
    ],
  },
] as const;

export type ThemeToken = (typeof TOKEN_GROUPS)[number]["tokens"][number][0];
export type ThemeColors = Record<ThemeToken, string>;
export type ThemeOverrides = Partial<ThemeColors>;

export const THEME_TOKENS = TOKEN_GROUPS.flatMap((g) => g.tokens.map(([t]) => t)) as ThemeToken[];

export const PRESETS: Record<BaseTheme, ThemeColors> = {
  dark: {
    bg: "#0f0f13",
    surface: "#1e1e24",
    "surface-2": "#16161a",
    "surface-3": "#2a2a32",
    line: "#3f3f46",
    text: "#e4e4e7",
    "text-strong": "#ffffff",
    muted: "#a1a1aa",
    faint: "#71717a",
    accent: "#ef4444",
    "accent-strong": "#dc2626",
    "accent-fg": "#ffffff",
    heal: "#16a34a",
    warn: "#f59e0b",
    danger: "#b91c1c",
    temp: "#60a5fa",
    "card-player": "#222226",
    "card-monster": "#3a1515",
    "monster-line": "#7f1d1d",
    "token-player": "#1e3a8a",
    "token-monster": "#7f1d1d",
    "map-bg": "#16161a",
    "grid-line": "#ffffff",
    highlight: "#facc15",
  },
  light: {
    bg: "#f4ebd8",
    surface: "#eee2cd",
    "surface-2": "#e5d6bc",
    "surface-3": "#dcc8a8",
    line: "#cbb38e",
    text: "#382410",
    "text-strong": "#261605",
    muted: "#5c4325",
    faint: "#8c7355",
    accent: "#7a2e1f",
    "accent-strong": "#5c2216",
    "accent-fg": "#fff8ee",
    heal: "#2f6b2f",
    warn: "#b7791f",
    danger: "#8b1a1a",
    temp: "#1d4ed8",
    "card-player": "#fbf7f0",
    "card-monster": "#ecd6ca",
    "monster-line": "#a55a5a",
    "token-player": "#1e3a8a",
    "token-monster": "#7f1d1d",
    "map-bg": "#efe4cf",
    "grid-line": "#000000",
    highlight: "#d97706",
  },
};

export const THEME_NAMES: Record<BaseTheme, string> = { light: "Parchment", dark: "Dungeon" };

export function resolveTheme(base: BaseTheme, overrides: ThemeOverrides = {}): ThemeColors {
  return { ...PRESETS[base], ...overrides };
}

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: string) => HEX.test(v);

/** "#rrggbb" + alpha → "rgba(...)" (the canvas can't use color-mix). */
export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Grid lines are drawn at a fixed opacity so any picked colour stays subtle. */
export const GRID_ALPHA = 0.15;

/** Writes the theme as CSS variables on <html>, plus the values derived from it. */
export function applyTheme(base: BaseTheme, colors: ThemeColors, root = document.documentElement) {
  for (const t of THEME_TOKENS) root.style.setProperty(`--${t}`, colors[t]);
  const shade = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, black)`;
  root.style.setProperty("--glow", withAlpha(colors.accent, base === "dark" ? 0.4 : 0.3));
  root.style.setProperty("--card-player-bg", `linear-gradient(145deg, ${colors["card-player"]} 0%, ${shade(colors["card-player"], base === "dark" ? 75 : 95)} 100%)`);
  root.style.setProperty("--card-monster-bg", `linear-gradient(145deg, ${colors["card-monster"]} 0%, ${shade(colors["card-monster"], base === "dark" ? 55 : 92)} 100%)`);
  root.style.setProperty("--grid-line-a", withAlpha(colors["grid-line"], GRID_ALPHA));
  root.style.setProperty("--shadow", base === "dark" ? "0 10px 25px rgb(0 0 0 / 0.45)" : "0 8px 20px rgb(0 0 0 / 0.1)");
  root.style.colorScheme = base;
  root.dataset.theme = base;
}
