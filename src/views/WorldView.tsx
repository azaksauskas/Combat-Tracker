import clsx from "clsx";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Dialog } from "../components/Dialog";
import { canStrike, threatOf } from "../game/region";
import { allFactions, liveHours, startTownBattle } from "../game/town-store";
import { num } from "../game/tuning";
import { TERRAIN, WORLD_H, WORLD_W, dist, inSight, isExplored, terrainAt, travelHours, type Place, type Pt } from "../game/world";
import { afterOutcome, beginAt, boardAt, buyAt, canChoose, choose, doDeed, doneToday, enterWorld, helloFrom, fightBand, passBy, talkTo, townsfolkAt, hireAt, marchTo, packRations, pauseMarch, raidDen, recruitsAt, resumeMarch, saveMarch, setSpeed, slipAway, takeContract, tradeHorses, useWorld, worldOf } from "../game/world-store";
import { availableMembers, chosenParty, myCharacters } from "../game/party-store";
import { costOf, horsePriceAt, isSettlement, priceOf, repText, sells, wageOf } from "../game/company";
import { BUILDING, DEEDS, ROLE, buildingsOf, deedCost } from "../game/settlement";
import { SettlementScene, Figure, useTownUi } from "./SettlementScene";
import { TRAITS } from "../game/roster";
import { useActiveProfile, usePlayers } from "../store/players";
import { EVENTS, eventDef, MARKS } from "../game/events";
import { Compass, ExploredMask, INK, InkBand, InkCompany, InkDefs, InkEvent, InkPlace, InkVignette, PAPER, RED, useBakedLand, useFogImage } from "./InkMap";

/**
 * The world map, drawn in pen and ink: the company marches across the land
 * (click anywhere, or on a place), the clock runs only while it moves, the
 * map fills in as they explore, bands roam and give chase, and arriving
 * somewhere opens what can be done there. The view follows the company;
 * drag to look around, scroll or use +/− to zoom.
 */

const PLACE_ICON: Record<Place["kind"], string> = { home: "⛺", village: "🛖", town: "🏘️", city: "🏰", lair: "💀", site: "🏚️", den: "🐾", mark: "🗿" };
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
  // Arriving at a settlement goes into its streets; the map is one click away.
  const [inside, setInside] = useState(false);
  useEffect(() => {
    const place = s.at ? worldOf(usePlayers.getState().docs[id])?.places.find((p) => p.id === s.at) : undefined;
    setInside(isSettlement(place));
    if (isSettlement(place)) useTownUi.setState({ building: "board" });
  }, [s.at, id]);
  // The land is drawn once into a picture; the fog only changes when new ground is seen.
  const { url: land, baker } = useBakedLand(world);
  const fog = useFogImage(s.explored);

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
  const eta = dest ? travelHours(world, pos, dest) / ((doc.world.horses ? num("world.horseSpeed") : 1) * (doc.world.hungry ? num("company.hungrySlow") : 1)) : 0;
  const ground = TERRAIN[terrainAt(world, pos)];
  const party = chosenParty();
  const visibleEvents = s.events.filter((e) => inSight(e, pos) || isExplored(s.explored, e));
  const done = new Set(doc.world.done);

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
    const ev = visibleEvents.find((q) => dist(q, p) < 16);
    if (ev) return marchTo({ x: ev.x, y: ev.y });
    const place = world.places.find((q) => known(q) && dist(q, p) < 18);
    marchTo(place ? { x: place.x, y: place.y } : p, place?.id ?? null);
  };
  const wheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 4));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      {inside && here && isSettlement(here) ? (
        <SettlementScene place={here} folk={townsfolkAt(here)} onLeave={() => setInside(false)} />
      ) : (
      <div className="relative self-start overflow-hidden rounded-xl border-2 shadow-inner" style={{ borderColor: INK, background: PAPER }}>
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
          <ExploredMask fog={fog} sight={num("world.sight")} pos={pos} />
          <rect width={WORLD_W} height={WORLD_H} fill={PAPER} />
          <rect width={WORLD_W} height={WORLD_H} fill="url(#ink-dots)" />
          <g mask="url(#ink-explored)">
            <rect width={WORLD_W} height={WORLD_H} fill={PAPER} />
            {land && <image href={land} x={0} y={0} width={WORLD_W} height={WORLD_H} preserveAspectRatio="none" />}
          </g>
          {/* The company's route */}
          {dest && <line x1={pos.x} y1={pos.y} x2={dest.x} y2={dest.y} stroke={RED} strokeWidth={1.4} strokeDasharray="1 4" strokeLinecap="round" />}
          {dest && <path d={`M ${dest.x - 5} ${dest.y - 5} L ${dest.x + 5} ${dest.y + 5} M ${dest.x + 5} ${dest.y - 5} L ${dest.x - 5} ${dest.y + 5}`} stroke={RED} strokeWidth={2} strokeLinecap="round" />}
          {world.places.map((p) => (
            <InkPlace key={p.id} place={p} known={known(p)} here={p.id === s.at} done={done.has(p.id)} />
          ))}
          {visibleEvents.map((e) => (
            <InkEvent key={e.id} x={e.x} y={e.y} look={EVENTS[e.kind]?.look ?? "figure"} />
          ))}
          {s.bands
            .filter((b) => inSight(b, pos) || b.contract)
            .map((b) => (
              <InkBand key={b.id} band={b} chasing={dist(b, pos) < num("world.bandSight")} pos={pos} />
            ))}
          <InkCompany pos={pos} trail={s.trail} marching={s.running} count={party.length} riding={doc.world.horses} />
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
      )}
      {baker}
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
        <CompanyPurse />
        {here && <PlacePanel place={here} onGoTown={onGoTown} onAdventure={onAdventure} inside={inside} onEnter={() => setInside(true)} />}
        <Legend />
      </aside>

      <Happening />
      {here && <Talk place={here} />}
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

function PlacePanel({ place, onGoTown, onAdventure, inside, onEnter }: { place: Place; onGoTown: () => void; onAdventure: () => void; inside: boolean; onEnter: () => void }) {
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
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted">Pack rations from the camp's food ({Math.floor(doc?.town?.food ?? 0)}):</span>
            {[5, 10, 20].map((n) => (
              <button key={n} className="btn px-2 py-0 text-xs" disabled={(doc?.town?.food ?? 0) < 1} onClick={() => packRations(n)}>
                +{n}
              </button>
            ))}
          </div>
        </>
      )}
      {isSettlement(place) && (
        <>
          {!inside && (
            <button className="btn btn-primary" onClick={onEnter}>
              🚪 Into {place.name}
            </button>
          )}
          <Settlement place={place} />
        </>
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
      {place.kind === "den" && <Den place={place} />}
      {place.kind === "mark" && (
        <>
          <p className="text-sm text-muted">{MARKS[place.ref ?? ""]?.text}</p>
          {doc?.world?.done.includes(place.id) ? (
            <p className="text-xs text-faint">The company has seen what there is to see here.</p>
          ) : (
            <button className="btn btn-primary" onClick={() => useWorld.setState({ happening: { id: place.id, kind: place.ref ?? "", mark: true } })}>
              🔍 Look closer
            </button>
          )}
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

/** Talking to someone in the street: a greeting, then what they know. */
function Talk({ place }: { place: Place }) {
  const who = useTownUi((s) => s.talk);
  const [said, setSaid] = useState<{ hello: string; told: string } | null>(null);
  useEffect(() => setSaid(who ? { hello: helloFrom(place, who), told: "" } : null), [who, place]);
  const close = () => useTownUi.setState({ talk: null });
  return (
    <Dialog open={!!who} onClose={close} title={who ? `${who.name}, ${ROLE[who.role].title}` : ""}>
      {who && said && (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <svg viewBox="-20 -62 40 66" className="h-24 w-16 shrink-0" aria-hidden>
              <Figure role={who.role} s={1.3} />
            </svg>
            <div className="space-y-2">
              <p className="font-serif italic">“{said.hello}”</p>
              {said.told && <p className="text-sm">{said.told}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            {!said.told && (
              <button className="btn btn-primary" onClick={() => setSaid({ ...said, told: talkTo(place, who).told })}>
                Ask what they know
              </button>
            )}
            <button className="btn" onClick={close}>
              Farewell
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** An event or landmark the company came upon, and how the choice turned out. */
function Happening() {
  const h = useWorld((s) => s.happening);
  const outcome = useWorld((s) => s.outcome);
  // Re-render when gold or rations change what can be afforded.
  usePlayers((s) => s.docs);
  const def = h ? eventDef(h.kind) : undefined;
  return (
    <>
      <Dialog open={!!def} onClose={passBy} title={def?.title ?? ""}>
        {def && (
          <div className="space-y-3">
            <svg viewBox="-16 -16 32 26" className="mx-auto block h-24 w-32" aria-hidden>
              <InkVignette look={def.look} />
            </svg>
            <p className="font-serif italic">{def.text}</p>
            <div className="flex flex-col gap-1.5">
              {def.choices.map((c, i) =>
                c.needsNoHorses && !canChoose(c) && !c.cost ? null : (
                  <button key={c.label} className={clsx("btn justify-start text-left", !c.leave && "btn-primary")} disabled={!canChoose(c)} onClick={() => choose(i)}>
                    {c.label}
                    {c.skill && (
                      <span className="ml-auto pl-3 text-xs opacity-80">
                        {c.skill} DC {c.dc}
                      </span>
                    )}
                    {c.cost?.provisions ? <span className="ml-auto pl-3 text-xs opacity-80">−{c.cost.provisions} rations</span> : null}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={!!outcome} onClose={afterOutcome} title={outcome?.title ?? ""}>
        {outcome && (
          <div className="space-y-3">
            {outcome.check && <p className="text-xs text-muted">🎲 {outcome.check}</p>}
            <p className="font-serif italic">{outcome.text}</p>
            <button className="btn btn-primary" onClick={afterOutcome}>
              {outcome.fight ? "⚔ To arms!" : "Carry on"}
            </button>
          </div>
        )}
      </Dialog>
    </>
  );
}

function Den({ place }: { place: Place }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const hours = useWorld((s) => s.hours);
  const out = useWorld((s) => s.bands.filter((b) => b.from === place.id).length);
  const at = doc?.world?.cleared[place.id];
  const quietFor = at === undefined ? 0 : Math.ceil(num("world.denRegrow") - (hours - at) / 24);
  const what = place.ref === "bandits" ? "Outlaws hole up here and rob the roads nearby." : place.ref === "vermin" ? "Giant rats breed in the dark here." : "A pack makes its home here and hunts the land around.";
  return (
    <>
      <p className="text-sm text-muted">
        {what} {quietFor > 0 ? `Cleared out: quiet for ${quietFor} more day${quietFor === 1 ? "" : "s"}.` : `${out} band${out === 1 ? "" : "s"} out from here; they don't stray far.`}
      </p>
      {quietFor <= 0 && (
        <button className="btn btn-primary" onClick={() => raidDen(place)}>
          {FOE_ICON[place.ref ?? ""] ?? "⚔"} Clear the den
        </button>
      )}
    </>
  );
}

function Legend() {
  return (
    <section className="rounded-lg border border-line bg-surface p-3 text-xs text-muted shadow" aria-label="Legend">
      <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">How to read the map</h3>
      <ul className="space-y-0.5">
        <li>Blank paper: land the company hasn't seen yet. It fills in as they march.</li>
        <li>Dotted lines are roads (quick). Forests, mountains and marsh are slow.</li>
        <li>Hexagons are settlements, ? is a place not yet found, red rings are bands on the move. Bands keep close to their dens and lairs; the open country is quieter.</li>
        <li>A red ! is something happening nearby (a fire, a wagon in the ditch, lights in the marsh): march to it. Landmarks like standing stones can be looked into once.</li>
        <li>Drag to look around, scroll or +/− to zoom, ⌖ back to the company.</li>
      </ul>
    </section>
  );
}

function CompanyPurse() {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const hours = useWorld((s) => s.hours);
  const world = worldOf(doc);
  if (!doc?.world || !doc.town || !world) return null;
  const roster = availableMembers(myCharacters()).filter((e) => !doc.fallen.includes(e.key));
  const wages = roster.reduce((n, e) => n + wageOf(doc.progress[e.key]?.level ?? 1), 0) + (doc.world.horses ? num("world.horseUpkeep") : 0);
  const marching = chosenParty().length;
  const days = marching ? Math.floor(doc.world.provisions / marching) : 0;
  const unpaid = Object.values(doc.world.unpaid).filter((n) => n > 0).length;
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="The company's purse">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">💰 Purse and rations</h3>
      <dl className="grid grid-cols-3 gap-1 text-center text-xs">
        <div className="rounded border border-line bg-surface-2 p-1">
          <dt className="text-faint">Gold</dt>
          <dd className="font-bold text-strong">🪙 {doc.town.gold}</dd>
        </div>
        <div className="rounded border border-line bg-surface-2 p-1" title={`${roster.length} on the roster, paid every day on the road`}>
          <dt className="text-faint">Wages / day</dt>
          <dd className="font-bold text-strong">−{wages}</dd>
        </div>
        <div className={clsx("rounded border p-1", doc.world.hungry ? "border-danger bg-danger/10" : "border-line bg-surface-2")} title={`${marching} marching eat one ration each a day`}>
          <dt className="text-faint">Rations</dt>
          <dd className="font-bold text-strong">
            🍖 {doc.world.provisions} <span className="font-normal text-muted">({days} d)</span>
          </dd>
        </div>
      </dl>
      {doc.world.hungry && <p className="text-xs text-danger">Hungry: the company marches slower and fights worse until it eats.</p>}
      {unpaid > 0 && <p className="text-xs text-warn">{unpaid} unpaid: hired heroes leave after {num("company.desertDays")} days without pay.</p>}
      {doc.world.contracts.length > 0 && (
        <ul className="space-y-1 text-xs" aria-label="Contracts">
          {doc.world.contracts.map((c) => {
            const left = Math.max(0, Math.round(c.due - hours));
            const from = world.places.find((p) => p.id === c.from)?.name;
            const to = world.places.find((p) => p.id === c.to)?.name;
            return (
              <li key={c.id} className="rounded border border-line bg-surface-2/60 px-2 py-1">
                <span className="font-semibold text-strong">{c.kind === "hunt" ? "⚔" : "📦"} {c.title}</span>
                <span className="block text-muted">
                  {c.state === "done" ? `Done: collect ${c.reward} gold in ${from}.` : c.kind === "deliver" ? `To ${to} · ${c.reward} gold · ${left} h left` : `${c.reward} gold · ${left} h left · marked on the map`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Settlement({ place }: { place: Place }) {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  useWorld((s) => s.hours);
  const building = useTownUi((s) => s.building);
  if (!doc?.world || !doc.town) return null;
  const rep = doc.world.rep[place.id] ?? 0;
  const board = boardAt(place);
  const recruits = recruitsAt(place);
  const buildings = buildingsOf(place);
  const tab = buildings.includes(building) ? building : "board";
  const folk = townsfolkAt(place).filter((f) => f.at === tab);
  const deeds = DEEDS.filter((d) => d.building === tab);
  // What each building shows: the board's work, the market's goods, the tavern's sellswords…
  const shows = {
    work: tab === "board" || tab === "court",
    market: tab === "market" || tab === "docks",
    recruits: (tab === "tavern" || tab === "hall") && place.kind !== "village",
  };
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        A {place.kind} known for {place.known}. The company is <strong className="text-strong">{repText(rep)}</strong> here ({rep >= 0 ? "+" : ""}
        {rep}).
      </p>
      <div className="flex flex-wrap gap-1" role="tablist">
        {buildings.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={clsx("btn px-2 py-0 text-xs", tab === k && "border-accent text-accent")} onClick={() => useTownUi.setState({ building: k })}>
            {BUILDING[k].icon} {BUILDING[k].name}
            {k === "board" ? ` (${board.length})` : ""}
          </button>
        ))}
      </div>
      {shows.work && (
        <ul className="space-y-1">
          {board.map((c) => (
            <li key={c.id} className="rounded border border-line bg-surface-2/60 p-2 text-xs">
              <span className="font-semibold text-strong">{c.kind === "hunt" ? "⚔" : "📦"} {c.title}</span>
              <span className="mt-0.5 flex items-center justify-between gap-2 text-muted">
                🪙 {c.reward} · {c.days} day{c.days === 1 ? "" : "s"}
                <button className="btn px-2 py-0 text-xs" onClick={() => takeContract(c)}>
                  Take it
                </button>
              </span>
            </li>
          ))}
          {board.length === 0 && <li className="text-xs text-muted italic">Nothing posted. New work comes every few days.</li>}
        </ul>
      )}
      {shows.market && (
        <ul className="space-y-1 text-xs">
          {place.kind !== "village" && (
            <li className="flex items-center gap-2 rounded border border-line bg-surface-2/60 px-2 py-1">
              <span className="flex-1">
                🐎 Horses · ×{num("world.horseSpeed")} march speed · {num("world.horseUpkeep")} gold a day
              </span>
              {doc.world.horses ? (
                <button className="btn px-2 py-0 text-xs" onClick={() => tradeHorses(place, false)}>
                  Sell · 🪙 {Math.round(horsePriceAt(place) / 2)}
                </button>
              ) : (
                <button className="btn px-2 py-0 text-xs" disabled={doc.town!.gold < horsePriceAt(place)} onClick={() => tradeHorses(place, true)}>
                  Buy · 🪙 {horsePriceAt(place)}
                </button>
              )}
            </li>
          )}
          {sells(place).map((item) => {
            const price = priceOf(item, place, rep);
            return (
              <li key={item} className="flex items-center gap-2 rounded border border-line bg-surface-2/60 px-2 py-1">
                <span className="flex-1">
                  {item === "ration" ? "🍖 Rations" : "🧪 Potion of Healing"} · 🪙 {price} each
                </span>
                {(item === "ration" ? [5, 10] : [1]).map((n) => (
                  <button key={n} className="btn px-2 py-0 text-xs" disabled={doc.town!.gold < costOf(item, place, rep, n)} onClick={() => buyAt(place, item, n)} title={`${costOf(item, place, rep, n)} gold`}>
                    +{n} · 🪙 {costOf(item, place, rep, n)}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {shows.recruits && (
        <ul className="space-y-1">
          {recruits.map((c) => (
            <li key={c.id} className="rounded border border-line bg-surface-2/60 p-2 text-xs">
              <span className="flex items-baseline justify-between gap-2">
                <strong className="text-strong">{c.spec.name}</strong>
                <span className="text-faint">
                  Level {c.level} {c.spec.species} {c.spec.className}
                </span>
              </span>
              <span className="block text-muted italic">{c.pitch}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {c.traits.map((t) => (
                  <span key={t} className="rounded-full border border-line px-1.5" title={TRAITS[t]?.text}>
                    {TRAITS[t]?.icon} {TRAITS[t]?.name}
                  </span>
                ))}
                <button className="btn ml-auto px-2 py-0 text-xs" disabled={doc.town!.gold < c.fee} onClick={() => hireAt(place, c)}>
                  Hire · 🪙 {c.fee}
                </button>
              </span>
            </li>
          ))}
          {recruits.length === 0 && <li className="text-xs text-muted italic">Nobody looking for work. More come with renown and a good name here.</li>}
        </ul>
      )}
      {tab === "tavern" && place.kind === "village" && <p className="text-xs text-muted italic">A village alehouse: no sellswords here, but plenty of talk.</p>}
      {tab === "forge" && <p className="text-xs text-muted italic">The smiths are busy with the duke's order. Before long they'll take orders from a company too.</p>}
      {deeds.map((d) => {
        const cost = deedCost(d, place);
        const done = doneToday(`${d.id}:${place.id}`);
        return (
          <div key={d.id} className="flex items-center gap-2 rounded border border-line bg-surface-2/60 px-2 py-1 text-xs">
            <span className="flex-1">{d.label}</span>
            <button className="btn px-2 py-0 text-xs" disabled={done || doc.town!.gold < cost} onClick={() => doDeed(place, d.id)}>
              {done ? "Done today" : cost ? `🪙 ${cost}` : "Go"}
            </button>
          </div>
        );
      })}
      {folk.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">People here</h4>
          {folk.map((f) => (
            <button key={f.id} className="btn w-full justify-start px-2 py-0.5 text-xs" onClick={() => useTownUi.setState({ talk: f })}>
              💬 {f.name}, {ROLE[f.role].title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
