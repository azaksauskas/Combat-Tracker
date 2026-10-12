import clsx from "clsx";
import type { RollEntry } from "../domain/types";

/** "[~7~, 18] + 4" → dropped dice (~x~) shown struck through. */
function Breakdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/(~\d+~)/).map((part, i) =>
        /^~\d+~$/.test(part) ? (
          <s key={i} className="opacity-50">
            {part.slice(1, -1)}
          </s>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function RollLine({
  roll,
  big,
  onReroll,
  markShown = true,
}: {
  roll: RollEntry;
  big?: boolean;
  onReroll?: () => void;
  /** Show the 👁 "visible to players" marker (pointless on the player screen). */
  markShown?: boolean;
}) {
  const crit = roll.natural === 20;
  const fumble = roll.natural === 1;
  return (
    <div className={clsx("flex items-center gap-3", big && "animate-[roll-pop_250ms_ease-out]")}>
      <div className="min-w-0 flex-1">
        {roll.label && <div className="truncate text-xs font-semibold text-muted">{roll.label}</div>}
        <div className="truncate font-mono text-xs text-faint">
          {roll.expression} · <Breakdown text={roll.breakdown} />
        </div>
        {(crit || fumble) && (
          <div className={clsx("text-xs font-bold uppercase", crit ? "text-heal" : "text-danger")}>{crit ? "Natural 20!" : "Natural 1"}</div>
        )}
      </div>
      {markShown && roll.shown && (
        <span className="shrink-0 text-xs" title="Shown to players">
          👁
        </span>
      )}
      <button
        className={clsx(
          "shrink-0 rounded-md text-right font-black tabular-nums",
          big ? "min-w-14 px-2 text-4xl" : "min-w-10 px-1 text-xl",
          crit ? "text-heal" : fumble ? "text-danger" : "text-strong",
          onReroll && "hover:bg-surface-3",
        )}
        onClick={onReroll}
        disabled={!onReroll}
        title={onReroll ? "Roll again" : undefined}
      >
        {roll.total}
      </button>
    </div>
  );
}
