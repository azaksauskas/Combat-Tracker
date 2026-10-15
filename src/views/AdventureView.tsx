import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../components/Dialog";
import { HpBar } from "../components/HpBar";
import { checkChance, skillBonus, visibleChoices, type CampaignState, type Choice } from "../game/adventure";
import {
  abandonAdventure,
  adventureOf,
  findScenario,
  completeShortRest,
  dismissLevelUp,
  equipItem,
  goToBattle,
  pickChoice,
  takeUpFoundWeapon,
  unequipItem,
} from "../game/campaign-store";
import { ITEMS, MAX_LEVEL, XP_FOR_LEVEL, isFoundGear, type Hero, type Party } from "../game/party";
import { WEAPONS, gearIcon, gearName, trainedWith } from "../game/arsenal";
import { MAGIC_ITEMS, RARITY } from "../game/treasure";
import { abilityMod, formatMod } from "../domain/statblock";
import { useGame } from "../store/game";

/** The story side of an adventure: party, scene, choices, rests and level-ups. */
export function AdventureView({ state }: { state: CampaignState }) {
  // Re-render when the DM edits their adventures (playtesting while editing).
  useGame((s) => s.library.adventures);
  const adv = adventureOf(state);
  if (!adv) return <p className="text-danger">This adventure no longer exists.</p>;
  const scene = adv.scenes[state.sceneId];
  const pending = state.pending[0];

  return (
    <div className="flex w-full flex-col gap-3 lg:h-[calc(100dvh-6rem)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-accent">
            {adv.title}
            {state.replay && <span className="ml-2 align-middle text-xs font-normal text-faint">replay · no rewards</span>}
          </h2>
          <p className="text-sm text-muted">Level {state.party.heroes[0]?.level ?? 1} party · {state.party.gold} gp</p>
        </div>
        <button className="btn btn-ghost" onClick={() => confirm("Abandon this adventure? Progress will be lost.") && abandonAdventure()}>
          Abandon adventure
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[19rem_1fr]">
        <PartySheet party={state.party} clues={state.flags} />

        <section className="flex min-h-0 flex-col rounded-lg border border-line bg-surface shadow" aria-label="Story">
          <StoryFeed state={state} />
          <div className="border-t border-line p-4">
            {state.ended ? (
              <Ending state={state} />
            ) : pending?.kind === "fight" ? (
              <FightPrompt fight={pending} />
            ) : pending?.kind === "short-rest" ? (
              <ShortRest party={state.party} />
            ) : (
              scene && (
                <>
                  <h3 className="text-xl font-bold text-strong">{scene.title}</h3>
                  <p className="mt-2 leading-relaxed whitespace-pre-line">{scene.text}</p>
                  <Choices state={state} />
                </>
              )
            )}
          </div>
        </section>
      </div>

      <Dialog open={pending?.kind === "levelup"} onClose={dismissLevelUp} title="Level up!">
        {pending?.kind === "levelup" && (
          <div className="space-y-3">
            {pending.reports.map((r, i) => (
              <div key={i} className="rounded-md border border-line bg-surface-2 p-3">
                <div className="font-bold text-strong">
                  {r.hero.name} → level {r.level}
                </div>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {r.gains.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            ))}
            <button className="btn btn-primary w-full font-display" onClick={dismissLevelUp}>
              Onward!
            </button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function PartySheet({ party, clues }: { party: Party; clues: string[] }) {
  const level = party.heroes[0]?.level ?? 1;
  const nextXp = level < MAX_LEVEL ? XP_FOR_LEVEL[level + 1]! : null;
  const equipment = Object.entries(party.items).filter(([id, n]) => n > 0 && ITEMS[id]?.kind === "equipment");
  const potions = Object.entries(party.items).filter(([id, n]) => n > 0 && ITEMS[id]?.kind === "potion");
  const gear = Object.entries(party.items).filter(([id, n]) => n > 0 && isFoundGear(id));
  const magic = Object.entries(party.items).filter(([id, n]) => n > 0 && !ITEMS[id] && MAGIC_ITEMS[id]);

  return (
    <aside className="min-h-0 space-y-3 overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow" aria-label="Party">
      <div>
        <div className="flex justify-between text-xs text-faint">
          <span>XP {party.xp}</span>
          <span>{nextXp ? `next level at ${nextXp}` : "max level for now"}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-accent" style={{ width: `${nextXp ? Math.min(100, (party.xp / nextXp) * 100) : 100}%` }} />
        </div>
      </div>
      <ul className="space-y-2">
        {party.heroes.map((h) => (
          <HeroCard key={h.key} hero={h} />
        ))}
      </ul>
      {clues.length > 0 && (
        <section>
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">🔑 What you know</h4>
          <p className="text-sm">{clues.join(", ")}</p>
        </section>
      )}
      <section>
        <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Pack</h4>
        <p className="text-sm">💰 {party.gold} gp</p>
        {potions.map(([id, n]) => (
          <p key={id} className="text-sm" title={ITEMS[id]!.description}>
            🧪 {n} × {ITEMS[id]!.name}
          </p>
        ))}
        {equipment.map(([id, n]) => (
          <div key={id} className="mt-1 text-sm">
            <span title={ITEMS[id]!.description}>
              ⚔ {n} × {ITEMS[id]!.name}
            </span>
            <select
              className="field mt-1 py-1 text-xs"
              value=""
              aria-label={`Equip ${ITEMS[id]!.name}`}
              onChange={(e) => e.target.value && equipItem(e.target.value, id)}
            >
              <option value="">Give to…</option>
              {party.heroes
                .filter((h) => !h.dead && !h.equipment.includes(id))
                .map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.name}
                  </option>
                ))}
            </select>
          </div>
        ))}
        {gear.map(([id, n]) => (
          <div key={id} className="mt-1 text-sm">
            <span title={WEAPONS[id] ? "A weapon found on the road: a hero can sling it on their back, or it goes to the armoury at home" : "Goes to the armoury at home"}>
              {gearIcon(id)} {n} × {gearName(id)}
            </span>
            {WEAPONS[id] && (
              <select className="field mt-1 py-1 text-xs" value="" aria-label={`Take up ${gearName(id)}`} onChange={(e) => e.target.value && takeUpFoundWeapon(e.target.value, id)}>
                <option value="">Sling on the back of…</option>
                {party.heroes
                  .filter((h) => !h.dead)
                  .map((h) => (
                    <option key={h.key} value={h.key}>
                      {h.name}
                      {trainedWith(h.stats, id) ? "" : " (untrained)"}
                    </option>
                  ))}
              </select>
            )}
          </div>
        ))}
        {magic.map(([id, n]) => (
          <p key={id} className="mt-1 text-sm" title={`${MAGIC_ITEMS[id]!.text} Goes to the treasury at home.`} style={{ color: RARITY[MAGIC_ITEMS[id]!.rarity].color }}>
            {MAGIC_ITEMS[id]!.icon} {n} × {MAGIC_ITEMS[id]!.name}
          </p>
        ))}
        {potions.length === 0 && equipment.length === 0 && gear.length === 0 && magic.length === 0 && <p className="text-xs text-faint italic">No items yet.</p>}
      </section>
    </aside>
  );
}

function HeroCard({ hero: h }: { hero: Hero }) {
  return (
    <li className={clsx("rounded-md border border-line bg-surface-2 p-2 text-sm", h.dead && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={clsx("font-bold text-strong", h.dead && "line-through")}>{h.name}</span>
        <span className="text-xs text-faint">
          {h.className} {h.level}
        </span>
      </div>
      {h.stats.alignment && <div className="text-[11px] text-faint italic">{h.stats.alignment}</div>}
      {h.dead ? (
        <p className="text-xs text-danger">Fallen</p>
      ) : (
        <>
          <div className="mt-1 flex justify-between text-xs">
            <span>
              HP {h.hp}/{h.hpMax}
            </span>
            <span className="text-faint">
              AC {h.ac} · hit dice {h.hitDice}/{h.level}
            </span>
          </div>
          <HpBar combatant={{ hpCurrent: h.hp, hpMax: h.hpMax, hpTemp: 0 }} className="mt-1" />
          {h.equipment.map((e) =>
            WEAPONS[e] ? (
              <span key={e} className="mt-1 block text-xs text-muted" title="Found on the road; drawn in a fight. It stays with them at home.">
                {gearIcon(e)} {gearName(e)} (on the back)
              </span>
            ) : (
              <button key={e} className="mt-1 text-xs text-accent hover:underline" onClick={() => unequipItem(h.key, e)} title="Unequip">
                ⚔ {ITEMS[e]?.name} ✕
              </button>
            ),
          )}
        </>
      )}
    </li>
  );
}

function StoryFeed({ state }: { state: CampaignState }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [state.story.length]);
  const tone: Record<string, string> = {
    scene: "mt-3 font-display text-base font-bold text-accent",
    narration: "italic leading-relaxed",
    check: "font-mono text-xs text-muted",
    reward: "text-xs font-semibold text-heal",
    danger: "text-xs font-semibold text-danger",
    levelup: "font-bold text-highlight",
  };
  return (
    <ol ref={ref} className="min-h-40 flex-1 space-y-1 overflow-y-auto p-4 text-sm" aria-label="Story so far">
      {state.story.map((e) => (
        <li key={e.id} className={tone[e.kind]}>
          {e.text}
        </li>
      ))}
    </ol>
  );
}

function Choices({ state }: { state: CampaignState }) {
  const adv = adventureOf(state)!;
  const choices = visibleChoices(state, adv);
  const [picking, setPicking] = useState<Choice | null>(null);
  useEffect(() => setPicking(null), [state.sceneId, state.story.length]);

  if (picking?.check) {
    const { skill, dc } = picking.check;
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold">
          Who tries? <span className="text-faint">({skill}, DC {dc})</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {state.party.heroes
            .filter((h) => !h.dead)
            .map((h) => {
              const bonus = skillBonus(h, skill);
              return (
                <button key={h.key} className="btn justify-between" onClick={() => pickChoice(picking.id, h.key)}>
                  <span>{h.name}</span>
                  <span className="text-xs text-faint">
                    {formatMod(bonus)} · {Math.round(checkChance(bonus, dc) * 100)}%
                  </span>
                </button>
              );
            })}
        </div>
        <button className="btn btn-ghost text-xs" onClick={() => setPicking(null)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-2">
      {choices.map((c) => {
        const tooPoor = !!c.costGold && state.party.gold < c.costGold;
        const group = c.check?.mode === "group";
        const groupOdds =
          group && c.check
            ? Math.round(
                (state.party.heroes.filter((h) => !h.dead).reduce((n, h) => n + checkChance(skillBonus(h, c.check!.skill), c.check!.dc), 0) /
                  Math.max(1, state.party.heroes.filter((h) => !h.dead).length)) *
                  100,
              )
            : null;
        return (
          <li key={c.id}>
            <button
              className="btn w-full justify-between text-left"
              disabled={tooPoor}
              onClick={() => (c.check?.mode === "choose" ? setPicking(c) : pickChoice(c.id))}
            >
              <span>{c.label}</span>
              <span className="shrink-0 text-xs font-normal text-faint">
                {c.check && `${c.check.skill} DC ${c.check.dc}${group ? ` · group (≈${groupOdds}% each)` : ""}`}
                {c.costGold ? `${c.costGold} gp` : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FightPrompt({ fight }: { fight: Extract<CampaignState["pending"][number], { kind: "fight" }> }) {
  const sc = findScenario(fight.scenarioId);
  return (
    <div className="text-center">
      <h3 className="text-xl font-bold text-danger">⚔ {sc?.name ?? "Battle"}</h3>
      <p className="mt-1 text-sm text-muted">
        {fight.surprised === "enemy" ? "You've caught them off guard: the enemies are surprised (Disadvantage on initiative)." : fight.surprised === "party" ? "You've been caught off guard: your party is surprised (Disadvantage on initiative)." : sc?.blurb}
      </p>
      <button className="btn btn-primary mt-3 px-6 font-display" onClick={goToBattle}>
        To battle!
      </button>
    </div>
  );
}

function ShortRest({ party }: { party: Party }) {
  const heroes = party.heroes.filter((h) => !h.dead);
  // Suggest enough dice to (roughly) heal up, without wasting them.
  const suggest = (h: Hero) => Math.min(h.hitDice, Math.ceil(Math.max(0, h.hpMax - h.hp) / (h.hitDie / 2 + 1 + abilityMod(h.stats.abilities.con))));
  const [spend, setSpend] = useState<Record<string, number>>(() => Object.fromEntries(heroes.map((h) => [h.key, suggest(h)])));
  return (
    <div>
      <h3 className="text-xl font-bold text-strong">Short rest</h3>
      <p className="text-sm text-muted">Spend hit dice to heal (each: roll the die + Con modifier). Second Wind, Action Surge and Channel Divinity recover too.</p>
      <ul className="mt-3 space-y-2">
        {heroes.map((h) => (
          <li key={h.key} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {h.name}{" "}
              <span className="text-xs text-faint">
                {h.hp}/{h.hpMax} HP · d{h.hitDie}
                {formatMod(abilityMod(h.stats.abilities.con))}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <button className="btn px-2" aria-label={`Fewer hit dice for ${h.name}`} onClick={() => setSpend((s) => ({ ...s, [h.key]: Math.max(0, (s[h.key] ?? 0) - 1) }))}>
                −
              </button>
              <span className="w-12 text-center tabular-nums">
                {spend[h.key] ?? 0}/{h.hitDice}
              </span>
              <button className="btn px-2" aria-label={`More hit dice for ${h.name}`} onClick={() => setSpend((s) => ({ ...s, [h.key]: Math.min(h.hitDice, (s[h.key] ?? 0) + 1) }))}>
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button className="btn btn-primary mt-3 w-full font-display" onClick={() => completeShortRest(spend)}>
        Finish resting
      </button>
    </div>
  );
}

function Ending({ state }: { state: CampaignState }) {
  const won = state.ended === "victory";
  return (
    <div className="text-center">
      <h3 className={clsx("text-3xl font-bold", won ? "text-heal" : "text-danger")}>{won ? "Adventure complete!" : "The adventure ends"}</h3>
      <p className="mt-1 text-sm text-muted">
        {won
          ? `Your party reached level ${state.party.heroes[0]?.level} with ${state.party.gold} gp.`
          : "Better luck next time."}
      </p>
      <button className="btn btn-primary mt-3 font-display" onClick={abandonAdventure}>
        Back to the start
      </button>
    </div>
  );
}
