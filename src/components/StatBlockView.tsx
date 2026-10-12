import clsx from "clsx";
import { useState } from "react";
import { toast } from "sonner";
import type { Advantage } from "../domain/attack";
import { ABILITIES, abilityMod, describeAction, formatMod, saveBonus, type StatBlock } from "../domain/statblock";
import type { Combatant } from "../domain/types";
import { performAction } from "../store/actions";
import { useGame } from "../store/game";
import { useUi } from "../store/ui";

interface Props {
  combatant: Combatant;
  stats: StatBlock;
  /** Rolls a plain check/save expression into the log (ability, save, skill). */
  onRoll: (expression: string, label: string) => void;
}

const RollChip = ({ label, mod, onRoll }: { label: string; mod: number; onRoll: () => void }) => (
  <button type="button" className="roll-link" onClick={onRoll} title={`Roll ${label}: 1d20${formatMod(mod)}`}>
    {label} {formatMod(mod)}
  </button>
);

/** Structured 2024 stat block with one-click checks, saves and actions. */
export function StatBlockView({ combatant: c, stats, onRoll }: Props) {
  const d20 = (mod: number) => `1d20${mod ? formatMod(mod) : ""}`;
  const adjustments = (
    [
      ["Resistant", stats.resistances],
      ["Immune", stats.immunities],
      ["Vulnerable", stats.vulnerabilities],
    ] as const
  ).filter(([, list]) => list.length > 0);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-6 gap-1 text-center">
        {ABILITIES.map((a) => {
          const mod = abilityMod(stats.abilities[a]);
          return (
            <button
              key={a}
              type="button"
              className="rounded-md border border-line bg-surface-2/60 py-1 hover:border-accent"
              onClick={() => onRoll(d20(mod), `${a.toUpperCase()} check`)}
              title={`Roll a ${a.toUpperCase()} check`}
            >
              <div className="text-[10px] font-bold tracking-wider text-faint uppercase">{a}</div>
              <div className="font-bold text-strong">{formatMod(mod)}</div>
              <div className="text-[10px] text-faint">{stats.abilities[a]}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-xs font-bold tracking-wider text-faint uppercase">Saves</span>
          {ABILITIES.map((a) => (
            <RollChip key={a} label={a.toUpperCase()} mod={saveBonus(stats, a)} onRoll={() => onRoll(d20(saveBonus(stats, a)), `${a.toUpperCase()} save`)} />
          ))}
        </div>
        {Object.keys(stats.skills).length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-xs font-bold tracking-wider text-faint uppercase">Skills</span>
            {Object.entries(stats.skills).map(([name, mod]) => (
              <RollChip key={name} label={name} mod={mod} onRoll={() => onRoll(d20(mod), name)} />
            ))}
          </div>
        )}
        {adjustments.map(([label, list]) => (
          <div key={label}>
            <span className="mr-1 text-xs font-bold tracking-wider text-faint uppercase">{label}</span>
            <span className="capitalize">{list.join(", ")}</span>
          </div>
        ))}
        {stats.conditionImmunities.length > 0 && (
          <div>
            <span className="mr-1 text-xs font-bold tracking-wider text-faint uppercase">Condition immune</span>
            {stats.conditionImmunities.join(", ")}
          </div>
        )}
      </div>

      {stats.actions.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Actions</h4>
          <ActionList combatant={c} stats={stats} />
        </section>
      )}
    </div>
  );
}

function ActionList({ combatant: c, stats }: { combatant: Combatant; stats: StatBlock }) {
  const combatants = useGame((s) => s.combat.combatants);
  const others = combatants.filter((x) => x.id !== c.id);
  // Default target: the first standing creature on the other side.
  const defaultTarget = (others.find((x) => x.isMonster !== c.isMonster && x.hpCurrent > 0) ?? others[0])?.id ?? "";
  const [targetId, setTargetId] = useState("");
  const target = others.some((x) => x.id === targetId) ? targetId : defaultTarget;
  const [advantage, setAdvantage] = useState<Advantage>("normal");

  const run = (actionId: string) => {
    const report = performAction(c.id, actionId, target, { advantage, shown: useUi.getState().rollShown });
    if (!report) return;
    toast(report.title, {
      description: report.detail,
      action: report.undo ? { label: "Undo damage", onClick: report.undo } : undefined,
    });
  };

  if (others.length === 0) return <p className="text-xs text-muted italic">Add another combatant to target.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-faint">
          Target
          <select className="field min-w-0 flex-1 py-1" value={target} onChange={(e) => setTargetId(e.target.value)} aria-label="Target">
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} (AC {o.ac}, {o.hpCurrent} HP){o.isMonster ? " ☠" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex rounded-md border border-line bg-surface-2 p-0.5 text-xs" role="group" aria-label="Advantage">
          {(
            [
              ["dis", "Dis"],
              ["normal", "—"],
              ["adv", "Adv"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={advantage === v}
              onClick={() => setAdvantage(v)}
              className={clsx("rounded px-2 py-0.5", advantage === v ? "bg-surface-3 font-semibold text-strong" : "text-muted")}
              title={v === "normal" ? "Normal roll" : v === "adv" ? "Advantage" : "Disadvantage"}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <ul className="space-y-1.5">
        {stats.actions.map((a) => (
          <li key={a.id} className="flex items-start gap-2 rounded-md border border-line/60 bg-surface-2/40 p-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-strong">{a.name}</div>
              <div className="text-xs text-muted">{describeAction(a)}</div>
              {a.notes && <div className="text-xs text-faint italic">{a.notes}</div>}
            </div>
            <button className="btn btn-primary shrink-0 px-2 py-1 text-xs" onClick={() => run(a.id)}>
              {a.kind === "attack" ? "Attack" : "Force save"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
