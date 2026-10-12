import clsx from "clsx";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RollLine } from "../components/RollLine";
import { ConditionChip } from "../components/Conditions";
import { Avatar } from "../components/Avatar";
import { healthStatus, tokenColor } from "../domain/combat";
import { useGame } from "../store/game";

/** Read-only table view for players: no stat blocks, enemy HP shown only as a band. */
export function PlayerView() {
  const { combatants, activeId, round, rolls } = useGame((s) => s.combat);
  const shownRolls = rolls.filter((r) => r.shown).slice(0, 5);
  useAnnounceRolls(shownRolls[0]);

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
                <span className="rounded border border-temp/40 bg-surface-2 px-2 py-0.5 text-xs font-bold text-temp uppercase">
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
      {shownRolls.length > 0 && (
        <section className="mt-6 w-full rounded-lg border border-line bg-surface p-4 shadow" aria-label="Recent rolls">
          <h3 className="mb-3 text-lg font-bold text-accent">🎲 Rolls</h3>
          <ol className="space-y-2">
            {shownRolls.map((r, i) => (
              <li key={r.id}>
                <RollLine roll={r} big={i === 0} markShown={false} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Pops a toast when the DM shows a new roll (not for rolls already there on load). */
function useAnnounceRolls(latest: { id: string; label: string; total: number; natural: 20 | 1 | null } | undefined) {
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = latest?.id ?? null;
    if (seen.current !== undefined && id && id !== seen.current && latest) {
      const nat = latest.natural === 20 ? " · Natural 20!" : latest.natural === 1 ? " · Natural 1" : "";
      toast(`🎲 ${latest.label || "Roll"} → ${latest.total}${nat}`);
    }
    seen.current = id;
  }, [latest]);
}
