import clsx from "clsx";
import { produce, type Draft } from "immer";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AdventureGraph } from "./AdventureGraph";
import { connectScenes, moveNode } from "../game/adventure-graph";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ADVENTURES } from "../content/adventures";
import type { Adventure, Choice, Effect, Next, Outcome, Scene } from "../domain/adventure";
import { newId } from "../domain/combat";
import { ABILITIES, ABILITY_NAMES, DAMAGE_TYPES } from "../domain/statblock";
import { addScene, clueIndex, blankAdventure, deleteScene, duplicateAdventure, lintAdventure, parseAdventureJson, renameScene, sceneLinks, type Issue } from "../game/adventure-edit";
import { beginAdventure } from "../game/campaign-store";
import { ITEMS, MAX_LEVEL } from "../game/party";
import { SCENARIOS } from "../game/scenarios";
import { SKILLS } from "../game/skills";
import { update, useGame } from "../store/game";
import { useLibraryDraft } from "../store/useLibraryDraft";
import { ensurePlaying } from "../store/players";

/**
 * The DM's adventure editor: scenes, choices, skill checks, effects and
 * fights (built-in scenarios or your saved encounters). Adventures live in
 * the synced library and appear on the Play page; "Playtest" jumps straight in.
 */
export function AdventureEditorView() {
  const mine = useGame((s) => s.library.adventures);
  const [selected, setSelected] = useState<string | null>(mine[0]?.id ?? null);
  const current = mine.find((a) => a.id === selected) ?? null;
  const fileRef = useRef<HTMLInputElement>(null);

  const create = (adv: Adventure) => {
    update("library", (d) => {
      d.adventures.push(adv);
    });
    setSelected(adv.id);
  };

  const importFile = async (file: File) => {
    try {
      create(parseAdventureJson(await file.text(), newId()));
      toast.success(`Imported ${file.name}`);
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-3xl font-bold text-accent">Adventures</h2>
          <p className="text-sm text-muted">Write story scenes with choices, skill checks, rewards and fights. They show up on the Play page.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          <button className="btn btn-primary font-display" onClick={() => create(blankAdventure(newId()))}>
            + New adventure
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <nav className="space-y-4" aria-label="Adventure list">
          <div>
            <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Yours</h3>
            {mine.length === 0 && <p className="text-xs text-muted italic">None yet. Start a new one or copy a built-in adventure.</p>}
            <ul className="space-y-1">
              {mine.map((a) => (
                <li key={a.id}>
                  <button
                    className={clsx("w-full rounded-md border px-2 py-1.5 text-left text-sm", a.id === selected ? "border-accent bg-accent/10 text-strong" : "border-line bg-surface hover:border-accent")}
                    onClick={() => setSelected(a.id)}
                    aria-current={a.id === selected}
                  >
                    <div className="truncate font-semibold">{a.title}</div>
                    <div className="text-xs text-faint">{Object.keys(a.scenes).length} scenes</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Built in</h3>
            <ul className="space-y-1">
              {ADVENTURES.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
                  <span className="truncate font-semibold">{a.title}</span>
                  <button className="btn px-2 py-0.5 text-xs" onClick={() => create(duplicateAdventure(a, newId()))} title="Make your own copy and edit it">
                    ✎ Edit a copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {current ? (
          <Editor key={current.id} saved={current} onDeleted={() => setSelected(null)} />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-10 text-center text-muted">Pick an adventure on the left, or create a new one.</div>
        )}
      </div>
    </div>
  );
}

// --- Editor ------------------------------------------------------------------------------

function Editor({ saved, onDeleted }: { saved: Adventure; onDeleted: () => void }) {
  const { draft, setDraft, edit, flush } = useLibraryDraft("adventures", saved);
  const encounters = useGame((s) => s.library.encounters);
  const maps = useGame((s) => s.library.maps);
  const navigate = useNavigate();
  const [sceneId, setSceneId] = useState(draft.start in draft.scenes ? draft.start : (Object.keys(draft.scenes)[0] ?? null));
  const [view, setViewState] = useState<"graph" | "list">(() => {
    try {
      return localStorage.getItem("adventure-editor-view") === "list" ? "list" : "graph";
    } catch {
      return "graph";
    }
  });
  const setView = (v: "graph" | "list") => {
    setViewState(v);
    try {
      localStorage.setItem("adventure-editor-view", v);
    } catch {
      /* private mode: just don't remember */
    }
  };
  const fights = useMemo(
    () => [
      ...SCENARIOS.map((s) => ({ id: s.id, name: s.name })),
      ...maps.map((m) => ({ id: `map:${m.id}`, name: `Map: ${m.name}` })),
      ...encounters.map((e) => ({ id: `encounter:${e.id}`, name: `Saved: ${e.name}` })),
    ],
    [encounters, maps],
  );
  const issues = useMemo(() => lintAdventure(draft, fights.map((f) => f.id)), [draft, fights]);
  const scene = sceneId ? draft.scenes[sceneId] : undefined;
  const sceneIds = Object.keys(draft.scenes);

  const playtest = (from?: string) => {
    flush();
    if (ensurePlaying()) beginAdventure(from ? { ...draft, start: from } : draft);
    navigate("/play");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.title.replace(/[^\w-]+/g, "-").toLowerCase() || "adventure"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const newScene = (title?: string) => {
    const { adventure, id } = addScene(draft, title);
    setDraft(adventure);
    setSceneId(id);
    return id;
  };

  return (
    <section className="min-w-0 space-y-4" aria-label="Adventure editor">
      <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow">
        <div className="grid gap-3 md:grid-cols-[1fr_8rem_12rem]">
          <Field label="Title">
            <input className="field" value={draft.title} onChange={(e) => edit((d) => void (d.title = e.target.value))} />
          </Field>
          <Field label="Starting gold">
            <input className="field" type="number" min={0} value={draft.startingGold} onChange={(e) => edit((d) => void (d.startingGold = Number(e.target.value) || 0))} />
          </Field>
          <Field label="First scene">
            <SceneSelect value={draft.start} ids={sceneIds} scenes={draft.scenes} onChange={(v) => edit((d) => void (d.start = v))} />
          </Field>
        </div>
        <Field label="Blurb (shown on the Play page)">
          <textarea className="field" rows={2} value={draft.blurb} onChange={(e) => edit((d) => void (d.blurb = e.target.value))} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary font-display" onClick={() => playtest()} disabled={issues.some((i) => i.level === "error")} title="Start the adventure on the Play page">
            ▶ Playtest
          </button>
          <button className="btn" onClick={exportJson}>
            Export JSON
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (!confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
              update("library", (d) => {
                d.adventures = d.adventures.filter((a) => a.id !== draft.id);
              });
              onDeleted();
            }}
          >
            Delete
          </button>
          <span className="ml-auto text-xs text-faint">Changes save automatically.</span>
        </div>
        <Issues issues={issues} onPick={(id) => id && id in draft.scenes && setSceneId(id)} />
        <Clues adventure={draft} />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Scene view">
        {(
          [
            ["graph", "🕸 Graph"],
            ["list", "☰ List"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={clsx("btn text-sm", view === k && "border-accent text-accent")} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
        {view === "graph" && (
          <>
            <button className="btn text-sm" onClick={() => newScene()}>
              + Add scene
            </button>
            <span className="text-xs text-faint">Drag scenes to arrange them. Drag from a scene's right dot to another scene (or an end) to add a choice. Click a scene to edit it below.</span>
          </>
        )}
      </div>

      {view === "graph" && (
        <AdventureGraph
          adventure={draft}
          issues={issues}
          selected={sceneId}
          onSelect={setSceneId}
          onMove={(id, p) => setDraft(moveNode(draft, id, p))}
          onConnect={(from, to) => {
            setDraft(connectScenes(draft, from, to));
            setSceneId(from);
          }}
        />
      )}

      <div className={clsx("grid gap-4", view === "list" && "xl:grid-cols-[14rem_1fr]")}>
        <div className={clsx("space-y-1", view === "graph" && "hidden")} aria-label="Scenes">
          <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Scenes</h3>
          <ul className="space-y-1">
            {sceneIds.map((id) => {
              const s = draft.scenes[id]!;
              const bad = issues.some((i) => i.sceneId === id && i.level === "error");
              return (
                <li key={id}>
                  <button
                    className={clsx("w-full rounded-md border px-2 py-1 text-left text-sm", id === sceneId ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-accent")}
                    onClick={() => setSceneId(id)}
                  >
                    <div className="flex items-center gap-1 truncate font-semibold text-strong">
                      {id === draft.start && <span title="First scene">⭐</span>}
                      {bad && <span className="text-danger" title="Has problems">⚠</span>}
                      <span className="truncate">{s.title || id}</span>
                    </div>
                    <div className="truncate text-[11px] text-faint">→ {sceneLinks(s).join(", ") || "—"}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn w-full text-xs" onClick={() => newScene()}>
            + Add scene
          </button>
        </div>

        {scene ? (
          <SceneEditor
            key={scene.id}
            scene={scene}
            adventure={draft}
            fights={fights}
            edit={(recipe) => edit((d) => recipe(d.scenes[scene.id]!))}
            rename={(to) => {
              const next = renameScene(draft, scene.id, to);
              if (!next) return toast.error(`"${to}" is empty or already used`);
              setDraft(next);
              setSceneId(to.trim());
            }}
            remove={() => {
              if (!confirm(`Delete the scene "${scene.title || scene.id}"? Links to it will need fixing.`)) return;
              setDraft(deleteScene(draft, scene.id));
              setSceneId(null);
            }}
            newScene={newScene}
            goTo={setSceneId}
            playtest={() => playtest(scene.id)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-10 text-center text-muted">Pick a scene.</div>
        )}
      </div>
    </section>
  );
}

/**
 * Clues are words the party learns during the adventure ("amulet": a thief
 * told them where to find it). Later choices can appear only once a clue is
 * known, or disappear once it is.
 */
function Clues({ adventure }: { adventure: Adventure }) {
  const clues = [...clueIndex(adventure)];
  return (
    <>
      <datalist id="adventure-clues">
        {clues.map(([name]) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">
          🔑 Clues ({clues.length}) — words the party learns that open up later choices
        </summary>
        {clues.length === 0 ? (
          <p className="mt-1 text-xs text-faint">
            None yet. Add a “Learn a clue” effect to an outcome (e.g. a thief tells where the amulet is: clue “amulet”), then make a later choice “Shown only if the party knows clue: amulet”.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {clues.map(([name, use]) => (
              <li key={name}>
                <strong className="text-strong">{name}</strong>
                <span className="text-xs text-muted">
                  {" "}
                  · learned: {use.learned.join("; ") || <span className="text-warn">nowhere!</span>} · matters for: {use.needed.join("; ") || "nothing yet"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}

function Issues({ issues, onPick }: { issues: Issue[]; onPick: (sceneId?: string) => void }) {
  if (issues.length === 0) return <p className="text-sm text-heal">✓ No problems found: every link works.</p>;
  return (
    <ul className="space-y-0.5 text-sm" aria-label="Problems">
      {issues.map((i, n) => (
        <li key={n}>
          <button className={clsx("text-left hover:underline", i.level === "error" ? "text-danger" : "text-warn")} onClick={() => onPick(i.sceneId)}>
            {i.level === "error" ? "⚠" : "•"} {i.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

// --- Scenes and choices ---------------------------------------------------------------

interface Ctx {
  adventure: Adventure;
  fights: { id: string; name: string }[];
  newScene: (title?: string) => string;
  goTo: (id: string) => void;
}

function SceneEditor({
  scene,
  edit,
  rename,
  remove,
  playtest,
  ...ctx
}: Ctx & {
  scene: Scene;
  edit: (recipe: (s: Draft<Scene>) => void) => void;
  rename: (to: string) => void;
  remove: () => void;
  playtest: () => void;
}) {
  const [id, setId] = useState(scene.id);
  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-line bg-surface p-4 shadow" aria-label="Scene editor">
      <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
        <Field label="Scene title">
          <input className="field" value={scene.title} onChange={(e) => edit((s) => void (s.title = e.target.value))} />
        </Field>
        <Field label="Scene id (used in links)">
          <input className="field font-mono text-xs" value={id} onChange={(e) => setId(e.target.value)} onBlur={() => id !== scene.id && rename(id)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </Field>
      </div>
      <Field label="What the heroes see">
        <textarea className="field" rows={5} value={scene.text} onChange={(e) => edit((s) => void (s.text = e.target.value))} />
      </Field>
      <Field label="When the party first arrives">
        <EffectsEditor effects={scene.onEnter ?? []} onChange={(effects) => edit((s) => void (s.onEnter = effects.length ? effects : undefined))} />
      </Field>

      <div className="space-y-2">
        <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Choices</h4>
        {scene.choices.map((c, i) => (
          <ChoiceEditor
            key={c.id}
            choice={c}
            {...ctx}
            edit={(recipe) => edit((s) => recipe(s.choices[i]!))}
            move={(dir) =>
              edit((s) => {
                const j = i + dir;
                if (j < 0 || j >= s.choices.length) return;
                [s.choices[i], s.choices[j]] = [s.choices[j]!, s.choices[i]!];
              })
            }
            remove={() => edit((s) => void s.choices.splice(i, 1))}
          />
        ))}
        <button
          className="btn w-full text-sm"
          onClick={() => edit((s) => void s.choices.push({ id: `c${newId()}`, label: "", success: { next: { scene: scene.id } } }))}
        >
          + Add choice
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button className="btn" onClick={playtest} title="Start a playtest at this scene">
          ▶ Playtest from here
        </button>
        <button className="btn btn-danger ml-auto" onClick={remove}>
          Delete scene
        </button>
      </div>
    </div>
  );
}

function ChoiceEditor({
  choice: c,
  edit,
  move,
  remove,
  ...ctx
}: Ctx & {
  choice: Choice;
  edit: (recipe: (c: Draft<Choice>) => void) => void;
  move: (dir: -1 | 1) => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(!c.label);
  return (
    <div className="rounded-md border border-line bg-surface-2/60">
      <div className="flex cursor-pointer items-center gap-2 p-2" onClick={(e) => e.target === e.currentTarget && setOpen(!open)}>
        <button className="btn px-2 py-0.5 text-xs" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Collapse choice" : "Expand choice"}>
          {open ? "▾ Close" : "✎ Edit"}
        </button>
        <input className="field flex-1 py-1" placeholder="What the players can choose, e.g. “Search the camp”" value={c.label} onChange={(e) => edit((d) => void (d.label = e.target.value))} aria-label="Choice label" />
        <span className="hidden text-xs text-faint sm:inline">{summary(c, ctx.adventure, ctx.fights)}</span>
        <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => move(-1)} aria-label="Move up">
          ↑
        </button>
        <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => move(1)} aria-label="Move down">
          ↓
        </button>
        <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={remove} aria-label="Delete choice">
          🗑
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Shown only if the party knows clue">
              <input className="field py-1" list="adventure-clues" placeholder="e.g. amulet" value={c.requiresFlag ?? ""} onChange={(e) => edit((d) => void (d.requiresFlag = e.target.value.trim() || undefined))} />
            </Field>
            <Field label="Hidden once the party knows clue">
              <input className="field py-1" list="adventure-clues" value={c.hideIfFlag ?? ""} onChange={(e) => edit((d) => void (d.hideIfFlag = e.target.value.trim() || undefined))} />
            </Field>
            <Field label="Costs gold">
              <input className="field py-1" type="number" min={0} value={c.costGold ?? 0} onChange={(e) => edit((d) => void (d.costGold = Number(e.target.value) || undefined))} />
            </Field>
            <label className="flex items-end gap-2 pb-1.5 text-sm">
              <input type="checkbox" checked={!!c.once} onChange={(e) => edit((d) => void (d.once = e.target.checked || undefined))} /> Only once
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input
                type="checkbox"
                checked={!!c.check}
                onChange={(e) =>
                  edit((d) => {
                    d.check = e.target.checked ? { skill: "Perception", dc: 12, mode: "choose" } : undefined;
                    if (!e.target.checked) d.failure = undefined;
                  })
                }
              />
              Skill check
            </label>
            {c.check && (
              <>
                <Field label="Skill">
                  <select className="field py-1" value={c.check.skill} onChange={(e) => edit((d) => void (d.check!.skill = e.target.value))}>
                    {SKILLS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="DC">
                  <input className="field w-20 py-1" type="number" min={1} max={30} value={c.check.dc} onChange={(e) => edit((d) => void (d.check!.dc = Number(e.target.value) || 10))} />
                </Field>
                <Field label="Who rolls">
                  <select className="field py-1" value={c.check.mode} onChange={(e) => edit((d) => void (d.check!.mode = e.target.value as "choose" | "group"))}>
                    <option value="choose">One hero (players pick)</option>
                    <option value="group">Group check (half must pass)</option>
                  </select>
                </Field>
              </>
            )}
          </div>

          <OutcomeEditor title={c.check ? "On a success" : "What happens"} outcome={c.success} onChange={(o) => edit((d) => void (d.success = o))} {...ctx} />
          {c.check &&
            (c.failure ? (
              <OutcomeEditor title="On a failure" outcome={c.failure} onChange={(o) => edit((d) => void (d.failure = o))} onRemove={() => edit((d) => void (d.failure = undefined))} {...ctx} />
            ) : (
              <button className="btn text-xs" onClick={() => edit((d) => void (d.failure = { next: structuredClone(c.success.next) }))}>
                + Different outcome on a failure (otherwise the same as success)
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function summary(c: Choice, adv: Adventure, fights: { id: string; name: string }[]): string {
  const where = (n: Next) =>
    "scene" in n ? `→ ${adv.scenes[n.scene]?.title ?? n.scene}` : "fight" in n ? `⚔ ${fights.find((f) => f.id === n.fight.scenarioId)?.name ?? n.fight.scenarioId}` : n.end === "victory" ? "🏁 victory" : "☠ defeat";
  return `${c.check ? `${c.check.skill} DC ${c.check.dc} · ` : ""}${where(c.success.next)}`;
}

// --- Outcomes, effects and links ------------------------------------------------------

function OutcomeEditor({
  title,
  outcome,
  onChange,
  onRemove,
  ...ctx
}: Ctx & { title: string; outcome: Outcome; onChange: (o: Outcome) => void; onRemove?: () => void }) {
  const set = (recipe: (d: Draft<Outcome>) => void) => onChange(produce(outcome, recipe));
  return (
    <fieldset className="space-y-2 rounded-md border border-line p-2">
      <legend className="flex items-center gap-2 px-1 text-xs font-bold text-strong">
        {title}
        {onRemove && (
          <button className="text-faint hover:text-danger" onClick={onRemove} aria-label="Remove failure outcome">
            ✕
          </button>
        )}
      </legend>
      <textarea className="field" rows={2} placeholder="Narration (optional)" value={outcome.text ?? ""} onChange={(e) => set((d) => void (d.text = e.target.value || undefined))} />
      <EffectsEditor effects={outcome.effects ?? []} onChange={(effects) => set((d) => void (d.effects = effects.length ? effects : undefined))} />
      <NextEditor next={outcome.next} onChange={(n) => set((d) => void (d.next = n))} {...ctx} />
    </fieldset>
  );
}

const NEW_SCENE = "__new__";

function SceneSelect({
  value,
  ids,
  scenes,
  onChange,
  onNew,
  optional,
  label,
}: {
  value: string | undefined;
  ids: string[];
  scenes: Record<string, Scene>;
  onChange: (id: string) => void;
  onNew?: () => string;
  optional?: string;
  label?: string;
}) {
  return (
    <select
      className={clsx("field py-1", value && !(value in scenes) && "border-danger text-danger")}
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => (e.target.value === NEW_SCENE ? onChange(onNew!()) : onChange(e.target.value))}
    >
      {optional !== undefined && <option value="">{optional}</option>}
      {value && !(value in scenes) && <option value={value}>{value} (missing!)</option>}
      {ids.map((id) => (
        <option key={id} value={id}>
          {scenes[id]!.title || id}
        </option>
      ))}
      {onNew && <option value={NEW_SCENE}>+ New scene…</option>}
    </select>
  );
}

function NextEditor({ next, onChange, adventure, fights, newScene, goTo }: Ctx & { next: Next; onChange: (n: Next) => void }) {
  const kind = "scene" in next ? "scene" : "fight" in next ? "fight" : "end";
  const ids = Object.keys(adventure.scenes);
  const fallback = ids[0] ?? "";
  const switchKind = (k: string) =>
    onChange(
      k === "scene"
        ? { scene: fallback }
        : k === "fight"
          ? { fight: { scenarioId: fights[0]?.id ?? "" }, victory: fallback }
          : { end: "victory" },
    );
  const link = (id: string | undefined) =>
    id && id in adventure.scenes ? (
      <button className="text-xs text-accent hover:underline" onClick={() => goTo(id)}>
        open ↗
      </button>
    ) : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select className="field w-auto py-1" value={kind} onChange={(e) => switchKind(e.target.value)} aria-label="Then">
        <option value="scene">Then go to scene</option>
        <option value="fight">Then fight</option>
        <option value="end">Then the adventure ends</option>
      </select>
      {"scene" in next && (
        <>
          <SceneSelect label="Next scene" value={next.scene} ids={ids} scenes={adventure.scenes} onChange={(id) => onChange({ scene: id })} onNew={() => newScene()} />
          {link(next.scene)}
        </>
      )}
      {"fight" in next && (
        <>
          <select className="field w-auto py-1" aria-label="Fight" value={next.fight.scenarioId} onChange={(e) => onChange({ ...next, fight: { ...next.fight, scenarioId: e.target.value } })}>
            {!fights.some((f) => f.id === next.fight.scenarioId) && <option value={next.fight.scenarioId}>{next.fight.scenarioId} (missing!)</option>}
            {fights.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            className="field w-auto py-1"
            aria-label="Surprise"
            value={next.fight.surprised ?? ""}
            onChange={(e) => onChange({ ...next, fight: { ...next.fight, surprised: (e.target.value || undefined) as "party" | "enemy" | undefined } })}
          >
            <option value="">nobody surprised</option>
            <option value="enemy">enemies surprised</option>
            <option value="party">party surprised</option>
          </select>
          <span className="text-xs text-muted">win →</span>
          <SceneSelect label="Scene after victory" value={next.victory} ids={ids} scenes={adventure.scenes} onChange={(id) => onChange({ ...next, victory: id })} onNew={() => newScene("After the fight")} />
          {link(next.victory)}
          <span className="text-xs text-muted">lose →</span>
          <SceneSelect
            label="Scene after defeat"
            value={next.defeat}
            ids={ids}
            scenes={adventure.scenes}
            optional="the adventure ends"
            onChange={(id) => onChange({ ...next, defeat: id || undefined })}
            onNew={() => newScene("Defeated")}
          />
          {link(next.defeat)}
        </>
      )}
      {"end" in next && (
        <select className="field w-auto py-1" aria-label="Ending" value={next.end} onChange={(e) => onChange({ end: e.target.value as "victory" | "defeat" })}>
          <option value="victory">in victory</option>
          <option value="defeat">in defeat</option>
        </select>
      )}
    </div>
  );
}

const EFFECT_LABELS: Record<Effect["type"], string> = {
  xp: "XP",
  milestone: "Level up to",
  gold: "Gold",
  item: "Item",
  flag: "Learn a clue",
  damage: "Trap / damage",
  rest: "Rest",
  settler: "Settler for the town",
  deed: "Deed (reputation)",
};

const blankEffect = (type: Effect["type"]): Effect =>
  ({
    xp: { type: "xp", amount: 50 },
    milestone: { type: "milestone", level: 2 },
    gold: { type: "gold", amount: 10 },
    item: { type: "item", id: Object.keys(ITEMS)[0]! },
    flag: { type: "flag", name: "" },
    damage: { type: "damage", dice: "2d6", damageType: "piercing", save: { ability: "dex", dc: 12 } },
    rest: { type: "rest", kind: "short" },
    settler: { type: "settler", name: "", trade: "" },
    deed: { type: "deed", law: 0, good: 1 },
  })[type] as Effect;

function EffectsEditor({ effects, onChange }: { effects: Effect[]; onChange: (e: Effect[]) => void }) {
  const set = (i: number, e: Effect) => onChange(effects.map((x, j) => (j === i ? e : x)));
  return (
    <div className="space-y-1">
      {effects.map((e, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded bg-surface px-2 py-1 text-sm">
          <span className="w-24 text-xs font-semibold text-strong">{EFFECT_LABELS[e.type]}</span>
          <EffectFields effect={e} onChange={(x) => set(i, x)} />
          <button className="ml-auto text-faint hover:text-danger" onClick={() => onChange(effects.filter((_, j) => j !== i))} aria-label="Remove effect">
            ✕
          </button>
        </div>
      ))}
      <select className="field w-auto py-0.5 text-xs" value="" aria-label="Add effect" onChange={(e) => e.target.value && onChange([...effects, blankEffect(e.target.value as Effect["type"])])}>
        <option value="">+ Add effect…</option>
        {(Object.keys(EFFECT_LABELS) as Effect["type"][]).map((t) => (
          <option key={t} value={t}>
            {EFFECT_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

function EffectFields({ effect: e, onChange }: { effect: Effect; onChange: (e: Effect) => void }) {
  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);
  switch (e.type) {
    case "xp":
    case "gold":
      return <input className="field w-24 py-0.5" type="number" min={0} value={e.amount} aria-label={EFFECT_LABELS[e.type]} onChange={(x) => onChange({ ...e, amount: num(x.target.value) })} />;
    case "milestone":
      return (
        <select className="field w-auto py-0.5" value={e.level} aria-label="Level" onChange={(x) => onChange({ ...e, level: Number(x.target.value) })}>
          {Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>
              level {n}
            </option>
          ))}
        </select>
      );
    case "item":
      return (
        <>
          <select className="field w-auto py-0.5" value={e.id} aria-label="Item" onChange={(x) => onChange({ ...e, id: x.target.value })}>
            {Object.entries(ITEMS).map(([id, it]) => (
              <option key={id} value={id}>
                {it.name}
              </option>
            ))}
          </select>
          <input className="field w-16 py-0.5" type="number" min={1} value={e.count ?? 1} aria-label="Count" onChange={(x) => onChange({ ...e, count: num(x.target.value, 1) === 1 ? undefined : num(x.target.value, 1) })} />
        </>
      );
    case "flag":
      return <input className="field w-40 py-0.5" list="adventure-clues" placeholder="e.g. amulet" value={e.name} aria-label="Clue" onChange={(x) => onChange({ ...e, name: x.target.value.trim() })} />;
    case "deed":
      return (
        <>
          <select className="field w-auto py-0.5" value={e.law} aria-label="Law" onChange={(x) => onChange({ ...e, law: Number(x.target.value) })}>
            {[-2, -1, 0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n > 0 ? `lawful +${n}` : n < 0 ? `chaotic ${-n}` : "law: —"}
              </option>
            ))}
          </select>
          <select className="field w-auto py-0.5" value={e.good} aria-label="Good" onChange={(x) => onChange({ ...e, good: Number(x.target.value) })}>
            {[-2, -1, 0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n > 0 ? `good +${n}` : n < 0 ? `evil ${-n}` : "good: —"}
              </option>
            ))}
          </select>
        </>
      );
    case "settler":
      return (
        <>
          <input className="field w-32 py-0.5" placeholder="Name" value={e.name} aria-label="Settler's name" onChange={(x) => onChange({ ...e, name: x.target.value })} />
          <input className="field w-32 py-0.5" placeholder="Trade, e.g. blacksmith" value={e.trade ?? ""} aria-label="Settler's trade" onChange={(x) => onChange({ ...e, trade: x.target.value || undefined })} />
        </>
      );
    case "rest":
      return (
        <select className="field w-auto py-0.5" value={e.kind} aria-label="Rest" onChange={(x) => onChange({ ...e, kind: x.target.value as "short" | "long" })}>
          <option value="short">short rest</option>
          <option value="long">long rest</option>
        </select>
      );
    case "damage":
      return (
        <>
          <input className="field w-20 py-0.5" value={e.dice} aria-label="Damage dice" onChange={(x) => onChange({ ...e, dice: x.target.value })} />
          <select className="field w-auto py-0.5" value={e.damageType} aria-label="Damage type" onChange={(x) => onChange({ ...e, damageType: x.target.value })}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            className="field w-auto py-0.5"
            value={e.save?.ability ?? ""}
            aria-label="Saving throw"
            onChange={(x) => onChange({ ...e, save: x.target.value ? { ability: x.target.value as (typeof ABILITIES)[number], dc: e.save?.dc ?? 12 } : undefined })}
          >
            <option value="">no save</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {ABILITY_NAMES[a]} save halves
              </option>
            ))}
          </select>
          {e.save && <input className="field w-16 py-0.5" type="number" value={e.save.dc} aria-label="Save DC" onChange={(x) => onChange({ ...e, save: { ...e.save!, dc: num(x.target.value, 1) } })} />}
        </>
      );
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
