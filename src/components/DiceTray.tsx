import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { addDieToExpression as addDie, addModifierToExpression as addModifier } from "../domain/dice";
import * as actions from "../store/actions";
import { useGame } from "../store/game";
import { useUi } from "../store/ui";
import { RollLine } from "./RollLine";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
type Advantage = "normal" | "adv" | "dis";

/** Floating dice tray: quick dice, free notation, advantage, and a roll log. */
export function DiceTray() {
  const { diceOpen, rollShown, set } = useUi();
  const rolls = useGame((s) => s.combat.rolls);
  const [expr, setExpr] = useState("");
  const [label, setLabel] = useState("");
  const [advantage, setAdvantage] = useState<Advantage>("normal");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!diceOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ diceOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diceOpen, set]);

  const doRoll = (input = expr, rollLabel = label) => {
    try {
      actions.rollDice(input, { label: rollLabel.trim(), shown: rollShown, advantage });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const [latest, ...older] = rolls;

  return (
    <>
      <button
        className={clsx(
          "fixed right-4 bottom-4 z-[160] flex size-14 items-center justify-center rounded-full border border-line bg-surface text-3xl shadow-xl transition hover:scale-105",
          diceOpen && "border-accent",
        )}
        onClick={() => set({ diceOpen: !diceOpen })}
        aria-expanded={diceOpen}
        aria-label={diceOpen ? "Close dice tray" : "Open dice tray"}
        title="Dice"
      >
        🎲
      </button>

      {diceOpen && (
        <section
          className="fixed right-4 bottom-20 z-[160] flex max-h-[min(40rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-2rem))] flex-col rounded-lg border border-line bg-surface shadow-2xl"
          aria-label="Dice tray"
        >
          <form
            className="space-y-2 border-b border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              doRoll();
            }}
          >
            <div className="grid grid-cols-7 gap-1">
              {DICE.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="btn px-0 text-xs"
                  onClick={() => {
                    setExpr((x) => addDie(x, d));
                    setError(null);
                  }}
                  onDoubleClick={() => doRoll(`1d${d}`)}
                  title={`Add a d${d} (double-click to roll one now)`}
                >
                  d{d}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                ref={inputRef}
                className="field font-mono"
                placeholder="1d20+5, 2d6+3, 4d6kh3…"
                aria-label="Dice to roll"
                value={expr}
                onChange={(e) => {
                  setExpr(e.target.value);
                  setError(null);
                }}
              />
              <button type="button" className="btn px-2" onClick={() => setExpr((x) => addModifier(x, -1))} aria-label="Modifier minus one">
                −1
              </button>
              <button type="button" className="btn px-2" onClick={() => setExpr((x) => addModifier(x, 1))} aria-label="Modifier plus one">
                +1
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <input className="field" placeholder="Label (optional), e.g. Fireball" aria-label="Roll label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-line bg-surface-2 p-0.5 text-xs" role="group" aria-label="Advantage">
                {(
                  [
                    ["dis", "Dis"],
                    ["normal", "Normal"],
                    ["adv", "Adv"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={advantage === v}
                    onClick={() => setAdvantage(v)}
                    className={clsx("rounded px-2 py-1", advantage === v ? "bg-surface-3 font-semibold text-strong" : "text-muted")}
                    title={v === "normal" ? undefined : `Rolls a single d20 twice and keeps the ${v === "adv" ? "higher" : "lower"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => setExpr("")} disabled={!expr}>
                Clear
              </button>
              <button className="btn btn-primary ml-auto font-display" disabled={!expr.trim()}>
                Roll
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="accent-accent" checked={rollShown} onChange={(e) => set({ rollShown: e.target.checked })} />
              Show rolls to players
            </label>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {latest ? (
              <>
                <RollLine key={latest.id} roll={latest} big onReroll={() => doRoll(latest.expression, latest.label)} />
                {older.length > 0 && (
                  <ol className="mt-3 space-y-2 border-t border-line pt-3">
                    {older.map((r) => (
                      <li key={r.id}>
                        <RollLine roll={r} onReroll={() => doRoll(r.expression, r.label)} />
                      </li>
                    ))}
                  </ol>
                )}
                <button className="mt-3 text-xs text-faint hover:text-danger" onClick={() => confirm("Clear the roll log?") && actions.clearRolls()}>
                  Clear log
                </button>
              </>
            ) : (
              <p className="text-center text-sm text-muted italic">
                No rolls yet. Tip: click +4 or 2d6+3 in a stat block to roll it.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
