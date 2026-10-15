import clsx from "clsx";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Dialog } from "../components/Dialog";
import { canStrike, threatOf } from "../game/region";
import { allFactions, liveHours, startTownBattle } from "../game/town-store";
import { num } from "../game/tuning";
import { TERRAIN, WORLD_H, WORLD_W, dist, inSight, isExplored, terrainAt, travelHours, type Place, type Pt } from "../game/world";
import { beginAt, enterWorld, fightBand, marchTo, pauseMarch, resumeMarch, saveMarch, setSpeed, slipAway, useWorld, worldOf } from "../game/world-store";
import { chosenParty } from "../game/party-store";
import { useActiveProfile, usePlayers } from "../store/players";
import { Compass, ExploredMask, INK, InkBand, InkCompany, InkDefs, InkLand, InkPlace, InkRoads, PAPER, RED } from "./InkMap";

/**
 * The world map, drawn in pen and ink: the company marches across the land
 * (click anywhere, or on a place), the clock runs only while it moves, the
 * map fills in as they explore, bands roam and give chase, and arriving
 * somewhere opens what can be done there. The view follows the company;
 * drag to look around, scroll or use +/− to zoom.
 */

const PLACE_ICON: Record<Place["kind"], string> = { home: "⛺", village: "🛖", town: "🏘️", city: "🏰", lair: "💀", site: "🏚️" };
const FOE_ICON: Record<string, string> = { wolves: "🐺", bandits: "🗡️", goblins: "👺", undead: "💀", vermin: "🐀", cultists: "🕯️", gnolls: "🐗" };

const clock = (hours: number) => `Day ${Math.floor(hours / 24) + 1}, ${String(Math.floor(hours % 24)).padStart(2, "0")}:00`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function WorldView({ onGoTown, onAdventure }: { onGoTown: () => void; onAdventure: () => void }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const s = useWorld();
  const world = worldOf(doc);
  const svg = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1.8);
  const [look, setLook] = useState<Pt | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; start: Pt } | null>(null);

  useEffect(() => {
    enterWorld();
    return () => {
      // Leaving the map stops the march (and saves it).
      if (useWorld.getState().running) pauseMarch();
      else saveMarch();
    };
  }, []);
  // Marching brings the view back to the company.
  useEffect(() => {
    if (s.running) setLook(null);
  }, [s.running]);

  if (!doc?.world || !world || !s.pos) {
    return <p className="text-sm text-muted italic">{doc?.town ? "Unrolling the map…" : "Found your town first: the company needs a camp to set out from."}</p>;
  }
  const pos = s.pos;
  const seen = new Set(doc.world.seen);
  const known = (p: Place) => p.kind === "home" || p.kind === "village" || p.kind === "town" || p.kind === "city" || seen.has(p.id) || inSight(p, pos) || isExplored(s.explored, p);
  const here = s.at ? world.places.find((p) => p.id === s.at) : undefined;
  const dest = s.dest;
  const eta = dest ? travelHours(world, pos, dest) : 0;
  const ground = TERRAIN[terrainAt(world, pos)];
  const party = chosenParty();

  // The camera: centred on the company (or wherever the player dragged), kept on the map.
  const vw = WORLD_W / zoom;
  const vh = WORLD_H / zoom;
  const centre = look ?? pos;
  const vx = clamp(centre.x - vw / 2, 0, WORLD_W - vw);
  const vy = clamp(centre.y - vh / 2, 0, WORLD_H - vh);

  const toWorld = (clientX: number, clientY: number): Pt => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false, start: { x: vx + vw / 2, y: vy + vh / 2 } };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !svg.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 5) d.moved = true;
    if (!d.moved) return;
    const k = vw / svg.current.getBoundingClientRect().width;
    setLook({ x: d.start.x - dx * k, y: d.start.y - dy * k });
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const p = toWorld(e.clientX, e.clientY);
    const place = world.places.find((q) => known(q) && dist(q, p) < 18);
    marchTo(place ? { x: place.x, y: place.y } : p, place?.id ?? null);
  };
  const wheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 4));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <div className="relative overflow-hidden rounded-xl border-2 shadow-inner" style={{ borderColor: INK, background: PAPER }}>
        <svg
          ref={svg}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className="block aspect-[1000/640] w-full cursor-crosshair touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onWheel={wheel}
          role="img"
          aria-label="World map"
        >
          <InkDefs />
          <ExploredMask explored={s.explored} sight={num("world.sight")} pos={pos} />
          <rect width={WORLD_W} height={WORLD_H} fill={PAPER} />
          <rect width={WORLD_W} height={WORLD_H} fill="url(#ink-dots)" />
          <g mask="url(#ink-explored)">
            <rect width={WORLD_W} height={WORLD_H} fill={PAPER} />
            <InkLand world={world} />
            <InkRoads world={world} />
          </g>
          {/* The company's route */}
          {dest && <line x1={pos.x} y1={pos.y} x2={dest.x} y2={dest.y} stroke={RED} strokeWidth={1.4} strokeDasharray="1 4" strokeLinecap="round" />}
          {dest && <path d={`M ${dest.x - 5} ${dest.y - 5} L ${dest.x + 5} ${dest.y + 5} M ${dest.x + 5} ${dest.y - 5} L ${dest.x - 5} ${dest.y + 5}`} stroke={RED} strokeWidth={2} strokeLinecap="round" />}
          {world.places.map((p) => (
            <InkPlace key={p.id} place={p} known={known(p)} here={p.id === s.at} />
          ))}
          {s.bands
            .filter((b) => inSight(b, pos))
            .map((b) => (
              <InkBand key={b.id} band={b} chasing={dist(b, pos) < num("world.bandSight")} pos={pos} />
            ))}
          <InkCompany pos={pos} trail={s.trail} marching={s.running} count={party.length} />
          {/* The edge of sight */}
          <circle cx={pos.x} cy={pos.y} r={num("world.sight")} fill="none" stroke={INK} strokeWidth={0.6} strokeDasharray="1 5" opacity={0.5} pointerEvents="none" />
        </svg>
        <div className="pointer-events-none absolute top-2 left-2 rounded-sm border px-2 py-0.5 text-sm" style={{ borderColor: INK, background: PAPER, color: INK, fontFamily: "'IM Fell English', serif" }}>
          {clock((doc.town ? liveHours(doc.town) : 0) + s.bank)} · {ground.name}
        </div>
        <div className="pointer-events-none absolute right-2 bottom-2">
          <Compass />
        </div>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {[
            ["+", () => setZoom((z) => clamp(z * 1.3, 1, 4)), "Zoom in"],
            ["−", () => setZoom((z) => clamp(z / 1.3, 1, 4)), "Zoom out"],
            ["⌖", () => setLook(null), "Back to the company"],
          ].map(([label, onClick, title]) => (
            <button
              key={label as string}
              className="grid h-7 w-7 place-items-center rounded-sm border text-base leading-none"
              style={{ borderColor: INK, background: PAPER, color: INK }}
              onClick={onClick as () => void}
              title={title as string}
              aria-label={title as string}
            >
              {label as string}
            </button>
          ))}
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
      <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">How to read the map</h3>
      <ul className="space-y-0.5">
        <li>Blank paper: land the company hasn't seen yet. It fills in as they march.</li>
        <li>Dotted lines are roads (quick). Forests, mountains and marsh are slow.</li>
        <li>Hexagons are settlements, ? is a place not yet found, red rings are bands on the move.</li>
        <li>Drag to look around, scroll or +/− to zoom, ⌖ back to the company.</li>
      </ul>
    </section>
  );
}
