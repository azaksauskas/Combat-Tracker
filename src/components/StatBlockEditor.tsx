import clsx from "clsx";
import { newId } from "../domain/combat";
import { parseDice } from "../domain/dice";
import {
  ABILITIES,
  DAMAGE_TYPES,
  StatBlockSchema,
  abilityMod,
  formatMod,
  type Ability,
  type AttackAction,
  type DamageType,
  type StatAction,
  type StatBlock,
} from "../domain/statblock";

export const emptyStatBlock = (): StatBlock =>
  StatBlockSchema.parse({ abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, proficiency: 2 });

const newAttack = (): AttackAction => ({
  id: newId(),
  kind: "attack",
  name: "Attack",
  attackType: "melee",
  toHit: 4,
  reach: 5,
  range: null,
  damage: [{ dice: "1d6+2", type: "slashing" }],
  notes: "",
});

const num = (v: string, fallback = 0) => (v.trim() === "" || Number.isNaN(Number(v)) ? fallback : Math.trunc(Number(v)));
const diceValid = (d: string) => {
  try {
    parseDice(d);
    return true;
  } catch {
    return false;
  }
};

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx("rounded border px-1.5 py-0.5 text-xs capitalize", on ? "border-accent bg-accent/15 text-strong" : "border-line text-muted")}
    >
      {children}
    </button>
  );
}

/** Edits a structured stat block: abilities, saves, damage adjustments and actions. */
export function StatBlockEditor({ value, onChange }: { value: StatBlock; onChange: (v: StatBlock) => void }) {
  const set = <K extends keyof StatBlock>(k: K, v: StatBlock[K]) => onChange({ ...value, [k]: v });
  const toggle = <T,>(list: readonly T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const setAction = (i: number, a: StatAction) => set("actions", value.actions.map((x, j) => (j === i ? a : x)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITIES.map((a) => (
          <label key={a} className="text-center">
            <span className="field-label">{a}</span>
            <input
              type="number"
              className="field text-center"
              value={value.abilities[a]}
              onChange={(e) => set("abilities", { ...value.abilities, [a]: num(e.target.value, 10) })}
            />
            <span className="text-xs text-faint">{formatMod(abilityMod(value.abilities[a]))}</span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="field-label">Proficiency bonus</span>
          <input type="number" className="field" value={value.proficiency} onChange={(e) => set("proficiency", num(e.target.value, 2))} />
        </label>
        <label>
          <span className="field-label">CR (monsters)</span>
          <input className="field" value={value.cr ?? ""} placeholder="1/4" onChange={(e) => set("cr", e.target.value || null)} />
        </label>
        <label>
          <span className="field-label">Class & level (characters)</span>
          <div className="flex gap-1">
            <input className="field" value={value.className ?? ""} placeholder="Fighter" onChange={(e) => set("className", e.target.value || null)} />
            <input
              type="number"
              className="field w-16"
              value={value.level ?? ""}
              placeholder="1"
              onChange={(e) => set("level", e.target.value ? num(e.target.value, 1) : null)}
            />
          </div>
        </label>
      </div>

      <div>
        <span className="field-label">Saving throw proficiencies</span>
        <div className="flex flex-wrap gap-1">
          {ABILITIES.map((a) => (
            <Toggle key={a} on={value.saveProficiencies.includes(a)} onClick={() => set("saveProficiencies", toggle<Ability>(value.saveProficiencies, a))}>
              {a}
            </Toggle>
          ))}
        </div>
      </div>

      <details className="rounded-md border border-line p-2">
        <summary className="cursor-pointer text-xs font-bold tracking-wider text-faint uppercase">
          Damage resistances, immunities & vulnerabilities
        </summary>
        {(
          [
            ["resistances", "Resistant"],
            ["immunities", "Immune"],
            ["vulnerabilities", "Vulnerable"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="mt-2">
            <span className="field-label">{label}</span>
            <div className="flex flex-wrap gap-1">
              {DAMAGE_TYPES.map((t) => (
                <Toggle key={t} on={value[key].includes(t)} onClick={() => set(key, toggle<DamageType>(value[key], t))}>
                  {t}
                </Toggle>
              ))}
            </div>
          </div>
        ))}
      </details>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label mb-0">Actions</span>
          <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => set("actions", [...value.actions, newAttack()])}>
            + Add action
          </button>
        </div>
        {value.actions.length === 0 && <p className="text-xs text-muted italic">No actions yet.</p>}
        <ul className="space-y-2">
          {value.actions.map((a, i) => (
            <ActionRow
              key={a.id}
              action={a}
              onChange={(next) => setAction(i, next)}
              onRemove={() => set("actions", value.actions.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActionRow({ action: a, onChange, onRemove }: { action: StatAction; onChange: (a: StatAction) => void; onRemove: () => void }) {
  const kindValue = a.kind === "save" ? "save" : a.attackType;
  const setKind = (k: string) => {
    if (k === "save" && a.kind !== "save")
      onChange({ id: a.id, kind: "save", name: a.name, save: "dex", dc: 13, damage: a.damage, onSuccess: "half", notes: a.notes });
    else if (k !== "save")
      onChange(
        a.kind === "attack"
          ? { ...a, attackType: k as "melee" | "ranged", range: k === "ranged" ? (a.range ?? [80, 320]) : null }
          : { ...newAttack(), id: a.id, name: a.name, damage: a.damage, notes: a.notes, attackType: k as "melee" | "ranged", range: k === "ranged" ? [80, 320] : null },
      );
  };
  const part = a.damage[0] ?? { dice: "1d6", type: "slashing" as DamageType };
  const setPart = (p: Partial<typeof part>) => onChange({ ...a, damage: [{ ...part, ...p }, ...a.damage.slice(1)] });

  return (
    <li className="space-y-2 rounded-md border border-line bg-surface-2/50 p-2">
      <div className="flex gap-2">
        <input className="field flex-1" value={a.name} aria-label="Action name" onChange={(e) => onChange({ ...a, name: e.target.value })} />
        <select className="field w-32" value={kindValue} aria-label="Action type" onChange={(e) => setKind(e.target.value)}>
          <option value="melee">Melee attack</option>
          <option value="ranged">Ranged attack</option>
          <option value="save">Saving throw</option>
        </select>
        <button type="button" className="btn btn-ghost px-2 hover:text-danger" onClick={onRemove} aria-label={`Remove ${a.name}`}>
          ✕
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {a.kind === "attack" ? (
          <>
            <label className="w-16">
              <span className="field-label">To hit</span>
              <input type="number" className="field" value={a.toHit} onChange={(e) => onChange({ ...a, toHit: num(e.target.value) })} />
            </label>
            {a.attackType === "melee" ? (
              <label className="w-20">
                <span className="field-label">Reach ft</span>
                <input type="number" className="field" value={a.reach} onChange={(e) => onChange({ ...a, reach: num(e.target.value, 5) })} />
              </label>
            ) : (
              <label className="w-28">
                <span className="field-label">Range ft</span>
                <div className="flex gap-1">
                  <input type="number" className="field" value={a.range?.[0] ?? 80} onChange={(e) => onChange({ ...a, range: [num(e.target.value, 80), a.range?.[1] ?? 320] })} aria-label="Normal range" />
                  <input type="number" className="field" value={a.range?.[1] ?? 320} onChange={(e) => onChange({ ...a, range: [a.range?.[0] ?? 80, num(e.target.value, 320)] })} aria-label="Long range" />
                </div>
              </label>
            )}
          </>
        ) : (
          <>
            <label className="w-16">
              <span className="field-label">DC</span>
              <input type="number" className="field" value={a.dc} onChange={(e) => onChange({ ...a, dc: num(e.target.value, 10) })} />
            </label>
            <label className="w-20">
              <span className="field-label">Save</span>
              <select className="field uppercase" value={a.save} onChange={(e) => onChange({ ...a, save: e.target.value as Ability })}>
                {ABILITIES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-24">
              <span className="field-label">On success</span>
              <select className="field" value={a.onSuccess} onChange={(e) => onChange({ ...a, onSuccess: e.target.value as "half" | "none" })}>
                <option value="half">Half</option>
                <option value="none">None</option>
              </select>
            </label>
          </>
        )}
        <label className="w-24">
          <span className="field-label">Damage</span>
          <input
            className={clsx("field font-mono", !diceValid(part.dice) && "border-danger")}
            value={part.dice}
            placeholder="1d6+2"
            onChange={(e) => setPart({ dice: e.target.value })}
          />
        </label>
        <label className="w-32">
          <span className="field-label">Type</span>
          <select className="field capitalize" value={part.type} onChange={(e) => setPart({ type: e.target.value as DamageType })}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input className="field text-xs" value={a.notes} placeholder="Notes (e.g. target is knocked Prone)" aria-label="Action notes" onChange={(e) => onChange({ ...a, notes: e.target.value })} />
    </li>
  );
}
