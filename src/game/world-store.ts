import { toast } from "sonner";
import { create } from "zustand";
import type { PlayerDoc } from "../domain/players";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";
import { allAdventures, beginAdventure, useCampaign } from "./campaign-store";
import { availableMembers, chosenParty, myCharacters } from "./party-store";
import { addRep, contractsAt, isSettlement, payday, priceOf, type ActiveContract, type Contract } from "./company";
import { makeCandidates, type Candidate } from "./roster";
import { foeBattle } from "./patrol";
import { mulberry32, randomSeed } from "./rng";
import { setupFor } from "./scenarios";
import { startBattle, usePlay } from "./store";
import { allFactions, enlist, grantChest, onRoadBattle, partyLevel, passTime, salvageBattle } from "./town-store";
import { num } from "./tuning";
import { BAND_NAME, bandAt, blankExplored, dist, explore, generateWorld, march, moveBands, spawnBand, type Band, type Place, type Pt, type World } from "./world";

/**
 * The company on the march: a clock that runs only while it moves (paused,
 * ×1, ×2, ×4), bands that wander and give chase, and what happens on arrival.
 * The march lives here in memory; it is saved to the player's document when
 * the company stops, arrives, meets a band, or every few game hours.
 */

type Speed = 1 | 2 | 4;

interface WorldState {
  pos: Pt | null;
  dest: Pt | null;
  /** Where the company is headed, if it's a place. */
  destPlace: string | null;
  bands: Band[];
  running: boolean;
  speed: Speed;
  /** Game hours marched and not yet passed on to the town's clock. */
  bank: number;
  /** World hours (marching only). */
  hours: number;
  lastSpawn: number;
  /** The place the company stands at, after arriving. */
  at: string | null;
  /** A band that caught the company: fight or slip away. */
  encounter: Band | null;
  /** The map cells seen so far (see world.ts). */
  explored: string;
  /** Footprints behind the company (newest last). */
  trail: Pt[];
}

export const useWorld = create<WorldState>(() => ({ pos: null, dest: null, destPlace: null, bands: [], running: false, speed: 1, bank: 0, hours: 0, lastSpawn: 0, at: null, encounter: null, explored: "", trail: [] }));

const me = () => useActiveProfile.getState().id;
const docOf = () => {
  const id = me();
  return id ? usePlayers.getState().docs[id] : undefined;
};

let cache: { key: string; world: World } | null = null;
/** The player's land (cached: the same seed and places always make the same world). */
export function worldOf(doc: PlayerDoc | undefined): World | null {
  if (!doc?.world) return null;
  const factions = allFactions();
  const sites = allAdventures().map((a) => ({ id: a.id, title: a.title }));
  const key = `${doc.world.seed}|${doc.town?.name ?? ""}|${factions.map((f) => f.id).join()}|${sites.map((s) => s.id).join()}`;
  if (cache?.key !== key) cache = { key, world: generateWorld(doc.world.seed, doc.town?.name ?? "Home", factions, sites) };
  return cache.world;
}

/** Make sure the player has a world, and load the company's position from it. */
export function enterWorld() {
  const id = me();
  const doc = docOf();
  if (!id || !doc) return;
  if (!doc.world) {
    const seed = doc.town?.seed ?? randomSeed();
    const w = generateWorld(seed, doc.town?.name ?? "Home", allFactions(), allAdventures().map((a) => ({ id: a.id, title: a.title })));
    const home = w.places.find((p) => p.kind === "home")!;
    // A few bands are already out there.
    const rng = mulberry32(seed ^ 0xb4d5).rng;
    const bands = Array.from({ length: 2 }, (_, i) => spawnBand(w, rng, `b-start-${i}`, doc.renown, allFactions())).filter((b) => dist(b, home) > num("world.bandSight"));
    const explored = explore(blankExplored(), home, num("world.sight"));
    updatePlayer(id, (d) => ({
      ...d,
      world: { seed, x: home.x, y: home.y, hours: 0, bands, lastSpawn: 0, seen: ["home"], explored, provisions: 12, paidDay: 0, unpaid: {}, hungry: false, rep: {}, contracts: [], taken: [], horses: false },
    }));
  }
  const w = docOf()!.world!;
  const s = useWorld.getState();
  if (!s.pos)
    useWorld.setState({
      pos: { x: w.x, y: w.y },
      bands: w.bands,
      hours: w.hours,
      lastSpawn: w.lastSpawn,
      explored: explore(w.explored, { x: w.x, y: w.y }, num("world.sight")),
      trail: [],
      at: placeAt(worldOf(docOf()), { x: w.x, y: w.y })?.id ?? null,
    });
}

const placeAt = (w: World | null, p: Pt): Place | undefined => w?.places.find((q) => dist(q, p) < 14);

/** Save the march: the company's position and the bands, and pass the marched hours to the town. */
export function saveMarch() {
  const id = me();
  const s = useWorld.getState();
  if (!id || !s.pos || !docOf()?.world) return;
  const bank = s.bank;
  useWorld.setState({ bank: 0 });
  updatePlayer(id, (d) => (d.world ? { ...d, world: { ...d.world, x: s.pos!.x, y: s.pos!.y, hours: s.hours, bands: s.bands, lastSpawn: s.lastSpawn, explored: s.explored } } : d));
  if (bank >= 0.05) passTime(bank);
}

/** Set off for a point (or a place) on the map. */
export function marchTo(p: Pt, placeId: string | null = null) {
  if (useCampaign.getState().state || usePlay.getState().game) return void toast.error("The company is busy");
  if (!chosenParty().length) return void toast.error("No one is fit to march: the heroes are in the infirmary, looking after the town, or fallen");
  useWorld.setState({ dest: p, destPlace: placeId, running: true, at: null });
  startClock();
}

export const pauseMarch = () => {
  useWorld.setState({ running: false });
  saveMarch();
};
export const resumeMarch = () => {
  if (useWorld.getState().dest) {
    useWorld.setState({ running: true });
    startClock();
  }
};
export const setSpeed = (speed: Speed) => useWorld.setState({ speed });

let timer: number | null = null;
const TICK_MS = 100;

function startClock() {
  if (timer !== null) return;
  timer = window.setInterval(tick, TICK_MS);
}
function stopClock() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

/** One tick of the march. */
function tick() {
  const s = useWorld.getState();
  const w = worldOf(docOf());
  if (!s.running || !s.pos || !s.dest || !w) return stopClock();
  const hours = ((TICK_MS / 1000) * s.speed) / Math.max(0.05, num("world.realSecondsPerHour"));
  // A hungry company drags its feet.
  const cw = docOf()?.world;
  const pace = (cw?.hungry ? num("company.hungrySlow") : 1) * (cw?.horses ? num("world.horseSpeed") : 1);
  const step = march(w, s.pos, s.dest, hours * pace);
  const rng = mulberry32((w.seed ^ Math.floor(s.hours * 977)) >>> 0).rng;
  let bands = moveBands(w, s.bands, step.pos, hours, rng);
  let lastSpawn = s.lastSpawn;
  const renown = docOf()?.renown ?? 1;
  const cap = num("world.maxBands") + Math.floor(renown / 2);
  if (bands.length < cap && s.hours + hours - lastSpawn >= num("world.spawnHours")) {
    bands = [...bands, spawnBand(w, rng, `b${Math.floor(s.hours * 10)}`, renown, allFactions())];
    lastSpawn = s.hours + hours;
  }
  const caught = bandAt(bands, step.pos);
  // Footprints every few map units; the map fills in as the company sees more of it.
  const last = s.trail[s.trail.length - 1];
  const trail = !last || dist(last, step.pos) > 5 ? [...s.trail, step.pos].slice(-140) : s.trail;
  const explored = explore(s.explored, step.pos, num("world.sight"));
  const next: Partial<WorldState> = { pos: step.pos, bands, hours: s.hours + hours, bank: s.bank + hours, lastSpawn, trail, explored };
  // A new day on the road: wages, rations, deadlines.
  if (Math.floor((s.hours + hours) / 24) > Math.floor(s.hours / 24)) {
    useWorld.setState(next);
    newDay();
  }
  if (caught) {
    useWorld.setState({ ...next, running: false, encounter: caught });
    stopClock();
    saveMarch();
    return;
  }
  if (step.arrived) {
    const place = s.destPlace ? w.places.find((p) => p.id === s.destPlace) : placeAt(w, step.pos);
    useWorld.setState({ ...next, running: false, dest: null, destPlace: null, at: place?.id ?? null });
    stopClock();
    saveMarch();
    if (place) arrive(place);
    return;
  }
  useWorld.setState(next);
  // Save every few game hours on a long march.
  if (s.bank + hours >= 6) saveMarch();
}

function arrive(place: Place) {
  const id = me();
  if (!id) return;
  settleContracts(place);
  updatePlayer(id, (d) => (d.world && !d.world.seen.includes(place.id) ? { ...d, world: { ...d.world, seen: [...d.world.seen, place.id] } } : d));
  if (place.kind !== "home" && !docOf()?.world?.seen.includes(place.id)) addChronicle(id, [{ kind: "story", text: `The company reached ${place.name}.` }]);
}

// --- Bands on the road --------------------------------------------------------------------

/** Turn and fight the band that caught the company. */
export function fightBand() {
  const band = useWorld.getState().encounter;
  const party = chosenParty();
  if (!band || !party.length) return;
  const sc = foeBattle(band.foe, partyLevel(party), party.length, band.from ? "moderate" : "low", randomSeed(), `On the road: ${band.name.toLowerCase()}`);
  const { board, units } = setupFor(sc, party);
  useWorld.setState({ encounter: null });
  startBattle(sc, board, units, { stash: { ...(docOf()?.town?.stash ?? {}) } }, "town", { kind: "road", band: band.id, heroes: party.map((e) => e.key) });
}

/** Try to slip away: the party's best Stealth against DC 12; on a failure the band gets its fight. */
export function slipAway(): boolean {
  const band = useWorld.getState().encounter;
  if (!band) return false;
  const best = Math.max(0, ...chosenParty().map((e) => e.build().stats?.skills.Stealth ?? 0));
  const roll = 1 + Math.floor(Math.random() * 20) + best;
  if (roll >= num("world.slipDc")) {
    // Back off the way they came, and the band loses the trail for a while.
    const s = useWorld.getState();
    const away = s.pos ? { x: s.pos.x + (s.pos.x - band.x) * 3, y: s.pos.y + (s.pos.y - band.y) * 3 } : null;
    useWorld.setState({ encounter: null, pos: away ?? s.pos, bands: s.bands.map((b) => (b.id === band.id ? { ...b, goal: { x: b.x * 2 - (away?.x ?? b.x), y: b.y * 2 - (away?.y ?? b.y) } } : b)) });
    toast.success(`Slipped away (Stealth ${roll})`);
    saveMarch();
    return true;
  }
  toast.error(`Spotted (Stealth ${roll}): they're on you`);
  fightBand();
  return false;
}

// After the fight: a beaten band is gone; a lost fight sends the company limping back toward home.
onRoadBattle((bandId, won, game, battle) => {
  const id = me();
  const s = useWorld.getState();
  const w = worldOf(docOf());
  if (!id || !w) return;
  if (won) {
    salvageBattle(game, battle);
    grantChest(num("loot.patrolTier"), battle);
    useWorld.setState({ bands: s.bands.filter((b) => b.id !== bandId) });
    // A contract's band: the job is done; the pay waits at the settlement.
    const contract = s.bands.find((b) => b.id === bandId)?.contract;
    if (contract) {
      updatePlayer(id, (d) => (d.world ? { ...d, world: { ...d.world, contracts: d.world.contracts.map((c) => (c.id === contract ? { ...c, state: "done" as const } : c)) } } : d));
      const c = docOf()?.world?.contracts.find((x) => x.id === contract);
      if (c) toast.success(`Job done: go back to ${w.places.find((p) => p.id === c.from)?.name} for the pay`);
    }
  } else if (s.pos) {
    const home = w.places.find((p) => p.kind === "home")!;
    const d = Math.max(1, dist(home, s.pos));
    const back = Math.min(d, 60);
    useWorld.setState({ pos: { x: s.pos.x + ((home.x - s.pos.x) / d) * back, y: s.pos.y + ((home.y - s.pos.y) / d) * back }, bands: s.bands.map((b) => (b.id === bandId ? { ...b, goal: { x: b.from ? (w.places.find((p) => p.id === b.from)?.x ?? b.x) : b.x, y: b.from ? (w.places.find((p) => p.id === b.from)?.y ?? b.y) : b.y } } : b)) });
  }
  saveMarch();
});

/** Start an adventure from its site on the map. */
export function beginAt(place: Place) {
  const adv = allAdventures().find((a) => a.id === place.ref);
  if (adv) beginAdventure(adv);
}

// --- Running the company: wages, rations, work and recruits -----------------------------

/** A new day on the road: pay everyone, feed the marchers, and let lapsed contracts go. */
function newDay() {
  const id = me();
  const doc = docOf();
  const w = worldOf(doc);
  const hours = useWorld.getState().hours;
  const day = Math.floor(hours / 24);
  if (!id || !doc?.world || !doc.town || !w || day <= doc.world.paidDay) return;
  const roster = availableMembers(myCharacters())
    .filter((e) => !doc.fallen.includes(e.key))
    .map((e) => ({ key: e.key, name: e.label, level: doc.progress[e.key]?.level ?? 1 }));
  // The horses eat first.
  const fodder = doc.world.horses ? Math.min(doc.town.gold, num("world.horseUpkeep")) : 0;
  const pd = payday(doc.town.gold - fodder, roster, chosenParty().length, doc.world.provisions);
  const unpaid: Record<string, number> = {};
  for (const h of roster) unpaid[h.key] = pd.unpaid.includes(h.key) ? (doc.world.unpaid[h.key] ?? 0) + 1 : 0;
  // Hired heroes walk out after too many days without pay; the founders stay, grumbling.
  const deserters = roster.filter((h) => h.key.startsWith("custom-") && unpaid[h.key]! >= num("company.desertDays"));
  const lapsed = doc.world.contracts.filter((c) => c.state === "open" && c.due < hours);
  updatePlayer(id, (d) => {
    if (!d.world || !d.town) return d;
    let rep = d.world.rep;
    for (const c of lapsed) rep = addRep(rep, c.from, -2);
    return {
      ...d,
      town: { ...d.town, gold: d.town.gold - pd.paid - fodder },
      characters: d.characters.filter((c) => !deserters.some((x) => x.key === `custom-${c.id}`)),
      picks: d.picks.filter((k) => !deserters.some((x) => x.key === k)),
      world: {
        ...d.world,
        paidDay: day,
        provisions: d.world.provisions - pd.eaten,
        hungry: pd.hungry,
        unpaid,
        rep,
        contracts: d.world.contracts.filter((c) => !lapsed.includes(c)),
      },
    };
  });
  if (lapsed.length) useWorld.setState((s) => ({ bands: s.bands.filter((b) => !lapsed.some((c) => b.contract === c.id)) }));
  const lines: string[] = [];
  if (pd.paid) lines.push(`Paid ${pd.paid} gold in wages${fodder ? ` and ${fodder} for the horses` : ""}.`);
  if (pd.unpaid.length) lines.push(`Couldn't pay ${pd.unpaid.length} of the company.`);
  if (pd.hungry) lines.push("The rations ran out: the company is hungry.");
  for (const x of deserters) lines.push(`${x.name} walked out: no pay for ${num("company.desertDays")} days.`);
  for (const c of lapsed) lines.push(`Missed a deadline: ${c.title}.`);
  if (lines.length) addChronicle(id, lines.map((text) => ({ kind: "story" as const, text: `Day ${day + 1} on the road. ${text}` })));
  if (pd.hungry) toast.warning("Out of rations: the company is hungry (slower, and −" + num("company.hungryAttack") + " to attacks)");
  if (pd.unpaid.length) toast.warning(`Not enough gold for wages: ${pd.unpaid.length} unpaid`);
  for (const x of deserters) toast.error(`${x.name} has left the company`);
  for (const c of lapsed) toast.error(`Contract failed: ${c.title}`);
}

/** Arriving at a settlement: deliver parcels, collect pay for finished hunts. */
function settleContracts(place: Place) {
  const id = me();
  const doc = docOf();
  if (!id || !doc?.world || !isSettlement(place)) return;
  const paid = doc.world.contracts.filter((c) => (c.kind === "deliver" && c.to === place.id) || (c.kind === "hunt" && c.state === "done" && c.from === place.id));
  if (!paid.length) return;
  const gold = paid.reduce((n, c) => n + c.reward, 0);
  updatePlayer(id, (d) => {
    if (!d.world || !d.town) return d;
    let rep = d.world.rep;
    for (const c of paid) {
      rep = addRep(rep, c.from, c.kind === "hunt" ? 2 : 1);
      if (c.kind === "deliver") rep = addRep(rep, place.id, 1);
    }
    return { ...d, town: { ...d.town, gold: d.town.gold + gold }, world: { ...d.world, rep, contracts: d.world.contracts.filter((c) => !paid.includes(c)) } };
  });
  addChronicle(id, paid.map((c) => ({ kind: "loot" as const, text: `${c.title}: done, ${c.reward} gold.` })));
  toast.success(`Paid ${gold} gold in ${place.name}`);
}

/** The work on a settlement's board (minus what the company already took). */
export function boardAt(place: Place): Contract[] {
  const doc = docOf();
  const w = worldOf(doc);
  if (!doc?.world || !w) return [];
  return contractsAt(w, place, useWorld.getState().hours, Math.max(1, doc.renown), doc.world.rep[place.id] ?? 0).filter((c) => !doc.world!.taken.includes(c.id));
}

/** Take a contract: a hunt puts the band on the map. */
export function takeContract(c: Contract) {
  const id = me();
  const doc = docOf();
  if (!id || !doc?.world) return;
  if (doc.world.contracts.length >= 3) return void toast.error("The company has its hands full: three contracts at a time");
  const due = useWorld.getState().hours + c.days * 24;
  const active: ActiveContract = { ...c, due, state: "open" };
  updatePlayer(id, (d) => (d.world ? { ...d, world: { ...d.world, contracts: [...d.world.contracts, active], taken: [...d.world.taken, c.id].slice(-200) } } : d));
  if (c.kind === "hunt" && c.at && c.foe) {
    const band: Band = { id: `c-${c.id}`, foe: c.foe, name: BAND_NAME[c.foe] ?? "Raiders", x: c.at.x, y: c.at.y, goal: c.at, contract: c.id };
    useWorld.setState((s) => ({ bands: [...s.bands, band] }));
    saveMarch();
  }
  toast.success(`Taken: ${c.title}`);
}

/** Buy rations or potions at a settlement (with the camp's gold). */
export function buyAt(place: Place, item: "ration" | "potion", count: number) {
  const id = me();
  const doc = docOf();
  if (!id || !doc?.world || !doc.town || !isSettlement(place)) return;
  const cost = priceOf(item, place, doc.world.rep[place.id] ?? 0) * count;
  if (doc.town.gold < cost) return void toast.error(`Needs ${cost} gold`);
  updatePlayer(id, (d) =>
    d.world && d.town
      ? {
          ...d,
          town: { ...d.town, gold: d.town.gold - cost, stash: item === "potion" ? { ...d.town.stash, "potion-healing": (d.town.stash["potion-healing"] ?? 0) + count } : d.town.stash },
          world: { ...d.world, provisions: d.world.provisions + (item === "ration" ? count : 0), hungry: item === "ration" ? false : d.world.hungry },
        }
      : d,
  );
}

/** Take rations from the camp's food (one food, one ration). */
export function packRations(count: number) {
  const id = me();
  const doc = docOf();
  if (!id || !doc?.world || !doc.town) return;
  const n = Math.min(count, Math.floor(doc.town.food));
  if (n <= 0) return void toast.error("The camp has no food to spare");
  updatePlayer(id, (d) => (d.world && d.town ? { ...d, town: { ...d.town, food: d.town.food - n }, world: { ...d.world, provisions: d.world.provisions + n, hungry: false } } : d));
}

/** Sellswords looking for work in a town or a city (better with renown and reputation). */
export function recruitsAt(place: Place): Candidate[] {
  const doc = docOf();
  const w = worldOf(doc);
  if (!doc?.world || !w || (place.kind !== "town" && place.kind !== "city")) return [];
  const batch = Math.floor(useWorld.getState().hours / 24 / Math.max(1, num("tavern.refreshDays")));
  const rep = doc.world.rep[place.id] ?? 0;
  const score = Math.max(0, doc.renown * 10 + rep * num("company.recruitScorePerRep"));
  const seed = (w.seed ^ [...place.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 5) ^ (batch * 7907)) >>> 0;
  return makeCandidates(seed, `rec-${place.id}-${batch}`, place.kind === "city" ? 3 : 2, Math.max(1, doc.renown), score).filter((c) => !doc.world!.taken.includes(c.id));
}

export function hireAt(place: Place, c: Candidate) {
  const id = me();
  if (!id || !enlist(c, place.name)) return;
  updatePlayer(id, (d) => (d.world ? { ...d, world: { ...d.world, taken: [...d.world.taken, c.id].slice(-200) } } : d));
}

/** Buy horses (towns and cities): the company rides, faster, but the horses need feeding every day. Or sell them back for half. */
export function tradeHorses(place: Place, buy: boolean) {
  const id = me();
  const doc = docOf();
  if (!id || !doc?.world || !doc.town || (place.kind !== "town" && place.kind !== "city")) return;
  const price = num("world.horsePrice");
  if (buy) {
    if (doc.world.horses) return;
    if (doc.town.gold < price) return void toast.error(`Needs ${price} gold`);
    updatePlayer(id, (d) => (d.world && d.town ? { ...d, town: { ...d.town, gold: d.town.gold - price }, world: { ...d.world, horses: true } } : d));
    addChronicle(id, [{ kind: "story", text: `Bought horses in ${place.name}: the company rides now.` }]);
    toast.success("🐎 The company rides: faster on the march");
  } else {
    if (!doc.world.horses) return;
    const back = Math.round(price / 2);
    updatePlayer(id, (d) => (d.world && d.town ? { ...d, town: { ...d.town, gold: d.town.gold + back }, world: { ...d.world, horses: false } } : d));
    toast(`Sold the horses for ${back} gold`);
  }
}
