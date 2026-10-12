import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SIZES } from "../domain/types";
import { resizeImage } from "../lib/image";
import type { CombatantDraft } from "../store/actions";
import { Avatar } from "./Avatar";
import { RichTextEditor } from "./RichTextEditor";
import { StatBlockEditor, emptyStatBlock } from "./StatBlockEditor";

const NUMBER_FIELDS = ["initiative", "ac", "speed", "hpMax", "hpCurrent", "hpTemp"] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

/** Numbers are edited as strings so fields can be blank while typing. */
type FormState = Omit<CombatantDraft, NumberField> & Record<NumberField, string>;

export const blankCombatant = (): CombatantDraft => ({
  name: "",
  isMonster: false,
  image: null,
  size: 1,
  group: "",
  initiative: 0,
  ac: 10,
  speed: 30,
  hpMax: 10,
  hpCurrent: 10,
  hpTemp: 0,
  attributes: "",
  saves: "",
  actions: "",
  notes: "",
  stats: null,
});

const toForm = (c: CombatantDraft, blankInitiative: boolean): FormState => ({
  ...c,
  initiative: blankInitiative ? "" : String(c.initiative),
  ac: String(c.ac),
  speed: String(c.speed),
  hpMax: String(c.hpMax),
  hpCurrent: String(c.hpCurrent),
  hpTemp: c.hpTemp ? String(c.hpTemp) : "",
});

export type SubmitIntent = "roster" | "combat" | "save";

interface Props {
  mode: "create" | "edit";
  initial?: CombatantDraft;
  onSubmit: (draft: CombatantDraft, intent: SubmitIntent, initiativeBlank: boolean) => void;
}

/** One form for creating and editing — the original had two that drifted apart. */
export function CombatantForm({ mode, initial, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(initial ?? blankCombatant(), mode === "create"));
  // Remounting the rich text editors is the simplest way to clear them.
  const [resetKey, setResetKey] = useState(0);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const intent = ((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "save") as SubmitIntent;
    const num = (k: NumberField) => Math.trunc(Number(form[k])) || 0;
    const hpMax = num("hpMax");
    const draft: CombatantDraft = {
      ...form,
      name: form.name.trim(),
      initiative: num("initiative"),
      ac: num("ac"),
      speed: num("speed"),
      hpMax,
      hpCurrent: mode === "create" ? hpMax : num("hpCurrent"),
      hpTemp: num("hpTemp"),
    };
    onSubmit(draft, intent, form.initiative.trim() === "");
    if (mode === "create") {
      setForm(toForm(blankCombatant(), true));
      setResetKey((k) => k + 1);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      set("image", await resizeImage(file));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const numberInput = (k: NumberField, label: string, opts: { required?: boolean; placeholder?: string } = {}) => (
    <label>
      <span className="field-label">{label}</span>
      <input
        type="number"
        className="field"
        value={form[k]}
        required={opts.required}
        placeholder={opts.placeholder}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-4 text-sm">
      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className="field-label">Name</span>
          <input className="field" value={form.name} required onChange={(e) => set("name", e.target.value)} />
        </label>
        <div className="flex flex-col items-center">
          <span className="field-label">Avatar</span>
          <label className="relative cursor-pointer" title="Upload portrait">
            <Avatar combatant={form} size="sm" />
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {form.image && (
            <button type="button" className="mt-1 text-[10px] text-faint hover:text-accent" onClick={() => set("image", null)}>
              remove
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numberInput("initiative", "Initiative", { placeholder: form.isMonster ? "Roll d20" : "0" })}
        {numberInput("ac", "AC", { required: true })}
        {numberInput("hpMax", "Max HP", { required: true })}
        {mode === "edit" ? numberInput("hpCurrent", "Current HP", { required: true }) : numberInput("hpTemp", "Temp HP", { placeholder: "0" })}
        {mode === "edit" && numberInput("hpTemp", "Temp HP", { placeholder: "0" })}
        {numberInput("speed", "Speed (ft)")}
        <label>
          <span className="field-label">Size</span>
          <select className="field" value={form.size} onChange={(e) => set("size", Number(e.target.value))}>
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Group</span>
          <input className="field" value={form.group} placeholder="Optional" onChange={(e) => set("group", e.target.value)} />
        </label>
      </div>

      <label className="flex items-center gap-2 font-bold uppercase text-muted">
        <input type="checkbox" className="size-5 accent-accent" checked={form.isMonster} onChange={(e) => set("isMonster", e.target.checked)} />
        Monster / NPC
      </label>

      <section className="rounded-md border border-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-strong">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={!!form.stats}
            onChange={(e) => set("stats", e.target.checked ? emptyStatBlock() : null)}
          />
          Structured stat block
          <span className="font-normal text-faint">(one-click attacks, saves & resistances)</span>
        </label>
        {form.stats && (
          <div className="mt-3">
            <StatBlockEditor value={form.stats} onChange={(v) => set("stats", v)} />
          </div>
        )}
      </section>

      {/* Free-text fallbacks, for quick homebrew without a structured block. */}
      <div className={form.stats ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
        <label>
          <span className="field-label">Attributes</span>
          <input className="field" value={form.attributes} placeholder="STR 16 (+3), DEX 14 (+2)…" onChange={(e) => set("attributes", e.target.value)} />
        </label>
        <label>
          <span className="field-label">Saving throws</span>
          <input className="field" value={form.saves} placeholder="Dex +5, Wis +4" onChange={(e) => set("saves", e.target.value)} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" key={resetKey}>
        <div>
          <span className="field-label">Actions &amp; features</span>
          <RichTextEditor label="Actions and features" value={form.actions} onChange={(v) => set("actions", v)} />
        </div>
        <div>
          <span className="field-label">Resistances &amp; notes</span>
          <RichTextEditor label="Resistances and notes" value={form.notes} onChange={(v) => set("notes", v)} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        {mode === "create" ? (
          <>
            <button type="submit" value="roster" className="btn">
              Save to roster
            </button>
            <button type="submit" value="combat" className="btn btn-primary font-display">
              Add to initiative
            </button>
          </>
        ) : (
          <button type="submit" value="save" className="btn btn-primary font-display grow">
            Save changes
          </button>
        )}
      </div>
    </form>
  );
}

/** Editable stat-block fields only — live state (id, position, conditions) is left untouched. */
export function toDraft(c: CombatantDraft & { id?: string }): CombatantDraft {
  const { id: _id, conditions: _c, x: _x, y: _y, ...draft } = c;
  return draft;
}
