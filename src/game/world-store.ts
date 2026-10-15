import { toast } from "sonner";
import { create } from "zustand";
import type { PlayerDoc } from "../domain/players";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";
import { allAdventures, beginAdventure, useCampaign } from "./campaign-store";
import { chosenParty } from "./party-store";
import { foeBattle } from "./patrol";
import { mulberry32, randomSeed } from "./rng";
import { setupFor } from "./scenarios";
import { startBattle, usePlay } from "./store";
import { allFactions, grantChest, onRoadBattle, partyLevel, passTime, salvageBattle } from "./town-store";
import { num } from "./tuning";
import { bandAt, blankExplored, dist, explore, generateWorld, march, moveBands, spawnBand, type Band, type Place, type Pt, type World } from "./world";

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
    const bands = Array.from({ length: 3 }, (_, i) => spawnBand(w, rng, `b-start-${i}`, doc.renown, allFactions())).filter((b) => dist(b, home) > num("world.bandSight"));
    const explored = explore(blankExplored(), home, num("world.sight"));
    updatePlayer(id, (d) => ({ ...d, world: { seed, x: home.x, y: home.y, hours: 0, bands, lastSpawn: 0, seen: ["home"], explored } }));
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
  const step = march(w, s.pos, s.dest, hours);
  const rng = mulberry32((w.seed ^ Math.floor(s.hours * 977)) >>> 0).rng;
  let bands = moveBands(w, s.bands, step.pos, hours, rng);
  let lastSpawn = s.lastSpawn;
  const renown = docOf()?.renown ?? 1;
  const cap = num("world.maxBands") + renown;
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
