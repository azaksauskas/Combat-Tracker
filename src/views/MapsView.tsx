import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SRD_MONSTERS } from "../content/srd";
import { newId, initials } from "../domain/combat";
import { MAP_LIMITS, MAX_STARTS, type SkirmishMap } from "../domain/skirmish-map";
import { blankMap, checkMap, difficulty, mapScenario, monsterInfo, outline, paint, resize, scenarioToMap, trialRuns, type Tool } from "../game/maps";
import { chosenParty } from "../game/party-store";
import { SCENARIOS } from "../game/scenarios";
import { startGame } from "../game/store";
import { update, useGame } from "../store/game";
import { useLibraryDraft } from "../store/useLibraryDraft";
import { ensurePlaying } from "../store/players";

/**
 * Map editor for the game: paint walls and difficult terrain, place the
 * heroes' start squares and the monsters, check the difficulty, let the AI
 * fight it out a few times, then play it.
 */
export function MapsView() {
  const maps = useGame((s) => s.library.maps);
  const [selected, setSelected] = useState<string | null>(maps[0]?.id ?? null);
  const current = maps.find((m) => m.id === selected) ?? null;

  const create = (map: SkirmishMap) => {
    update("library", (d) => {
      d.maps.push(map);
    });
    setSelected(map.id);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-3xl font-bold text-accent">Battle maps</h2>
          <p className="text-sm text-muted">Draw maps for the game: skirmishes on the Play page and fights in your adventures.</p>
        </div>
        <button className="btn btn-primary font-display" onClick={() => create(blankMap(newId()))}>
          + New map
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <nav className="space-y-4" aria-label="Map list">
          <div>
            <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Yours</h3>
            {maps.length === 0 && <p className="text-xs text-muted italic">None yet. Start a new map or copy a built-in one.</p>}
            <ul className="space-y-1">
              {maps.map((m) => (
                <li key={m.id}>
                  <button
                    className={clsx("w-full rounded-md border px-2 py-1.5 text-left text-sm", m.id === selected ? "border-accent bg-accent/10 text-strong" : "border-line bg-surface hover:border-accent")}
                    onClick={() => setSelected(m.id)}
                    aria-current={m.id === selected}
                  >
                    <div className="truncate font-semibold">{m.name}</div>
                    <div className="text-xs text-faint">
                      {m.width}×{m.height} · {m.monsters.length} monsters
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Built in</h3>
            <ul className="space-y-1">
              {SCENARIOS.map((sc) => (
                <li key={sc.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
                  <span className="truncate font-semibold">{sc.name}</span>
                  <button className="btn px-2 py-0.5 text-xs" onClick={() => create(scenarioToMap(sc, newId()))} title="Make an editable copy">
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {current ? (
          <MapEditor key={current.id} saved={current} onDeleted={() => setSelected(null)} />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-10 text-center text-muted">Pick a map on the left, or create a new one.</div>
        )}
      </div>
    </div>
  );
}

const TOOLS: { kind: Exclude<Tool["kind"], "monster">; label: string; key: string }[] = [
  { kind: "wall", label: "🧱 Wall", key: "1" },
  { kind: "difficult", label: "〃 Difficult", key: "2" },
  { kind: "start", label: "🛡 Hero start", key: "3" },
  { kind: "erase", label: "⌫ Erase", key: "5" },
];

function MapEditor({ saved, onDeleted }: { saved: SkirmishMap; onDeleted: () => void }) {
  const { draft, setDraft, edit, flush } = useLibraryDraft("maps", saved);
  const roster = useGame((s) => s.library.roster);
  const navigate = useNavigate();
  const [tool, setTool] = useState<Tool>({ kind: "wall" });
  const [monsterRef, setMonsterRef] = useState("srd:goblin-warrior");
  const [level, setLevel] = useState(1);
  const [trial, setTrial] = useState<null | { done: number; result?: ReturnType<typeof trialRuns> }>(null);

  const rosterMonsters = roster.filter((c) => c.stats);
  const monsterTool = (): Tool => {
    const [source, ref] = monsterRef.split(/:(.*)/s) as ["srd" | "roster", string];
    return { kind: "monster", source, ref };
  };

  const issues = useMemo(() => checkMap(draft, roster), [draft, roster]);
  const party = chosenParty();
  const crs = draft.monsters.map((m) => monsterInfo(m, roster)?.cr ?? null);
  const diff = difficulty(crs, party.slice(0, Math.max(1, draft.starts.length)).map(() => level));
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of draft.monsters) {
      const name = monsterInfo(m, roster)?.name ?? "Missing monster";
      c.set(name, (c.get(name) ?? 0) + 1);
    }
    return [...c];
  }, [draft.monsters, roster]);

  // Keys 1–5 pick a tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const t = TOOLS.find((x) => x.key === e.key);
      if (t) setTool({ kind: t.kind });
      if (e.key === "4") setTool(monsterTool());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const runTrials = () => {
    flush();
    const total = 20;
    let done = 0;
    const acc = { wins: 0, rounds: 0, down: 0 };
    setTrial({ done: 0 });
    // A couple of fights per tick keeps the page responsive.
    const step = () => {
      const r = trialRuns(draft, roster, party, 2, done + 1);
      acc.wins += r.winRate * r.runs;
      acc.rounds += r.avgRounds * r.runs;
      acc.down += r.avgDown * r.runs;
      done += r.runs;
      if (done < total) {
        setTrial({ done });
        setTimeout(step, 0);
      } else setTrial({ done, result: { runs: done, winRate: acc.wins / done, avgRounds: acc.rounds / done, avgDown: acc.down / done } });
    };
    setTimeout(step, 30);
  };

  const errors = issues.filter((i) => i.level === "error");

  return (
    <section className="min-w-0 space-y-3" aria-label="Map editor">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3 shadow">
        <label className="block min-w-48 flex-1">
          <span className="field-label">Name</span>
          <input className="field" value={draft.name} onChange={(e) => edit((d) => void (d.name = e.target.value))} />
        </label>
        <label className="block">
          <span className="field-label">Width</span>
          <input className="field w-20" type="number" min={MAP_LIMITS.minWidth} max={MAP_LIMITS.maxWidth} value={draft.width} onChange={(e) => setDraft(resize(draft, Number(e.target.value), draft.height))} />
        </label>
        <label className="block">
          <span className="field-label">Height</span>
          <input className="field w-20" type="number" min={MAP_LIMITS.minHeight} max={MAP_LIMITS.maxHeight} value={draft.height} onChange={(e) => setDraft(resize(draft, draft.width, Number(e.target.value)))} />
        </label>
        <button className="btn" onClick={() => setDraft(outline(draft))} title="Put a wall around the edge">
          Wall the edges
        </button>
        <label className="block w-full">
          <span className="field-label">Description (shown on the Play page)</span>
          <input className="field" value={draft.blurb} onChange={(e) => edit((d) => void (d.blurb = e.target.value))} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-2 shadow" role="toolbar" aria-label="Tools">
        {TOOLS.slice(0, 3).map((t) => (
          <ToolButton key={t.kind} active={tool.kind === t.kind} onClick={() => setTool({ kind: t.kind })} hotkey={t.key}>
            {t.label}
          </ToolButton>
        ))}
        <ToolButton active={tool.kind === "monster"} onClick={() => setTool(monsterTool())} hotkey="4">
          👹 Monster
        </ToolButton>
        <select
          className="field w-auto py-1 text-sm"
          aria-label="Monster to place"
          value={monsterRef}
          onChange={(e) => {
            setMonsterRef(e.target.value);
            const [source, ref] = e.target.value.split(/:(.*)/s) as ["srd" | "roster", string];
            setTool({ kind: "monster", source, ref });
          }}
        >
          <optgroup label="SRD monsters">
            {SRD_MONSTERS.map((e) => (
              <option key={e.key} value={`srd:${e.key}`}>
                {e.label} ({e.subtitle.split(" · ")[0]})
              </option>
            ))}
          </optgroup>
          {rosterMonsters.length > 0 && (
            <optgroup label="Your roster">
              {rosterMonsters.map((c) => (
                <option key={c.id} value={`roster:${c.id}`}>
                  {c.name}
                  {c.stats?.cr ? ` (CR ${c.stats.cr})` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <ToolButton active={tool.kind === "erase"} onClick={() => setTool({ kind: "erase" })} hotkey="5">
          ⌫ Erase
        </ToolButton>
        <span className="ml-auto text-xs text-faint">Click or drag to paint · right-click erases · keys 1–5</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_18rem]">
        <MapCanvas map={draft} roster={roster} onPaint={(cell, erase) => setDraft((m) => paint(m, cell, erase ? { kind: "erase" } : tool, newId))} />

        <aside className="space-y-3 rounded-lg border border-line bg-surface p-3 text-sm shadow" aria-label="Map summary">
          <div>
            <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Monsters</h3>
            {counts.length === 0 ? (
              <p className="text-muted italic">None placed.</p>
            ) : (
              <ul>
                {counts.map(([name, n]) => (
                  <li key={name}>
                    {n} × {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Difficulty (2024)</h3>
            <div className="flex items-center gap-2">
              <span>Party level</span>
              <select className="field w-auto py-0.5" value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Party level">
                {[1, 2, 3].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <p className={clsx("mt-1 font-bold", diff.label === "Deadly" ? "text-danger" : diff.label === "High" ? "text-warn" : "text-strong")}>{diff.label}</p>
            <p className="text-xs text-muted">
              {diff.xp} XP of monsters; for {Math.max(1, Math.min(draft.starts.length, party.length))} heroes Low ≤ {diff.budget[0]}, Moderate ≤ {diff.budget[1]}, High ≤ {diff.budget[2]}.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Checks</h3>
            {issues.length === 0 ? (
              <p className="text-heal">✓ Ready to play</p>
            ) : (
              <ul className="space-y-0.5" aria-label="Problems">
                {issues.map((i) => (
                  <li key={i.text} className={i.level === "error" ? "text-danger" : "text-warn"}>
                    {i.level === "error" ? "⚠" : "•"} {i.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Test it</h3>
            <p className="text-xs text-muted">The AI plays your current party ({party.map((p) => p.label.split(" ")[0]).join(", ")}) at level 1, 20 times.</p>
            <button className="btn w-full" disabled={errors.length > 0 || (trial !== null && !trial.result)} onClick={runTrials}>
              {trial && !trial.result ? `Fighting… ${trial.done}/20` : "Run 20 AI fights"}
            </button>
            {trial?.result && (
              <p className="text-xs" aria-label="Trial results">
                Heroes win <strong className="text-strong">{Math.round(trial.result.winRate * 100)}%</strong> · {trial.result.avgRounds.toFixed(1)} rounds · {trial.result.avgDown.toFixed(1)} heroes down on average
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <button
              className="btn btn-primary font-display"
              disabled={errors.length > 0}
              onClick={() => {
                flush();
                if (ensurePlaying()) startGame(mapScenario(draft, roster));
                navigate("/play");
              }}
            >
              ⚔ Play this map
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirm(`Delete "${draft.name}"?`)) return;
                update("library", (d) => {
                  d.maps = d.maps.filter((m) => m.id !== draft.id);
                });
                onDeleted();
              }}
            >
              Delete map
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ToolButton({ active, onClick, hotkey, children }: { active: boolean; onClick: () => void; hotkey: string; children: React.ReactNode }) {
  return (
    <button className={clsx("btn px-2 py-1 text-sm", active && "border-accent bg-accent/15 text-strong")} aria-pressed={active} onClick={onClick} title={`Shortcut: ${hotkey}`}>
      {children}
    </button>
  );
}

/** The paintable grid. Plain elements (not canvas) so every square is a real button target. */
function MapCanvas({ map, roster, onPaint }: { map: SkirmishMap; roster: Parameters<typeof monsterInfo>[1]; onPaint: (cell: { x: number; y: number }, erase: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const painting = useRef<null | { erase: boolean; last: string }>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const stop = () => (painting.current = null);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const cell = Math.max(14, Math.min(40, Math.floor(width / map.width)));
  const walls = new Set(map.walls);
  const difficult = new Set(map.difficult);
  const starts = new Map(map.starts.map((k, i) => [k, i + 1]));
  const monsters = new Map(map.monsters.map((m) => [m.cell, m]));

  const cellAt = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.floor((e.clientX - box.left) / cell), y: Math.floor((e.clientY - box.top) / cell) };
  };
  const apply = (e: React.PointerEvent) => {
    if (!painting.current) return;
    const c = cellAt(e);
    const k = `${c.x},${c.y}`;
    if (k === painting.current.last) return;
    painting.current.last = k;
    onPaint(c, painting.current.erase);
  };

  return (
    <div ref={ref} className="min-w-0 overflow-auto rounded-lg border border-line bg-surface p-2 shadow">
      <div
        role="grid"
        aria-label={`${map.name}, ${map.width} by ${map.height} squares`}
        className="relative touch-none select-none"
        style={{ width: cell * map.width, height: cell * map.height, display: "grid", gridTemplateColumns: `repeat(${map.width}, ${cell}px)`, gridAutoRows: `${cell}px` }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          painting.current = { erase: e.button === 2, last: "" };
          apply(e);
        }}
        onPointerMove={apply}
      >
        {Array.from({ length: map.height }, (_, y) =>
          Array.from({ length: map.width }, (_, x) => {
            const k = `${x},${y}`;
            const m = monsters.get(k);
            const info = m ? monsterInfo(m, roster) : null;
            const start = starts.get(k);
            return (
              <div
                key={k}
                data-cell={k}
                className={clsx(
                  "relative flex items-center justify-center border-[0.5px] border-line/40 text-[10px] font-bold",
                  walls.has(k) ? "bg-muted/70" : difficult.has(k) ? "bg-heal/20" : "bg-map-bg",
                )}
                title={info ? info.name : start ? `Hero start ${start}` : walls.has(k) ? "Wall" : difficult.has(k) ? "Difficult terrain" : undefined}
              >
                {difficult.has(k) && !m && !start && <span className="text-heal/70">〃</span>}
                {start && <span className="flex h-[80%] w-[80%] items-center justify-center rounded-full border-2 border-temp bg-token-player text-white">{start}</span>}
                {m && (
                  <span className={clsx("flex h-[80%] w-[80%] items-center justify-center rounded-full border-2 text-white", info ? "border-danger bg-token-monster" : "border-faint bg-surface-3")}>
                    {info ? initials(info.name) : "?"}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
      <p className="mt-1 text-[11px] text-faint">
        {map.starts.length}/{MAX_STARTS} hero starts · numbered in the order heroes are placed
      </p>
    </div>
  );
}
