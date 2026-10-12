import { useGame } from "../store/game";
import { updateCombatant, updateRosterEntry } from "../store/actions";
import { CombatantForm, toDraft } from "./CombatantForm";
import { Dialog } from "./Dialog";

export type EditTarget = { id: string; source: "combat" | "roster" } | null;

export function EditCombatantDialog({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const combatant = useGame((s) =>
    target ? (target.source === "roster" ? s.library.roster : s.combat.combatants).find((c) => c.id === target.id) : undefined,
  );

  return (
    <Dialog open={!!combatant} onClose={onClose} title={target?.source === "roster" ? "Edit roster entry" : "Edit combatant"}>
      {combatant && target && (
        <CombatantForm
          key={combatant.id}
          mode="edit"
          initial={toDraft(combatant)}
          onSubmit={(draft) => {
            (target.source === "roster" ? updateRosterEntry : updateCombatant)(target.id, draft);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
