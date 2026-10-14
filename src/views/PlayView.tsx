import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { HpBar } from "../components/HpBar";
import { actionDamage, describeAction, formatMod, type StatAction } from "../domain/statblock";
import { averageDamage, hitChance } from "../game/ai";
import { canAct, checkTarget, currentUnit } from "../game/engine";
import { GameBoard, type BoardMode } from "../game/GameBoard";
import { SCENARIOS, encounterScenario, objectiveText, type Scenario } from "../game/scenarios";
import { mapScenario } from "../game/maps";
import type { GameState, Unit } from "../game/state";
import { dispatch, quitGame, startGame, usePlay } from "../game/store";
import { useGame } from "../store/game";
import { ADVENTURES } from "../content/adventures";
import { beginAdventure, returnFromBattle, useCampaign } from "../game/campaign-store";
import { POTIONS } from "../game/engine";
import { distanceFt } from "../game/board";
import { AdventureView } from "./AdventureView";
import { AwayReportDialog, TownView } from "./TownView";
import { RaidNewsDialog, ThreatBar } from "./RaidAlerts";
import { finishTownBattle } from "../game/town-store";
import { CharacterBuilder } from "../components/CharacterBuilder";
import type { CharacterSpec } from "../domain/character";
import { newId } from "../domain/combat";
import { characterKey, suggestedSpec } from "../game/builder";
import { MAX_PARTY, availableMembers, deleteCharacter, togglePick } from "../game/party-store";
import { bindSaves } from "../game/save-bind";
import { claimSave, legacySaves, useActiveProfile, usePlayers } from "../store/players";
import { XP_BY_CR, withProgress } from "../game/party";
import { INJURIES } from "../game/injuries";
import { num } from "../game/tuning";

/** Solo skirmish: your four heroes against an encounter, monsters run by the computer. */
bindSaves();

export function PlayView() {
  const game = usePlay((s) => s.game);
  const campaign = useCampaign((s) => s.state);
  const activeId = useActiveProfile((s) => s.id);
  const profiles = usePlayers((s) => s.profiles);
  const loaded = usePlayers((s) => (activeId ? !!s.loaded[activeId] : false));
  const active = profiles.find((p) => p.id === activeId);
  if (!active || !loaded) return <p className="mt-20 animate-pulse text-center text-muted">Loading your game…</p>;
  return (
    <>
      {game ? (
        <Battle game={game} />
      ) : campaign ? (
        <div className="mx-auto w-full max-w-6xl space-y-3">
          <ThreatBar />
          <AdventureView state={campaign} />
        </div>
      ) : (
        <Home />
      )}
      <AwayReportDialog />
      <RaidNewsDialog />
    </>
  );
}

/** Between adventures: your town, or setting out. */
function Home() {
  const [tab, setTab] = useState<"town" | "adventure">("town");
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ClaimOldSave />
      <div className="relative flex items-center gap-1 border-b border-line" role="tablist">
        {(
          [
            ["town", "🏘 Town"],
            ["adventure", "🗺 Adventures & skirmishes"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={clsx("-mb-px rounded-t-md border px-4 py-2 font-display text-sm", tab === k ? "border-line border-b-surface bg-surface text-accent" : "border-transparent text-muted hover:text-strong")}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto">
          <PlayingAs />
        </span>
      </div>
      {tab === "town" ? (
        <TownView />
      ) : (
        <>
          <ThreatBar onGoTown={() => setTab("town")} />
          <ScenarioPicker />
        </>
      )}
    </div>
  );
}

function ScenarioPicker() {
  const encounters = useGame((s) => s.library.encounters);
  const custom = useGame((s) => s.library.adventures);
  const maps = useGame((s) => s.library.maps);
  const roster = useGame((s) => s.library.roster);
  const myMaps = maps.map((m) => ({ map: m, sc: mapScenario(m, roster) })).filter((x) => x.sc.custom.length > 0 && x.sc.starts!.length > 0);
  const adventures = [...ADVENTURES, ...custom];
  const activeId = useActiveProfile((s) => s.id);
  const completed = usePlayers((s) => (activeId ? s.docs[activeId]?.completed : undefined)) ?? [];
  const open = adventures.filter((a) => !completed.includes(a.id));
  const done = adventures.filter((a) => completed.includes(a.id));
  const playable = encounters
    .map((e) => encounterScenario(e.name, e.combatants))
    .filter((sc) => sc.custom.length > 0);

  const card = (sc: Scenario & { custom?: unknown[] }) => (
    <li key={sc.id} className="flex flex-col rounded-lg border border-line bg-surface p-4 shadow">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-accent">{sc.name}</h3>
        {sc.difficulty && <span className="text-xs text-faint uppercase">{sc.difficulty}</span>}
      </div>
      <p className="mt-1 flex-1 text-sm text-muted">{sc.blurb}</p>
      <button className="btn btn-primary mt-3 font-display" onClick={() => startGame(sc as Scenario)}>
        ⚔ Fight
      </button>
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-accent">Play</h2>
        <p className="text-sm text-muted">A solo skirmish with the 2024 rules. You command the party; the monsters fight back.</p>
      </header>
      <PartyPicker />
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">Adventures</h3>
        <ul className="grid gap-3 md:grid-cols-2">
          {open.map((a) => (
            <li key={a.id} className="flex flex-col rounded-lg border-2 border-accent/60 bg-surface p-4 shadow">
              <h3 className="text-xl font-bold text-accent">{a.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{a.blurb}</p>
              <p className="mt-2 text-xs text-faint">{ADVENTURES.includes(a) ? "Built in" : "Your adventure"} · {Object.keys(a.scenes).length} scenes</p>
              <button className="btn btn-primary mt-3 font-display" onClick={() => beginAdventure(a)}>
                Begin the adventure
              </button>
            </li>
          ))}
        </ul>
        {open.length === 0 && <p className="text-sm text-muted italic">You've completed every adventure there is. The DM can write new ones (📖 Adventures).</p>}
        {done.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted">✓ Completed ({done.length})</summary>
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {done.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">
                  <span>
                    <strong className="text-strong">{a.title}</strong> <span className="text-xs text-heal">completed</span>
                  </span>
                  <button className="btn px-2 py-0.5 text-xs" onClick={() => beginAdventure(a)} title="Play it again for fun: no XP, gold or settlers">
                    Play again (no rewards)
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">Quick skirmish</h3>
        <ul className="grid gap-3 md:grid-cols-3">{SCENARIOS.map(card)}</ul>
      </section>
      {myMaps.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">Your maps</h3>
          <ul className="grid gap-3 md:grid-cols-3">{myMaps.map((x) => card(x.sc))}</ul>
        </section>
      )}
      {playable.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold tracking-wider text-faint uppercase">From your saved encounters</h3>
          <ul className="grid gap-3 md:grid-cols-3">{playable.map(card)}</ul>
          <p className="mt-2 text-xs text-faint">Only monsters with a structured stat block take part.</p>
        </section>
      )}
    </div>
  );
}

/** Choose up to four heroes from the ready-made party and the characters you built. */
function PartyPicker() {
  const shared = useGame((s) => s.library.characters);
  const activeId = useActiveProfile((s) => s.id);
  const mine = usePlayers((s) => (activeId ? s.docs[activeId]?.characters : undefined));
  const picks = usePlayers((s) => (activeId ? s.docs[activeId]?.picks : undefined)) ?? [];
  const characters = useMemo(() => [...shared, ...(mine ?? [])], [shared, mine]);
  const [editing, setEditing] = useState<CharacterSpec | null>(null);
  const progress = usePlayers((s) => (activeId ? s.docs[activeId]?.progress : undefined));
  const fallenKeys = usePlayers((s) => (activeId ? s.docs[activeId]?.fallen : undefined)) ?? [];
  const injuries = usePlayers((s) => (activeId ? s.docs[activeId]?.injuries : undefined));
  const members = availableMembers(characters).map((e) => withProgress(e, progress?.[e.key]));
  const custom = new Map(characters.map((c) => [characterKey(c), c]));
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-faint uppercase">
          Your party · {picks.length}/{MAX_PARTY}
        </h3>
        <button className="btn px-2 text-xs" onClick={() => setEditing(suggestedSpec("Fighter", newId(), ""))}>
          + Build a character
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {members.map((p) => {
          const on = picks.includes(p.key);
          const isFallen = fallenKeys.includes(p.key);
          const hurt = injuries?.[p.key] ?? [];
          const spec = custom.get(p.key);
          return (
            <li key={p.key} className={clsx("flex items-start gap-2 rounded-md border p-3 text-sm", on ? "border-accent bg-accent/10" : "border-line bg-surface-2")}>
              <label className={clsx("flex flex-1 items-start gap-2", isFallen ? "opacity-60" : "cursor-pointer")}>
                <input type="checkbox" className="mt-1" checked={on && !isFallen} disabled={isFallen || (!on && picks.length >= MAX_PARTY)} onChange={() => togglePick(p.key)} />
                <span>
                  <span className={clsx("block font-bold text-strong", isFallen && "line-through")}>
                    {isFallen && "✝ "}
                    {p.label}
                  </span>
                  <span className="block text-xs text-faint">{p.subtitle}</span>
                  {isFallen && <span className="block text-xs text-danger">Fallen: raise them at a shrine</span>}
                  {hurt.length > 0 && <span className="block text-xs text-warn">🩹 {hurt.map((x) => INJURIES[x]?.name).join(", ")}</span>}
                </span>
              </label>
              {spec && (
                <span className="flex flex-col gap-1">
                  <button className="btn btn-ghost px-1.5 py-0.5 text-xs" onClick={() => setEditing(spec)} aria-label={`Edit ${p.label}`}>
                    ✎
                  </button>
                  <button
                    className="btn btn-ghost px-1.5 py-0.5 text-xs"
                    aria-label={`Delete ${p.label}`}
                    onClick={() => {
                      if (!confirm(`Delete ${p.label}?`)) return;
                      deleteCharacter(spec.id);
                    }}
                  >
                    🗑
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {picks.length === 0 && <p className="mt-1 text-xs text-danger">Pick at least one hero (the ready-made party goes otherwise).</p>}
      <CharacterBuilder initial={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

/** Saves from before logins that this player can take over. */
function ClaimOldSave() {
  usePlayers((s) => s.docs);
  useGame((s) => s.players);
  const old = legacySaves();
  if (!old.length) return null;
  return (
    <div className="rounded-lg border border-accent/60 bg-accent/5 p-3 text-sm" aria-label="Old saves">
      <strong className="text-strong">Played here before logins?</strong> <span className="text-muted">Take over your old save: heroes, town and progress. It replaces what this account has.</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {old.map((o) => (
          <button key={o.id} className="btn text-sm" onClick={() => confirm(`Is "${o.name}" you? Your account takes over that save.`) && claimSave(o.id)}>
            That was me: {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayingAs() {
  const activeId = useActiveProfile((s) => s.id);
  const p = usePlayers((s) => s.profiles.find((x) => x.id === activeId));
  if (!p) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: p.color }} />
      Playing as <strong className="text-strong">{p.name}</strong>
    </div>
  );
}

function Battle({ game }: { game: GameState }) {
  const { scenario, log, fx, paths, aiRunning, mode: playMode } = usePlay();
  const [mode, setMode] = useState<BoardMode>({ kind: "move" });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const active = currentUnit(game);
  const heroTurn = !aiRunning && !game.outcome && active?.side === "party" && canAct(active);

  // Back to moving whenever the turn changes or an action is used.
  useEffect(() => setMode({ kind: "move" }), [active?.id, active?.turn.action, active?.turn.bonusAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") setMode({ kind: "move" });
      if ((e.key === "e" || e.key === "E") && heroTurn && active) dispatch({ type: "end-turn", unitId: active.id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [heroTurn, active]);

  return (
    <div className="flex w-full flex-col gap-3 lg:h-[calc(100dvh-6rem)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-accent">{scenario?.name ?? "Skirmish"}</h2>
          {game.objective && !game.outcome && (
            <p className="text-sm font-semibold text-heal" aria-label="Objective">
              🎯 {objectiveText(game.objective, game.round)}
            </p>
          )}
          <p className="text-sm text-muted">
            Round <strong className="text-strong">{game.round}</strong> ·{" "}
            {game.outcome ? (game.outcome === "victory" ? "Victory!" : game.fled ? "Retreat" : "Defeat") : aiRunning ? "Monsters are acting…" : active ? `${active.name}'s turn` : ""}
          </p>
        </div>
        {playMode !== "town" && (
          <div className="min-w-0 flex-1">
            <ThreatBar compact />
          </div>
        )}
        {playMode === "campaign" || playMode === "town" ? (
          !game.outcome && (
            <button
              className="btn btn-ghost"
              disabled={!active || active.side !== "party" || aiRunning}
              title="On a hero's turn: enemies next to your heroes get a parting attack, and the fight counts as lost"
              onClick={() =>
                active &&
                confirm(`Retreat? Every enemy next to a standing hero gets a parting attack, the fight counts as lost${playMode === "town" && usePlay.getState().context?.kind === "raid" ? ", and the raiders plunder the town" : ", and the way back takes time"}.`) &&
                dispatch({ type: "retreat", unitId: active.id })
              }
            >
              Retreat
            </button>
          )
        ) : (
          <button className="btn btn-ghost" onClick={() => confirm("Abandon this battle?") && quitGame()}>
            Quit battle
          </button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[15rem_1fr_20rem]">
        <TurnOrder game={game} hoverId={hoverId} />

        <section className="relative min-h-[50dvh] rounded-lg border border-line bg-surface p-2 shadow lg:min-h-0" aria-label="Battlefield">
          <GameBoard
            game={game}
            mode={mode}
            interactive={heroTurn}
            fx={fx}
            paths={paths}
            onMove={(to) => active && dispatch({ type: "move", unitId: active.id, to })}
            onTarget={(targetId) => {
              if (!active || mode.kind !== "target") return;
              const special = mode.actionId;
              if (special === "@help") return void dispatch({ type: "help", unitId: active.id, targetId });
              if (special === "@shove") return void dispatch({ type: "shove", unitId: active.id, targetId });
              if (special === "@shove-prone") return void dispatch({ type: "shove", unitId: active.id, targetId, prone: true });
              if (special === "@grapple") return void dispatch({ type: "grapple", unitId: active.id, targetId });
              const action = active.stats.actions.find((a) => a.id === mode.actionId);
              const many = action?.kind === "buff" ? action.targets : action?.kind === "heal" ? (action.targets ?? 1) : 1;
              if (action && many > 1) {
                // Several targets: collect them, then confirm in the side panel.
                const picked = mode.picked ?? [];
                const next = picked.includes(targetId) ? picked.filter((x) => x !== targetId) : [...picked, targetId].slice(-many);
                setMode({ ...mode, picked: next });
                return;
              }
              dispatch({ type: "action", unitId: active.id, actionId: mode.actionId, targetId });
            }}
            onArea={(point) => {
              if (active && mode.kind === "area") dispatch({ type: "action", unitId: active.id, actionId: mode.actionId, point });
            }}
            onHoverUnit={setHoverId}
          />
          {game.outcome && <Outcome game={game} />}
        </section>

        <div className="flex min-h-0 flex-col gap-3">
          {active && !game.outcome && <HeroPanel game={game} unit={active} heroTurn={heroTurn} mode={mode} setMode={setMode} hoverId={hoverId} />}
          <CombatLog lines={log} />
        </div>
      </div>
    </div>
  );
}

function TurnOrder({ game, hoverId }: { game: GameState; hoverId: string | null }) {
  const active = currentUnit(game);
  return (
    <section className="min-h-0 overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow" aria-label="Turn order">
      <ol className="space-y-1">
        {game.units.map((u) => (
          <li
            key={u.id}
            className={clsx(
              "rounded-md border px-2 py-1.5 text-sm",
              u.id === active?.id ? "border-accent bg-accent/10" : u.id === hoverId ? "border-line bg-surface-3/50" : "border-transparent",
              u.dead && "opacity-40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={clsx("truncate font-semibold", u.side === "enemy" ? "text-danger" : "text-strong", u.dead && "line-through")}>{u.name}</span>
              <span className="text-xs text-faint tabular-nums">
                {u.hp}/{u.hpMax}
              </span>
            </div>
            <HpBar combatant={{ hpCurrent: u.hp, hpMax: u.hpMax, hpTemp: u.tempHp }} className="mt-1" />
            {(u.conditions.length > 0 || (u.hp <= 0 && !u.dead && u.side === "party")) && (
              <div className="mt-1 text-[10px] text-muted">
                {u.conditions.join(", ")}
                {u.hp <= 0 && !u.dead && u.side === "party" && ` · death saves ${u.death.successes}✓ ${u.death.failures}✗${u.death.stable ? " (stable)" : ""}`}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", on ? "bg-heal text-white" : "bg-surface-3 text-faint line-through")}>{label}</span>
  );
}

function HeroPanel({
  game,
  unit: u,
  heroTurn,
  mode,
  setMode,
  hoverId,
}: {
  game: GameState;
  unit: Unit;
  heroTurn: boolean;
  mode: BoardMode;
  setMode: (m: BoardMode) => void;
  hoverId: string | null;
}) {
  const send = (cmd: Parameters<typeof dispatch>[0]) => dispatch(cmd);
  const prone = u.conditions.includes("Prone");
  const secondWind = u.stats.features.includes("second-wind") ? (u.resources["second-wind"] ?? 0) : null;
  const target = hoverId ? game.units.find((x) => x.id === hoverId) : undefined;

  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow" aria-label="Current creature">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-strong">{u.name}</h3>
        <span className="text-xs text-faint">
          AC {u.ac} · {u.hp}/{u.hpMax} HP
        </span>
      </div>
      {u.side === "party" && u.turn.needsDeathSave ? (
        <DyingPanel unit={u} busy={usePlay.getState().aiRunning || !!game.outcome} />
      ) : u.side === "party" ? (
        <>
          <div className="flex flex-wrap gap-1">
            <Pip on={u.turn.action} label="Action" />
            <Pip on={u.turn.bonusAction} label="Bonus" />
            <Pip on={u.reaction} label="Reaction" />
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-strong">{u.turn.movement} ft</span>
            {(u.turn.attacksLeft ?? 0) > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">{u.turn.attacksLeft} more attack</span>}
          </div>
          <SpellSlots unit={u} />
          {u.concentration && <p className="text-xs text-highlight">Concentrating on {u.concentration}</p>}

          <div className="space-y-1.5">
            {u.stats.actions.map((a) => {
              const selected = mode.kind !== "move" && mode.actionId === a.id;
              const noSlot = !!a.slot && (u.resources[`slot${a.slot}`] ?? 0) <= 0;
              return (
                <button
                  key={a.id}
                  disabled={!heroTurn || !u.turn[a.bonusAction ? "bonusAction" : "action"] || noSlot}
                  onClick={() => setMode(selected ? { kind: "move" } : isArea(a) ? { kind: "area", actionId: a.id } : { kind: "target", actionId: a.id })}
                  aria-pressed={selected}
                  className={clsx(
                    "w-full rounded-md border p-2 text-left text-sm transition disabled:opacity-40",
                    selected ? "border-accent bg-accent/10" : "border-line bg-surface-2 hover:border-accent",
                  )}
                >
                  <div className="font-semibold text-strong">{a.name}</div>
                  <div className="text-xs text-muted">{describeAction(a)}</div>
                </button>
              );
            })}
          </div>

          {mode.kind === "target" && mode.actionId.startsWith("@") && <SpecialPreview unit={u} actionId={mode.actionId} />}
          {mode.kind === "target" && !mode.actionId.startsWith("@") && <TargetPreview game={game} attacker={u} actionId={mode.actionId} target={target} />}
          {mode.kind === "target" && <PickedTargets game={game} unit={u} mode={mode} />}

          <div className="grid grid-cols-3 gap-1">
            <button className="btn px-1 text-xs" disabled={!heroTurn || !u.turn.action} onClick={() => send({ type: "dash", unitId: u.id })} title="Double your movement this turn">
              Dash
            </button>
            <button className="btn px-1 text-xs" disabled={!heroTurn || !u.turn.action} onClick={() => send({ type: "disengage", unitId: u.id })} title="Move without opportunity attacks">
              Disengage
            </button>
            <button className="btn px-1 text-xs" disabled={!heroTurn || !u.turn.action} onClick={() => send({ type: "dodge", unitId: u.id })} title="Attacks against you have Disadvantage">
              Dodge
            </button>
            <button className={clsx("btn px-1 text-xs", mode.kind === "target" && mode.actionId === "@help" && "border-accent text-accent")} disabled={!heroTurn || !u.turn.action} onClick={() => setMode({ kind: "target", actionId: "@help" })} title="Pick an enemy within 5 ft: the next ally to attack it has Advantage">
              🤝 Help
            </button>
            <button className="btn px-1 text-xs" disabled={!heroTurn || !u.turn.action} onClick={() => send({ type: "hide", unitId: u.id })} title="Needs three-quarters cover from every foe that can see you. Stealth vs 15: your next attack has Advantage, theirs against you Disadvantage">
              🫥 Hide
            </button>
            <button className={clsx("btn px-1 text-xs", mode.kind === "target" && mode.actionId.startsWith("@shove") && "border-accent text-accent")} disabled={!heroTurn || (!u.turn.action && !u.turn.attacksLeft)} onClick={() => setMode({ kind: "target", actionId: mode.kind === "target" && mode.actionId === "@shove" ? "@shove-prone" : "@shove" })} title="One of your attacks: push an enemy 5 ft (click again: knock it Prone)">
              ✋ {mode.kind === "target" && mode.actionId === "@shove-prone" ? "Trip" : "Shove"}
            </button>
            <button className={clsx("btn px-1 text-xs", mode.kind === "target" && mode.actionId === "@grapple" && "border-accent text-accent")} disabled={!heroTurn || (!u.turn.action && !u.turn.attacksLeft)} onClick={() => setMode({ kind: "target", actionId: "@grapple" })} title="One of your attacks: hold an enemy in place (speed 0)">
              🤼 Grapple
            </button>
            {u.conditions.includes("Grappled") && (
              <button className="btn col-span-2 px-1 text-xs" disabled={!heroTurn || !u.turn.action} onClick={() => send({ type: "escape", unitId: u.id })} title="Athletics or Acrobatics against the holder's DC">
                Break free
              </button>
            )}
            {secondWind !== null && (
              <button
                className="btn col-span-2 px-1 text-xs"
                disabled={!heroTurn || !u.turn.bonusAction || secondWind <= 0}
                onClick={() => send({ type: "second-wind", unitId: u.id })}
                title="Bonus action: regain 1d10 + level HP"
              >
                Second Wind ({secondWind})
              </button>
            )}
            {prone && (
              <button className="btn px-1 text-xs" disabled={!heroTurn} onClick={() => send({ type: "stand-up", unitId: u.id })}>
                Stand up
              </button>
            )}
            {u.stats.features.includes("action-surge") && (
              <button
                className="btn col-span-3 px-1 text-xs"
                disabled={!heroTurn || u.turn.action || (u.resources["action-surge"] ?? 0) <= 0}
                onClick={() => send({ type: "action-surge", unitId: u.id })}
                title="After using your action: take one more"
              >
                Action Surge ({u.resources["action-surge"] ?? 0})
              </button>
            )}
            {u.stats.features.includes("cunning-action") && (
              <>
                <button className="btn col-span-3 px-1 text-xs sm:col-span-1" disabled={!heroTurn || !u.turn.bonusAction} onClick={() => send({ type: "dash", unitId: u.id, bonus: true })} title="Cunning Action: Dash as a bonus action">
                  Bonus Dash
                </button>
                <button className="btn col-span-3 px-1 text-xs sm:col-span-1" disabled={!heroTurn || !u.turn.bonusAction} onClick={() => send({ type: "disengage", unitId: u.id, bonus: true })} title="Cunning Action: Disengage as a bonus action">
                  Bonus Disengage
                </button>
                <button className="btn col-span-3 px-1 text-xs sm:col-span-1" disabled={!heroTurn || !u.turn.bonusAction} onClick={() => send({ type: "hide", unitId: u.id, bonus: true })} title="Cunning Action: Hide as a bonus action">
                  Bonus Hide
                </button>
              </>
            )}
            {u.stats.features.includes("turn-undead") && (
              <button
                className="btn col-span-3 px-1 text-xs"
                disabled={!heroTurn || !u.turn.action || (u.resources["channel-divinity"] ?? 0) <= 0}
                onClick={() => send({ type: "turn-undead", unitId: u.id })}
                title="Undead within 30 ft: Wisdom save or Turned until damaged"
              >
                Turn Undead ({u.resources["channel-divinity"] ?? 0})
              </button>
            )}
          </div>

          <Potions game={game} unit={u} heroTurn={heroTurn} />

          <button className="btn btn-primary w-full font-display" disabled={!heroTurn} onClick={() => send({ type: "end-turn", unitId: u.id })} title="Shortcut: E">
            End turn
          </button>
          <p className="text-[11px] text-faint">
            {mode.kind === "target"
              ? "Click a highlighted creature · Esc to cancel"
              : mode.kind === "area"
                ? "Hover to aim, click a square to cast · Esc to cancel"
                : "Click a lit square to move · pick an action to attack"}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted italic">The monsters are taking their turn…</p>
      )}
    </section>
  );
}

const isArea = (a: StatAction) => a.kind === "save" && !!a.area;

function SpellSlots({ unit: u }: { unit: Unit }) {
  const levels = u.stats.spellSlots.map((max, i) => ({ level: i + 1, max, left: u.resources[`slot${i + 1}`] ?? 0 })).filter((x) => x.max > 0);
  if (levels.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted" aria-label="Spell slots">
      {levels.map((l) => (
        <span key={l.level} className="flex items-center gap-1" title={`Level ${l.level} spell slots: ${l.left} of ${l.max}`}>
          <span>{ordinalShort(l.level)}</span>
          {Array.from({ length: l.max }, (_, i) => (
            <span key={i} className={clsx("inline-block h-2.5 w-2.5 rotate-45 border border-accent", i < l.left ? "bg-accent" : "bg-transparent")} />
          ))}
        </span>
      ))}
    </div>
  );
}

const ordinalShort = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** Bless and friends: the creatures picked so far, and a button to cast. */
function PickedTargets({ game, unit: u, mode }: { game: GameState; unit: Unit; mode: Extract<BoardMode, { kind: "target" }> }) {
  const action = u.stats.actions.find((a) => a.id === mode.actionId);
  const many = action?.kind === "buff" ? action.targets : action?.kind === "heal" ? (action.targets ?? 1) : 1;
  if (!action || many <= 1) return null;
  const picked = mode.picked ?? [];
  return (
    <div className="space-y-1 rounded-md border border-line bg-surface-2/60 p-2 text-xs">
      <div className="text-muted">
        Pick up to {many}: {picked.length ? picked.map((id) => game.units.find((x) => x.id === id)?.name).join(", ") : "nobody yet"}
      </div>
      <button
        className="btn btn-primary w-full text-xs"
        disabled={picked.length === 0}
        onClick={() => dispatch({ type: "action", unitId: u.id, actionId: action.id, targetIds: picked })}
      >
        Cast {action.name} on {picked.length}
      </button>
    </div>
  );
}

/** A dying hero's turn: the player rolls the death save. */
function DyingPanel({ unit: u, busy }: { unit: Unit; busy: boolean }) {
  const pips = (n: number, mark: string, cls: string) =>
    Array.from({ length: 3 }, (_, i) => (
      <span key={i} className={clsx("inline-block w-5 text-center text-lg", i < n ? cls : "text-faint opacity-40")}>
        {mark}
      </span>
    ));
  return (
    <div className="space-y-3 rounded-md border-2 border-danger bg-danger/10 p-3 text-center">
      <p className="font-display text-lg font-bold text-danger">💀 {u.name} is dying</p>
      <div className="flex justify-center gap-6 text-sm">
        <div>
          <div className="text-xs text-faint">Successes</div>
          {pips(u.death.successes, "♥", "text-heal")}
        </div>
        <div>
          <div className="text-xs text-faint">Failures</div>
          {pips(u.death.failures, "✗", "text-danger")}
        </div>
      </div>
      <button className="btn btn-primary w-full font-display" disabled={busy} onClick={() => dispatch({ type: "death-save", unitId: u.id })}>
        🎲 Roll the death save
      </button>
      <p className="text-xs text-muted">10 or more: a success; three successes and they're stable. A 20: back on their feet. Two failures leave a lasting injury; three, and they die.</p>
    </div>
  );
}

/** What Help, Shove and Grapple do, while picking their target. */
function SpecialPreview({ unit: u, actionId }: { unit: Unit; actionId: string }) {
  const dc = 8 + Math.floor((u.stats.abilities.str - 10) / 2) + u.stats.proficiency;
  const text: Record<string, string> = {
    "@help": "Pick an enemy within 5 ft. The next ally who attacks it has Advantage.",
    "@shove": `Pick an enemy within 5 ft. Strength or Dexterity save, DC ${dc}: on a failure it's pushed 5 ft away. Click Shove again to trip it instead.`,
    "@shove-prone": `Pick an enemy within 5 ft. Strength or Dexterity save, DC ${dc}: on a failure it falls Prone (melee attacks against it have Advantage).`,
    "@grapple": `Pick an enemy within 5 ft. Strength or Dexterity save, DC ${dc}: on a failure its speed drops to 0 until it breaks free or you move away.`,
  };
  return <p className="rounded-md border border-line bg-surface-2/60 p-2 text-xs text-muted">{text[actionId]}</p>;
}

function TargetPreview({ game, attacker, actionId, target }: { game: GameState; attacker: Unit; actionId: string; target: Unit | undefined }) {
  const action = attacker.stats.actions.find((a) => a.id === actionId);
  if (!action) return null;
  const friendly = action.kind === "heal" || action.kind === "buff";
  if (!target || (target.id === attacker.id && !friendly) || target.dead) return <p className="text-xs text-muted italic">Hover a creature to see your odds.</p>;
  const check = checkTarget(game, attacker.id, actionId, target.id);
  if (!check.ok) return <p className="text-xs text-danger">{check.reason}</p>;
  let odds: string;
  let effect: string;
  switch (action.kind) {
    case "attack":
      odds = `${Math.round(hitChance(action.toHit, target.ac + check.cover, check.advantage) * 100)}% to hit (${formatMod(action.toHit)} vs AC ${target.ac + check.cover})`;
      effect = `≈ ${averageDamage(action.damage).toFixed(1)} damage on a hit`;
      break;
    case "save":
      odds = `DC ${action.dc} ${action.save.toUpperCase()} save`;
      effect = `≈ ${averageDamage(action.damage).toFixed(1)} damage on a failed save`;
      break;
    case "missile":
      odds = `${action.darts} darts, always hit`;
      effect = `≈ ${averageDamage(actionDamage(action)).toFixed(1)} damage`;
      break;
    case "heal":
      odds = `${target.hp}/${target.hpMax} HP`;
      effect = `heals ${action.dice}${action.ability ? ` + ${action.ability.toUpperCase()}` : ""}`;
      break;
    case "buff":
      odds = action.buff === "bless" ? "+1d4 to attacks and saves" : "+5 max HP";
      effect = action.concentration ? "concentration" : "until the end of the fight";
      break;
  }
  return (
    <div className="rounded-md border border-line bg-surface-2/60 p-2 text-xs">
      <div className="font-semibold text-strong">
        {target.name}: {odds}
      </div>
      <div className="text-muted">{effect}</div>
      {check.reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {check.reasons.map((r) => (
            <li key={r} className={r.startsWith("+") ? "text-heal" : "text-danger"}>
              {r.startsWith("+") ? "▲" : "▼"} {r.slice(2)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CombatLog({ lines }: { lines: { id: number; text: string; tone: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);
  const tone = useMemo(
    () =>
      ({
        turn: "mt-1 font-semibold text-accent",
        hit: "text-strong",
        crit: "font-bold text-highlight",
        miss: "text-faint",
        heal: "text-heal",
        bad: "text-danger",
        info: "text-muted",
        win: "font-bold text-heal",
        lose: "font-bold text-danger",
      }) as Record<string, string>,
    [],
  );
  return (
    <section className="flex min-h-48 flex-1 flex-col rounded-lg border border-line bg-surface shadow lg:min-h-0" aria-label="Combat log">
      <h3 className="border-b border-line px-3 py-1.5 text-xs font-bold tracking-wider text-faint uppercase">Combat log</h3>
      <ol ref={ref} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3 text-xs">
        {lines.map((l) => (
          <li key={l.id} className={tone[l.tone]}>
            {l.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What the parting attacks did as the party fell back. */
function fledText(game: GameState): string {
  const playMode = usePlay.getState().mode;
  const raid = playMode === "town" && usePlay.getState().context?.kind === "raid";
  const down = game.units.filter((u) => u.side === "party" && u.hp <= 0).map((u) => u.name);
  return [
    "The party fell back, carrying the wounded.",
    down.length ? `Down: ${down.join(", ")}.` : "",
    raid ? "The raiders have the town to themselves." : `The way back takes ${num("travel.fleeHours")} hours.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Who did what: damage, healing, foes dropped, and the battle's hero. */
function BattleSummary({ game }: { game: GameState }) {
  const tally = usePlay((s) => s.tally);
  const heroes = game.units.filter((u) => u.side === "party");
  const score = (id: string) => {
    const t = tally[id];
    return t ? t.dealt + t.healed * 0.75 + t.downed * 6 : 0;
  };
  const mvp = [...heroes].sort((a, b) => score(b.id) - score(a.id))[0];
  const slain = game.units.filter((u) => u.side === "enemy" && u.dead);
  const xp = slain.reduce((n, u) => n + (XP_BY_CR[u.stats.cr ?? ""] ?? 0), 0);
  if (!heroes.some((h) => tally[h.id])) return null;
  return (
    <div className="mt-3 space-y-2 text-left text-sm">
      <table className="w-full text-xs">
        <thead className="text-faint">
          <tr>
            <th className="text-left font-normal">Hero</th>
            <th className="font-normal" title="Damage dealt">⚔</th>
            <th className="font-normal" title="Damage taken">🩸</th>
            <th className="font-normal" title="Healing">✚</th>
            <th className="font-normal" title="Foes dropped">💀</th>
          </tr>
        </thead>
        <tbody>
          {heroes.map((h) => {
            const t = tally[h.id] ?? { dealt: 0, taken: 0, healed: 0, downed: 0 };
            return (
              <tr key={h.id} className={clsx("border-t border-line/50", h.id === mvp?.id && score(h.id) > 0 && "font-semibold text-strong")}>
                <td className="py-0.5">
                  {h.id === mvp?.id && score(h.id) > 0 ? "⭐ " : ""}
                  {h.name.split(" ")[0]}
                  {h.dead ? " ✝" : h.hp <= 0 ? " 💤" : ""}
                </td>
                <td className="text-center tabular-nums">{t.dealt}</td>
                <td className="text-center tabular-nums">{t.taken}</td>
                <td className="text-center tabular-nums">{t.healed || ""}</td>
                <td className="text-center tabular-nums">{t.downed || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {slain.length > 0 && (
        <p className="text-center text-xs text-muted">
          {slain.length} foe{slain.length === 1 ? "" : "s"} defeated · worth {xp} XP
        </p>
      )}
    </div>
  );
}

function Outcome({ game }: { game: GameState }) {
  const scenario = usePlay((s) => s.scenario);
  const playMode = usePlay((s) => s.mode);
  const campaign = playMode === "campaign";
  const won = game.outcome === "victory";
  const fallen = game.units.filter((u) => u.side === "party" && u.dead).length;
  const downed = game.units.filter((u) => u.side === "party" && !u.dead && u.hp <= 0).length;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[min(26rem,92vw)] rounded-lg border border-line bg-surface p-6 text-center shadow-2xl [animation:pop-in_0.35s_ease-out]">
        <div className="text-5xl" aria-hidden>
          {won ? "🏆" : game.fled ? "🏃" : "☠"}
        </div>
        <h3 className={clsx("font-display text-3xl font-bold", won ? "text-heal" : "text-danger")}>{won ? "Victory!" : game.fled ? "Retreat" : "Defeat"}</h3>
        <p className="mt-1 text-sm text-muted">
          {won ? `Won in ${game.round} round${game.round === 1 ? "" : "s"}.` : game.fled ? fledText(game) : "The party has fallen."}
          {won && (fallen || downed) ? ` ${fallen ? `${fallen} fallen` : ""}${fallen && downed ? ", " : ""}${downed ? `${downed} unconscious` : ""}.` : ""}
        </p>
        <BattleSummary game={game} />
        <div className="mt-4 flex flex-col gap-2">
          {playMode === "town" ? (
            <button className="btn btn-primary font-display" onClick={() => finishTownBattle()}>
              Back to town
            </button>
          ) : campaign ? (
            <button className="btn btn-primary font-display" onClick={() => returnFromBattle()}>
              Continue the adventure
            </button>
          ) : (
            <>
          {scenario && (
            <button className="btn btn-primary font-display" onClick={() => startGame(scenario)}>
              Play again
            </button>
          )}
          <button className="btn" onClick={quitGame}>
            Choose another battle
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Healing potions from the party's pack: drink, or hand to an ally within 5 ft (bonus action). */
function Potions({ game, unit: u, heroTurn }: { game: GameState; unit: Unit; heroTurn: boolean }) {
  const stock = Object.entries(game.stash ?? {}).filter(([, n]) => n > 0);
  if (stock.length === 0) return null;
  const allies = game.units.filter((x) => x.side === "party" && !x.dead && distanceFt(x.pos, u.pos) <= 5);
  return (
    <div className="space-y-1">
      {stock.map(([id, n]) => (
        <div key={id} className="flex items-center gap-1 text-xs">
          <span className="flex-1" title={POTIONS[id]?.dice}>
            🧪 {POTIONS[id]?.name ?? id} × {n}
          </span>
          <select
            className="field w-32 py-0.5 text-xs"
            value=""
            disabled={!heroTurn || !u.turn.bonusAction}
            aria-label={`Use ${POTIONS[id]?.name}`}
            onChange={(e) => e.target.value && dispatch({ type: "use-potion", unitId: u.id, itemId: id, targetId: e.target.value })}
          >
            <option value="">Use on…</option>
            {allies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id === u.id ? "yourself" : a.name} ({a.hp}/{a.hpMax})
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
