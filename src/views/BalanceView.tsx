import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TUNING_DEFAULTS, TUNING_FIELDS, type TuningField } from "../game/tuning";
import { update, useGame } from "../store/game";

/**
 * The DM's game balance page: every tunable number of the between-session
 * game, with its default. Changes are saved to the synced library and apply
 * to every player straight away.
 */
export function BalanceView() {
  const tuning = useGame((s) => s.library.tuning);
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const changed = Object.keys(tuning).filter((k) => k in TUNING_DEFAULTS && tuning[k] !== TUNING_DEFAULTS[k]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = TUNING_FIELDS.filter((f) => (!q || `${f.group} ${f.label} ${f.help ?? ""}`.toLowerCase().includes(q)) && (!onlyChanged || f.key in tuning));
    const out = new Map<string, TuningField[]>();
    for (const f of shown) out.set(f.group, [...(out.get(f.group) ?? []), f]);
    return [...out];
  }, [query, onlyChanged, tuning]);

  const set = (key: string, value: number) =>
    update("library", (d) => {
      if (value === TUNING_DEFAULTS[key]) delete d.tuning[key];
      else d.tuning[key] = value;
    });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(tuning, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "game-balance.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const valid = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in TUNING_DEFAULTS && typeof v === "number" && Number.isFinite(v))) as Record<string, number>;
      update("library", (d) => {
        d.tuning = valid;
      });
      toast.success(`Loaded ${Object.keys(valid).length} settings`);
    } catch {
      toast.error("That isn't a balance file");
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-3xl font-bold text-accent">Game balance</h2>
            <p className="text-sm text-muted">
              Fine-tune the between-session game while you play. Changes save at once and apply to every player; towns use them from their next game hour.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={exportJson}>
              Export
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = "";
              }}
            />
            <button
              className="btn btn-danger"
              disabled={changed.length === 0}
              onClick={() =>
                confirm(`Put all ${changed.length} changed settings back to their defaults?`) &&
                update("library", (d) => {
                  d.tuning = {};
                })
              }
            >
              Reset all
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input className="field w-72 py-1" placeholder="Search: farm, raid, potion…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search settings" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only changed ({changed.length})
          </label>
        </div>
      </header>

      {groups.length === 0 && <p className="text-muted italic">Nothing matches.</p>}
      {groups.map(([group, fields]) => (
        <section key={group} className="rounded-lg border border-line bg-surface p-3 shadow" aria-label={group}>
          <h3 className="mb-2 font-display text-lg font-bold text-accent">{group}</h3>
          <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {fields.map((f) => (
              <Setting key={f.key} field={f} value={tuning[f.key] ?? f.default} onChange={(v) => set(f.key, v)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Setting({ field: f, value, onChange }: { field: TuningField; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  // Follow changes made elsewhere (another tab, Reset all, Import).
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }
  const isChanged = value !== f.default;
  const commit = () => {
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n) || text.trim() === "") return setText(String(value));
    const clamped = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <li className={clsx("flex items-start gap-2 rounded-md px-1 py-0.5", isChanged && "bg-accent/10")}>
      <div className="min-w-0 flex-1 text-sm">
        <span className={clsx("block", isChanged ? "font-semibold text-strong" : "text-text")}>{f.label}</span>
        <span className="block text-xs text-faint">
          Default {f.default}
          {f.help ? ` · ${f.help}` : ""}
        </span>
      </div>
      <input
        className="field w-24 py-1 text-right tabular-nums"
        inputMode="decimal"
        aria-label={f.label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <button className="btn btn-ghost px-1.5 py-1 text-xs" disabled={!isChanged} onClick={() => onChange(f.default)} title="Back to the default" aria-label={`Reset ${f.label}`}>
        ↺
      </button>
    </li>
  );
}
