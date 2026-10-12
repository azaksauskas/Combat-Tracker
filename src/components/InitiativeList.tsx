import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { tokenColor } from "../domain/combat";
import type { Combatant } from "../domain/types";
import * as actions from "../store/actions";
import { setHover, useUi } from "../store/ui";
import { Avatar } from "./Avatar";
import { HpBar } from "./HpBar";

interface Props {
  combatants: Combatant[];
  activeId: string | null;
  /** Combatant currently shown in the details panel. */
  shownId: string | null;
  onSelect: (id: string) => void;
}

/** Compact initiative order: one short row per combatant. */
export function InitiativeList({ combatants, activeId, shownId, onSelect }: Props) {
  const sensors = useSensors(
    // A small distance keeps plain clicks on a row from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) actions.moveCombatant(String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={combatants.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-1" aria-label="Initiative order">
          {combatants.map((c) => (
            <Row
              key={c.id}
              combatant={c}
              ring={tokenColor(c, combatants)}
              active={c.id === activeId}
              shown={c.id === shownId}
              onSelect={() => onSelect(c.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Row({ combatant: c, ring, active, shown, onSelect }: { combatant: Combatant; ring: string; active: boolean; shown: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const hovered = useUi((s) => s.hoverId === c.id);
  const down = c.hpCurrent <= 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "group relative flex items-center gap-2 rounded-md border py-1.5 pr-2 pl-1 transition-colors",
        active ? "border-accent bg-accent/10" : "border-transparent",
        shown && !active && "border-line bg-surface-3/60",
        hovered && !active && !shown && "border-line bg-surface-3/50",
        isDragging && "z-20 bg-surface shadow-lg",
        down && "opacity-55",
      )}
      onMouseEnter={() => setHover(c.id, true)}
      onMouseLeave={() => setHover(c.id, false)}
      aria-current={active ? "step" : undefined}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none px-0.5 text-faint opacity-40 group-hover:opacity-100 active:cursor-grabbing"
        aria-label={`Reorder ${c.name}`}
      >
        ⠿
      </button>
      <span className={clsx("w-6 text-right text-sm font-bold tabular-nums", active ? "text-accent" : "text-muted")} title="Initiative">
        {c.initiative}
      </span>
      {/* The whole row body is one button that shows this combatant in the details panel. */}
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onSelect} aria-pressed={shown}>
        <Avatar combatant={c} size="xs" ring={ring} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className={clsx("truncate text-sm font-semibold text-strong", down && "line-through")}>{c.name}</span>
            {c.isMonster && <span className="text-xs text-faint" title="Monster">☠</span>}
          </span>
          <HpBar combatant={c} className="mt-1" />
          {c.conditions.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-0.5">
              {c.conditions.slice(0, 3).map((x) => (
                <span key={x} title={x} className="rounded bg-danger px-1 text-[10px] leading-4 text-white">
                  {x.slice(0, 4)}
                </span>
              ))}
              {c.conditions.length > 3 && <span className="text-[10px] text-faint" title={c.conditions.slice(3).join(", ")}>+{c.conditions.length - 3}</span>}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right text-xs leading-tight tabular-nums">
          <span className={clsx("block font-bold", down ? "text-danger" : "text-strong")}>
            {c.hpCurrent}
            {c.hpTemp > 0 && <span className="text-temp">+{c.hpTemp}</span>}
          </span>
          <span className="text-faint" title="Armour class">AC {c.ac}</span>
        </span>
      </button>
    </li>
  );
}
