import clsx from "clsx";
import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { Dialog } from "../components/Dialog";
import { canStrike, threatOf } from "../game/region";
import { allFactions, liveHours, startTownBattle } from "../game/town-store";
import { num } from "../game/tuning";
import { TERRAIN, WORLD_H, WORLD_W, dist, inSight, terrainAt, travelHours, type Band, type Patch, type Place } from "../game/world";
import { beginAt, enterWorld, fightBand, marchTo, pauseMarch, resumeMarch, saveMarch, setSpeed, slipAway, useWorld, worldOf } from "../game/world-store";
import { chosenParty } from "../game/party-store";
import { useActiveProfile, usePlayers } from "../store/players";

/**
 * The world map: the company marches across the land (click anywhere, or on a
 * place), the clock runs only while it moves, bands roam and give chase, and
 * arriving somewhere opens what can be done there.
 */

const PLACE_ICON: Record<Place["kind"], string> = { home: "⛺", village: "🛖", town: "🏘️", city: "🏰", lair: "💀", site: "🏚️" };
const FOE_ICON: Record<string, string> = { wolves: "🐺", bandits: "🗡️", goblins: "👺", undead: "💀", vermin: "🐀", cultists: "🕯️", gnolls: "🐗" };
const PATCH_ICON: Partial<Record<Patch["terrain"], string>> = { forest: "🌲", hills: "⛰️", marsh: "🌾" };

const clock = (hours: number) => `Day ${Math.floor(hours / 24) + 1}, ${String(Math.floor(hours % 24)).padStart(2, "0")}:00`;

function patchPath(p: Patch): string {
  const n = p.bumps.length;
  const pts = p.bumps.map((b, i) => {
    const a = (i / n) * Math.PI * 2;
    return [p.x + Math.cos(a) * p.r * b, p.y + Math.sin(a) * p.r * b] as const;
  });
  // A smooth closed curve through the points.
  const mid = (i: number) => {
    const [x1, y1] = pts[i % n]!;
    const [x2, y2] = pts[(i + 1) % n]!;
    return [(x1 + x2) / 2, (y1 + y2) / 2] as const;
  };
  let d = `M ${mid(0)[0]} ${mid(0)[1]}`;
  for (let i = 1; i <= n; i++) d += ` Q ${pts[i % n]![0]} ${pts[i % n]![1]} ${mid(i)[0]} ${mid(i)[1]}`;
  return d + " Z";
}

export function WorldView({ onGoTown, onAdventure }: { onGoTown: () => void; onAdventure: () => void }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const s = useWorld();
  const world = worldOf(doc);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    enterWorld();
    return () => {
      // Leaving the map stops the march (and saves it).
      if (useWorld.getState().running) pauseMarch();
      else saveMarch();
    };
  }, []);

  const scatter = useMemo(
    () =>
      (world?.patches ?? []).flatMap((p) => {
        const icon = PATCH_ICON[p.terrain];
        if (!icon) return [];
        const n = Math.round((p.r * p.r) / 500);
        return Array.from({ length: n }, (_, i) => {
          const a = (i * 2.399) % (Math.PI * 2);
          const r = Math.sqrt((i + 0.5) / n) * p.r * 0.85;
          return { key: `${p.id}-${i}`, icon, x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
        });
      }),
    [world],
  );

  if (!doc?.world || !world || !s.pos) {
    return <p className="text-sm text-muted italic">{doc?.town ? "Unrolling the map…" : "Found your town first: the company needs a camp to set out from."}</p>;
  }
  const pos = s.pos;
  const seen = new Set(doc.world.seen);
  const visible = (p: Place) => p.kind === "home" || p.kind === "village" || p.kind === "town" || p.kind === "city" || seen.has(p.id) || inSight(p, pos);
  const here = s.at ? world.places.find((p) => p.id === s.at) : undefined;
  const dest = s.dest;
  const eta = dest ? travelHours(world, pos, dest) : 0;
  const ground = TERRAIN[terrainAt(world, pos)];
  const party = chosenParty();

  const click = (e: MouseEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (!el) return;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse());
    const place = world.places.find((q) => visible(q) && dist(q, p) < 16);
    marchTo(place ? { x: place.x, y: place.y } : { x: p.x, y: p.y }, place?.id ?? null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <div className="relative overflow-hidden rounded-xl border border-line shadow-inner">
        <svg ref={svg} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} className="block w-full cursor-crosshair select-none" onClick={click} role="img" aria-label="World map">
          <defs>
            <radialGradient id="fog">
              <stop offset="0.7" stopColor="black" stopOpacity="0" />
              <stop offset="1" stopColor="black" stopOpacity="0.28" />
            </radialGradient>
            <mask id="sight">
              <rect width={WORLD_W} height={WORLD_H} fill="white" />
              <circle cx={pos.x} cy={pos.y} r={num("world.sight")} fill="black" />
            </mask>
          </defs>
          <rect width={WORLD_W} height={WORLD_H} fill={TERRAIN.plains.color} />
          {world.patches.map((p) => (
            <path key={p.id} d={patchPath(p)} fill={TERRAIN[p.terrain].color} stroke="rgba(0,0,0,0.12)" strokeWidth={2} />
          ))}
          {scatter.map((t) => (
            <text key={t.key} x={t.x} y={t.y} fontSize={14} textAnchor="middle" dominantBaseline="middle" opacity={0.8}>
              {t.icon}
            </text>
          ))}
          {world.roads.map((r, i) => {
            const d = `M ${r[0]!.x} ${r[0]!.y} Q ${r[1]!.x} ${r[1]!.y} ${r[2]!.x} ${r[2]!.y}`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={TERRAIN.road.color} strokeWidth={9} strokeLinecap="round" opacity={0.85} />
                <path d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="6 8" />
              </g>
            );
          })}
          {/* The company's route */}
          {dest && <line x1={pos.x} y1={pos.y} x2={dest.x} y2={dest.y} stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="7 6" opacity={0.85} />}
          {dest && (
            <text x={dest.x} y={dest.y} fontSize={16} textAnchor="middle" dominantBaseline="middle" fill="var(--accent)">
              ✖
            </text>
          )}
          {world.places.map((p) => {
            const show = visible(p);
            return (
              <g key={p.id} opacity={show ? 1 : 0.55}>
                <circle cx={p.x} cy={p.y} r={p.kind === "city" ? 17 : 14} fill="rgba(255,250,235,0.75)" stroke={p.kind === "lair" ? "var(--danger)" : p.kind === "home" ? "var(--accent)" : "rgba(0,0,0,0.25)"} strokeWidth={2} />
                <text x={p.x} y={p.y + 1} fontSize={p.kind === "city" ? 20 : 17} textAnchor="middle" dominantBaseline="middle">
                  {show ? PLACE_ICON[p.kind] : "❔"}
                </text>
                {show && (
                  <text x={p.x} y={p.y + 27} fontSize={12} textAnchor="middle" fontWeight={600} fill="#2d2416" stroke="rgba(255,250,235,0.85)" strokeWidth={3} paintOrder="stroke">
                    {p.name}
                  </text>
                )}
              </g>
            );
          })}
          {/* Fog beyond the company's sight */}
          <rect width={WORLD_W} height={WORLD_H} fill="rgba(30,30,45,0.22)" mask="url(#sight)" pointerEvents="none" />
          {s.bands
            .filter((b) => inSight(b, pos))
            .map((b) => (
              <BandToken key={b.id} band={b} chasing={dist(b, pos) < num("world.bandSight")} pos={pos} />
            ))}
          {/* The company */}
          <g style={{ transition: "transform 100ms linear" }} transform={`translate(${pos.x} ${pos.y})`}>
            <circle r={13} fill="var(--accent)" stroke="white" strokeWidth={2.5} />
            <text fontSize={15} textAnchor="middle" dominantBaseline="middle" y={1}>
              🚩
            </text>
            <text y={-19} fontSize={11} textAnchor="middle" fontWeight={700} fill="white" stroke="var(--accent)" strokeWidth={3} paintOrder="stroke">
              {party.length} ⚔
            </text>
          </g>
        </svg>
        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-surface/85 px-2 py-1 text-xs shadow">
          🕰 {clock((doc.town ? liveHours(doc.town) : 0) + s.bank)} · {ground.name}
        </div>
      </div>

      <aside className="space-y-3">
        <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="The march">
          <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🚩 The company</h3>
          <p className="text-sm">
            {party.length ? party.map((e) => e.label).join(", ") : <span className="text-danger">Nobody fit to march.</span>}
          </p>
          <div className="flex items-center gap-1">
            {s.running ? (
              <button className="btn px-3 text-sm" onClick={pauseMarch}>
                ⏸ Halt
              </button>
            ) : (
              <button className="btn px-3 text-sm" disabled={!dest} onClick={resumeMarch}>
                ▶ March
              </button>
            )}
            {([1, 2, 4] as const).map((k) => (
              <button key={k} className={clsx("btn px-2 text-xs", s.speed === k && "border-accent text-accent")} onClick={() => setSpeed(k)} aria-pressed={s.speed === k}>
                ×{k}
              </button>
            ))}
          </div>
          {dest ? (
            <p className="text-xs text-muted">
              {s.destPlace ? `To ${world.places.find((p) => p.id === s.destPlace)?.name}` : "Across country"}: about {Math.max(1, Math.round(eta))} h on foot.
            </p>
          ) : (
            <p className="text-xs text-muted">Click the map to march. Time passes only while the company is on the move.</p>
          )}
          <p className="text-[11px] text-faint">Roads are fast; forests, hills and marsh are slow. Bands that spot you give chase; settlements are safe ground.</p>
        </section>
        {here && <PlacePanel place={here} onGoTown={onGoTown} onAdventure={onAdventure} />}
        <Legend />
      </aside>

      <Dialog open={!!s.encounter} onClose={() => {}} title={s.encounter ? `${FOE_ICON[s.encounter.foe] ?? "⚔"} ${s.encounter.name}!` : ""}>
        {s.encounter && (
          <div className="space-y-3">
            <p>{s.encounter.from ? "A war band out of their lair has caught up with the company." : "Something on the road has caught the company's scent."}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={fightBand}>
                ⚔ Stand and fight
              </button>
              <button className="btn" onClick={slipAway} title={`The party's best Stealth against DC ${num("world.slipDc")}; on a failure they fight anyway`}>
                🫥 Try to slip away
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function BandToken({ band: b, chasing, pos }: { band: Band; chasing: boolean; pos: { x: number; y: number } }) {
  return (
    <g>
      {chasing && <line x1={b.x} y1={b.y} x2={pos.x} y2={pos.y} stroke="var(--danger)" strokeWidth={1.5} strokeDasharray="3 5" opacity={0.7} />}
      <g transform={`translate(${b.x} ${b.y})`} style={{ transition: "transform 100ms linear" }}>
        <circle r={11} fill="rgba(140,30,30,0.85)" stroke="white" strokeWidth={1.5} />
        <text fontSize={13} textAnchor="middle" dominantBaseline="middle" y={1}>
          {FOE_ICON[b.foe] ?? "⚔"}
        </text>
        <text y={22} fontSize={10} textAnchor="middle" fontWeight={700} fill="#7a1c1c" stroke="rgba(255,250,235,0.85)" strokeWidth={3} paintOrder="stroke">
          {b.name}
        </text>
      </g>
    </g>
  );
}

function PlacePanel({ place, onGoTown, onAdventure }: { place: Place; onGoTown: () => void; onAdventure: () => void }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const faction = place.kind === "lair" ? allFactions().find((f) => f.id === place.ref) : undefined;
  return (
    <section className="space-y-2 rounded-lg border border-accent/60 bg-surface p-3 shadow" aria-label={`At ${place.name}`}>
      <h3 className="font-display text-lg text-accent">
        {PLACE_ICON[place.kind]} {place.name}
      </h3>
      {place.kind === "home" && (
        <>
          <p className="text-sm text-muted">The company's camp. Rest, mend, buy and forge here.</p>
          <button className="btn" onClick={onGoTown}>
            ⛺ Into the camp
          </button>
        </>
      )}
      {(place.kind === "village" || place.kind === "town" || place.kind === "city") && (
        <p className="text-sm text-muted">
          A {place.kind} known for {place.known}. Its people eye the company warily: work and trade here come with the next step of the road.
        </p>
      )}
      {place.kind === "site" && (
        <>
          <p className="text-sm text-muted">Something waits here.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              beginAt(place);
              onAdventure();
            }}
          >
            📜 Begin: {place.name}
          </button>
        </>
      )}
      {faction && doc?.town && (
        <>
          <p className="text-sm text-muted">{faction.description}</p>
          {canStrike(threatOf(doc.town, faction.id), faction, doc.renown) ? (
            <button className="btn btn-primary" onClick={() => startTownBattle("lair", faction.id)}>
              ⚔ Attack the lair
            </button>
          ) : (
            <p className="text-xs text-warn">{threatOf(doc.town, faction.id).stage === "defeated" ? "Broken: nobody home." : `Too strong for now: needs renown ${faction.minRenown}.`}</p>
          )}
        </>
      )}
    </section>
  );
}

function Legend() {
  return (
    <section className="rounded-lg border border-line bg-surface p-3 text-xs text-muted shadow" aria-label="Legend">
      <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">Legend</h3>
      <ul className="grid grid-cols-2 gap-1">
        <li>⛺ Your camp</li>
        <li>🛖 🏘️ 🏰 Settlements</li>
        <li>🏚️ Adventure</li>
        <li>💀 Lair</li>
        <li>🌲 Forest (slow)</li>
        <li>⛰️ Hills (slow)</li>
      </ul>
    </section>
  );
}
