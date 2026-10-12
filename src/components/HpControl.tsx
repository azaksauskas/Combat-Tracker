import { useState } from "react";
import { toast } from "sonner";
import type { Combatant } from "../domain/types";
import { applyDamage, applyHealing, applyHpInput, grantTempHp } from "../store/actions";
import { HpBar } from "./HpBar";

/**
 * One field for every HP change: "7" or "-7" damages, "+5" heals, "t5" gives
 * temp HP, then Enter. The buttons do the same with the plain number.
 */
export function HpControl({ combatant: c }: { combatant: Combatant }) {
  const [text, setText] = useState("");
  const n = Math.abs(Math.trunc(Number(text.replace(/^[-+t]\s*/i, ""))));

  const submit = () => {
    if (!text.trim()) return;
    if (applyHpInput(c.id, text)) setText("");
    else toast.error(`"${text}" isn't an HP change`, { description: "Try 7, -7, +5 or t5" });
  };
  const apply = (fn: (id: string, n: number) => void) => {
    if (!n) return;
    fn(c.id, n);
    setText("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className={`text-3xl font-black ${c.hpCurrent <= 0 ? "text-red-600" : "text-strong"}`}>
          {c.hpCurrent}
          <span className="text-base font-normal text-faint"> / {c.hpMax}</span>
        </span>
        {c.hpTemp > 0 && <span className="text-sm font-bold text-temp">+{c.hpTemp} temp</span>}
      </div>
      <HpBar combatant={c} className="h-2" />
      <div className="flex gap-1">
        <input
          className="w-full min-w-0 px-2 py-1 text-sm"
          aria-label={`Change hit points for ${c.name}`}
          placeholder="7 · +5 heal · t5 temp"
          title="7 or -7 = damage · +5 = heal · t5 = temp HP · Enter to apply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn btn-danger px-2" onClick={() => apply(applyDamage)} disabled={!n}>
          Dmg
        </button>
        <button className="btn btn-heal px-2" onClick={() => apply(applyHealing)} disabled={!n}>
          Heal
        </button>
        <button className="btn px-2 text-temp" onClick={() => apply(grantTempHp)} disabled={!n} title="Grant temporary HP">
          Tmp
        </button>
      </div>
    </div>
  );
}
