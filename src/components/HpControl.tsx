import { useState } from "react";
import type { Combatant } from "../domain/types";
import { applyDamage, applyHealing, grantTempHp } from "../store/actions";

export function HpControl({ combatant: c }: { combatant: Combatant }) {
  const [amount, setAmount] = useState("");
  const n = Math.abs(Math.trunc(Number(amount)));
  const apply = (fn: (id: string, n: number) => void) => {
    if (!n) return;
    fn(c.id, n);
    setAmount("");
  };

  return (
    <div className="rounded-md border border-line bg-surface-2/60 p-3 text-center">
      <div className="text-xs uppercase tracking-widest text-faint">Health</div>
      <div className={`mb-2 text-2xl font-black ${c.hpCurrent <= 0 ? "text-red-600" : "text-strong"}`}>
        {c.hpCurrent}
        <span className="text-sm font-normal text-faint"> / {c.hpMax}</span>
        {c.hpTemp > 0 && <span className="ml-1 text-sm font-bold text-temp">+{c.hpTemp}</span>}
      </div>
      <div className="flex gap-1">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={`Hit point amount for ${c.name}`}
          placeholder="Amt"
          className="w-full min-w-14 px-1 py-1 text-center text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply(applyDamage)}
        />
        <button className="btn btn-danger px-2" onClick={() => apply(applyDamage)} title="Damage (Enter)">
          Dmg
        </button>
        <button className="btn btn-heal px-2" onClick={() => apply(applyHealing)}>
          Heal
        </button>
        <button className="btn px-2 text-temp" onClick={() => apply(grantTempHp)} title="Grant temporary HP">
          Tmp
        </button>
      </div>
    </div>
  );
}
