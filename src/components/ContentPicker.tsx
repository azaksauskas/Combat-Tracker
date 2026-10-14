import { toast } from "sonner";
import { PARTY, SRD_MONSTERS, type ContentEntry } from "../content/srd";
import { characterEntry } from "../game/builder";
import * as actions from "../store/actions";
import { useGame } from "../store/game";
import { usePlayers } from "../store/players";

/** Built-in SRD monsters and the ready-made party, one click to add. */
export function ContentPicker() {
  const characters = useGame((s) => s.library.characters);
  const profiles = usePlayers((s) => s.profiles);
  const docs = usePlayers((s) => s.docs);
  const add = (e: ContentEntry) => {
    const added = actions.addToCombat(e.build(), { rollInitiative: true });
    if (added) toast.success(`${added.name} joins the fight (init ${added.initiative})`);
  };
  const toRoster = (e: ContentEntry) => {
    actions.addToRoster(e.build());
    toast.success(`${e.label} saved to the roster`);
  };

  const section = (title: string, entries: ContentEntry[], extra?: React.ReactNode) => (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold tracking-wider text-faint uppercase">{title}</h4>
        {extra}
      </div>
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li key={e.key} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-strong">{e.label}</div>
              <div className="text-xs text-faint">{e.subtitle}</div>
            </div>
            <button className="btn btn-ghost px-2 text-xs" onClick={() => toRoster(e)} title="Save to roster">
              Roster
            </button>
            <button className="btn btn-primary px-2 text-xs" onClick={() => add(e)}>
              + Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-5 text-sm">
      {section(
        "Party (level 1)",
        PARTY,
        <button className="btn px-2 text-xs" onClick={() => PARTY.forEach(add)}>
          + Add whole party
        </button>,
      )}
      {characters.length > 0 && section("Shared characters", characters.map(characterEntry))}
      {profiles.map((p) => {
        const mine = docs[p.id]?.characters ?? [];
        return mine.length > 0 ? <div key={p.id}>{section(`${p.name}'s characters`, mine.map(characterEntry))}</div> : null;
      })}
      {section("Monsters (SRD 5.2)", SRD_MONSTERS)}
      <p className="text-xs text-faint">
        Rolls initiative (d20 + Dex) on add. Stat blocks give one-click attacks in the details panel. Monster content from the SRD 5.2 (CC-BY-4.0).
      </p>
    </div>
  );
}
