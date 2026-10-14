import { num } from "./tuning";
import { toast } from "sonner";
import { create } from "zustand";
import { newId } from "../domain/combat";
import type { PlayerDoc } from "../domain/players";
import { MAX_TOWN_LOG, type BuildingType, type Town } from "../domain/town";
import type { GameState } from "./state";
import { BREWS, COMPONENTS, MODS, SLOTS, addComponents, cantAfford, fitMod, pay, salvage, type Component, type Cost } from "./crafting";
import { onBeforeSignOut, useGame } from "../store/game";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";
import { randomSeed } from "./rng";
import type { Faction } from "../domain/faction";
import { BUILTIN_FACTIONS, lairResult, payTribute, raidResult, refuseTribute } from "./region";
import { findScenario, useCampaign } from "./campaign-store";
import { setupFor } from "./scenarios";
import { quitGame, startBattle, usePlay } from "./store";
import { spellProblem } from "./spellbook";
import { chosenParty, heroAsNow, recordAftermath, recoveryLeft } from "./party-store";
import { ARMORS, WEAPONS, gearName, loadoutProblem, startingKit, type Loadout } from "./arsenal";
import { INJURIES, aftermath } from "./injuries";
import { completeContract, notePatrol, patrolBounty, rewardText, tradeAtMarket, type Good } from "./economy";
import { PATROL_FOES, foeBattle } from "./patrol";
import { claimGoal } from "./goals";
import { BLOCKED_FROM, blockedBy, titheShare, townStage } from "./guilds";
import { MAX_LEVEL, XP_BY_CR, XP_FOR_LEVEL, levelForXp } from "./party";
import {
  onlineMsPerHour,
  advance,
  awayReport,
  craftHours,
  working,
  bump,
  startUpgrade,
  assign,
  postCall,
  applyDeeds,
  bringHome,
  catchUp,
  hire,
  lift,
  startingReputation,
  durationText,
  foundTown,
  helpsLeft,
  sleepHours,
  startBuilding,
  useHelp,
  takeStash,
  welcome,
  type AwayReport,
  type SimContext,
} from "./town";

/**
 * Runs the active player's town in the browser: the live clock while they're
 * on the Play page, catching up when they come back, and the actions they
 * take. Everything is saved to their player document.
 */

export const useTownUi = create<{ report: AwayReport | null; title: string }>(() => ({ report: null, title: "" }));

const me = () => useActiveProfile.getState().id;
const docOf = (id: string | null) => (id ? usePlayers.getState().docs[id] : undefined);

/** Renown of the town's owner and of the players who moved in. */
export function townContext(ownerId: string): SimContext {
  const docs = usePlayers.getState().docs;
  const owner = docs[ownerId];
  const residents = Object.entries(docs)
    .filter(([id, d]) => id !== ownerId && d.residence === ownerId)
    .map(([, d]) => d.renown);
  return { renown: owner?.renown ?? 1, residents, ownerAway: !!owner?.residence, factions: allFactions(), tithe: titheShare(townStage(ownerId, docs, Date.now())) };
}

/** A guild's hold may forbid this in the player's own town: says why and returns false. */
function allowed(action: keyof typeof BLOCKED_FROM): boolean {
  const id = me();
  if (!id) return false;
  const why = blockedBy(townStage(id, usePlayers.getState().docs, Date.now()), action);
  if (why) toast.error(why);
  return !why;
}

function setTown(id: string, change: (t: Town, d: PlayerDoc) => Town) {
  updatePlayer(id, (d) => (d.town ? { ...d, town: change(d.town, d) } : d));
}

// --- The clock ------------------------------------------------------------------------

let boundTo: string | null = null;
/** Real time of the last tick while the player was on the Play page (0: not here). */
let lastTick = 0;
/** When the current stretch of being here began; earlier time was caught up at the slower rate. */
let onlineSince = 0;

/** Game hours earned online since the town was last saved. */
const onlineHours = (t: Town, now: number) => (lastTick ? Math.max(0, (now - Math.max(t.at, onlineSince)) / onlineMsPerHour()) : 0);

/** Game time right now, for display: the saved hours plus online time since. */
export function liveHours(t: Town, now = Date.now()): number {
  const online = lastTick && now - lastTick < 30_000 && boundTo !== null;
  return online ? t.hours + onlineHours(t, now) : t.hours;
}

const onPlayPage = () => location.hash.startsWith("#/play");

let ticking = false;
/** Other systems that check in on every tick (spies, guilds). */
const tickHooks: (() => void)[] = [];
export const onTownTick = (f: () => void) => void tickHooks.push(f);

function tick() {
  // Saving below notifies subscribers, which would call tick again.
  if (ticking) return;
  ticking = true;
  try {
    step();
    for (const f of tickHooks) f();
  } finally {
    ticking = false;
  }
}

function step() {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc) return;
  const visible = document.visibilityState === "visible" && onPlayPage();
  const now = Date.now();
  if (id !== boundTo) {
    // Just arrived (or switched player): first catch up on the time away.
    boundTo = id;
    lastTick = 0;
  }
  if (!doc.town || doc.residence) {
    lastTick = visible ? now : 0;
    return;
  }
  if (!visible) {
    // Away from the game: time keeps passing at real speed; caught up on return.
    if (lastTick) commitOnline(id, doc.town, now);
    lastTick = 0;
    return;
  }
  if (!lastTick || now - lastTick > 30_000) {
    // Arriving, or back after the page slept: the gap counts as time away.
    lastTick = now;
    onlineSince = now;
    const before = doc.town;
    const back = catchUp(before, now, townContext(id));
    updatePlayer(id, (d) => ({ ...d, town: back.town }));
    if (usePlay.getState().game && back.town.raidNews.length > before.raidNews.length) toast.warning(MESSENGER);
    if (back.hours >= 1 && (back.events.length || back.town.gold !== before.gold || back.town.food !== before.food)) {
      useTownUi.setState({ report: awayReport(before, back.town, back.events, back.hours), title: "While you were away…" });
    }
    return;
  }
  lastTick = now;
  // Save once per game hour (one real minute) rather than on every tick.
  if (Math.floor(doc.town.hours + onlineHours(doc.town, now)) > Math.floor(doc.town.hours)) commitOnline(id, doc.town, now);
}

const MESSENGER = "📯 A messenger from town: raiders struck. The full report after the battle.";

function commitOnline(id: string, t: Town, now: number) {
  const { town, events } = advance(t, onlineHours(t, now), now, townContext(id));
  updatePlayer(id, (d) => ({ ...d, town }));
  const news = town.raidNews.length > t.raidNews.length;
  if (usePlay.getState().game) {
    // Mid-battle: one quiet note; the full report waits until the fight is over.
    if (news) toast.warning(MESSENGER);
    return;
  }
  for (const e of events) if (e.tone !== "info") toast[e.tone === "good" ? "success" : "warning"](e.text);
}

/** The player has read the raid reports. */
export function readRaidNews() {
  const id = me();
  if (id && docOf(id)?.town?.raidNews.length) setTown(id, (t) => ({ ...t, raidNews: [] }));
}

let started = false;
export function bindTown() {
  if (started) return;
  started = true;
  setInterval(tick, 2_000);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("hashchange", tick);
  const bank = () => {
    const id = me();
    const t = docOf(id)?.town;
    if (id && t && lastTick && !docOf(id)?.residence) commitOnline(id, t, Date.now());
  };
  window.addEventListener("pagehide", bank);
  // Signing out: bank the time played, and the next account starts its own clock.
  onBeforeSignOut(() => {
    bank();
    lastTick = 0;
    boundTo = null;
  });
  // React after the save that changed the document has finished, never in the
  // middle of it: a nested save would be overwritten by the outer one.
  usePlayers.subscribe(() => queueMicrotask(tick));
  // Dev-only handle for automated browser tests: pretend the player was away.
  if (import.meta.env.DEV)
    Object.assign(window, {
      __town: {
        get: () => docOf(me())?.town ?? null,
        set: (change: (t: Town) => Town) => {
          const id = me();
          if (id) setTown(id, change);
        },
        /** As if the player had closed the page this many real hours ago. */
        away: (hours: number) => {
          const id = me();
          if (!id) return;
          lastTick = 0;
          setTown(id, (t) => ({ ...t, at: Date.now() - hours * 3_600_000 }));
        },
      },
    });
}

// --- Actions ------------------------------------------------------------------------

/** Long actions move the clock (only in your own town: other towns keep their owner's time). */
export function passTime(hours: number, what?: string) {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc?.town || doc.residence) return;
  const now = Date.now();
  // Bank the online time first, then jump.
  const online = onlineHours(doc.town, now);
  const start = what ? { ...doc.town, log: [...doc.town.log, { at: doc.town.hours + online, text: `${what} (${durationText(hours)}).`, tone: "info" as const }] } : doc.town;
  const { town, events } = advance(start, online + hours, now, townContext(id));
  updatePlayer(id, (d) => ({ ...d, town }));
  if (what && events.length) useTownUi.setState({ report: awayReport(doc.town, town, events, hours), title: `${what}…` });
}

export function found(name: string) {
  const id = me();
  if (!id) return;
  // The town starts with the reputation of the heroes who founded it.
  const alignments = chosenParty().map((e) => e.build().stats?.alignment ?? "Neutral");
  updatePlayer(id, (d) => ({ ...d, town: foundTown(name, Date.now(), randomSeed(), 30, startingReputation(alignments)), residence: null }));
  lastTick = onlineSince = Date.now();
}

export function build(type: BuildingType) {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc?.town || !allowed("build")) return;
  try {
    // Bank online time so the work starts now, not at the last save.
    const now = Date.now();
    const { town } = advance(doc.town, onlineHours(doc.town, now), now, townContext(id));
    updatePlayer(id, (d) => ({ ...d, town: startBuilding(town, type, d.renown, newId()) }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

export const renameTown = (name: string) => {
  const id = me();
  if (id && name.trim()) setTown(id, (t) => ({ ...t, name: name.trim() }));
};

export const setOpen = (open: boolean) => {
  if (!allowed("open")) return;
  const id = me();
  if (id) setTown(id, (t) => ({ ...t, open }));
};

/** Travel by waystone to another player's town and live there; your own town carries on without you. */
export function joinTown(ownerId: string) {
  const id = me();
  if (!id || ownerId === id) return;
  passTime(6, "Travelled by waystone");
  updatePlayer(id, (d) => ({ ...d, residence: ownerId }));
  const owner = usePlayers.getState().profiles.find((p) => p.id === ownerId);
  addChronicle(id, [{ kind: "story", text: `Moved to ${docOf(ownerId)?.town?.name ?? "another town"}${owner ? `, ${owner.name}'s town` : ""}.` }]);
}

export function goHome() {
  const id = me();
  if (!id) return;
  updatePlayer(id, (d) => ({ ...d, residence: null }));
  lastTick = 0; // catch up on what happened while away
  addChronicle(id, [{ kind: "story", text: "Went back home." }]);
}

// --- Adventures and the town ------------------------------------------------------------

/** Potions from the town's stores, for a party setting out. */
export function packForAdventure(): Record<string, number> {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc?.town || doc.residence) return {};
  const { town, potions } = takeStash(doc.town);
  if (Object.keys(potions).length) updatePlayer(id, (d) => ({ ...d, town }));
  return potions;
}

/** When an adventure ends: gold and potions come home, rescued people move in, renown grows. */
export function homecoming(
  title: string,
  gold: number,
  potions: Record<string, number>,
  recruits: { name: string; trade?: string }[],
  level: number,
  result: { outcome: "victory" | "defeat" | "abandoned"; deaths: number; deeds?: { law: number; good: number } },
) {
  const id = me();
  if (!id) return;
  updatePlayer(id, (d) => {
    let town = d.town;
    if (town) {
      town = bringHome(town, gold, potions, title);
      town = lift(town, (result.outcome === "victory" ? 8 : result.outcome === "defeat" ? -8 : -2) - 5 * result.deaths);
      if (result.deeds) town = applyDeeds(town, result.deeds);
      for (const r of recruits) town = welcome(town, { name: r.name, trade: r.trade ?? "", from: `Met the heroes in ${title}` }, newId());
    }
    return { ...d, town, renown: Math.max(d.renown, level) };
  });
}

/** Weapons and armour found on an adventure go to the armoury; a weapon a hero took up stays on their back (their old spare goes to the armoury). */
export function stowFinds(stash: Record<string, number>, spares: Record<string, string>) {
  const id = me();
  if (!id || (!Object.keys(stash).length && !Object.keys(spares).length)) return;
  updatePlayer(id, (d) => {
    const armory = { ...d.armory };
    const loadouts = { ...d.loadouts };
    for (const [k, n] of Object.entries(stash)) armory[k] = (armory[k] ?? 0) + n;
    for (const [hero, weapon] of Object.entries(spares)) {
      const built = heroAsNow(hero)?.build();
      const was = loadouts[hero] ?? startingKit(built?.stats?.className);
      if (was.spare) armory[was.spare] = (armory[was.spare] ?? 0) + 1;
      loadouts[hero] = { ...was, spare: weapon };
    }
    return { ...d, armory, loadouts };
  });
  const names = [...Object.entries(stash).map(([k, n]) => `${n > 1 ? `${n} × ` : ""}${gearName(k)}`), ...Object.values(spares).map(gearName)];
  addChronicle(id, [
    {
      kind: "story",
      text: `Brought home for the armoury: ${names.join(", ")}.`,
    },
  ]);
}

/** Renown follows the best hero's level as soon as they level up. */
export function noteLevel(level: number) {
  const id = me();
  if (id) updatePlayer(id, (d) => (level > d.renown ? { ...d, renown: level } : d));
}

// --- Daily limits ---------------------------------------------------------------------

export const today = () => new Date().toLocaleDateString("en-CA");

/** A day's work around town: once per bed per real day. */
export function helpOut() {
  if (!allowed("help")) return;
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return;
  if (helpsLeft(t, today()) <= 0) return toast.info("Everyone's had enough of your help for today. Come back tomorrow, or build more houses.");
  setTown(id, (x) => useHelp(x, today()));
  passTime(24, "The heroes spent a day helping around town");
}

/** Sleep through the night, until dawn. */
export function sleep() {
  const t = docOf(me())?.town;
  if (!t) return;
  const hours = sleepHours(liveHours(t));
  if (hours === null) return toast.info("It's broad daylight. Sleep comes after 20:00.");
  passTime(hours, "The heroes slept until dawn");
}

// --- Crafting -----------------------------------------------------------------------

/** A job at a workplace: pay, then wait (longer without a worker of the right trade). */
function work(at: BuildingType, cost: Cost, baseHours: number, what: string, change: (t: Town) => Town) {
  if (!allowed("craft")) return false;
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return false;
  const hours = craftHours(t, at, baseHours);
  const why = cantAfford(t, cost);
  if (why) {
    toast.error(why);
    return false;
  }
  setTown(id, (x) => change(pay(x, cost)));
  passTime(hours, what);
  return true;
}


/** Fit a mod to one of the player's heroes at the smithy. */
export function craftMod(heroKey: string, heroName: string, modId: string) {
  const mod = MODS[modId];
  const id = me();
  if (!mod || !id) return;
  if (!work("smithy", mod.cost, mod.hours, `The smith fitted ${heroName}'s ${SLOTS[mod.slot].toLowerCase()} with: ${mod.name}`, (t) => t)) return;
  updatePlayer(id, (d) => ({ ...d, gear: { ...d.gear, [heroKey]: fitMod(d.gear[heroKey] ?? [], modId) } }));
  addChronicle(id, [{ kind: "loot", text: `${heroName}'s ${SLOTS[mod.slot].toLowerCase()} now has: ${mod.name} (${mod.description.replace(/\.$/, "")}).` }]);
}

export function removeMod(heroKey: string, modId: string) {
  const id = me();
  if (id) updatePlayer(id, (d) => ({ ...d, gear: { ...d.gear, [heroKey]: (d.gear[heroKey] ?? []).filter((m) => m !== modId) } }));
}

export function brew(itemId: string, name: string) {
  const b = BREWS[itemId];
  if (!b) return;
  work("apothecary", b.cost, b.hours, `The apothecary brewed a ${name}`, (t) => bump({ ...t, stash: { ...t.stash, [itemId]: (t.stash[itemId] ?? 0) + 1 } }, "brews"));
}

/** Iron and dust from a won battle go to the town's stores. */
export function salvageBattle(game: GameState, battle: string) {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc?.town) return;
  const found = salvage(game);
  const parts = (Object.entries(found) as [Component, number][]).filter(([, n]) => n > 0);
  if (!parts.length) return;
  const text = `Salvaged ${parts.map(([k, n]) => `${n} ${COMPONENTS[k].name.toLowerCase()}`).join(" and ")} from ${battle}.`;
  setTown(id, (t) => ({ ...addComponents(t, found), log: [...t.log, { at: t.hours, text, tone: "good" as const }].slice(-MAX_TOWN_LOG) }));
}

/** Hire a worker at the tavern (gold, a free bed); naming a trade costs more. */
export function hireWorker(trade?: string) {
  if (!allowed("hire")) return;
  townAction((t) => hire(t, trade));
}

// --- Weapons and armour ---------------------------------------------------------------

/** Where gear comes from: the market sells simple weapons, light armour and shields; the smithy forges the rest. */
export function gearSource(itemId: string): {
  at: "market" | "smithy";
  gold: number;
  iron: number;
  hours: number;
} | null {
  const k = num("gear.priceMultiplier");
  const wp = WEAPONS[itemId];
  const ar = ARMORS[itemId];
  if (!wp && !ar) return null;
  const price = Math.max(1, Math.round((wp?.price ?? ar!.price) * k));
  const fromMarket = wp ? wp.category === "simple" : ar!.kind === "light" || ar!.kind === "shield";
  if (fromMarket) return { at: "market", gold: price, iron: 0, hours: 0 };
  return {
    at: "smithy",
    gold: price,
    iron: Math.min(10, Math.max(1, Math.round(price / 25))),
    hours: Math.min(24, 2 + Math.round(price / 25)),
  };
}

/** Buy at the market, or have the smithy forge it; it goes to the armoury. */
export function getGear(itemId: string) {
  const src = gearSource(itemId);
  const id = me();
  const t = docOf(id)?.town;
  if (!src || !id || !t) return;
  const add = (d: PlayerDoc): PlayerDoc => ({
    ...d,
    armory: { ...d.armory, [itemId]: (d.armory[itemId] ?? 0) + 1 },
  });
  if (src.at === "market") {
    if (!working(t, "market")) return void toast.error("Buying gear needs a staffed market");
    if (!allowed("market")) return;
    if (t.gold < src.gold) return void toast.error(`Needs ${src.gold} gold`);
    updatePlayer(id, (d) =>
      add({
        ...d,
        town: d.town ? { ...d.town, gold: d.town.gold - src.gold } : d.town,
      }),
    );
    toast.success(`Bought: ${gearName(itemId)}`);
    return;
  }
  if (!working(t, "smithy")) return void toast.error("Forging needs a staffed smithy");
  if (work("smithy", { gold: src.gold, iron: src.iron }, src.hours, `The smith forged ${gearName(itemId)}`, (x) => x)) updatePlayer(id, add);
}

/** Change what a hero carries (in town only): the old item goes back to the armoury. */
export function equipGear(heroKey: string, slot: keyof Loadout, itemId: string | null) {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc) return;
  if (useCampaign.getState().state || usePlay.getState().game) return void toast.error("Gear is changed in town, between adventures");
  const hero = heroAsNow(heroKey)?.build();
  if (!hero?.stats) return;
  const current: Loadout = doc.loadouts[heroKey] ?? startingKit(hero.stats.className);
  const next: Loadout = { ...current, [slot]: itemId ?? undefined };
  if (!itemId) delete next[slot];
  // A two-handed weapon frees the off hand.
  const freed: string[] = [];
  if (slot === "main" && itemId && WEAPONS[itemId]?.props.includes("two-handed") && next.off) {
    freed.push(next.off);
    delete next.off;
  }
  const why = loadoutProblem(hero.stats, next);
  if (why) return void toast.error(why);
  if (itemId && (doc.armory[itemId] ?? 0) <= 0) return void toast.error(`No ${gearName(itemId)} in the armoury`);
  const armory = { ...doc.armory };
  if (itemId) armory[itemId] = (armory[itemId] ?? 0) - 1;
  for (const back of [current[slot], ...freed]) if (back) armory[back] = (armory[back] ?? 0) + 1;
  for (const k of Object.keys(armory)) if (armory[k]! <= 0) delete armory[k];
  updatePlayer(id, (d) => ({
    ...d,
    loadouts: { ...d.loadouts, [heroKey]: next },
    armory,
  }));
}

/** Prepare a caster's spells for the next outing (in town only). */
export function prepareSpells(heroKey: string, spellIds: string[]) {
  const id = me();
  if (!id || !docOf(id)) return;
  if (useCampaign.getState().state || usePlay.getState().game) return void toast.error("Spells are prepared in town, between adventures");
  const hero = heroAsNow(heroKey)?.build();
  if (!hero?.stats) return;
  const why = spellProblem(hero.stats, spellIds);
  if (why) return void toast.error(why);
  updatePlayer(id, (d) => ({
    ...d,
    spells: { ...d.spells, [heroKey]: spellIds },
  }));
}

/** Start upgrading a building to its next level. */
export function upgradeBuilding(buildingId: string) {
  if (!allowed("upgrade")) return;
  const id = me();
  townAction((t) => startUpgrade(t, buildingId, docOf(id)?.renown ?? 1));
}

/** Take the reward of a finished goal. */
export function claimTownGoal(goalId: string) {
  const id = me();
  townAction((t) => claimGoal(t, goalId, docOf(id)?.renown ?? 1));
}

/** Put up a notice at the hall asking for someone of a trade. */
export function postNotice(trade: string) {
  if (!allowed("notice")) return;
  townAction((t) => postCall(t, trade));
}

/** Move a settler to a workplace, tell them to rest ("rest"), or let them choose (null). */
export function assignSettler(settlerId: string, job: string | null) {
  if (!allowed("assign")) return;
  townAction((t) => assign(t, settlerId, job));
}

/** Buy (n > 0) or sell (n < 0) at the market. */
export function marketTrade(good: Good, n: number) {
  if (!allowed("market")) return;
  townAction((t) => tradeAtMarket(t, good, n));
}

function townAction(change: (t: Town) => Town) {
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return;
  try {
    const next = change(t);
    updatePlayer(id, (d) => ({ ...d, town: next }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

// --- Patrols and contracts -------------------------------------------------------------

/** The heroes' level for sizing fights: the best among those going. */
export const partyLevel = (party: ReturnType<typeof chosenParty>) => Math.max(1, ...party.map((e) => e.build().stats?.level ?? 1));

export const NO_ONE_FIT = "No one is fit to go: the heroes are in the infirmary or fallen";

/** Ride out around the town looking for trouble, for a small bounty. */
export function startPatrol() {
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return;
  const party = chosenParty();
  if (!party.length) return toast.error(NO_ONE_FIT);
  const seed = (t.seed ^ Math.floor(t.hours * 7919)) >>> 0;
  const foe = PATROL_FOES[seed % PATROL_FOES.length]!;
  const sc = foeBattle(foe, partyLevel(party), party.length, "low", seed);
  const { board, units } = setupFor(sc, party);
  startBattle(sc, board, units, { stash: { ...t.stash } }, "town", { kind: "patrol", heroes: party.map((e) => e.key) });
}

/** Take a job from the town's board. */
export function startContract(contractId: string) {
  const id = me();
  const t = docOf(id)?.town;
  const c = t?.contracts.find((x) => x.id === contractId);
  if (!id || !t || !c) return;
  const party = chosenParty();
  if (!party.length) return toast.error(NO_ONE_FIT);
  const sc = foeBattle(c.foe, partyLevel(party), party.length, "moderate", c.seed, c.title);
  const { board, units } = setupFor(sc, party);
  startBattle(sc, board, units, { stash: { ...t.stash } }, "town", { kind: "contract", contract: c.id, heroes: party.map((e) => e.key) });
}

// --- The region: tribute, raids and lairs ------------------------------------------------

/** Built-in factions plus the DM's own. */
export const allFactions = (): Faction[] => [...BUILTIN_FACTIONS, ...useGame.getState().library.factions];
const factionOf = (fid: string) => allFactions().find((f) => f.id === fid);

function regionAction(fid: string, change: (t: Town, f: Faction) => Town) {
  const id = me();
  const f = factionOf(fid);
  if (!id || !f) return;
  try {
    const t = docOf(id)?.town;
    if (!t) return;
    const next = change(t, f);
    updatePlayer(id, (d) => ({ ...d, town: next }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

export function payTributeTo(fid: string) {
  regionAction(fid, payTribute);
  const id = me();
  const f = factionOf(fid);
  if (id && f) addChronicle(id, [{ kind: "story", text: `Paid tribute to ${f.name}.` }]);
}

export function refuseTributeTo(fid: string) {
  regionAction(fid, refuseTribute);
  const id = me();
  const f = factionOf(fid);
  if (id && f) addChronicle(id, [{ kind: "story", text: `Refused to pay tribute to ${f.name}. A raid is coming.` }]);
}

/** Defend the town against a raid, or strike the faction's lair, on the battle screen. */
export function startTownBattle(kind: "raid" | "lair", fid: string) {
  const id = me();
  const f = factionOf(fid);
  const t = docOf(id)?.town;
  if (!id || !f || !t) return;
  const sc = findScenario(kind === "raid" ? f.raid : f.lair);
  if (!sc) return toast.error(`${f.name}'s ${kind === "raid" ? "raid" : "lair"} battle no longer exists. Ask the DM to fix the faction.`);
  const party = chosenParty();
  if (!party.length) return void toast.error(NO_ONE_FIT);
  const { board, units } = setupFor(sc, party);
  const name = kind === "raid" ? `${f.name} raid ${t.name}` : `${f.name}'s lair`;
  // Potions from the town's stores are at hand; what's left goes back.
  startBattle({ ...sc, name }, board, units, { stash: { ...t.stash } }, "town", { kind, faction: fid, heroes: party.map((e) => e.key) });
}

let reclaimHook: ((guildId: string, won: boolean) => void) | null = null;
/** The guild system's answer to a fight for the town (set by intrigue-store, which depends on this module). */
export const onReclaim = (f: (guildId: string, won: boolean) => void) => void (reclaimHook = f);

/** Back from a town battle: apply the result to the town. */
export function finishTownBattle(retreat = false) {
  const id = me();
  const { game, context, scenario } = usePlay.getState();
  if (!id || !game || !context) return quitGame();
  const fled = retreat || !!game.fled;
  const won = !fled && game.outcome === "victory";
  const keys = context.heroes ?? [];
  recordAftermath(aftermath(game, (uid) => (/^p\d+$/.test(uid) ? keys[Number(uid.slice(1))] : undefined)));
  const battle = scenario?.name ?? "a fight";
  const keepStash = (t: Town): Town => ({ ...t, stash: { ...(game.stash ?? t.stash) } });

  if (context.kind === "reclaim") {
    if (won) salvageBattle(game, battle);
    reclaimHook?.(context.guild ?? "", won);
    updatePlayer(id, (d) => (d.town ? { ...d, town: keepStash(d.town) } : d));
    addChronicle(id, [{ kind: "fight", text: won ? `Won ${battle}.` : `Lost ${battle}.` }]);
    passTime(2);
    return quitGame();
  }

  if (context.kind === "patrol" || context.kind === "contract") {
    const town = docOf(id)?.town;
    if (!town) return quitGame();
    const patrol = context.kind === "patrol";
    const bounty = patrol ? patrolBounty(town, partyLevel(chosenParty())) : 0;
    const contract = town.contracts.find((c) => c.id === context.contract);
    updatePlayer(id, (d) => {
      if (!d.town) return d;
      let t = keepStash(d.town);
      if (patrol) {
        t = notePatrol(t);
        if (won) t = bump(t, "patrols");
        if (won) t = { ...t, gold: t.gold + bounty, log: [...t.log, { at: t.hours, text: `The heroes' patrol cleared ${battle.replace(/^Patrol: /, "")}: ${bounty} gold bounty.`, tone: "good" as const }].slice(-MAX_TOWN_LOG) };
      } else if (won && contract) t = bump(completeContract(t, contract.id), "contracts");
      return { ...d, town: t };
    });
    if (won) {
      salvageBattle(game, battle);
      awardXp(id, game, keys, undefined, num("xp.patrolMultiplier"));
      toast.success(patrol ? `Bounty: ${bounty} gold` : `Job done: ${contract ? rewardText(contract.reward) : "paid"}`);
    }
    addChronicle(id, [{ kind: "fight", text: won ? (patrol ? `Patrolled: ${battle.replace(/^Patrol: /, "")}, for ${bounty} gold.` : `Finished a job: ${battle}.`) : fled ? `Fell back from ${battle}.` : `Lost ${battle}.` }]);
    const hours = num(patrol ? "patrol.hours" : "contract.hours") + (fled ? num("travel.fleeHours") : 0);
    passTime(hours, patrol ? "The heroes rode out on patrol" : `The heroes went out on a job`);
    return quitGame();
  }

  const f = context.faction ? factionOf(context.faction) : undefined;
  if (!f) return quitGame();
  const result = context.kind === "raid" ? raidResult : lairResult;
  updatePlayer(id, (d) => (d.town ? { ...d, town: keepStash(result(d.town, f, won)) } : d));
  if (won) {
    salvageBattle(game, battle);
    awardXp(id, game, keys, context.kind === "lair" ? f.milestone : undefined);
  }
  addChronicle(id, [
    {
      kind: "fight",
      text:
        context.kind === "raid"
          ? won
            ? `Drove off a raid by ${f.name}.`
            : `Failed to stop a raid by ${f.name}; the town was plundered.`
          : won
            ? `Broke ${f.name} in their lair. They won't be back.`
            : `An attack on ${f.name}'s lair failed.`,
    },
  ]);
  // A lair is a march away; fleeing it takes the long way home.
  if (fled && context.kind === "lair") passTime(2 + num("travel.fleeHours"), `Fled from ${f.name}'s lair and made it home`);
  else passTime(2);
  quitGame();
}

/** XP for the heroes who fought (monsters' XP shared out), and a lair's milestone level. */
function awardXp(id: string, game: GameState, keys: string[], milestone: number | undefined, multiplier = num("xp.battleMultiplier")) {
  if (!keys.length) return;
  const monsterXp = game.units.filter((u) => u.side === "enemy" && u.dead).reduce((n, u) => n + (XP_BY_CR[u.stats.cr ?? ""] ?? 0), 0);
  const share = Math.floor((monsterXp * multiplier) / keys.length);
  const names = new Map(chosenParty().map((e) => [e.key, e.label]));
  const ups: string[] = [];
  let best = 0;
  updatePlayer(id, (d) => {
    const progress = { ...d.progress };
    for (const k of keys) {
      const was = progress[k] ?? { level: 1, xp: 0 };
      let xp = was.xp + share;
      if (milestone) xp = Math.max(xp, XP_FOR_LEVEL[Math.min(MAX_LEVEL, milestone)] ?? 0);
      const level = Math.max(was.level, levelForXp(xp));
      if (level > was.level) ups.push(`${names.get(k) ?? k} reached level ${level}`);
      best = Math.max(best, level);
      progress[k] = { level, xp };
    }
    return { ...d, progress, renown: Math.max(d.renown, best) };
  });
  toast.success(`+${share} XP each${milestone ? ` · milestone: level ${milestone}` : ""}`);
  for (const u of ups) toast.success(`⭐ ${u}!`);
  if (ups.length) addChronicle(id, ups.map((text) => ({ kind: "level" as const, text: `${text}.` })));
}

// --- The shrine: injuries and the fallen ----------------------------------------------

export const treatCost = (): Cost => ({ gold: num("shrine.treatGold"), herbs: num("shrine.treatHerbs") });
export const raiseCost = (): Cost => ({ gold: num("shrine.raiseGold"), dust: num("shrine.raiseDust") });

/** Heal one of a hero's lasting injuries. */
export function treatInjury(heroKey: string, heroName: string, injury: string) {
  const id = me();
  if (!id) return;
  if (!work("shrine", treatCost(), num("shrine.treatHours"), `The shrine tended ${heroName}'s ${INJURIES[injury]?.name.toLowerCase() ?? "wound"}`, (t) => t)) return;
  updatePlayer(id, (d) => {
    const list = [...(d.injuries[heroKey] ?? [])];
    const i = list.indexOf(injury);
    if (i >= 0) list.splice(i, 1);
    return { ...d, injuries: { ...d.injuries, [heroKey]: list } };
  });
  addChronicle(id, [{ kind: "story", text: `${heroName}'s ${INJURIES[injury]?.name.toLowerCase() ?? "injury"} was healed at the shrine.` }]);
}

/** Give a hero in the infirmary a Potion of Healing from the town's stores: back on their feet sooner. */
export function hastenRecovery(heroKey: string, heroName: string, potion = "potion-healing") {
  const id = me();
  const doc = docOf(id);
  if (!id || !doc?.town) return;
  if (recoveryLeft(doc, heroKey) <= 0) return;
  if ((doc.town.stash[potion] ?? 0) <= 0) return void toast.error("No Potion of Healing in the town's stores");
  const cut = num("infirmary.potionHours") * (potion === "potion-greater-healing" ? 2 : 1);
  updatePlayer(id, (d) => {
    if (!d.town) return d;
    const stash = {
      ...d.town.stash,
      [potion]: (d.town.stash[potion] ?? 0) - 1,
    };
    if (stash[potion]! <= 0) delete stash[potion];
    return {
      ...d,
      town: { ...d.town, stash },
      recovery: { ...d.recovery, [heroKey]: (d.recovery[heroKey] ?? 0) - cut },
    };
  });
  toast.success(`${heroName} drinks the potion: ${cut} hours sooner on their feet`);
}

/** Bring a fallen hero back. */
export function raiseHero(heroKey: string, heroName: string) {
  const id = me();
  if (!id) return;
  if (!work("shrine", raiseCost(), num("shrine.raiseHours"), `The shrine's priests raised ${heroName} from the dead`, (t) => t)) return;
  updatePlayer(id, (d) => ({ ...d, fallen: d.fallen.filter((k) => k !== heroKey) }));
  addChronicle(id, [{ kind: "story", text: `${heroName} was raised from the dead at the shrine.` }]);
}
