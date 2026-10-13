import clsx from "clsx";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BACKGROUND_NAMES, CLASS_NAMES, SPECIES_NAMES, STANDARD_ARRAY, type CharacterSpec, type ClassName } from "../domain/character";
import { ABILITIES, ABILITY_NAMES, abilityMod, describeAction, formatMod, type Ability } from "../domain/statblock";
import { BACKGROUNDS, CLASSES, SPECIES, buildCharacter, finalAbilities, suggestedSpec, validateSpec } from "../game/builder";
import { saveCharacter } from "../game/party-store";
import { Dialog } from "./Dialog";

/**
 * Level-1 character builder: class, species, background, standard array and
 * the background's +2 / +1, with a live character sheet. Saves to the
 * player's own synced document; the DM sees it in the tracker too.
 */
export function CharacterBuilder({ initial, onClose }: { initial: CharacterSpec | null; onClose: () => void }) {
  return (
    <Dialog open={!!initial} onClose={onClose} title={initial?.name ? `Character: ${initial.name}` : "New character"} wide>
      {initial && <BuilderForm key={initial.id} initial={initial} onClose={onClose} />}
    </Dialog>
  );
}

function BuilderForm({ initial, onClose }: { initial: CharacterSpec; onClose: () => void }) {
  const [spec, setSpec] = useState(initial);
  const errors = validateSpec(spec);
  const sheet = useMemo(() => (errors.length ? null : buildCharacter(spec)), [spec, errors.length]);
  const bg = BACKGROUNDS[spec.background];
  const final = finalAbilities(spec);

  const set = (patch: Partial<CharacterSpec>) => setSpec((s) => ({ ...s, ...patch }));

  /** Picking a score another ability already has swaps the two, so the array stays complete. */
  const assign = (ability: Ability, score: number) =>
    setSpec((s) => {
      const base = { ...s.base };
      const other = ABILITIES.find((a) => a !== ability && base[a] === score);
      if (other) base[other] = base[ability];
      base[ability] = score;
      return { ...s, base };
    });

  const changeClass = (className: ClassName) => {
    const next = suggestedSpec(className, spec.id, spec.name);
    setSpec({ ...next, species: spec.species });
  };

  const changeBackground = (background: CharacterSpec["background"]) => {
    const allowed = BACKGROUNDS[background].abilities;
    const plus2 = allowed.includes(spec.plus2) ? spec.plus2 : allowed[0];
    const plus1 = allowed.includes(spec.plus1) && spec.plus1 !== plus2 ? spec.plus1 : allowed.find((a) => a !== plus2)!;
    set({ background, plus2, plus1 });
  };

  const saveSpec = () => {
    if (errors.length) return;
    saveCharacter(spec);
    toast.success(`${spec.name} is ready for adventure`);
    onClose();
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <label className="block">
          <span className="field-label">Name</span>
          <input className="field" value={spec.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">Class</span>
            <select className="field" value={spec.className} onChange={(e) => changeClass(e.target.value as ClassName)}>
              {CLASS_NAMES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Species</span>
            <select className="field" value={spec.species} onChange={(e) => set({ species: e.target.value as CharacterSpec["species"] })}>
              {SPECIES_NAMES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Background</span>
            <select className="field" value={spec.background} onChange={(e) => changeBackground(e.target.value as CharacterSpec["background"])}>
              {BACKGROUND_NAMES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">
          {spec.className}: d{CLASSES[spec.className].hitDie} hit die, {CLASSES[spec.className].armor}. {spec.species}: {SPECIES[spec.species].traits.map((t) => t.name).join(", ")}.{" "}
          {spec.background}: {bg.skills.join(" and ")}, {bg.feat.name}.
        </p>

        <div>
          <span className="field-label">Ability scores (standard array, then +2 and +1 from the {spec.background} background)</span>
          <table className="mt-1 w-full text-sm">
            <thead className="text-xs text-faint">
              <tr>
                <th className="text-left font-normal">Ability</th>
                <th className="font-normal">Base</th>
                <th className="font-normal">+2</th>
                <th className="font-normal">+1</th>
                <th className="font-normal">Score</th>
              </tr>
            </thead>
            <tbody>
              {ABILITIES.map((a) => {
                const allowed = bg.abilities.includes(a);
                return (
                  <tr key={a} className="border-t border-line">
                    <td className="py-1 font-semibold text-strong">{ABILITY_NAMES[a]}</td>
                    <td className="text-center">
                      <select className="field w-20 py-0.5" aria-label={`${ABILITY_NAMES[a]} base score`} value={spec.base[a]} onChange={(e) => assign(a, Number(e.target.value))}>
                        {STANDARD_ARRAY.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-center">
                      <input type="radio" name="plus2" aria-label={`+2 ${ABILITY_NAMES[a]}`} disabled={!allowed} checked={spec.plus2 === a} onChange={() => set({ plus2: a, plus1: spec.plus1 === a ? spec.plus2 : spec.plus1 })} />
                    </td>
                    <td className="text-center">
                      <input type="radio" name="plus1" aria-label={`+1 ${ABILITY_NAMES[a]}`} disabled={!allowed} checked={spec.plus1 === a} onChange={() => set({ plus1: a, plus2: spec.plus2 === a ? spec.plus1 : spec.plus2 })} />
                    </td>
                    <td className="text-center font-bold text-strong tabular-nums">
                      {final[a]} <span className="text-xs font-normal text-muted">({formatMod(abilityMod(final[a]))})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="btn btn-ghost mt-1 px-2 text-xs" onClick={() => setSpec({ ...suggestedSpec(spec.className, spec.id, spec.name), species: spec.species, background: spec.background, plus2: spec.plus2, plus1: spec.plus1 })}>
            Suggested scores for a {spec.className}
          </button>
        </div>

        {errors.length > 0 && (
          <ul className="space-y-0.5 text-sm text-danger">
            {errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary font-display" disabled={errors.length > 0} onClick={saveSpec}>
            Save character
          </button>
        </div>
      </div>

      <aside className="space-y-2 rounded-md border border-line bg-surface-2/60 p-3 text-sm" aria-label="Character sheet">
        {sheet?.stats ? (
          <>
            <div className="font-display text-lg font-bold text-accent">{sheet.name}</div>
            <div className="text-xs text-faint">
              Level 1 {spec.className} · {spec.species} {spec.background}
            </div>
            <div className="flex gap-3 text-strong">
              <span>
                AC <strong>{sheet.ac}</strong>
              </span>
              <span>
                HP <strong>{sheet.hpMax}</strong>
              </span>
              <span>
                Speed <strong>{sheet.speed} ft</strong>
              </span>
            </div>
            <div className="text-xs text-muted">
              Skills: {Object.entries(sheet.stats.skills).map(([k, v]) => `${k} ${formatMod(v)}`).join(", ")}
            </div>
            <ul className="space-y-1">
              {sheet.stats.actions.map((a) => (
                <li key={a.id} className="rounded border border-line bg-surface p-1.5">
                  <div className="font-semibold text-strong">{a.name}</div>
                  <div className="text-xs text-muted">{describeAction(a)}</div>
                </li>
              ))}
            </ul>
            <ul className="space-y-0.5 text-xs text-muted">
              {sheet.stats.traits.map((t) => (
                <li key={t.name}>
                  <strong className="text-strong">{t.name}.</strong> {t.text}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={clsx("text-muted italic")}>Fix the choices on the left to see the character sheet.</p>
        )}
      </aside>
    </div>
  );
}
