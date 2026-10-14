import clsx from "clsx";
import { useEffect, useState } from "react";
import { Dialog } from "../components/Dialog";
import type { Faction } from "../domain/faction";
import type { Town } from "../domain/town";
import { militia, raidOdds, raidStrength } from "../game/region";
import { clockText, durationText, working } from "../game/town";
import { allFactions, liveHours, readRaidNews, useTownUi } from "../game/town-store";
import { usePlay } from "../game/store";
import { activeDoc, usePlayers } from "../store/players";
import { useGame } from "../store/game";

/**
 * Raids, wherever the player is: a bar with what's coming and how the
 * militia would fare, and a report of what happened while the heroes were
 * elsewhere (shown once, never in the middle of a battle).
 */

/** The player's own town, when they live in it. */
function useOwnTown(): Town | null {
  usePlayers((s) => s.docs);
  const doc = activeDoc();
  return doc?.town && !doc.residence ? doc.town : null;
}

/** Re-renders every few seconds so countdowns follow the clock. */
function useNow(ms = 5_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** How the town's own people would fare against this faction's raiders. */
export function militiaChances(t: Town, f: Faction): { line: string; likely: string } {
  const m = militia(t, working(t, "watchtower"));
  const strength = raidStrength(f);
  const o = raidOdds(m, strength);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const likely = o.repel >= 0.5 ? "drive them off" : o.plunder >= 0.5 ? "be overrun" : "hold, with some losses";
  return {
    likely,
    line: `Militia: ${m.parts.join(", ")} + d6 against strength ${strength}. Drive off ${pct(o.repel)} · hold ${pct(o.hold)} · overrun ${pct(o.plunder)}.`,
  };
}

/** Tribute demands and coming raids, in one line each. */
export function ThreatBar({ compact, onGoTown }: { compact?: boolean; onGoTown?: () => void }) {
  useGame((s) => s.library.factions);
  const t = useOwnTown();
  const now = useNow();
  if (!t) return null;
  const hours = liveHours(t, now);
  const factions = allFactions();
  const urgent = t.threats.filter((th) => (th.stage === "demanding" || th.stage === "raiding") && th.dueAt !== undefined);
  if (!urgent.length) return null;
  return (
    <div className={clsx("space-y-1", compact && "text-xs")} role="status" aria-label="Threats to your town">
      {urgent.map((th) => {
        const f = factions.find((x) => x.id === th.faction);
        if (!f) return null;
        const left = Math.max(0, th.dueAt! - hours);
        const when = `${left < 1 ? "within the hour" : `in ${durationText(Math.ceil(left))}`} (${clockText(th.dueAt!)})`;
        const raid = th.stage === "raiding";
        return (
          <div key={th.faction} className={clsx("flex flex-wrap items-center gap-x-2 rounded-md border border-danger/60 bg-danger/10", compact ? "px-2 py-1" : "px-3 py-2 text-sm")}>
            <span>{f.icon}</span>
            <span className="min-w-0 flex-1">
              <strong className="text-strong">{raid ? `${f.name} will raid ${t.name} ${when}.` : `${f.name} demand ${th.demand} gold ${when}.`}</strong>{" "}
              <span className="text-muted">{raid ? `If the heroes aren't there, the militia will likely ${militiaChances(t, f).likely}.` : "Unpaid, it becomes a raid."}</span>
            </span>
            {onGoTown && (
              <button className="btn px-2 py-0.5 text-xs" onClick={onGoTown}>
                🏘 To town
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const HEADLINE = { repelled: "Raid driven off", held: "Raid held at the gate", plundered: "The town was plundered" } as const;

/** What happened in the raids the player didn't see. Waits until no battle and no other report is open. */
export function RaidNewsDialog() {
  useGame((s) => s.library.factions);
  const t = useOwnTown();
  const inBattle = usePlay((s) => !!s.game);
  const otherReport = useTownUi((s) => !!s.report);
  const news = t?.raidNews ?? [];
  const open = !!t && news.length > 0 && !inBattle && !otherReport;
  const factions = allFactions();
  return (
    <Dialog open={open} onClose={readRaidNews} title={news.length > 1 ? "📯 News of raids" : "📯 News of a raid"}>
      {t && (
        <div className="space-y-3 text-sm">
          {news.map((n, i) => {
            const f = factions.find((x) => x.id === n.faction);
            return (
              <article key={i} className={clsx("rounded-md border p-3", n.result === "repelled" ? "border-heal/60 bg-heal/10" : "border-danger/60 bg-danger/10")}>
                <h4 className={clsx("font-display text-base font-bold", n.result === "repelled" ? "text-heal" : "text-danger")}>
                  {f?.icon} {HEADLINE[n.result]}
                </h4>
                <p className="text-xs text-faint">
                  {clockText(n.at)} · {f?.name ?? "Raiders"}
                </p>
                <p className="mt-1">
                  {n.by === "heroes"
                    ? "The heroes fell back and the raiders went through the town."
                    : n.result === "repelled"
                      ? "With the heroes away, the settlers took up arms and drove the raiders off. The town is proud of them."
                      : n.result === "held"
                        ? "With the heroes away, the settlers held the gate, but raiders slipped past and took some stores."
                        : "With the heroes away, the settlers couldn't stop them."}
                </p>
                {n.detail && <p className="mt-1 text-xs text-muted">{n.detail}.</p>}
                {n.lost && <p className="mt-1 font-semibold text-danger">Lost: {n.lost}.</p>}
              </article>
            );
          })}
          {news.some((n) => n.result !== "repelled") && (
            <p className="text-xs text-muted">
              More settlers and staffed watchtowers make a stronger militia. Paying tribute, defending in person, or breaking the faction's lair stops raids
              altogether.
            </p>
          )}
          <div className="text-right">
            <button className="btn btn-primary font-display" onClick={readRaidNews}>
              Understood
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
