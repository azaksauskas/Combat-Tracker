import { useMemo, useState, type ReactNode } from "react";
import { ALIGNMENTS } from "../domain/alignment";
import { newId } from "../domain/combat";
import type { Faction } from "../domain/faction";
import { BUILTIN_FACTIONS } from "../game/region";
import { SCENARIOS } from "../game/scenarios";
import { update, useGame } from "../store/game";

/**
 * The DM's factions: who threatens the players' towns, what they demand,
 * and which battles their raids and lairs are (any skirmish, map or saved
 * encounter).
 */
export function FactionsView() {
  const mine = useGame((s) => s.library.factions);
  const maps = useGame((s) => s.library.maps);
  const encounters = useGame((s) => s.library.encounters);
  const fights = useMemo(
    () => [
      ...SCENARIOS.map((s) => ({ id: s.id, name: s.name })),
      ...maps.map((m) => ({ id: `map:${m.id}`, name: `Map: ${m.name}` })),
      ...encounters.map((e) => ({ id: `encounter:${e.id}`, name: `Saved: ${e.name}` })),
    ],
    [maps, encounters],
  );

  const add = (from?: Faction) =>
    update("library", (d) => {
      d.factions.push(from ? { ...from, id: newId(), name: `${from.name} (copy)` } : { id: newId(), name: "New faction", icon: "⚑", alignment: "Neutral Evil", description: "", raid: "goblin-ambush", lair: "goblin-ambush", tribute: 20, minRenown: 1 });
    });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-3xl font-bold text-accent">Factions</h2>
          <p className="text-sm text-muted">Who notices the players' towns as they grow: they watch, demand tribute, raid, and can be broken in their lairs.</p>
        </div>
        <button className="btn btn-primary font-display" onClick={() => add()}>
          + New faction
        </button>
      </header>

      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">Yours</h3>
        {mine.length === 0 && <p className="text-sm text-muted italic">None yet. Create one, or copy a built-in faction to change it.</p>}
        <ul className="space-y-3">
          {mine.map((f, i) => (
            <FactionEditor key={f.id} faction={f} fights={fights} onChange={(next) => update("library", (d) => void (d.factions[i] = next))} onDelete={() => confirm(`Delete ${f.name}?`) && update("library", (d) => void d.factions.splice(i, 1))} />
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">Built in</h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {BUILTIN_FACTIONS.map((f) => (
            <li key={f.id} className="rounded-md border border-line bg-surface p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="text-strong">
                  {f.icon} {f.name}
                </strong>
                <button className="btn px-2 py-0.5 text-xs" onClick={() => add(f)}>
                  Copy
                </button>
              </div>
              <div className="text-xs text-muted">
                {f.alignment} · tribute {f.tribute || "none"} · notices renown {f.minRenown}+ · raid: {fights.find((x) => x.id === f.raid)?.name} · lair: {fights.find((x) => x.id === f.lair)?.name}
              </div>
              <p className="mt-1 text-xs">{f.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FactionEditor({ faction: f, fights, onChange, onDelete }: { faction: Faction; fights: { id: string; name: string }[]; onChange: (f: Faction) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(f);
  const set = (patch: Partial<Faction>) => setDraft((d) => ({ ...d, ...patch }));
  const commit = () => JSON.stringify(draft) !== JSON.stringify(f) && onChange(draft);
  const fightSelect = (value: string, key: "raid" | "lair") => (
    <select className="field py-1" value={value} onChange={(e) => onChange({ ...draft, [key]: e.target.value })} aria-label={key === "raid" ? "Raid battle" : "Lair battle"}>
      {!fights.some((x) => x.id === value) && <option value={value}>{value} (missing!)</option>}
      {fights.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  return (
    <li className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" onBlur={commit}>
      <div className="grid gap-2 sm:grid-cols-[4rem_1fr_12rem]">
        <Field label="Icon">
          <input className="field py-1 text-center" value={draft.icon} maxLength={4} onChange={(e) => set({ icon: e.target.value })} />
        </Field>
        <Field label="Name">
          <input className="field py-1" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Alignment">
          <select className="field py-1" value={draft.alignment} onChange={(e) => onChange({ ...draft, alignment: e.target.value })}>
            {ALIGNMENTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description (players see it)">
        <input className="field py-1" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Raid battle">{fightSelect(draft.raid, "raid")}</Field>
        <Field label="Lair battle">{fightSelect(draft.lair, "lair")}</Field>
        <Field label="Tribute (0: they just raid)">
          <input className="field py-1" type="number" min={0} value={draft.tribute} onChange={(e) => set({ tribute: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Field label="Notices heroes of level">
          <select className="field py-1" value={draft.minRenown} onChange={(e) => onChange({ ...draft, minRenown: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="text-right">
        <button className="btn btn-danger text-sm" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
