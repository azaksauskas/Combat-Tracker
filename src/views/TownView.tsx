import clsx from "clsx";
import { useEffect, useState } from "react";
import { Dialog } from "../components/Dialog";
import { BUILDING_TYPES, type Town } from "../domain/town";
import type { Profile } from "../domain/players";
import { BUILDINGS, HIRE_COST, beds, built, cantBuild, clockText, durationText, helpsLeft, isBuilt, opinion, power, renownOf, sleepHours, staffing, type SimContext } from "../game/town";
import { reputationText } from "../domain/alignment";
import { allFactions, payTributeTo, refuseTributeTo, startTownBattle } from "../game/town-store";
import { STAGE_TEXT, threatOf } from "../game/region";
import { bindTown, hireWorker, brew, build, buy, craftMod, found, goHome, helpOut, joinTown, liveHours, removeMod, renameTown, setOpen, sleep, today, townContext, useTownUi } from "../game/town-store";
import { BREWS, COMPONENTS, MODS, SLOTS, applyMods, cantAfford, costText, fits, type Component, type Slot } from "../game/crafting";
import { ITEMS } from "../game/party";
import { availableMembers, myCharacters } from "../game/party-store";
import { useGame } from "../store/game";
import { useActiveProfile, usePlayers } from "../store/players";

bindTown();

/** Re-renders every second so the town clock moves. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The player's town, or the town they moved to. */
export function TownView() {
  const id = useActiveProfile((s) => s.id)!;
  const doc = usePlayers((s) => s.docs[id]);
  const profiles = useGame((s) => s.players.profiles);
  if (!doc) return null;
  if (doc.residence) {
    const host = profiles.find((p) => p.id === doc.residence);
    return <HostTown hostId={doc.residence} host={host} />;
  }
  if (!doc.town) return <FoundTown renown={doc.renown} />;
  return <OwnTown town={doc.town} ownerId={id} renown={doc.renown} />;
}

function FoundTown({ renown }: { renown: number }) {
  const [name, setName] = useState("");
  const r = renownOf(renown);
  return (
    <section className="mx-auto max-w-xl space-y-3 rounded-lg border border-line bg-surface p-6 text-center shadow">
      <h3 className="text-2xl font-bold text-accent">Found your town</h3>
      <p className="text-sm text-muted">
        Every hero needs a place to come home to. Start with a hall and a plot of land; build farms, houses and shops; take in the people you meet on your adventures. Your heroes are{" "}
        <strong className="text-strong">{r.title.toLowerCase()}</strong>, so there is room for {r.maxBuildings} buildings for now.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) found(name);
        }}
      >
        <input className="field flex-1" placeholder="Name your town" value={name} onChange={(e) => setName(e.target.value)} aria-label="Town name" />
        <button className="btn btn-primary font-display" disabled={!name.trim()}>
          Found it
        </button>
      </form>
      <Waystone />
    </section>
  );
}

function OwnTown({ town: t, ownerId, renown }: { town: Town; ownerId: string; renown: number }) {
  const now = useNow();
  const hours = liveHours(t, now);
  const ctx = townContext(ownerId);
  const r = renownOf(renown);
  const staff = staffing(t);
  const [name, setName] = useState(t.name);
  const residents = useResidents(ownerId);
  useEffect(() => setName(t.name), [t.name]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow">
        <div>
          <input
            className="w-full bg-transparent font-display text-2xl font-bold text-accent outline-none focus:underline"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== t.name && renameTown(name)}
            aria-label="Town name"
          />
          <p className="text-sm text-muted">
            <span className="font-semibold text-strong tabular-nums" aria-label="Town clock">
              🕯 {clockText(hours)}
            </span>{" "}
            · Renown: {r.title} · Power {power(t, ctx)} · Known as{" "}
            <span className="text-strong" title={`Law ${t.reputation.law}, good ${t.reputation.good} (from −10 to +10)`}>
              {reputationText(t.reputation)}
            </span>
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-center text-sm" aria-label="Stores">
          <Stat label="Gold" value={t.gold} icon="🪙" />
          <Stat label="Food" value={t.food} icon="🍞" warn={t.food < t.settlers.length} />
          <Stat label="Materials" value={t.materials} icon="🪵" />
          <Stat label="Settlers" value={`${t.settlers.length}/${beds(t)}`} icon="🧑‍🌾" />
          <Stat label="Potions" value={Object.values(t.stash).reduce((a, b) => a + b, 0)} icon="🧪" />
          {(Object.keys(COMPONENTS) as Component[]).map((k) => (
            <Stat key={k} label={COMPONENTS[k].name} value={t.components[k]} icon={COMPONENTS[k].icon} />
          ))}
        </dl>
      </header>

      <Alarms town={t} hours={hours} />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section className="rounded-lg border border-line bg-surface p-3 shadow" aria-label="Buildings">
            <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">
              Buildings · {t.buildings.length}/{r.maxBuildings}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {t.buildings.map((b) => {
                const def = BUILDINGS[b.type];
                const left = b.readyAt !== undefined ? Math.max(0, b.readyAt - hours) : 0;
                return (
                  <li key={b.id} className="rounded-md border border-line bg-surface-2 p-2 text-sm">
                    <div className="font-semibold text-strong">
                      {def.icon} {def.name}
                    </div>
                    {isBuilt(b) ? (
                      def.staffed && <div className={clsx("text-xs", staff.get(b.id) ? "text-heal" : "text-warn")}>{staff.get(b.id) ? "Staffed" : "Needs a worker"}</div>
                    ) : (
                      <>
                        <div className="text-xs text-muted">Building · {durationText(Math.ceil(left))} left</div>
                        <div className="mt-1 h-1.5 rounded bg-surface-3">
                          <div className="h-1.5 rounded bg-accent" style={{ width: `${100 - (left / def.hours) * 100}%` }} />
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <h4 className="mt-4 mb-1 text-xs font-bold tracking-wider text-faint uppercase">Build</h4>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {BUILDING_TYPES.filter((type) => type !== "hall").map((type) => {
                const def = BUILDINGS[type];
                const why = cantBuild(t, type, renown);
                return (
                  <li key={type}>
                    <button
                      className="flex h-full w-full flex-col rounded-md border border-line bg-surface p-2 text-left text-sm hover:border-accent disabled:opacity-50 disabled:hover:border-line"
                      disabled={!!why}
                      onClick={() => build(type)}
                      title={why ?? `Build a ${def.name.toLowerCase()}`}
                    >
                      <span className="font-semibold text-strong">
                        {def.icon} {def.name}
                      </span>
                      <span className="flex-1 text-xs text-muted">{def.description}</span>
                      <span className="mt-1 text-xs text-faint">
                        {def.cost.gold} gold · {def.cost.materials} materials · {def.hours} h{def.staffed ? " · needs a worker" : ""}
                      </span>
                      {why && <span className="text-xs text-warn">{why}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <Workshop town={t} />

          <Settlers town={t} ctx={ctx} residents={residents} />
        </div>

        <aside className="space-y-4">
          <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Time">
            <h3 className="text-xs font-bold tracking-wider text-faint uppercase">Time</h3>
            <p className="text-xs text-muted">While you're here, a minute is an hour. While you're away, the town carries on at the pace of the real world.</p>
            <div className="grid grid-cols-2 gap-1">
              <button className="btn text-sm" onClick={sleep} disabled={sleepHours(hours) === null} title={sleepHours(hours) === null ? "Sleep comes after 20:00" : "Sleep until dawn"}>
                💤 Sleep{sleepHours(hours) !== null ? ` (${sleepHours(hours)} h)` : ""}
              </button>
              <button className="btn text-sm" onClick={helpOut} disabled={helpsLeft(t, today()) <= 0} title="Once per bed in town, per real day">
                🔨 Help out (1 day)
              </button>
            </div>
            <p className="text-xs text-faint">
              {sleepHours(hours) === null ? "Sleep comes after 20:00. " : ""}Help out: {helpsLeft(t, today())} of {beds(t)} left today (one per bed).
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={t.open} onChange={(e) => setOpen(e.target.checked)} /> Other heroes may move in
            </label>
          </section>
          <Region town={t} renown={renown} />
          <Waystone />
          <section className="rounded-lg border border-line bg-surface p-3 shadow" aria-label="Town log">
            <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">What's been happening</h3>
            <ol className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {[...t.log].reverse().map((e, i) => (
                <li key={i} className={e.tone === "good" ? "text-heal" : e.tone === "bad" ? "text-danger" : "text-muted"}>
                  <span className="text-xs text-faint">{clockText(e.at)} · </span>
                  {e.text}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Tribute demands and coming raids, with what the heroes can do about them. */
function Alarms({ town: t, hours }: { town: Town; hours: number }) {
  const factions = allFactions();
  const urgent = t.threats.filter((th) => th.stage === "demanding" || th.stage === "raiding");
  if (!urgent.length) return null;
  return (
    <div className="space-y-2" role="alert">
      {urgent.map((th) => {
        const f = factions.find((x) => x.id === th.faction);
        if (!f) return null;
        const left = th.dueAt !== undefined ? Math.max(0, th.dueAt - hours) : 0;
        return (
          <div key={th.faction} className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-danger bg-danger/10 p-3 text-sm">
            <span className="text-2xl">{f.icon}</span>
            <div className="min-w-0 flex-1">
              <strong className="text-strong">
                {th.stage === "demanding" ? `${f.name} demand ${th.demand} gold` : `${f.name} are coming to raid the town`}
              </strong>
              <div className="text-xs text-muted">
                {th.dueAt !== undefined && `${durationText(Math.ceil(left))} left (${clockText(th.dueAt)}). `}
                {th.stage === "raiding" ? "Defend the town, strike their lair first, or brace for losses." : "Pay, refuse (they'll raid), or strike their lair."}
              </div>
            </div>
            {th.stage === "demanding" && (
              <>
                <button className="btn text-sm" disabled={t.gold < (th.demand ?? 0)} onClick={() => payTributeTo(f.id)}>
                  Pay {th.demand} gold
                </button>
                <button className="btn text-sm" onClick={() => refuseTributeTo(f.id)}>
                  Refuse
                </button>
              </>
            )}
            {th.stage === "raiding" && (
              <button className="btn btn-primary text-sm font-display" onClick={() => startTownBattle("raid", f.id)}>
                ⚔ Defend the town
              </button>
            )}
            <button className="btn text-sm" onClick={() => startTownBattle("lair", f.id)}>
              🏴 Strike their lair
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Every faction of the region and where it stands with this town. */
function Region({ town: t, renown }: { town: Town; renown: number }) {
  useGame((s) => s.library.factions);
  const factions = allFactions();
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Region">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🗺 The region</h3>
      <ul className="space-y-2">
        {factions.map((f) => {
          const th = threatOf(t, f.id);
          const unknown = renown < f.minRenown && th.stage === "quiet";
          return (
            <li key={f.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="text-strong">
                  {f.icon} {f.name}
                </strong>
                <span className={clsx("text-xs", th.stage === "friendly" || th.stage === "defeated" ? "text-heal" : th.stage === "quiet" ? "text-faint" : "text-danger")}>
                  {unknown ? `Far away (renown ${f.minRenown})` : STAGE_TEXT[th.stage]}
                </span>
              </div>
              <div className="text-xs text-muted">
                {f.alignment} · {f.description}
              </div>
              {!unknown && th.stage !== "defeated" && th.stage !== "friendly" && (
                <div className="mt-1 h-1.5 rounded bg-surface-3" title={`Attention ${Math.round(th.attention)}/100`}>
                  <div className="h-1.5 rounded bg-danger" style={{ width: `${th.attention}%` }} />
                </div>
              )}
              {th.stage === "watching" && (
                <button className="btn mt-1 px-2 py-0.5 text-xs" onClick={() => startTownBattle("lair", f.id)}>
                  🏴 Strike their lair
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-faint">Factions notice a town as its power grows, faster when its reputation offends them. Those who share your outlook turn friendly. A watchtower slows them down.</p>
    </section>
  );
}

const FACES = ["😠", "🙁", "😐", "🙂", "😄"];
const face = (mood: number) => FACES[Math.min(4, Math.floor(mood / 20))]!;

/** Who lives here, how they feel and why; how the town looks to newcomers; hiring. */
function Settlers({ town: t, ctx, residents }: { town: Town; ctx: SimContext; residents: Profile[] }) {
  const look = opinion(t, "Neutral", ctx);
  const free = beds(t) - t.settlers.length;
  const tavern = staffedOf(t, "tavern");
  const workers = [...staffing(t).values()];
  const idle = workers.filter((x) => !x).length;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Settlers">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-faint uppercase">
          Settlers · {t.settlers.length}/{beds(t)} beds
        </h3>
        {idle > 0 && <span className="text-xs text-warn">{idle} building{idle === 1 ? " needs a worker" : "s need workers"}</span>}
      </div>
      {t.settlers.length === 0 ? (
        <p className="text-sm text-muted italic">Nobody lives here yet.</p>
      ) : (
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {t.settlers.map((s) => (
            <li key={s.id} className="flex gap-2">
              <span className="text-xl" title={`Mood ${s.mood}/100`} aria-label={`Mood ${s.mood} of 100`}>
                {face(s.mood)}
              </span>
              <span>
                <strong className="text-strong">{s.name}</strong>
                {s.trade && <span className="text-muted">, {s.trade}</span>} <span className="text-xs text-faint">· {s.alignment}</span>
                {s.mind && <span className={clsx("block text-xs italic", s.mood < 40 ? "text-danger" : "text-muted")}>“{s.mind}”</span>}
                <span className="block text-xs text-faint">{s.from}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {residents.length > 0 && <p className="text-sm">Heroes living here: {residents.map((p) => p.name).join(", ")}</p>}
      <div className="rounded-md border border-line bg-surface-2/60 p-2 text-sm" aria-label="Appeal">
        <div>
          <strong className="text-strong">How the town looks to newcomers: {look.target}/100</strong>
          <span className="text-xs text-muted"> · {free > 0 ? `${free} free bed${free === 1 ? "" : "s"}` : "no free beds: build a house"}</span>
        </div>
        <ul className="mt-1 flex flex-wrap gap-x-3 text-xs">
          {look.reasons.length === 0 && <li className="text-muted">Nothing special either way.</li>}
          {look.reasons.map((r) => (
            <li key={r.text} className={r.delta > 0 ? "text-heal" : "text-danger"}>
              {r.delta > 0 ? "▲" : "▼"} {r.text}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-faint">
          Travellers come more often to an appealing town, and far more with a tavern. Each settler also judges the heroes' deeds by their own beliefs; content settlers invite friends, miserable ones leave.
        </p>
        <button className="btn mt-2 text-sm" disabled={!tavern || free <= 0 || t.gold < HIRE_COST} onClick={hireWorker} title={!tavern ? "Needs a staffed tavern" : free <= 0 ? "No free bed" : ""}>
          🍺 Hire a worker ({HIRE_COST} gold){!tavern ? " · needs a staffed tavern" : ""}
        </button>
      </div>
    </section>
  );
}

const staffedOf = (t: Town, type: Town["buildings"][number]["type"]) => {
  const staff = staffing(t);
  return built(t).some((b) => b.type === type && staff.get(b.id));
};

/** Smithy (mods), apothecary (brewing) and market (buying components), once built and staffed. */
function Workshop({ town: t }: { town: Town }) {
  const smithy = staffedOf(t, "smithy");
  const apothecary = staffedOf(t, "apothecary");
  const market = staffedOf(t, "market");
  if (!smithy && !apothecary && !market)
    return (
      <section className="rounded-lg border border-dashed border-line p-3 text-sm text-muted" aria-label="Workshop">
        <strong className="text-strong">Workshop.</strong> Build and staff a smithy to fit mods to your heroes, an apothecary to brew potions, or a market to buy iron, herbs and arcane dust. Iron and dust are also salvaged from battles won on adventures.
      </section>
    );
  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Workshop">
      {smithy && <Smithy town={t} />}
      {apothecary && (
        <div>
          <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">⚗ Apothecary</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(BREWS).map(([id, b]) => {
              const why = cantAfford(t, b.cost);
              return (
                <li key={id}>
                  <button className="flex w-full flex-col rounded-md border border-line bg-surface-2 p-2 text-left text-sm hover:border-accent disabled:opacity-50" disabled={!!why} onClick={() => brew(id, ITEMS[id]?.name ?? id)}>
                    <span className="font-semibold text-strong">🧪 Brew {ITEMS[id]?.name}</span>
                    <span className="text-xs text-muted">{ITEMS[id]?.description}</span>
                    <span className="text-xs text-faint">
                      {costText(b.cost)} · {b.hours} h
                    </span>
                    {why && <span className="text-xs text-warn">{why}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {market && (
        <div>
          <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">⚖ Market</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(COMPONENTS) as Component[]).map((k) => (
              <button key={k} className="btn text-sm" disabled={t.gold < COMPONENTS[k].price} onClick={() => buy(k)}>
                Buy {COMPONENTS[k].icon} {COMPONENTS[k].name.toLowerCase()} ({COMPONENTS[k].price} gold)
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Smithy({ town: t }: { town: Town }) {
  const id = useActiveProfile((s) => s.id)!;
  const gear = usePlayers((s) => s.docs[id]?.gear) ?? {};
  usePlayers((s) => s.docs[id]?.characters);
  const heroes = availableMembers(myCharacters());
  const [heroKey, setHeroKey] = useState(heroes[0]?.key ?? "");
  const hero = heroes.find((h) => h.key === heroKey) ?? heroes[0];
  if (!hero) return null;
  const base = hero.build();
  const mods = gear[hero.key] ?? [];
  const modded = applyMods(base, mods);
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">⚒ Smithy</h3>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <select className="field w-auto py-1" value={hero.key} onChange={(e) => setHeroKey(e.target.value)} aria-label="Hero">
          {heroes.map((h) => (
            <option key={h.key} value={h.key}>
              {h.label}
            </option>
          ))}
        </select>
        <span className="text-muted">
          AC {modded.ac}
          {modded.ac !== base.ac ? ` (was ${base.ac})` : ""} · {modded.stats?.actions.filter((a) => a.kind === "attack" || a.kind === "save" || a.kind === "missile").slice(0, 3).map((a) => a.name).join(", ")}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {(Object.keys(SLOTS) as Slot[]).map((slot) => {
          const fitted = mods.find((m) => MODS[m]?.slot === slot);
          const options = Object.entries(MODS).filter(([, m]) => m.slot === slot && base.stats && fits(m, base.stats));
          return (
            <div key={slot} className="rounded-md border border-line bg-surface-2 p-2 text-sm">
              <div className="text-xs font-bold text-faint uppercase">{SLOTS[slot]}</div>
              {fitted ? (
                <div className="flex items-start justify-between gap-1">
                  <span>
                    <strong className="text-strong">{MODS[fitted]!.name}</strong>
                    <span className="block text-xs text-muted">{MODS[fitted]!.description}</span>
                  </span>
                  <button className="text-faint hover:text-danger" onClick={() => removeMod(hero.key, fitted)} aria-label={`Remove ${MODS[fitted]!.name}`} title="Remove (the mod is lost)">
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted italic">{options.length ? "Empty" : "Nothing fits this hero"}</p>
              )}
              <ul className="mt-1 space-y-1">
                {options
                  .filter(([mid]) => mid !== fitted)
                  .map(([mid, m]) => {
                    const why = cantAfford(t, m.cost);
                    return (
                      <li key={mid}>
                        <button className="w-full rounded border border-line bg-surface px-2 py-1 text-left text-xs hover:border-accent disabled:opacity-50" disabled={!!why} onClick={() => craftMod(hero.key, hero.label, mid)} title={why ?? (fitted ? `Replaces ${MODS[fitted]!.name}` : "Fit it")}>
                          <span className="font-semibold text-strong">{m.name}</span> — {m.description}
                          <span className="block text-faint">
                            {costText(m.cost)} · {m.hours} h{why ? ` · ${why}` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, icon, warn }: { label: string; value: number | string; icon: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className={clsx("text-lg font-bold tabular-nums", warn ? "text-danger" : "text-strong")}>
        {icon} {value}
      </dd>
    </div>
  );
}

function useResidents(ownerId: string): Profile[] {
  const profiles = useGame((s) => s.players.profiles);
  const docs = usePlayers((s) => s.docs);
  return profiles.filter((p) => p.id !== ownerId && docs[p.id]?.residence === ownerId);
}

/** Other players' towns you can travel to and live in. */
function Waystone() {
  const me = useActiveProfile((s) => s.id);
  const profiles = useGame((s) => s.players.profiles);
  const docs = usePlayers((s) => s.docs);
  const towns = profiles.filter((p) => p.id !== me && docs[p.id]?.town && !docs[p.id]?.residence);
  if (towns.length === 0) return null;
  return (
    <section className="space-y-1 rounded-lg border border-line bg-surface p-3 text-left shadow" aria-label="Waystone">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🪨 Waystone</h3>
      <p className="text-xs text-muted">Travel to another hero's town and live there. Your own town carries on without you (thieves like an empty hall).</p>
      <ul className="space-y-1">
        {towns.map((p) => {
          const town = docs[p.id]!.town!;
          return (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <strong className="text-strong">{town.name}</strong> <span className="text-xs text-faint">· {p.name} · {built(town).length} buildings, {town.settlers.length} settlers</span>
              </span>
              <button className="btn px-2 py-0.5 text-xs" disabled={!town.open} title={town.open ? "6 hours by waystone" : "Not taking newcomers"} onClick={() => joinTown(p.id)}>
                {town.open ? "Move here" : "Closed"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HostTown({ hostId, host }: { hostId: string; host: Profile | undefined }) {
  const doc = usePlayers((s) => s.docs[hostId]);
  const t = doc?.town;
  const residents = useResidents(hostId);
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-2xl font-bold text-accent">{t?.name ?? "A town"}</h3>
          <p className="text-sm text-muted">
            You live in {host?.name ?? "another player"}'s town{t ? ` · ${clockText(t.hours)} (as of ${host?.name ?? "the owner"}'s last visit)` : ""}.
          </p>
        </div>
        <button className="btn" onClick={goHome}>
          🏠 Go home
        </button>
      </div>
      {t && (
        <>
          <p className="text-sm">
            {built(t)
              .map((b) => `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name}`)
              .join(" · ")}
          </p>
          <p className="text-sm text-muted">
            {t.settlers.length} settlers · heroes here: {[host?.name, ...residents.map((p) => p.name)].filter(Boolean).join(", ")}
          </p>
          <ol className="max-h-60 space-y-0.5 overflow-y-auto text-sm">
            {[...t.log]
              .reverse()
              .slice(0, 15)
              .map((e, i) => (
                <li key={i} className={e.tone === "good" ? "text-heal" : e.tone === "bad" ? "text-danger" : "text-muted"}>
                  <span className="text-xs text-faint">{clockText(e.at)} · </span>
                  {e.text}
                </li>
              ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Shown on the Play page whenever the town has news after time away or a long action. */
export function AwayReportDialog() {
  const report = useTownUi((s) => s.report);
  const title = useTownUi((s) => s.title);
  const close = () => useTownUi.setState({ report: null });
  const change = (n: number, unit: string) => (n === 0 ? null : <li className={n > 0 ? "text-heal" : "text-danger"}>{`${n > 0 ? "+" : ""}${n} ${unit}`}</li>);
  return (
    <Dialog open={!!report} onClose={close} title={title || "Meanwhile…"}>
      {report && (
        <div className="space-y-3 text-sm">
          <p className="text-muted">{durationText(report.hours)} passed.</p>
          <ul className="flex flex-wrap gap-x-4 font-semibold">
            {change(report.gold, "gold")}
            {change(report.food, "food")}
            {change(report.materials, "materials")}
            {change(report.settlers, report.settlers === 1 || report.settlers === -1 ? "settler" : "settlers")}
          </ul>
          {report.events.length > 0 ? (
            <ol className="max-h-72 space-y-1 overflow-y-auto">
              {report.events.map((e, i) => (
                <li key={i} className={e.tone === "good" ? "text-heal" : e.tone === "bad" ? "text-danger" : "text-text"}>
                  <span className="text-xs text-faint">{clockText(e.at)} · </span>
                  {e.text}
                </li>
              ))}
            </ol>
          ) : (
            <p className="italic">A quiet time. Nothing much happened.</p>
          )}
          <div className="text-right">
            <button className="btn btn-primary font-display" onClick={close}>
              Back to town
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
