import clsx from "clsx";
import { useEffect, useState } from "react";
import { MISSION_KINDS, type Mission, type MissionKind } from "../domain/players";
import { MISSIONS, missionCost } from "../game/intrigue";
import { STAGE_INFO, canCollect, holds, titheGold, type Hold } from "../game/guilds";
import { banish, cantSpy, collectTithe, crackdownOn, foundGuild, joinGuild, leaveGuild, sendSpy, startReclaim, unban, workForGuild } from "../game/intrigue-store";
import { today } from "../game/town-store";
import { num } from "../game/tuning";
import { useActiveProfile, usePlayers } from "../store/players";
import "../game/intrigue-store";

/**
 * Spies and guilds on screen: the owner's view of guilds in their town and
 * their spies; a resident's guild; and the takeover banner.
 */

function useNow(ms = 10_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const nameOf = (id: string) => usePlayers.getState().profiles.find((p) => p.id === id)?.name ?? "someone";
const STAGE_TONE = ["text-muted", "text-warn", "text-danger", "text-danger"] as const;

/** Influence against authority, with the stage marks. */
export function HoldBar({ hold }: { hold: Hold }) {
  const pct = Math.min(120, hold.ratio * 100);
  return (
    <div>
      <div className="relative h-3 rounded-full bg-surface-3" title={`Influence ${hold.influence} against authority ${hold.authority}`}>
        <div className={clsx("h-3 rounded-full", hold.stage >= 2 ? "bg-danger" : hold.stage === 1 ? "bg-warn" : "bg-accent")} style={{ width: `${(pct / 120) * 100}%` }} />
        {[num("guild.stage1"), num("guild.stage2"), 1].map((m) => (
          <span key={m} className="absolute top-0 h-3 w-px bg-text/40" style={{ left: `${((m * 100) / 120) * 100}%` }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px]">
        <span className={STAGE_TONE[hold.stage]}>
          <strong>{STAGE_INFO[hold.stage].title}</strong> · {STAGE_INFO[hold.stage].text}
        </span>
        <span className="text-faint tabular-nums">
          {hold.influence} / {hold.authority}
        </span>
      </div>
    </div>
  );
}

/** The strongest guild's grip on the owner's town, shown above everything when it matters. */
export function TakeoverBanner({ ownerId, onOpen }: { ownerId: string; onOpen: () => void }) {
  const docs = usePlayers((s) => s.docs);
  const now = useNow();
  const top = holds(ownerId, docs, now)[0];
  if (!top || top.stage === 0) return null;
  return (
    <button className={clsx("flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left text-sm", top.stage >= 2 ? "border-danger bg-danger/10" : "border-warn bg-warn/10")} onClick={onOpen}>
      <span className="text-2xl">🏛</span>
      <span className="min-w-0 flex-1">
        <strong className="text-strong">
          {top.guild.name}: {STAGE_INFO[top.stage].title}
        </strong>
        <span className="block text-xs text-muted">
          {STAGE_INFO[top.stage].text}
          {top.stage === 1 ? ` Production −${Math.round(num("guild.tithe") * 100)}%.` : ""} See 🕵 Intrigue.
        </span>
      </span>
    </button>
  );
}

/** The owner's tab: guilds in the town, and spies. */
export function IntrigueTab({ ownerId }: { ownerId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GuildsInMyTown ownerId={ownerId} />
      <Spies />
    </div>
  );
}

function GuildsInMyTown({ ownerId }: { ownerId: string }) {
  const docs = usePlayers((s) => s.docs);
  const now = useNow();
  const list = holds(ownerId, docs, now);
  const t = docs[ownerId]?.town;
  const cooldown = t ? Math.max(0, t.lastCrackdown + num("guild.crackdownHours") * 3_600_000 - now) : 0;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Guilds in your town">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🏛 Guilds in your town</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted italic">No guilds. Heroes who move into your town can found one; their influence grows every day they stay.</p>
      ) : (
        list.map((h) => (
          <div key={h.guild.id} className="space-y-2 rounded-md border border-line bg-surface-2/60 p-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-strong">{h.guild.name}</strong>
              <span className="text-xs text-muted">{h.guild.members.map(nameOf).join(", ")}</span>
            </div>
            <HoldBar hold={h} />
            <div className="flex flex-wrap gap-1">
              {h.stage < 3 && (
                <button className="btn px-2 py-0.5 text-xs" disabled={cooldown > 0 || (t?.gold ?? 0) < num("guild.crackdownGold")} onClick={() => crackdownOn(h.guild.id)} title="The watch leans on the guild: influence goes down">
                  👮 Crack down ({num("guild.crackdownGold")} gold){cooldown > 0 ? ` · in ${Math.ceil(cooldown / 3_600_000)} h` : ""}
                </button>
              )}
              {h.stage <= 1 && (
                <button className="btn px-2 py-0.5 text-xs" onClick={() => confirm(`Banish ${h.guild.name}'s members from the town?`) && banish(h.guild.id)}>
                  🚪 Banish them
                </button>
              )}
              {h.stage === 3 && (
                <button className="btn btn-primary px-2 py-0.5 text-xs" onClick={() => startReclaim(h.guild.id)}>
                  ⚔ Take the town back (fight)
                </button>
              )}
            </div>
          </div>
        ))
      )}
      <p className="text-[11px] text-faint">
        Your authority grows with your heroes' renown, the town's spirit, happy settlers and staffed watchtowers, and drops while you live elsewhere. Influence above half of it brings a tithe; above three quarters, the guild blocks the market, hiring, notices and upgrades; above all of it, the guild runs the town.
      </p>
      {t && t.banned.length > 0 && (
        <div className="text-xs">
          Banished:{" "}
          {t.banned.map((b) => (
            <button key={b} className="btn btn-ghost px-1 py-0 text-xs" onClick={() => unban(b)} title="Let them back">
              {nameOf(b)} ✕
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Send spies to other players' towns, and read what they found. */
export function Spies() {
  const me = useActiveProfile((s) => s.id)!;
  const docs = usePlayers((s) => s.docs);
  const profiles = usePlayers((s) => s.profiles);
  const now = useNow();
  const mine = docs[me];
  const targets = profiles.filter((p) => p.id !== me && docs[p.id]?.town);
  const [target, setTarget] = useState("");
  const chosen = target || targets[0]?.id || "";
  const missions = [...(mine?.missions ?? [])].reverse();
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Spies">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🕵 Spies</h3>
      {targets.length === 0 ? (
        <p className="text-sm text-muted italic">No other towns to send spies to yet.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            Target
            <select className="field w-auto py-1" value={chosen} onChange={(e) => setTarget(e.target.value)} aria-label="Spy target">
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {docs[p.id]!.town!.name} ({p.name})
                </option>
              ))}
            </select>
          </label>
          <ul className="grid gap-2 sm:grid-cols-3">
            {MISSION_KINDS.map((k: MissionKind) => {
              const why = cantSpy(mine, k);
              return (
                <li key={k}>
                  <button className="flex h-full w-full flex-col rounded-md border border-line bg-surface-2 p-2 text-left text-sm hover:border-accent disabled:opacity-55" disabled={!!why || !chosen} onClick={() => sendSpy(chosen, k)} title={why ?? ""}>
                    <span className="font-semibold text-strong">
                      {MISSIONS[k].icon} {MISSIONS[k].name}
                    </span>
                    <span className="flex-1 text-xs text-muted">{MISSIONS[k].text}</span>
                    <span className="text-[11px] text-faint">
                      🪙 {missionCost(k)} · ⏱ {num("spy.minutes")} min
                    </span>
                    {why && <span className="text-[11px] text-warn">{why}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {missions.length > 0 && (
        <ol className="space-y-1 text-sm" aria-label="Missions">
          {missions.map((m) => (
            <MissionRow key={m.id} m={m} now={now} />
          ))}
        </ol>
      )}
    </section>
  );
}

function MissionRow({ m, now }: { m: Mission; now: number }) {
  const docs = usePlayers((s) => s.docs);
  const where = docs[m.target]?.town?.name ?? nameOf(m.target);
  const r = m.result;
  return (
    <li className={clsx("rounded-md border px-2 py-1", r?.caught ? "border-danger/50 bg-danger/5" : r ? "border-heal/50 bg-heal/5" : "border-line")}>
      <div className="flex justify-between gap-2">
        <span>
          {MISSIONS[m.kind].icon} {MISSIONS[m.kind].name} · <strong className="text-strong">{where}</strong>
        </span>
        <span className="text-xs text-faint">{r ? (r.caught ? "Caught" : "Done") : `Arrives in ${Math.max(1, Math.round((m.arriveAt - now) / 60_000))} min`}</span>
      </div>
      {r?.report && (
        <div className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
          {Object.entries(r.report).map(([k, v]) => (
            <span key={k} className="rounded-full bg-surface-3 px-1.5 text-muted">
              {k}: {v}
            </span>
          ))}
        </div>
      )}
      {r?.damage && (
        <div className="text-[11px] text-muted">
          Burned {r.damage.food} food and {r.damage.materials} materials.
        </div>
      )}
    </li>
  );
}

/** A resident's view: guilds in the town they live in. */
export function ResidentGuild({ hostId }: { hostId: string }) {
  const me = useActiveProfile((s) => s.id)!;
  const docs = usePlayers((s) => s.docs);
  const now = useNow();
  const mine = docs[me];
  const list = holds(hostId, docs, now);
  const [name, setName] = useState("");
  const myHold = mine?.guild && mine.guild.town === hostId ? list.find((h) => h.guild.id === mine.guild!.id) : undefined;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Guild">
      <h3 className="text-xs font-bold tracking-wider text-faint uppercase">🏛 Guild</h3>
      {myHold ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <strong className="text-strong">{myHold.guild.name}</strong>
            <span className="text-xs text-muted">{myHold.guild.members.map(nameOf).join(", ")}</span>
          </div>
          <HoldBar hold={myHold} />
          <div className="flex flex-wrap gap-1">
            <button className="btn px-2 py-0.5 text-xs" disabled={mine!.guildWork.day === today()} onClick={workForGuild}>
              🔨 Work for the guild (+{num("guild.perWork")}){mine!.guildWork.day === today() ? " · done today" : ""}
            </button>
            {myHold.guild.id === me && myHold.stage === 3 && (
              <button className="btn btn-primary px-2 py-0.5 text-xs" disabled={!canCollect(mine!.lastTithe, now)} onClick={collectTithe}>
                💰 Collect the tithe ({titheGold(myHold.guild)} gold)
              </button>
            )}
            <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => confirm("Leave the guild?") && leaveGuild()}>
              Leave
            </button>
          </div>
          <p className="text-[11px] text-faint">Influence grows every day you stay (faster with more renown), with each day's work, and with unrest your spies stir here.</p>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          {list.map((h) => (
            <div key={h.guild.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2/60 p-2">
              <span>
                <strong className="text-strong">{h.guild.name}</strong> <span className="text-xs text-muted">· {h.guild.members.map(nameOf).join(", ")}</span>
              </span>
              <button className="btn px-2 py-0.5 text-xs" onClick={() => joinGuild(h.guild)}>
                Join
              </button>
            </div>
          ))}
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) foundGuild(name);
            }}
          >
            <input className="field flex-1 py-1" placeholder="Name a new guild" value={name} onChange={(e) => setName(e.target.value)} aria-label="Guild name" />
            <button className="btn px-2 text-sm" disabled={!name.trim()}>
              Found ({num("guild.foundGold")} gold)
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
