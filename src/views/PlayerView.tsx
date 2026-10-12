import clsx from "clsx";
import { ConditionChip } from "../components/Conditions";
import { Avatar } from "../components/Avatar";
import { healthStatus, tokenColor } from "../domain/combat";
import { useGame } from "../store/game";

/** Read-only table view for players: no stat blocks, enemy HP shown only as a band. */
export function PlayerView() {
  const { combatants, activeId, round } = useGame((s) => s.combat);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
      <h2 className="mt-4 text-4xl font-bold tracking-wider text-accent uppercase">The Combat</h2>
      <p className="mb-8 text-muted">{activeId ? `Round ${round}` : "Waiting for the DM…"}</p>
      {combatants.map((c) => {
        const status = healthStatus(c);
        return (
          <div
            key={c.id}
            className={clsx(
              "mb-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg p-4",
              c.isMonster ? "card-monster" : "card-player",
              activeId === c.id && "active-turn",
              status === "down" && "opacity-60",
            )}
          >
            <div className="flex items-center gap-4">
              <Avatar combatant={c} size="lg" ring={tokenColor(c, combatants)} active={activeId === c.id} />
              <span className="font-display text-2xl font-bold tracking-wide text-strong">{c.name}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.isMonster && status !== "healthy" && <ConditionChip label={status === "down" ? "Down" : "Bloodied"} />}
              {!c.isMonster && c.hpCurrent <= 0 && <ConditionChip label="Down" />}
              {c.hpTemp > 0 && (
                <span className="rounded border border-blue-900/50 bg-black/30 px-2 py-0.5 text-xs font-bold text-temp uppercase">
                  +{c.hpTemp} temp
                </span>
              )}
              {c.conditions.map((cond) => (
                <ConditionChip key={cond} label={cond} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
