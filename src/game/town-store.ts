import { toast } from "sonner";
import { create } from "zustand";
import { newId } from "../domain/combat";
import type { PlayerDoc } from "../domain/players";
import { MAX_TOWN_LOG, type BuildingType, type Town } from "../domain/town";
import type { GameState } from "./state";
import { BREWS, COMPONENTS, MODS, SLOTS, addComponents, cantAfford, fitMod, pay, salvage, type Component, type Cost } from "./crafting";
import { useGame } from "../store/game";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";
import { randomSeed } from "./rng";
import type { Faction } from "../domain/faction";
import { BUILTIN_FACTIONS, lairResult, payTribute, raidResult, refuseTribute } from "./region";
import { findScenario } from "./campaign-store";
import { setupFor } from "./scenarios";
import { quitGame, startBattle, usePlay } from "./store";
import { chosenParty } from "./party-store";
import { MAX_LEVEL, XP_BY_CR, XP_FOR_LEVEL, levelForXp } from "./party";
import {
  ONLINE_MS_PER_HOUR,
  advance,
  awayReport,
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
  return { renown: owner?.renown ?? 1, residents, ownerAway: !!owner?.residence, factions: allFactions() };
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
const onlineHours = (t: Town, now: number) => (lastTick ? Math.max(0, (now - Math.max(t.at, onlineSince)) / ONLINE_MS_PER_HOUR) : 0);

/** Game time right now, for display: the saved hours plus online time since. */
export function liveHours(t: Town, now = Date.now()): number {
  const online = lastTick && now - lastTick < 30_000 && boundTo !== null;
  return online ? t.hours + onlineHours(t, now) : t.hours;
}

const onPlayPage = () => location.hash.startsWith("#/play");

let ticking = false;
function tick() {
  // Saving below notifies subscribers, which would call tick again.
  if (ticking) return;
  ticking = true;
  try {
    step();
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
    if (back.hours >= 1 && (back.events.length || back.town.gold !== before.gold || back.town.food !== before.food)) {
      useTownUi.setState({ report: awayReport(before, back.town, back.events, back.hours), title: "While you were away…" });
    }
    return;
  }
  lastTick = now;
  // Save once per game hour (one real minute) rather than on every tick.
  if (Math.floor(doc.town.hours + onlineHours(doc.town, now)) > Math.floor(doc.town.hours)) commitOnline(id, doc.town, now);
}

function commitOnline(id: string, t: Town, now: number) {
  const { town, events } = advance(t, onlineHours(t, now), now, townContext(id));
  updatePlayer(id, (d) => ({ ...d, town }));
  for (const e of events) if (e.tone !== "info") toast[e.tone === "good" ? "success" : "warning"](e.text);
}

let started = false;
export function bindTown() {
  if (started) return;
  started = true;
  setInterval(tick, 2_000);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("hashchange", tick);
  window.addEventListener("pagehide", () => {
    const id = me();
    const t = docOf(id)?.town;
    if (id && t && lastTick && !docOf(id)?.residence) commitOnline(id, t, Date.now());
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
  if (!id || !doc?.town) return;
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
  const id = me();
  if (id) setTown(id, (t) => ({ ...t, open }));
};

/** Travel by waystone to another player's town and live there; your own town carries on without you. */
export function joinTown(ownerId: string) {
  const id = me();
  if (!id || ownerId === id) return;
  passTime(6, "Travelled by waystone");
  updatePlayer(id, (d) => ({ ...d, residence: ownerId }));
  const owner = useGame.getState().players.profiles.find((p) => p.id === ownerId);
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

/** Renown follows the best hero's level as soon as they level up. */
export function noteLevel(level: number) {
  const id = me();
  if (id) updatePlayer(id, (d) => (level > d.renown ? { ...d, renown: level } : d));
}

// --- Daily limits ---------------------------------------------------------------------

export const today = () => new Date().toLocaleDateString("en-CA");

/** A day's work around town: once per bed per real day. */
export function helpOut() {
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

function work(cost: Cost, hours: number, what: string, change: (t: Town) => Town) {
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return false;
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
  if (!work(mod.cost, mod.hours, `The smith fitted ${heroName}'s ${SLOTS[mod.slot].toLowerCase()} with: ${mod.name}`, (t) => t)) return;
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
  work(b.cost, b.hours, `The apothecary brewed a ${name}`, (t) => ({ ...t, stash: { ...t.stash, [itemId]: (t.stash[itemId] ?? 0) + 1 } }));
}

export function buy(component: Component, n = 1) {
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return;
  const price = COMPONENTS[component].price * n;
  if (t.gold < price) return toast.error(`Needs ${price} gold`);
  setTown(id, (x) => addComponents({ ...x, gold: x.gold - price }, { [component]: n }));
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

/** Hire a worker at the tavern (gold, a free bed). */
export function hireWorker() {
  const id = me();
  const t = docOf(id)?.town;
  if (!id || !t) return;
  try {
    const next = hire(t);
    updatePlayer(id, (d) => ({ ...d, town: next }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
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
  const { board, units } = setupFor(sc, party);
  const name = kind === "raid" ? `${f.name} raid ${t.name}` : `${f.name}'s lair`;
  // Potions from the town's stores are at hand; what's left goes back.
  startBattle({ ...sc, name }, board, units, { stash: { ...t.stash } }, "town", { kind, faction: fid, heroes: party.map((e) => e.key) });
}

/** Back from a town battle: apply the result to the town. */
export function finishTownBattle(retreat = false) {
  const id = me();
  const { game, context, scenario } = usePlay.getState();
  const f = context ? factionOf(context.faction) : undefined;
  if (!id || !game || !context || !f) return quitGame();
  const won = !retreat && game.outcome === "victory";
  const result = context.kind === "raid" ? raidResult : lairResult;
  updatePlayer(id, (d) => (d.town ? { ...d, town: { ...result(d.town, f, won), stash: { ...(game.stash ?? d.town.stash) } } } : d));
  if (won) {
    salvageBattle(game, scenario?.name ?? f.name);
    awardXp(id, game, context.heroes ?? [], context.kind === "lair" ? f.milestone : undefined);
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
  passTime(2);
  quitGame();
}

/** XP for the heroes who fought (monsters' XP shared out), and a lair's milestone level. */
function awardXp(id: string, game: GameState, keys: string[], milestone: number | undefined) {
  if (!keys.length) return;
  const monsterXp = game.units.filter((u) => u.side === "enemy" && u.dead).reduce((n, u) => n + (XP_BY_CR[u.stats.cr ?? ""] ?? 0), 0);
  const share = Math.floor(monsterXp / keys.length);
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
