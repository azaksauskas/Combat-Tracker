import clsx from "clsx";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "../components/Avatar";
import { EditCombatantDialog, type EditTarget } from "../components/EditCombatantDialog";
import { toDraft } from "../components/CombatantForm";
import type { Encounter } from "../domain/types";
import * as actions from "../store/actions";
import { useGame } from "../store/game";

export function EncountersView() {
  const { roster, encounters } = useGame((s) => s.library);
  const combatantCount = useGame((s) => s.combat.combatants.length);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [name, setName] = useState("");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10">
      <section>
        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-line pb-2 sm:flex-row sm:items-end">
          <h2 className="text-2xl font-bold text-accent">Saved encounters</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              actions.saveEncounter(name.trim());
              toast.success(`Saved "${name.trim()}"`);
              setName("");
            }}
          >
            <input className="field" placeholder="Encounter name" aria-label="Encounter name" value={name} required onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary shrink-0" disabled={combatantCount === 0} title={combatantCount === 0 ? "Add combatants to the tracker first" : undefined}>
              Save current fight
            </button>
          </form>
        </div>
        {encounters.length === 0 ? (
          <p className="text-muted italic">No encounters saved.</p>
        ) : (
          <div className="space-y-4">
            {encounters.map((e) => (
              <EncounterCard key={e.id} encounter={e} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 border-b border-line pb-2 text-2xl font-bold text-accent">Roster</h2>
        {roster.length === 0 ? (
          <p className="text-muted italic">No saved stat blocks. Use “Save to roster” when creating a combatant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2 p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar combatant={c} size="sm" />
                  <div>
                    <div className="font-bold text-strong">
                      {c.name}
                      {c.isMonster && " ☠"}
                    </div>
                    <div className="text-sm text-faint">
                      AC {c.ac} · HP {c.hpMax} · {c.speed} ft
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setEditing({ id: c.id, source: "roster" })}>
                    ✎ Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const added = actions.addToCombat(toDraft(c), { rollIfMonster: true });
                      if (added) toast.success(`${added.name} added to combat (init ${added.initiative})`);
                    }}
                  >
                    Add to combat
                  </button>
                  <button
                    className="btn btn-danger"
                    aria-label={`Delete ${c.name} from roster`}
                    onClick={() => confirm(`Remove ${c.name} from the roster?`) && actions.removeFromRoster(c.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EditCombatantDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EncounterCard({ encounter: e }: { encounter: Encounter }) {
  const roster = useGame((s) => s.library.roster);
  const [pick, setPick] = useState("");
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <article className="rounded-lg border border-line bg-surface shadow">
      <div className="flex items-center justify-between gap-2 p-4">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        >
          <span className={clsx("text-faint transition-transform", open && "rotate-90")} aria-hidden>
            ▶
          </span>
          <h3 className="truncate text-lg font-bold text-accent">{e.name}</h3>
          <span className="shrink-0 text-sm text-faint">({e.combatants.length})</span>
        </button>
        <div className="flex shrink-0 gap-2">
          <button
            className="btn btn-primary"
            onClick={() => confirm("Replace the current tracker with this encounter?") && actions.loadEncounter(e.id)}
          >
            Load
          </button>
          <button
            className="btn btn-danger"
            aria-label={`Delete encounter ${e.name}`}
            onClick={() => confirm(`Delete encounter "${e.name}"?`) && actions.deleteEncounter(e.id)}
          >
            ✕
          </button>
        </div>
      </div>
      {open && (
        <div id={bodyId} className="border-t border-line p-4">
          {e.combatants.length === 0 ? (
            <p className="text-sm text-muted italic">No combatants yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {e.combatants.map((c) => (
                <div key={c.id} className="group relative rounded border border-line bg-surface-2 p-2 text-xs">
                  <strong className="text-strong">
                    {c.name}
                    {c.isMonster && " ☠"}
                  </strong>
                  <div className="text-faint">
                    HP {c.hpCurrent}/{c.hpMax} · AC {c.ac}
                  </div>
                  <button
                    className="absolute top-1 right-1 text-faint opacity-0 group-hover:opacity-100 hover:text-red-500 focus:opacity-100"
                    aria-label={`Remove ${c.name} from encounter`}
                    onClick={() => actions.removeFromEncounter(e.id, c.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {roster.length > 0 && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                actions.addRosterEntryToEncounter(e.id, pick);
                setPick("");
              }}
            >
              <select className="field max-w-xs" value={pick} aria-label="Roster entry to add" onChange={(ev) => setPick(ev.target.value)}>
                <option value="">Add from roster…</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isMonster && " ☠"}
                  </option>
                ))}
              </select>
              <button className="btn" disabled={!pick}>
                + Add
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
