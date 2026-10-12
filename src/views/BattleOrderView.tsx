import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, rectSortingStrategy } from "@dnd-kit/sortable";
import clsx from "clsx";
import { useState } from "react";
import { toast } from "sonner";
import { CombatantCard } from "../components/CombatantCard";
import { CombatantForm } from "../components/CombatantForm";
import { EditCombatantDialog, type EditTarget } from "../components/EditCombatantDialog";
import { tokenColor } from "../domain/combat";
import * as actions from "../store/actions";
import { useGame } from "../store/game";
import { useUi } from "../store/ui";

export function BattleOrderView() {
  const { combatants, activeId, round } = useGame((s) => s.combat);
  const { viewMode, showCreate, set } = useUi();
  const [editing, setEditing] = useState<EditTarget>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) actions.moveCombatant(String(active.id), String(over.id));
  };

  const inCombat = activeId !== null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col justify-between gap-3 border-b border-line pb-3 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-bold text-accent">Order of Battle</h2>
          <p className="text-sm text-muted">{inCombat ? `Round ${round}` : "Combat not started"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={clsx("btn", showCreate ? "text-accent" : "btn-ghost")} onClick={() => set({ showCreate: !showCreate })}>
            + Create
          </button>
          <button className="btn btn-ghost" onClick={actions.sortInitiative} title="Sort by initiative">
            Sort init
          </button>
          <div className="flex rounded-md border border-line bg-surface-2 p-0.5 text-sm" role="group" aria-label="Layout">
            {(["rows", "cards"] as const).map((m) => (
              <button
                key={m}
                onClick={() => set({ viewMode: m })}
                aria-pressed={viewMode === m}
                className={clsx("rounded px-3 py-1 capitalize", viewMode === m ? "bg-surface-3 text-strong" : "text-muted")}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="sticky top-16 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/90 p-2 shadow backdrop-blur md:top-2">
        {inCombat ? (
          <>
            <button className="btn" onClick={actions.previousTurn} aria-label="Previous turn">
              ◀ Prev
            </button>
            <button className="btn btn-primary font-display" onClick={actions.nextTurn}>
              Next turn ▶
            </button>
            <span className="px-2 text-sm text-muted">
              Round <strong className="text-strong">{round}</strong> ·{" "}
              {combatants.find((c) => c.id === activeId)?.name ?? "—"}
            </span>
            <button className="btn btn-ghost ml-auto" onClick={actions.endCombat}>
              End combat
            </button>
          </>
        ) : (
          <button className="btn btn-primary font-display" onClick={actions.nextTurn} disabled={combatants.length === 0}>
            ⚔ Start combat
          </button>
        )}
        {!inCombat && combatants.length > 0 && (
          <button
            className="btn btn-ghost ml-auto"
            onClick={() => confirm("Remove every combatant from the tracker?") && actions.clearCombat()}
          >
            Clear tracker
          </button>
        )}
      </div>

      {showCreate && (
        <section className="rounded-lg border border-line bg-surface p-5 shadow-xl">
          <h3 className="mb-4 border-b border-line pb-2 text-xl font-bold text-accent">Create combatant</h3>
          <CombatantForm
            mode="create"
            onSubmit={(draft, intent, initiativeBlank) => {
              if (intent === "roster") {
                actions.addToRoster(draft);
                toast.success(`${draft.name} saved to the roster`);
              } else {
                const added = actions.addToCombat(draft, { rollIfMonster: initiativeBlank });
                if (added) toast.success(`${added.name} joins the fight (init ${added.initiative})`);
              }
            }}
          />
        </section>
      )}

      {combatants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line py-10 text-center text-muted italic">
          The battle has not yet begun…
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={combatants.map((c) => c.id)} strategy={viewMode === "rows" ? verticalListSortingStrategy : rectSortingStrategy}>
            <div className={viewMode === "cards" ? "grid grid-cols-1 gap-6 lg:grid-cols-2" : "flex flex-col gap-4"}>
              {combatants.map((c) => (
                <CombatantCard
                  key={c.id}
                  combatant={c}
                  ring={tokenColor(c, combatants)}
                  active={activeId === c.id}
                  layout={viewMode}
                  onEdit={() => setEditing({ id: c.id, source: "combat" })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <EditCombatantDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
