import clsx from "clsx";
import { useMemo } from "react";
import type { Faction, Threat } from "../domain/faction";
import type { Town } from "../domain/town";
import { canStrike, STAGE_TEXT, threatOf } from "../game/region";
import { intrigueOn } from "../game/guilds";
import { allFactions, startTownBattle } from "../game/town-store";
import { useGame } from "../store/game";
import { useActiveProfile, usePlayers } from "../store/players";

/**
 * A simple map of the region around the player's town: the town in the
 * middle, other heroes' towns nearby, and the factions' lairs further out
 * (the more renown a faction needs, the further away). Lines show who is
 * watching, demanding or coming to raid.
 */

const W = 360;
const H = 260;
const C = { x: W / 2, y: H / 2 };

/** A stable angle for a name, so lairs don't move around between visits. */
function angleOf(id: string, i: number, n: number): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // Spread evenly, nudged by the name.
  return ((i + 0.5) / Math.max(1, n)) * Math.PI * 2 + ((h % 100) / 100 - 0.5) * 0.6;
}

const at = (angle: number, r: number) => ({ x: C.x + Math.cos(angle) * r * (W / 2 - 28), y: C.y + Math.sin(angle) * r * (H / 2 - 24) });

const STAGE_COLOR: Partial<Record<Threat["stage"], string>> = {
  watching: "var(--warn)",
  demanding: "var(--warn)",
  raiding: "var(--danger)",
  friendly: "var(--heal)",
};

export function RegionMap({ town: t, renown }: { town: Town; renown: number }) {
  useGame((s) => s.library.factions);
  const me = useActiveProfile((s) => s.id);
  const profiles = usePlayers((s) => s.profiles);
  const docs = usePlayers((s) => s.docs);
  const factions = allFactions();
  const others = intrigueOn() ? profiles.filter((p) => p.id !== me && docs[p.id]?.town && !docs[p.id]?.residence) : [];

  const lairs = useMemo(
    () =>
      factions.map((f, i) => {
        const r = Math.min(1, 0.72 + 0.1 * Math.max(0, f.minRenown - 1));
        return { f, ...at(angleOf(f.id, i, factions.length), r) };
      }),
    [factions],
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-line bg-map-bg" role="img" aria-label="Map of the region">
      <defs>
        <marker id="raid-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--danger)" />
        </marker>
      </defs>
      {/* Roads to the other heroes' towns */}
      {others.map((p, i) => {
        const pos = at(angleOf(p.id, i, others.length) + Math.PI / others.length, 0.3);
        const town = docs[p.id]!.town!;
        return (
          <g key={p.id}>
            <line x1={C.x} y1={C.y} x2={pos.x} y2={pos.y} stroke="var(--faint)" strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
            <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={16}>
              🏘
            </text>
            <text x={pos.x} y={pos.y + 18} textAnchor="middle" fontSize={8} fill="var(--muted)">
              {town.name} ({p.name})
            </text>
          </g>
        );
      })}
      {/* Factions */}
      {lairs.map(({ f, x, y }) => {
        const th = threatOf(t, f.id);
        const unknown = renown < f.minRenown && th.stage === "quiet";
        const color = STAGE_COLOR[th.stage];
        const raid = th.stage === "raiding";
        return (
          <g key={f.id} className={clsx(canStrike(th, f, renown) && "cursor-pointer")} onClick={() => strike(f, th, renown)}>
            <title>{unknown ? `Somewhere far away: you'd need renown ${f.minRenown} to learn more` : `${f.name}: ${STAGE_TEXT[th.stage]}${canStrike(th, f, renown) ? ". Click to strike their lair." : ""}`}</title>
            {color && !unknown && th.stage !== "quiet" && (
              <line
                x1={x}
                y1={y}
                x2={C.x + (x - C.x) * 0.18}
                y2={C.y + (y - C.y) * 0.18}
                stroke={color}
                strokeWidth={raid ? 2.5 : 1.5}
                strokeDasharray={th.stage === "friendly" ? undefined : raid ? "6 4" : "2 4"}
                markerEnd={raid ? "url(#raid-arrow)" : undefined}
              >
                {raid && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />}
              </line>
            )}
            <circle cx={x} cy={y} r={14} fill="var(--surface)" stroke={unknown ? "var(--line)" : (color ?? "var(--line)")} strokeWidth={1.5} opacity={th.stage === "defeated" ? 0.5 : 1} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize={14} opacity={th.stage === "defeated" ? 0.4 : 1}>
              {unknown ? "?" : f.icon}
            </text>
            {th.stage === "defeated" && (
              <text x={x} y={y + 6} textAnchor="middle" fontSize={20} fill="var(--danger)">
                ✕
              </text>
            )}
            <text x={x} y={y + 25} textAnchor="middle" fontSize={8} fill={unknown ? "var(--faint)" : "var(--text)"}>
              {unknown ? "Unknown lands" : f.name}
            </text>
          </g>
        );
      })}
      {/* Home */}
      <circle cx={C.x} cy={C.y} r={18} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
      <text x={C.x} y={C.y + 6} textAnchor="middle" fontSize={18}>
        🏰
      </text>
      <text x={C.x} y={C.y + 30} textAnchor="middle" fontSize={9} fontWeight="bold" fill="var(--accent)">
        {t.name}
      </text>
    </svg>
  );
}

function strike(f: Faction, th: Threat, renown: number) {
  if (!canStrike(th, f, renown)) return;
  if (confirm(`Strike ${f.name}'s lair now?`)) startTownBattle("lair", f.id);
}
