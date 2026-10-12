import clsx from "clsx";
import type { Combatant } from "../domain/types";

/** HP as a bar: green → amber when bloodied → empty when down; temp HP in blue. */
export function HpBar({ combatant: c, className }: { combatant: Pick<Combatant, "hpCurrent" | "hpMax" | "hpTemp">; className?: string }) {
  const max = Math.max(1, c.hpMax);
  const pct = Math.min(100, (Math.max(0, c.hpCurrent) / max) * 100);
  const tempPct = Math.min(100 - pct, (c.hpTemp / max) * 100);
  const color = c.hpCurrent <= 0 ? "bg-transparent" : pct <= 50 ? "bg-warn" : "bg-heal";
  return (
    <div
      className={clsx("flex h-1.5 overflow-hidden rounded-full bg-surface-3", className)}
      role="meter"
      aria-label="Hit points"
      aria-valuemin={0}
      aria-valuemax={c.hpMax}
      aria-valuenow={c.hpCurrent}
    >
      <div className={color} style={{ width: `${pct}%` }} />
      {c.hpTemp > 0 && <div className="bg-temp" style={{ width: `${tempPct}%` }} />}
    </div>
  );
}
