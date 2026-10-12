import clsx from "clsx";
import { useState } from "react";
import { toast } from "sonner";
import { CombatantDetail } from "../components/CombatantDetail";
import { CombatantForm } from "../components/CombatantForm";
import { Dialog } from "../components/Dialog";
import { EditCombatantDialog, type EditTarget } from "../components/EditCombatantDialog";
import { InitiativeList } from "../components/InitiativeList";
import { tokenColor } from "../domain/combat";
import * as actions from "../store/actions";
import { useGame } from "../store/game";
import { useUi, type CombatTab } from "../store/ui";

const TABS: { id: CombatTab; label: string }[] = [
  { id: "order", label: "Order" },
  { id: "details", label: "Details" },
];

/**
 * The DM's combat screen: compact initiative list on the left, the selected
 * combatant's full stat block on the right. On narrow screens the panes
 * become tabs.
 */
export function BattleOrderView() {
  const { combatants, activeId, round } = useGame((s) => s.combat);
  const { pinnedId, combatTab, set } = useUi();
  const [editing, setEditing] = useState<EditTarget>(null);
  const [creating, setCreating] = useState(false);

  const pinned = combatants.find((c) => c.id === pinnedId);
  const shown = pinned ?? combatants.find((c) => c.id === activeId);
  const inCombat = activeId !== null;

  const select = (id: string) => set({ pinnedId: id, combatTab: "details" });
  const pane = (tab: CombatTab) => (combatTab === tab ? "flex" : "hidden lg:flex");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:h-[calc(100dvh-6rem)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-3xl font-bold text-accent">Order of Battle</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + Add combatant
          </button>
          <button className="btn btn-ghost" onClick={actions.sortInitiative} title="Sort by initiative">
            Sort
          </button>
          {combatants.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => confirm("Remove every combatant from the tracker?") && actions.clearCombat()}
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow">
        {inCombat ? (
          <>
            <button className="btn" onClick={actions.previousTurn} aria-label="Previous turn">
              ◀
            </button>
            <button className="btn btn-primary font-display" onClick={actions.nextTurn}>
              Next turn ▶
            </button>
            <span className="px-1 text-sm text-muted">
              Round <strong className="text-strong">{round}</strong>
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
      </div>

      <nav className="flex rounded-md border border-line bg-surface-2 p-0.5 text-sm lg:hidden" aria-label="Combat panes">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => set({ combatTab: t.id })}
            aria-pressed={combatTab === t.id}
            className={clsx("flex-1 rounded px-3 py-1.5", combatTab === t.id ? "bg-surface-3 font-semibold text-strong" : "text-muted")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[20rem_1fr]">
        <section className={clsx(pane("order"), "min-h-0 flex-col rounded-lg border border-line bg-surface p-2 shadow")} aria-label="Initiative">
          {combatants.length === 0 ? (
            <p className="m-auto p-6 text-center text-sm text-muted italic">
              The battle has not yet begun… Add combatants, or load an encounter.
            </p>
          ) : (
            <div className="min-h-0 overflow-y-auto">
              <InitiativeList combatants={combatants} activeId={activeId} shownId={shown?.id ?? null} onSelect={select} />
            </div>
          )}
        </section>

        <section className={clsx(pane("details"), "min-h-0 flex-col rounded-lg border border-line bg-surface p-4 shadow")} aria-label="Combatant details">
          <div className="min-h-0 overflow-y-auto">
            {shown ? (
              <CombatantDetail
                key={shown.id}
                combatant={shown}
                ring={tokenColor(shown, combatants)}
                active={shown.id === activeId}
                pinned={!!pinned}
                onEdit={() => setEditing({ id: shown.id, source: "combat" })}
              />
            ) : (
              <p className="p-6 text-center text-sm text-muted italic">
                Select a combatant, or start combat to follow the active turn.
              </p>
            )}
          </div>
        </section>
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Add combatant">
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
      </Dialog>
      <EditCombatantDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
