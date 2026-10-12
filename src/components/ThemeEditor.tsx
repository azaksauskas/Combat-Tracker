import clsx from "clsx";
import { useEffect, useState } from "react";
import { useUi } from "../store/ui";
import { PRESETS, THEME_NAMES, THEME_TOKENS, TOKEN_GROUPS, isHexColor, resolveTheme, type BaseTheme, type ThemeToken } from "../theme/themes";

/**
 * Slide-over panel to recolour the current theme. Every change is applied
 * immediately (the whole app, the map included, is the preview) and saved
 * on this device, separately for Parchment and Dungeon.
 */
export function ThemeEditor() {
  const { themeEditorOpen, theme, themeOverrides, set } = useUi();
  const overrides = themeOverrides[theme];
  const colors = resolveTheme(theme, overrides);
  const changed = Object.keys(overrides).length;

  useEffect(() => {
    if (!themeEditorOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ themeEditorOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [themeEditorOpen, set]);

  if (!themeEditorOpen) return null;

  const setColor = (token: ThemeToken, value: string | null) => {
    const next = { ...overrides };
    if (value === null || value.toLowerCase() === PRESETS[theme][token]) delete next[token];
    else next[token] = value.toLowerCase();
    set({ themeOverrides: { ...themeOverrides, [theme]: next } });
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[200] flex w-[min(22rem,100vw)] flex-col border-l border-line bg-surface shadow-2xl"
      aria-label="Customise theme"
    >
      <header className="flex items-center justify-between border-b border-line p-4">
        <div>
          <h2 className="text-xl font-bold text-accent">Customise theme</h2>
          <p className="text-xs text-faint">
            {THEME_TOKENS.length} colours · {changed ? `${changed} changed` : "all default"}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => set({ themeEditorOpen: false })} aria-label="Close theme editor">
          ✕
        </button>
      </header>

      <div className="flex gap-1 border-b border-line p-3" role="group" aria-label="Base theme">
        {(Object.keys(THEME_NAMES) as BaseTheme[]).map((t) => (
          <button
            key={t}
            onClick={() => set({ theme: t })}
            aria-pressed={theme === t}
            className={clsx("btn flex-1", theme === t ? "border-accent text-accent" : "btn-ghost")}
          >
            {THEME_NAMES[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {TOKEN_GROUPS.map((group) => (
          <section key={group.label}>
            <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">{group.label}</h3>
            <ul className="space-y-1.5">
              {group.tokens.map(([token, label]) => (
                <ColorRow
                  key={token}
                  label={label}
                  value={colors[token]}
                  isDefault={!(token in overrides)}
                  onChange={(v) => setColor(token, v)}
                  onReset={() => setColor(token, null)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="border-t border-line p-3">
        <button
          className="btn w-full"
          disabled={!changed}
          onClick={() =>
            confirm(`Reset all ${THEME_NAMES[theme]} colours to their defaults?`) &&
            set({ themeOverrides: { ...themeOverrides, [theme]: {} } })
          }
        >
          Reset {THEME_NAMES[theme]} to defaults
        </button>
      </footer>
    </aside>
  );
}

function ColorRow({
  label,
  value,
  isDefault,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  isDefault: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  // Free-typed hex is kept locally until it's a valid colour.
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <li className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0.5"
        aria-label={`${label} colour`}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (isHexColor(e.target.value)) onChange(e.target.value);
        }}
        onBlur={() => setText(value)}
        spellCheck={false}
        className={clsx("w-20 px-1.5 py-0.5 font-mono text-xs", !isHexColor(text) && "border-danger")}
        aria-label={`${label} hex value`}
      />
      <button
        className={clsx("w-5 text-faint hover:text-accent", isDefault && "invisible")}
        onClick={onReset}
        title="Reset to default"
        aria-label={`Reset ${label}`}
      >
        ↺
      </button>
    </li>
  );
}
