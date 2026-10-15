import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../components/Dialog";
import { BUILDING_TYPES, type Town } from "../domain/town";
import type { Profile } from "../domain/players";
import { TRADES, TRADE_FOR, assignments, buildersBusy, callCost, dailyChange, needs, plots } from "../game/town";
import { currentGoals, rewardText as goalReward } from "../game/goals";
import { claimTownGoal } from "../game/town-store";
import { BuildingPanel, TownScene, face, tradeIcon } from "./TownScene";
import { BUILDINGS, hireCost, beds, built, cantBuild, clockText, durationText, helpsLeft, opinion, power, renownOf, sleepHours, staffing, type SimContext } from "../game/town";
import { reputationText } from "../domain/alignment";
import { raiseCost, raiseHero, treatCost, treatInjury } from "../game/town-store";
import { INJURIES } from "../game/injuries";
import { allFactions, payTributeTo, refuseTributeTo, startTownBattle } from "../game/town-store";
import { STAGE_TEXT, canStrike, threatOf } from "../game/region";
import { assignSettler, marketTrade, partyLevel, postNotice, startContract, startPatrol } from "../game/town-store";
import { GOODS, GOOD_INFO, boardSize, buyPrice, patrolBounty, patrolsToday, rewardText, sellPrice, stock } from "../game/economy";
import { chosenParty } from "../game/party-store";
import { bindTown, hireWorker, brew, build, craftMod, found, goHome, helpOut, joinTown, liveHours, removeMod, renameTown, setOpen, sleep, today, townContext, useTownUi } from "../game/town-store";
import { BREWS, COMPONENTS, MODS, SLOTS, applyMods, cantAfford, costText, fits, type Component, type Slot } from "../game/crafting";
import { ITEMS, withProgress } from "../game/party";
import { availableMembers, myCharacters } from "../game/party-store";
import { useGame } from "../store/game";
import { num } from "../game/tuning";
import { useActiveProfile, usePlayers } from "../store/players";
import { militiaChances } from "./RaidAlerts";
import { RegionMap } from "./RegionMap";
import { IntrigueTab, ResidentGuild, Spies, TakeoverBanner } from "./IntrigueView";
import { intrigueOn } from "../game/guilds";
import { titheShare, townStage } from "../game/guilds";
import { usePlay } from "../game/store";

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
  const profiles = usePlayers((s) => s.profiles);
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
      {intrigueOn() && <Waystone />}
    </section>
  );
}

type TownTab = "town" | "build" | "people" | "workshop" | "jobs" | "region" | "intrigue" | "log";

function useTownTab(): [TownTab, (t: TownTab) => void] {
  const [tab, setTabState] = useState<TownTab>(() => {
    try {
      return (localStorage.getItem("town-tab") as TownTab | null) ?? "town";
    } catch {
      return "town";
    }
  });
  const setTab = (next: TownTab) => {
    setTabState(next);
    try {
      localStorage.setItem("town-tab", next);
    } catch {
      /* not remembered: fine */
    }
  };
  return [tab, setTab];
}

function OwnTown({ town: t, ownerId, renown }: { town: Town; ownerId: string; renown: number }) {
  const now = useNow();
  const hours = liveHours(t, now);
  const ctx = townContext(ownerId);
  const residents = useResidents(ownerId);
  const [tab, setTab] = useTownTab();
  const [selected, setSelected] = useState<string | null>(null);
  const urgent = t.threats.filter((th) => th.stage === "demanding" || th.stage === "raiding").length;
  const unhappy = t.settlers.filter((x) => x.mood < 40).length;
  const guildStage = townStage(ownerId, usePlayers.getState().docs, now);
  const tabs: { id: TownTab; label: string; badge?: number; tone?: "warn" | "danger" | "info" }[] = [
    { id: "town", label: "🏡 Village" },
    { id: "build", label: "🔨 Build" },
    { id: "people", label: `👥 People`, badge: needs(t).length + unhappy || undefined, tone: "warn" },
    { id: "workshop", label: "⚒ Workshop" },
    { id: "jobs", label: "📜 Jobs", badge: t.contracts.length || undefined, tone: "info" as const },
    { id: "region", label: "🗺 Region", badge: urgent || undefined, tone: "danger" as const },
    ...(intrigueOn() ? [{ id: "intrigue" as const, label: "🕵 Intrigue", badge: guildStage || undefined, tone: "danger" as const }] : []),
    { id: "log", label: "📖 Events" },
  ];
  const current = tab;

  return (
    <div className="space-y-3">
      <TownHeader town={t} hours={hours} renown={renown} ctx={ctx} tithe={titheShare(guildStage)} />
      <Alarms town={t} hours={hours} />
      {intrigueOn() && <TakeoverBanner ownerId={ownerId} onOpen={() => setTab("intrigue")} />}
      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Town">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={current === x.id}
            className={clsx("-mb-px flex items-center gap-1 rounded-t-md border px-3 py-1.5 text-sm", current === x.id ? "border-line border-b-surface bg-surface font-semibold text-accent" : "border-transparent text-muted hover:text-strong")}
            onClick={() => setTab(x.id)}
          >
            {x.label}
            {x.badge && (
              <span className={clsx("rounded-full px-1.5 text-[10px] font-bold text-white", x.tone === "danger" ? "bg-danger" : x.tone === "warn" ? "bg-warn" : "bg-accent")}>{x.badge}</span>
            )}
          </button>
        ))}
      </div>

      {current === "town" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
          <div className="space-y-3">
            <TownScene town={t} hours={hours} renown={renown} selected={selected} onSelect={setSelected} onBuild={() => setTab("build")} />
            {selected && <BuildingPanel town={t} buildingId={selected} renown={renown} onClose={() => setSelected(null)} />}
            <NeedsChips town={t} onOpen={() => setTab("people")} />
          </div>
          <aside className="space-y-3">
            <Goals town={t} renown={renown} />
            <TimeCard town={t} hours={hours} />
            <QuickJobs town={t} onOpen={() => setTab("jobs")} />
            <RecentEvents town={t} onOpen={() => setTab("log")} />
          </aside>
        </div>
      )}
      {current === "build" && <BuildList town={t} renown={renown} onBuilt={() => setTab("town")} />}
      {current === "people" && <Settlers town={t} ctx={ctx} residents={residents} />}
      {current === "workshop" && <Workshop town={t} />}
      {current === "jobs" && <Board town={t} hours={hours} />}
      {current === "region" && (
        <div className="space-y-3">
          <Region town={t} renown={renown} />
          {intrigueOn() && (
            <div className="grid gap-3 md:grid-cols-2">
              <Waystone />
              <label className="flex items-center gap-2 self-start rounded-lg border border-line bg-surface p-3 text-sm shadow">
                <input type="checkbox" checked={t.open} onChange={(e) => setOpen(e.target.checked)} /> Other heroes may move in
              </label>
            </div>
          )}
        </div>
      )}
      {current === "intrigue" && intrigueOn() && <IntrigueTab ownerId={ownerId} />}
      {current === "log" && <TownLog town={t} />}
    </div>
  );
}

/** Name, clock, fame and the stores, with how each changes per day. */
function TownHeader({ town: t, hours, renown, ctx, tithe }: { town: Town; hours: number; renown: number; ctx: SimContext; tithe: number }) {
  const [name, setName] = useState(t.name);
  useEffect(() => setName(t.name), [t.name]);
  const daily = dailyChange(t, tithe);
  const h = Math.floor(hours) % 24;
  const night = h >= 20 || h < 6;
  const potions = Object.values(t.stash).reduce((a, b) => a + b, 0);
  const foodDays = daily.food < 0 ? Math.floor(t.food / -daily.food) : null;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow">
      <div className="min-w-0">
        <input
          className="w-full bg-transparent font-display text-2xl font-bold text-accent outline-none focus:underline"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== t.name && renameTown(name)}
          aria-label="Town name"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-strong tabular-nums" aria-label="Town clock" title={night ? "Night: you can sleep until dawn" : "Day"}>
            {night ? "🌙" : "☀️"} {clockText(hours)}
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5" title={`Renown: ${renownOf(renown).reach}`}>
            ⭐ {renownOf(renown).title}
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5" title={`Law ${t.reputation.law}, good ${t.reputation.good} (from −10 to +10). Power ${power(t, ctx)}.`}>
            ⚖ {reputationText(t.reputation)}
          </span>
        </div>
      </div>
      <dl className="flex flex-wrap gap-1.5" aria-label="Stores">
        <Res icon="🪙" label="Gold" value={t.gold} delta={daily.gold} />
        <Res icon="🍞" label="Food" value={t.food} delta={daily.food} warn={foodDays !== null && foodDays < 3} note={foodDays !== null ? `Runs out in ${foodDays} day${foodDays === 1 ? "" : "s"}` : undefined} />
        <Res icon="🪵" label="Materials" value={t.materials} delta={daily.materials} />
        <Res icon="🧑‍🌾" label="Settlers" value={`${t.settlers.length}/${beds(t)}`} />
        <Res icon="🧪" label="Potions" value={potions} />
        {(Object.keys(COMPONENTS) as Component[]).map((k) => (
          <Res key={k} icon={COMPONENTS[k].icon} label={COMPONENTS[k].name} value={t.components[k]} delta={k === "herbs" ? daily.herbs : k === "dust" ? daily.dust : 0} />
        ))}
      </dl>
    </header>
  );
}

/** The next goals, with progress and a reward to claim. */
function Goals({ town: t, renown }: { town: Town; renown: number }) {
  const list = currentGoals(t, renown);
  if (!list.length) return null;
  return (
    <section className="space-y-2 rounded-lg border border-accent/50 bg-surface p-3 shadow" aria-label="Goals">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🎯 Goals</h3>
      <ul className="space-y-2">
        {list.map(({ goal: g, now, done }) => (
          <li key={g.id} className={clsx("rounded-md border p-2 text-sm", done ? "border-heal bg-heal/10" : "border-line bg-surface-2/60")}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{g.icon}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-strong">{g.text}</span>
                <span className="text-[11px] text-muted">Reward: {goalReward(g.reward)}</span>
              </span>
              {done && (
                <button className="btn btn-primary animate-pulse px-2 py-0.5 text-xs" onClick={() => claimTownGoal(g.id)}>
                  🎁 Claim
                </button>
              )}
            </div>
            {!done && g.target > 1 && (
              <div className="mt-1 flex items-center gap-2">
                <span className="block h-1.5 flex-1 rounded bg-surface-3">
                  <span className="block h-1.5 rounded bg-accent" style={{ width: `${(now / g.target) * 100}%` }} />
                </span>
                <span className="text-[10px] text-faint tabular-nums">
                  {now}/{g.target}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "+3" floating up from a store when it grows. */
function useGains(value: number | string) {
  const prev = useRef(value);
  const [gains, setGains] = useState<{ id: number; n: number }[]>([]);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (typeof value !== "number" || typeof before !== "number" || value === before) return;
    const id = Date.now() + Math.random();
    setGains((g) => [...g, { id, n: value - before }]);
    const timer = setTimeout(() => setGains((g) => g.filter((x) => x.id !== id)), 1400);
    return () => clearTimeout(timer);
  }, [value]);
  return gains;
}

/** One store: icon, amount, and the day's change. */
function Res({ icon, label, value, delta, warn, note }: { icon: string; label: string; value: number | string; delta?: number; warn?: boolean; note?: string }) {
  const gains = useGains(value);
  return (
    <div className={clsx("relative rounded-lg border px-2 py-1 text-center", warn ? "border-danger bg-danger/10" : "border-line bg-surface-2")} title={`${label}${delta ? `: ${delta > 0 ? "+" : ""}${delta} a day` : ""}${note ? `. ${note}` : ""}`}>
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-baseline gap-1">
        <span className="text-base">{icon}</span>
        <span className={clsx("font-bold tabular-nums", warn ? "text-danger" : "text-strong")}>{value}</span>
        {!!delta && <span className={clsx("text-[10px] font-semibold tabular-nums", delta > 0 ? "text-heal" : "text-danger")}>{delta > 0 ? `+${delta}` : delta}/d</span>}
      </dd>
      {gains.map((g) => (
        <span key={g.id} className={clsx("pointer-events-none absolute -top-2 right-1 text-xs font-bold [animation:float-up_1.4s_ease-out_forwards]", g.n > 0 ? "text-heal" : "text-danger")}>
          {g.n > 0 ? `+${g.n}` : g.n}
        </span>
      ))}
    </div>
  );
}

/** What's missing, as small clickable chips. */
function NeedsChips({ town: t, onOpen }: { town: Town; onOpen: () => void }) {
  const list = needs(t);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-semibold text-warn">The town needs:</span>
      {list.map((n) => (
        <button key={n.text} className="rounded-full border border-warn/50 bg-warn/10 px-2 py-0.5 text-warn hover:bg-warn/20" onClick={onOpen} title={n.text}>
          {tradeIcon(n.trade)} a {n.trade} for the {BUILDINGS[n.building].name.toLowerCase()}
        </button>
      ))}
    </div>
  );
}

/** The clock and what to do with time. */
function TimeCard({ town: t, hours }: { town: Town; hours: number }) {
  const sleepFor = sleepHours(hours);
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Time">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">⏳ Pass the time</h3>
      <div className="grid grid-cols-2 gap-1">
        <button className="btn text-sm" onClick={sleep} disabled={sleepFor === null} title={sleepFor === null ? `Sleep comes after ${num("time.sleepFrom")}:00` : "Sleep until dawn"}>
          💤 Sleep{sleepFor !== null ? ` (${sleepFor} h)` : ""}
        </button>
        <button className="btn text-sm" onClick={helpOut} disabled={helpsLeft(t, today()) <= 0} title="A day's work around town. Once per bed, per real day">
          🔨 Help out
        </button>
      </div>
      <p className="text-[11px] text-faint">
        1 real minute = 1 hour here. Help out: {helpsLeft(t, today())}/{beds(t)} left today.
      </p>
    </section>
  );
}

/** A nudge towards the patrols and jobs. */
function QuickJobs({ town: t, onOpen }: { town: Town; onOpen: () => void }) {
  const bounty = patrolBounty(t, partyLevel(chosenParty()));
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Quick jobs">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">⚔ Work for the heroes</h3>
      <button className="btn w-full font-display text-sm" onClick={startPatrol}>
        Ride out on patrol · 🪙 {bounty}
      </button>
      <button className="btn btn-ghost w-full text-sm" onClick={onOpen}>
        📜 {t.contracts.length ? `${t.contracts.length} job${t.contracts.length === 1 ? "" : "s"} on the board` : "The board is empty"} →
      </button>
    </section>
  );
}

function RecentEvents({ town: t, onOpen }: { town: Town; onOpen: () => void }) {
  const recent = [...t.log].reverse().slice(0, 5);
  return (
    <section className="space-y-1 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Recent events">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">📖 Lately</h3>
      <ol className="space-y-1 text-xs">
        {recent.map((e, i) => (
          <li key={i} className={clsx("flex gap-1", e.tone === "good" ? "text-heal" : e.tone === "bad" ? "text-danger" : "text-muted")}>
            <span aria-hidden>{e.tone === "good" ? "▲" : e.tone === "bad" ? "▼" : "•"}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
      <button className="btn btn-ghost w-full px-2 py-0.5 text-xs" onClick={onOpen}>
        All events →
      </button>
    </section>
  );
}

function TownLog({ town: t }: { town: Town }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3 shadow" aria-label="Town log">
      <ol className="space-y-1 text-sm">
        {[...t.log].reverse().map((e, i) => (
          <li key={i} className={clsx("flex gap-2", e.tone === "good" ? "text-heal" : e.tone === "bad" ? "text-danger" : "text-muted")}>
            <span className="w-28 shrink-0 text-xs text-faint tabular-nums">{clockText(e.at)}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What can be built: icon, cost and time at a glance; the description on hover. */
function BuildList({ town: t, renown, onBuilt }: { town: Town; renown: number; onBuilt: () => void }) {
  const room = plots(t, renown);
  const full = t.buildings.length >= room;
  const busy = buildersBusy(t);
  return (
    <div className="space-y-3" aria-label="Buildings">
      {(full || busy) && (
        <p className={clsx("rounded-md border px-3 py-2 text-sm", full ? "border-warn/60 bg-warn/10 text-warn" : "border-line bg-surface-2 text-muted")}>
          {full
            ? `🔒 All ${room} plots are used. Upgrade the town hall (Village → click the hall) for more, or gain renown.`
            : "🏗 The builders are busy: one project (building or upgrade) at a time."}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {BUILDING_TYPES.filter((type) => type !== "hall").map((type) => {
          const def = BUILDINGS[type];
          const why = cantBuild(t, type, renown);
          const roomOrBusy = full || busy;
          const have = t.buildings.filter((b) => b.type === type).length;
          const trade = TRADE_FOR[type];
          return (
            <li key={type}>
              <button
                className="flex h-full w-full gap-3 rounded-lg border border-line bg-surface p-2 text-left text-sm shadow-sm hover:border-accent disabled:opacity-55 disabled:hover:border-line"
                disabled={!!why}
                onClick={() => {
                  build(type);
                  onBuilt();
                }}
                title={def.description}
              >
                <span className="text-4xl leading-none">{def.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-1">
                    <strong className="text-strong">{def.name}</strong>
                    {have > 0 && <span className="text-[10px] text-faint">have {have}</span>}
                  </span>
                  <span className="line-clamp-2 block text-xs text-muted">{def.description}</span>
                  <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <Chip bad={t.gold < def.cost.gold}>🪙 {def.cost.gold}</Chip>
                    {def.cost.materials > 0 && <Chip bad={t.materials < def.cost.materials}>🪵 {def.cost.materials}</Chip>}
                    <Chip>⏱ {def.hours} h</Chip>
                    {trade && <Chip>{tradeIcon(trade)} {trade}</Chip>}
                  </span>
                  {why && !roomOrBusy && <span className="mt-0.5 block text-[11px] text-warn">{why}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chip({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <span className={clsx("rounded-full px-1.5 py-0.5", bad ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted")}>{children}</span>;
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
          <div key={th.faction} className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-danger bg-danger/10 p-3 text-sm max-sm:[&>div]:basis-[calc(100%-3rem)]">
            <span className="text-2xl">{f.icon}</span>
            <div className="min-w-0 flex-1">
              <strong className="text-strong">
                {th.stage === "demanding" ? `${f.name} demand ${th.demand} gold` : `${f.name} are coming to raid the town`}
              </strong>
              <div className="text-xs text-muted">
                {th.dueAt !== undefined && `${durationText(Math.ceil(left))} left (${clockText(th.dueAt)}). `}
                {th.stage === "raiding" ? "Defend the town, strike their lair first, or leave it to the militia." : "Pay, refuse (they'll raid), or strike their lair."}
              </div>
              {th.stage === "raiding" && <div className="text-xs text-muted">{militiaChances(t, f).line}</div>}
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
      <div className="grid gap-4 md:grid-cols-[minmax(0,30rem)_1fr]">
      <div>
        <RegionMap town={t} renown={renown} />
        <p className="mt-1 text-[11px] text-faint">Dotted lines: scouts watching. Red arrows: a raid on its way. Green: friends. Click a lair you know to strike it.</p>
      </div>
      <div>
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
              {canStrike(th, f, renown) && th.stage !== "demanding" && th.stage !== "raiding" && (
                <button className="btn mt-1 px-2 py-0.5 text-xs" onClick={() => startTownBattle("lair", f.id)} title={`Lair battle${f.milestone ? `; breaking it takes the heroes to level ${f.milestone}` : ""}`}>
                  🏴 Strike their lair{f.milestone ? ` (milestone: level ${f.milestone})` : ""}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-faint">Factions notice a town as its power grows, faster when its reputation offends them. Those who share your outlook turn friendly. A watchtower slows them down.</p>
      </div>
      </div>
    </section>
  );
}


/** Who lives here, how they feel and why; how the town looks to newcomers; hiring. */
function Settlers({ town: t, ctx, residents }: { town: Town; ctx: SimContext; residents: Profile[] }) {
  const look = opinion(t, "Neutral", ctx);
  const free = beds(t) - t.settlers.length;
  const tavern = staffedOf(t, "tavern");
  const workers = [...staffing(t).values()];
  const idle = workers.filter((x) => !x).length;
  const jobOf = new Map([...assignments(t)].map(([b, sid]) => [sid, b]));
  const [hireTrade, setHireTrade] = useState("");
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
        <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {t.settlers.map((s) => (
            <li key={s.id} className="flex gap-2 rounded-lg border border-line bg-surface-2/60 p-2">
              <span className="flex flex-col items-center">
                <span className="text-3xl leading-none" title={`Mood ${s.mood}/100`} aria-label={`Mood ${s.mood} of 100`}>
                  {face(s.mood)}
                </span>
                <span className="mt-1 h-1 w-9 rounded bg-surface-3">
                  <span className={clsx("block h-1 rounded", s.mood < 40 ? "bg-danger" : s.mood < 60 ? "bg-warn" : "bg-heal")} style={{ width: `${s.mood}%` }} />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-1">
                  <strong className="text-strong">{s.name}</strong>
                  {s.trade && (
                    <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">
                      {tradeIcon(s.trade)} {s.trade}
                    </span>
                  )}
                </span>
                {s.mind && <span className={clsx("block truncate text-xs italic", s.mood < 40 ? "text-danger" : "text-muted")} title={s.mind}>“{s.mind}”</span>}
                <span className="block truncate text-[11px] text-faint" title={`${s.alignment} · ${s.from}`}>
                  {s.alignment} · {s.from}
                </span>
                <JobPicker town={t} settlerId={s.id} job={s.job} at={jobOf.get(s.id)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <Needs town={t} />
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="field w-auto py-1 text-sm" value={hireTrade} onChange={(e) => setHireTrade(e.target.value)} aria-label="Trade to hire" disabled={!tavern}>
            <option value="">Anyone ({hireCost()} gold)</option>
            {TRADES.map((tr) => (
              <option key={tr} value={tr}>
                A {tr} ({hireCost(tr)} gold)
              </option>
            ))}
          </select>
          <button
            className="btn text-sm"
            disabled={!tavern || free <= 0 || t.gold < hireCost(hireTrade || undefined)}
            onClick={() => hireWorker(hireTrade || undefined)}
            title={!tavern ? "Needs a staffed tavern" : free <= 0 ? "No free bed" : ""}
          >
            🍺 Hire{!tavern ? " · needs a staffed tavern" : ""}
          </button>
        </div>
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
  const shrine = staffedOf(t, "shrine");
  if (!smithy && !apothecary && !market && !shrine)
    return (
      <section className="rounded-lg border border-dashed border-line p-3 text-sm text-muted" aria-label="Workshop">
        <strong className="text-strong">Workshop.</strong> Build and staff a smithy to fit mods to your heroes, an apothecary to brew potions, a market to buy and sell food, materials, iron, herbs and arcane dust, a shrine to heal lasting injuries and raise the fallen, or a mage tower for arcane dust and wondrous items. Iron and dust are also salvaged from battles won on adventures. Magic items are forged and crafted on the Heroes tab.
      </section>
    );
  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Workshop">
      {smithy && <Smithy town={t} />}
      {shrine && <Shrine town={t} />}
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
      {market && <Market town={t} />}
    </section>
  );
}


/** Where a settler works: let them choose, put them somewhere, or tell them to rest. */
function JobPicker({ town: t, settlerId, job, at }: { town: Town; settlerId: string; job: string | undefined; at: string | undefined }) {
  const places = built(t).filter((b) => BUILDINGS[b.type].staffed);
  const label = (id: string) => {
    const b = t.buildings.find((x) => x.id === id)!;
    const same = places.filter((x) => x.type === b.type);
    return `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name}${same.length > 1 ? ` ${same.indexOf(b) + 1}` : ""}`;
  };
  if (!places.length) return null;
  return (
    <label className="mt-0.5 flex items-center gap-1 text-xs text-muted">
      Works:
      <select className="field px-1 py-0 text-xs" value={job && (job === "rest" || places.some((b) => b.id === job)) ? job : ""} onChange={(e) => assignSettler(settlerId, e.target.value || null)} aria-label="Job">
        <option value="">{at ? `${label(at)} (their choice)` : "Nothing: takes the next opening"}</option>
        {places.map((b) => (
          <option key={b.id} value={b.id}>
            {label(b.id)}
          </option>
        ))}
        <option value="rest">Rest</option>
      </select>
    </label>
  );
}

/** What the town is short of, and a notice at the hall to call for it. */
function Needs({ town: t }: { town: Town }) {
  const list = needs(t);
  const call = t.call;
  const trades = [...new Set(list.map((n) => n.trade))];
  if (!list.length && !call) return null;
  return (
    <div className="rounded-md border border-warn/50 bg-warn/5 p-2 text-sm" aria-label="Town needs">
      <strong className="text-strong">The town needs</strong>
      <ul className="mt-1 space-y-0.5 text-xs">
        {list.map((n) => (
          <li key={n.text} className="text-warn">
            • {n.text}
          </li>
        ))}
      </ul>
      {call ? (
        <p className="mt-1 text-xs text-muted">📜 A notice is up at the hall: a {call.trade} wanted, until {clockText(call.until)}. Travellers of that trade come more often, and stay.</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {trades.map((tr) => (
            <button key={tr} className="btn px-2 py-0.5 text-xs" disabled={t.gold < callCost()} onClick={() => postNotice(tr)} title={`A notice at the hall for ${num("trades.callDays")} days`}>
              📜 Call for a {tr} ({callCost()} gold)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Buy and sell the town's stores. */
function Market({ town: t }: { town: Town }) {
  return (
    <div aria-label="Market">
      <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">⚖ Market</h3>
      <p className="mb-1 text-xs text-muted">Short of something? Buy it, or sell what you can spare. The market buys at {Math.round(num("price.sellShare") * 100)}% of the price.</p>
      <table className="w-full text-sm">
        <tbody>
          {GOODS.map((g) => {
            const info = GOOD_INFO[g];
            const have = stock(t, g);
            const buyCost = Math.ceil(buyPrice(g) * info.lot);
            const sellGain = Math.floor(sellPrice(g) * info.lot);
            return (
              <tr key={g} className="border-t border-line/50">
                <td className="py-1">
                  {info.icon} {info.name} <span className="text-xs text-faint">({have})</span>
                </td>
                <td className="py-1 text-right">
                  <button className="btn px-2 py-0.5 text-xs" disabled={t.gold < buyCost} onClick={() => marketTrade(g, info.lot)}>
                    Buy {info.lot} · {buyCost} gold
                  </button>{" "}
                  <button className="btn px-2 py-0.5 text-xs" disabled={have < info.lot || sellGain <= 0} onClick={() => marketTrade(g, -info.lot)}>
                    Sell {info.lot} · +{sellGain} gold
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Patrols and the town's notice board: small fights for small pay. */
function Board({ town: t, hours }: { town: Town; hours: number }) {
  const bounty = patrolBounty(t, partyLevel(chosenParty()));
  const next = Math.max(1, Math.round(bounty * num("patrol.decay")));
  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Notice board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-faint uppercase">📜 Work around town</h3>
        <span className="text-xs text-faint">Board: {t.contracts.length}/{boardSize(t)} jobs · more room with a staffed market and tavern</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn font-display" onClick={startPatrol}>
          ⚔ Ride out on patrol
        </button>
        <span className="text-xs text-muted">
          A small fight nearby · {num("patrol.hours")} h · bounty {bounty} gold{patrolsToday(t) > 0 ? ` (patrol ${patrolsToday(t) + 1} today; the next pays ${next})` : `, then ${next}, less each time today`}
        </span>
      </div>
      {t.contracts.length === 0 ? (
        <p className="text-xs text-muted italic">No jobs posted. New ones turn up in the mornings.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {t.contracts.map((c) => (
            <li key={c.id} className="flex flex-col rounded-md border border-line bg-surface-2 p-2 text-sm">
              <strong className="text-strong">{c.title}</strong>
              <span className="flex-1 text-xs text-muted">{c.text}</span>
              <span className="mt-1 text-xs">
                Pays <strong className="text-heal">{rewardText(c.reward)}</strong> · {num("contract.hours")} h · gone in {durationText(Math.max(0, Math.ceil(c.expiresAt - hours)))}
              </span>
              <button className="btn mt-1 self-start px-2 py-0.5 text-xs" onClick={() => startContract(c.id)}>
                Take the job
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Heal lasting injuries; raise the fallen. */
function Shrine({ town: t }: { town: Town }) {
  const id = useActiveProfile((s) => s.id)!;
  const injuries = usePlayers((s) => s.docs[id]?.injuries) ?? {};
  const fallen = usePlayers((s) => s.docs[id]?.fallen) ?? [];
  const names = new Map(availableMembers(myCharacters()).map((e) => [e.key, e.label]));
  const hurt = Object.entries(injuries).filter(([, list]) => list.length);
  const treat = treatCost();
  const raise = raiseCost();
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold tracking-wider text-faint uppercase">🕯 Shrine</h3>
      {hurt.length === 0 && fallen.length === 0 && <p className="text-sm text-muted italic">Nobody needs the priests today.</p>}
      <ul className="space-y-1 text-sm">
        {fallen.map((key) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              ✝ <strong className="text-strong">{names.get(key) ?? key}</strong> <span className="text-danger">has fallen</span>
            </span>
            <button className="btn px-2 py-0.5 text-xs" disabled={!!cantAfford(t, raise)} title={cantAfford(t, raise) ?? ""} onClick={() => raiseHero(key, names.get(key) ?? key)}>
              Raise from the dead ({costText(raise)} · {num("shrine.raiseHours")} h)
            </button>
          </li>
        ))}
        {hurt.flatMap(([key, list]) =>
          list.map((inj, i) => (
            <li key={`${key}-${inj}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="text-strong">{names.get(key) ?? key}</strong>: {INJURIES[inj]?.name} <span className="text-xs text-muted">({INJURIES[inj]?.effect})</span>
              </span>
              <button className="btn px-2 py-0.5 text-xs" disabled={!!cantAfford(t, treat)} title={cantAfford(t, treat) ?? ""} onClick={() => treatInjury(key, names.get(key) ?? key, inj)}>
                Treat ({costText(treat)} · {num("shrine.treatHours")} h)
              </button>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

function Smithy({ town: t }: { town: Town }) {
  const id = useActiveProfile((s) => s.id)!;
  const gear = usePlayers((s) => s.docs[id]?.gear) ?? {};
  usePlayers((s) => s.docs[id]?.characters);
  const progress = usePlayers((s) => s.docs[id]?.progress) ?? {};
  const heroes = availableMembers(myCharacters()).map((e) => withProgress(e, progress[e.key]));
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


function useResidents(ownerId: string): Profile[] {
  const profiles = usePlayers((s) => s.profiles);
  const docs = usePlayers((s) => s.docs);
  return profiles.filter((p) => p.id !== ownerId && docs[p.id]?.residence === ownerId);
}

/** Other players' towns you can travel to and live in. */
function Waystone() {
  const me = useActiveProfile((s) => s.id);
  const profiles = usePlayers((s) => s.profiles);
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
          <div className="grid gap-3 lg:grid-cols-2">
            <ResidentGuild hostId={hostId} />
            <Spies />
          </div>
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
  // Never over a battle: the news waits until the fight is over.
  const inBattle = usePlay((s) => !!s.game);
  const tile = (n: number, icon: string, unit: string) =>
    n === 0 ? null : (
      <li className={clsx("flex flex-col items-center rounded-lg border px-3 py-2", n > 0 ? "border-heal/50 bg-heal/10" : "border-danger/50 bg-danger/10")}>
        <span className="text-2xl">{icon}</span>
        <span className={clsx("font-display text-lg font-bold tabular-nums", n > 0 ? "text-heal" : "text-danger")}>{n > 0 ? `+${n}` : n}</span>
        <span className="text-[10px] text-muted">{unit}</span>
      </li>
    );
  return (
    <Dialog open={!!report && !inBattle} onClose={close} title={title || "Meanwhile…"}>
      {report && (
        <div className="space-y-3 text-sm">
          <div className="text-center">
            <div className="text-5xl" aria-hidden>
              🎁
            </div>
            <p className="text-muted">{durationText(report.hours)} passed. Here's what the town gathered:</p>
          </div>
          <ul className="flex flex-wrap justify-center gap-2">
            {tile(report.gold, "🪙", "gold")}
            {tile(report.food, "🍞", "food")}
            {tile(report.materials, "🪵", "materials")}
            {tile(report.settlers, "🧑‍🌾", report.settlers === 1 || report.settlers === -1 ? "settler" : "settlers")}
          </ul>
          {report.events.length > 0 ? (
            <details open={report.events.some((e) => e.tone === "bad")} className="rounded-md border border-line bg-surface-2/60 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-strong">What happened ({report.events.length})</summary>
              <ol className="mt-1 max-h-60 space-y-1 overflow-y-auto">
                {report.events.map((e, i) => (
                  <li key={i} className={e.tone === "good" ? "text-heal" : e.tone === "bad" ? "text-danger" : "text-text"}>
                    <span className="text-xs text-faint">{clockText(e.at)} · </span>
                    {e.text}
                  </li>
                ))}
              </ol>
            </details>
          ) : (
            <p className="text-center italic">A quiet time. Nothing much happened.</p>
          )}
          <div className="text-center">
            <button className="btn btn-primary px-6 font-display" onClick={close}>
              🎁 Collect
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
