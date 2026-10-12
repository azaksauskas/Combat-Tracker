import { useId, useState } from "react";
import { CONDITIONS, type Combatant } from "../domain/types";
import { addCondition, removeCondition } from "../store/actions";

export function ConditionChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const cls = "inline-flex items-center gap-1 rounded-full border border-transparent bg-danger px-2 py-0.5 text-xs text-white";
  if (!onRemove) return <span className={cls}>{label}</span>;
  return (
    <button type="button" className={`${cls} hover:brightness-125`} onClick={onRemove} title={`Remove ${label}`}>
      {label} <span aria-hidden>×</span>
    </button>
  );
}

export function ConditionEditor({ combatant: c }: { combatant: Combatant }) {
  const [value, setValue] = useState("");
  const listId = useId();
  const add = () => {
    addCondition(c.id, value);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          list={listId}
          className="field"
          placeholder="Add condition…"
          aria-label={`Add condition to ${c.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <datalist id={listId}>
          {CONDITIONS.filter((x) => !c.conditions.includes(x)).map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <button className="btn" onClick={add} aria-label="Add condition">
          +
        </button>
      </div>
      {c.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.conditions.map((cond) => (
            <ConditionChip key={cond} label={cond} onRemove={() => removeCondition(c.id, cond)} />
          ))}
        </div>
      )}
    </div>
  );
}
