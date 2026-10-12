import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Combatant } from "../domain/types";
import { removeCombatant, setActive } from "../store/actions";
import { Avatar } from "./Avatar";
import { ConditionEditor } from "./Conditions";
import { HpControl } from "./HpControl";
import { RichText } from "./RichText";

interface Props {
  combatant: Combatant;
  ring: string;
  active: boolean;
  layout: "rows" | "cards";
  onEdit: () => void;
}

export function CombatantCard({ combatant: c, ring, active, layout, onEdit }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
  });
  const isRow = layout === "rows";
  const hasStats = c.attributes || c.saves;
  const hasText = c.actions || c.notes;

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "relative flex gap-4 rounded-lg p-4 transition-shadow",
        c.isMonster ? "card-monster" : "card-player",
        active && "active-turn",
        isDragging && "z-20 opacity-80",
        isRow ? "flex-col md:flex-row md:items-stretch" : "flex-col",
      )}
      aria-current={active ? "step" : undefined}
    >
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="btn btn-ghost size-9 cursor-grab touch-none p-0 active:cursor-grabbing"
          aria-label={`Reorder ${c.name}`}
          title="Drag to reorder"
        >
          ⠿
        </button>
        <button className="btn btn-ghost size-9 p-0" onClick={onEdit} aria-label={`Edit ${c.name}`} title="Edit">
          ✎
        </button>
        <button
          className="btn btn-ghost size-9 p-0 hover:text-red-500"
          onClick={() => removeCombatant(c.id)}
          aria-label={`Remove ${c.name}`}
          title="Remove from combat"
        >
          ✕
        </button>
      </div>

      <div className={clsx("flex items-center gap-4 pr-28", isRow && "md:w-60 md:shrink-0 md:pr-0")}>
        <button
          onClick={() => setActive(active ? null : c.id)}
          className="rounded-full transition-transform hover:scale-110"
          title={active ? "Clear active turn" : "Make this the active turn"}
        >
          <Avatar combatant={c} ring={ring} active={active} />
        </button>
        <div className="min-w-0">
          <h3 className="truncate text-xl leading-tight font-bold text-strong">
            {c.name}
            {c.isMonster && <span title="Monster"> ☠</span>}
          </h3>
          <dl className="mt-1 flex flex-wrap gap-x-4 text-sm">
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
          {c.group && <span className="mt-1 inline-block rounded bg-surface-3 px-1.5 text-[10px] uppercase tracking-wider text-muted">{c.group}</span>}
        </div>
      </div>

      {hasStats && (
        <div className={clsx("space-y-1 text-xs", isRow ? "md:w-44 md:shrink-0 md:self-center" : "rounded border border-line/50 bg-surface-2/40 p-2")}>
          {c.attributes && (
            <div>
              <strong className="block text-[10px] uppercase tracking-wider text-faint">Attributes</strong>
              {c.attributes}
            </div>
          )}
          {c.saves && (
            <div>
              <strong className="block text-[10px] uppercase tracking-wider text-faint">Saves</strong>
              {c.saves}
            </div>
          )}
        </div>
      )}

      <div className={clsx(isRow && "md:w-72 md:shrink-0 md:self-center")}>
        <HpControl combatant={c} />
      </div>

      <div className={clsx("flex min-w-0 flex-col gap-2", isRow && "md:flex-1 md:pt-10")}>
        {hasText && (
          <details className="group rounded border border-line/50 bg-surface-2/40" open>
            <summary className="flex cursor-pointer list-none justify-between p-2 text-xs font-bold uppercase tracking-wider text-muted">
              Actions &amp; notes <span className="transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="space-y-2 border-t border-line/50 p-2 text-sm">
              {c.actions && (
                <div>
                  <strong className="block text-[10px] uppercase text-faint">Actions</strong>
                  <RichText html={c.actions} />
                </div>
              )}
              {c.notes && (
                <div>
                  <strong className="block text-[10px] uppercase text-faint">Notes</strong>
                  <RichText html={c.notes} />
                </div>
              )}
            </div>
          </details>
        )}
        <ConditionEditor combatant={c} />
      </div>
    </article>
  );
}
