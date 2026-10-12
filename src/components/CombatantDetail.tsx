import clsx from "clsx";
import { SIZES, type Combatant } from "../domain/types";
import { removeCombatant, setActive } from "../store/actions";
import { useUi } from "../store/ui";
import { Avatar } from "./Avatar";
import { ConditionEditor } from "./Conditions";
import { HpControl } from "./HpControl";
import { RichText } from "./RichText";

interface Props {
  combatant: Combatant;
  ring: string;
  active: boolean;
  pinned: boolean;
  onEdit: () => void;
}

/** Full stat block for one combatant: follows the active turn unless pinned. */
export function CombatantDetail({ combatant: c, ring, active, pinned, onEdit }: Props) {
  const setUi = useUi((s) => s.set);
  const size = SIZES.find((s) => s.value === c.size)?.label ?? `${c.size}×`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-faint">
        {pinned ? (
          <>
            <span>📌 Pinned</span>
            <button className="font-semibold text-accent hover:underline" onClick={() => setUi({ pinnedId: null })}>
              Follow turn
            </button>
          </>
        ) : (
          <span>{active ? "⚔ Active turn" : "Not in combat yet"}</span>
        )}
      </div>

      <header className="flex items-start gap-3">
        <Avatar combatant={c} ring={ring} active={active} />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl leading-tight font-bold break-words text-strong">
            {c.name}
            {c.isMonster && <span title="Monster"> ☠</span>}
          </h3>
          <dl className="mt-1 flex flex-wrap gap-x-3 text-sm">
            {(
              [
                ["INIT", c.initiative],
                ["AC", c.ac],
                ["SPD", `${c.speed} ft`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <dt className="text-faint">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] tracking-wider text-muted uppercase">
            <span className="rounded bg-surface-3 px-1.5">{size}</span>
            {c.group && <span className="rounded bg-surface-3 px-1.5">{c.group}</span>}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button className={clsx("btn", active && "text-accent")} onClick={() => setActive(active ? null : c.id)}>
          {active ? "Clear turn" : "Give turn"}
        </button>
        <button className="btn" onClick={onEdit}>
          ✎ Edit
        </button>
        <button
          className="btn btn-ghost ml-auto hover:text-danger"
          onClick={() => confirm(`Remove ${c.name} from combat?`) && removeCombatant(c.id)}
        >
          Remove
        </button>
      </div>

      <section className="rounded-md border border-line bg-surface-2/60 p-3">
        <HpControl combatant={c} />
      </section>

      <section>
        <h4 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Conditions</h4>
        <ConditionEditor combatant={c} />
      </section>

      {(c.attributes || c.saves) && (
        <section className="space-y-1 text-sm">
          {c.attributes && (
            <div>
              <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Attributes</h4>
              {c.attributes}
            </div>
          )}
          {c.saves && (
            <div>
              <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Saves</h4>
              {c.saves}
            </div>
          )}
        </section>
      )}

      {c.actions && (
        <section className="text-sm">
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Actions</h4>
          <RichText html={c.actions} />
        </section>
      )}
      {c.notes && (
        <section className="text-sm">
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Notes</h4>
          <RichText html={c.notes} />
        </section>
      )}
    </div>
  );
}
