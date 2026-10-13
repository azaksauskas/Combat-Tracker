import { toast } from "sonner";
import { create } from "zustand";
import { newId } from "../domain/combat";
import type { PlayerDoc } from "../domain/players";
import type { BuildingType, Town } from "../domain/town";
import { useGame } from "../store/game";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";
import { randomSeed } from "./rng";
import {
  ONLINE_MS_PER_HOUR,
  advance,
  awayReport,
  bringHome,
  catchUp,
  durationText,
  foundTown,
  startBuilding,
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
  return { renown: owner?.renown ?? 1, residents, ownerAway: !!owner?.residence };
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
  updatePlayer(id, (d) => ({ ...d, town: foundTown(name, Date.now(), randomSeed()), residence: null }));
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
export function homecoming(title: string, gold: number, potions: Record<string, number>, recruits: { name: string; trade?: string }[], level: number) {
  const id = me();
  if (!id) return;
  updatePlayer(id, (d) => {
    let town = d.town;
    if (town) {
      town = bringHome(town, gold, potions, title);
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
