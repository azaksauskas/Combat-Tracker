import { toast } from "sonner";
import type { MissionKind, PlayerDoc } from "../domain/players";
import { MAX_TOWN_LOG, type Town } from "../domain/town";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";
import { MAX_MISSIONS, MISSIONS, applyIncoming, due, incoming, missionCost, newMission, resolveMission } from "./intrigue";
import { authority, canCollect, crackdown, holds, influence, reclaim, titheGold, type Guild } from "./guilds";
import { foeBattle } from "./patrol";
import { setupFor } from "./scenarios";
import { startBattle, usePlay } from "./store";
import { chosenParty } from "./party-store";
import { onReclaim, onTownTick, partyLevel, today } from "./town-store";
import { randomSeed } from "./rng";
import { num } from "./tuning";
import { working } from "./town";

/**
 * Spies and guilds, in the browser: sending spies, settling their missions,
 * applying what others' spies did here, and the guild actions of members and
 * owners. Each player only ever writes their own document.
 */

const me = () => useActiveProfile.getState().id;
const docs = () => usePlayers.getState().docs;
const nameOf = (id: string) => usePlayers.getState().profiles.find((p) => p.id === id)?.name ?? "someone";
const townName = (id: string) => docs()[id]?.town?.name ?? `${nameOf(id)}'s town`;
const logged = (t: Town, text: string, tone: "good" | "bad" | "info"): Town => ({ ...t, log: [...t.log, { at: t.hours, text, tone }].slice(-MAX_TOWN_LOG) });

// --- Spies ------------------------------------------------------------------------------

/** Why this player can't send spies now, or null. */
export function cantSpy(d: PlayerDoc | undefined, kind: MissionKind): string | null {
  if (!d?.town) return "You need a town of your own";
  if (!working(d.town, "tavern")) return "Spies are found in a staffed tavern";
  if (d.town.gold < missionCost(kind)) return `Needs ${missionCost(kind)} gold`;
  return null;
}

export function sendSpy(target: string, kind: MissionKind) {
  const id = me();
  const d = id ? docs()[id] : undefined;
  if (!id || !d) return;
  const why = cantSpy(d, kind);
  if (why) return void toast.error(why);
  const m = newMission(kind, target, Date.now(), randomSeed());
  updatePlayer(id, (x) => ({
    ...x,
    town: x.town ? logged({ ...x.town, gold: x.town.gold - missionCost(kind) }, `🕵 A spy left for ${townName(target)} (${MISSIONS[kind].name.toLowerCase()}).`, "info") : x.town,
    missions: [...x.missions, m].slice(-MAX_MISSIONS),
  }));
  toast.success(`${MISSIONS[kind].icon} Your spy is on the way to ${townName(target)}`);
}

/** Missions whose spies have arrived: decide what happened. */
function settleMine(id: string, d: PlayerDoc, now: number) {
  const ready = due(d.missions, now);
  if (!ready.length) return;
  const results = new Map(ready.map((m) => [m.id, resolveMission(m, docs()[m.target]?.town ?? null, now)]));
  updatePlayer(id, (x) => ({ ...x, missions: x.missions.map((m) => (results.has(m.id) && !m.result ? { ...m, result: results.get(m.id)! } : m)) }));
  for (const m of ready) {
    const r = results.get(m.id)!;
    const where = townName(m.target);
    const text = r.caught
      ? `Our spy was caught in ${where}. ${nameOf(m.target)} knows who sent them.`
      : m.kind === "scout"
        ? `Our spy came back from ${where} with a report.`
        : m.kind === "sabotage"
          ? `Our saboteur burned ${r.damage?.food ?? 0} food and ${r.damage?.materials ?? 0} materials in ${where}.`
          : `Our agent stirred unrest in ${where}.`;
    (r.caught ? toast.error : toast.success)(`🕵 ${text}`);
    addChronicle(id, [{ kind: "story", text }]);
  }
}

/** What other players' spies did here, applied once. */
function applyTheirs(id: string, d: PlayerDoc) {
  const list = incoming(id, d, docs());
  if (!list.length) return;
  const seen = [...d.seenMissions, ...list.map((x) => x.mission.id)].slice(-200);
  if (!d.town) return void updatePlayer(id, (x) => ({ ...x, seenMissions: seen }));
  const { town, news } = applyIncoming(d.town, list, nameOf);
  updatePlayer(id, (x) => ({ ...x, town, seenMissions: seen }));
  for (const n of news) (n.tone === "good" ? toast.success : toast.warning)(`🕵 ${n.text}`);
}

/** Banished: back home, and out of the guild. */
function enforceBan(id: string, d: PlayerDoc) {
  if (!d.residence) return;
  const host = docs()[d.residence]?.town;
  if (!host?.banned.includes(id)) return;
  const where = host.name;
  updatePlayer(id, (x) => ({ ...x, residence: null, guild: null }));
  toast.error(`You were banished from ${where} and went home.`);
  addChronicle(id, [{ kind: "story", text: `Banished from ${where}.` }]);
}

onTownTick(() => {
  const id = me();
  const d = id ? docs()[id] : undefined;
  if (!id || !d || !usePlayers.getState().ready || usePlay.getState().game) return;
  const now = Date.now();
  settleMine(id, d, now);
  applyTheirs(id, docs()[id] ?? d);
  enforceBan(id, docs()[id] ?? d);
});

// --- Guild members ------------------------------------------------------------------

export function foundGuild(name: string) {
  const id = me();
  const d = id ? docs()[id] : undefined;
  if (!id || !d?.residence) return;
  if (d.guild) return void toast.error("Leave your guild first");
  const cost = num("guild.foundGold");
  if (d.town && d.town.gold < cost) return void toast.error(`Founding a guild costs ${cost} gold from your own town`);
  const town = d.residence;
  updatePlayer(id, (x) => ({
    ...x,
    town: x.town ? { ...x.town, gold: x.town.gold - cost } : x.town,
    guild: { id, name: name.trim() || "The Guild", town, joinedAt: Date.now() },
  }));
  addChronicle(id, [{ kind: "story", text: `Founded ${name.trim() || "a guild"} in ${townName(town)}.` }]);
}

export function joinGuild(g: Guild) {
  const id = me();
  if (!id) return;
  updatePlayer(id, (x) => ({ ...x, guild: { id: g.id, name: g.name, town: g.town, joinedAt: Date.now() } }));
  addChronicle(id, [{ kind: "story", text: `Joined ${g.name}.` }]);
}

export function leaveGuild() {
  const id = me();
  if (!id) return;
  updatePlayer(id, (x) => ({ ...x, guild: null }));
}

/** A day's work for the guild: once per real day. */
export function workForGuild() {
  const id = me();
  const d = id ? docs()[id] : undefined;
  if (!id || !d?.guild) return;
  if (d.guildWork.day === today()) return void toast.info("You've done your share for today. Come back tomorrow.");
  updatePlayer(id, (x) => ({ ...x, guildWork: { day: today(), total: x.guildWork.total + 1 } }));
  toast.success(`+${num("guild.perWork")} influence for ${d.guild.name}`);
}

/** The founder takes the guild's cut from a town it runs. */
export function collectTithe() {
  const id = me();
  const d = id ? docs()[id] : undefined;
  if (!id || !d?.guild || d.guild.id !== id) return;
  const hold = holds(d.guild.town, docs(), Date.now()).find((h) => h.guild.id === id);
  if (!hold || hold.stage < 3) return void toast.error("The guild doesn't run this town (yet)");
  if (!canCollect(d.lastTithe, Date.now())) return void toast.info("The tithe was collected today already");
  const gold = titheGold(hold.guild);
  updatePlayer(id, (x) => ({ ...x, lastTithe: Date.now(), town: x.town ? logged({ ...x.town, gold: x.town.gold + gold }, `${d.guild!.name} sent home ${gold} gold of ${townName(d.guild!.town)}'s tithe.`, "good") : x.town }));
  toast.success(`+${gold} gold to your own town`);
}

// --- Owners ------------------------------------------------------------------------

export function crackdownOn(guildId: string) {
  const id = me();
  const d = id ? docs()[id] : undefined;
  if (!id || !d?.town) return;
  try {
    const t = crackdown(d.town, guildId, authority(d), Date.now());
    const g = holds(id, docs(), Date.now()).find((h) => h.guild.id === guildId);
    updatePlayer(id, (x) => ({ ...x, town: logged(t, `The watch cracked down on ${g?.guild.name ?? "the guild"}.`, "info") }));
    toast.success("The guild's grip loosens");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

export function banish(guildId: string) {
  const id = me();
  const d = id ? docs()[id] : undefined;
  const hold = id ? holds(id, docs(), Date.now()).find((h) => h.guild.id === guildId) : undefined;
  if (!id || !d?.town || !hold) return;
  if (hold.stage >= 2) return void toast.error("The guild is too strong to banish now: crack down first, or take the town back");
  updatePlayer(id, (x) => ({ ...x, town: x.town ? logged({ ...x.town, banned: [...new Set([...x.town.banned, ...hold.guild.members])] }, `${hold.guild.name} were banished from the town.`, "info") : x.town }));
}

export function unban(playerId: string) {
  const id = me();
  if (!id) return;
  updatePlayer(id, (x) => ({ ...x, town: x.town ? { ...x.town, banned: x.town.banned.filter((b) => b !== playerId) } : x.town }));
}

/** Take the town back from a guild that runs it: a fight with its hired blades. */
export function startReclaim(guildId: string) {
  const id = me();
  const t = id ? docs()[id]?.town : undefined;
  if (!id || !t) return;
  const party = chosenParty();
  if (!party.length) return void toast.error("Pick the heroes who'll go first");
  const hold = holds(id, docs(), Date.now()).find((h) => h.guild.id === guildId);
  const sc = foeBattle("bandits", partyLevel(party), party.length, "moderate", randomSeed(), `Taking ${t.name} back from ${hold?.guild.name ?? "the guild"}`);
  const { board, units } = setupFor(sc, party);
  startBattle(sc, board, units, { stash: { ...t.stash } }, "town", { kind: "reclaim", guild: guildId, heroes: party.map((e) => e.key) });
}

onReclaim((guildId, won) => reclaimResult(guildId, won));

/** After the fight to take the town back. */
export function reclaimResult(guildId: string, won: boolean) {
  const id = me();
  if (!id) return;
  const hold = holds(id, docs(), Date.now()).find((h) => h.guild.id === guildId);
  if (!won || !hold) return;
  updatePlayer(id, (x) => ({ ...x, town: x.town ? logged(reclaim(x.town, guildId, influence(hold.guild, docs(), Date.now())), `The heroes took the town back from ${hold.guild.name}.`, "good") : x.town }));
  addChronicle(id, [{ kind: "fight", text: `Took the town back from ${hold.guild.name}.` }]);
}
