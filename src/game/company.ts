import { FOES } from "./patrol";
import { mulberry32 } from "./rng";
import { characterOf } from "./settlement";
import { num } from "./tuning";
import { FACTION_FOE, dist, travelHours, type Place, type Pt, type World } from "./world";

/**
 * Running the company (Battle Brothers style): wages every day for everyone on
 * the roster, rations for the march, and the work, goods and reputation each
 * settlement offers. Pure functions; world-store applies them.
 */

export const isSettlement = (p: Place | undefined) => !!p && (p.kind === "village" || p.kind === "town" || p.kind === "city");

/** A hero's daily wage. */
export const wageOf = (level: number) => Math.round(num("company.wageBase") + num("company.wagePerLevel") * (Math.max(1, level) - 1));

/** Reputation in a settlement: −10 (hated) … +10 (beloved). */
export const repText = (rep: number) => (rep >= 6 ? "beloved" : rep >= 3 ? "welcome" : rep > -3 ? "known" : rep > -6 ? "distrusted" : "hated");
const clampRep = (r: number) => Math.max(-10, Math.min(10, r));
export const addRep = (reps: Record<string, number>, placeId: string, n: number) => ({ ...reps, [placeId]: clampRep((reps[placeId] ?? 0) + n) });

/** Prices in a settlement, per item (to a tenth of a gold): bigger places cost more; reputation helps. */
export function priceOf(item: "ration" | "potion", place: Place, rep: number): number {
  const size = place.kind === "city" ? 1.4 : place.kind === "town" ? 1.15 : 1;
  const base = item === "ration" ? num("company.rationPrice") : num("company.potionPrice");
  const local = (item === "ration" ? characterOf(place).rations : characterOf(place).potions) ?? 1;
  return Math.max(0.1, Math.round(base * size * local * (1 - 0.03 * rep) * 10) / 10);
}
/** What a number of them costs, in whole gold. */
export const costOf = (item: "ration" | "potion", place: Place, rep: number, count: number) => Math.max(1, Math.ceil(priceOf(item, place, rep) * count - 1e-9));
/** Horses for the company here (cheaper where there's a river market). */
export const horsePriceAt = (place: Place) => Math.round(num("world.horsePrice") * (characterOf(place).horses ?? 1));
/** What a settlement sells. */
export const sells = (place: Place): ("ration" | "potion")[] => (place.kind === "village" ? ["ration"] : ["ration", "potion"]);

// --- Contracts --------------------------------------------------------------------------

export interface Contract {
  id: string;
  /** The settlement that posted it. */
  from: string;
  kind: "hunt" | "deliver";
  title: string;
  /** Hunt: the foe; deliver: the place to deliver to. */
  foe?: string;
  to?: string;
  /** Hunt: where the band lurks. */
  at?: Pt;
  reward: number;
  /** Days the company has to do it (from taking it). */
  days: number;
}

/** A contract the company has taken. */
export interface ActiveContract extends Contract {
  /** World hour by which it must be done. */
  due: number;
  /** "open" → (hunt) "done" when the band is beaten → collected at the settlement. */
  state: "open" | "done";
}

const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17);

/** Which batch of contracts is on the boards (a new one every few days of marching). */
export const boardBatch = (hours: number) => Math.floor(hours / 24 / Math.max(1, num("company.boardDays")));

/** The work posted in a settlement right now (fixed for the batch). */
export function contractsAt(w: World, place: Place, hours: number, level: number, rep: number): Contract[] {
  if (!isSettlement(place)) return [];
  const batch = boardBatch(hours);
  const rng = mulberry32((w.seed ^ hashOf(place.id) ^ (batch * 104729)) >>> 0).rng;
  const count = (place.kind === "city" ? 3 : place.kind === "town" ? 2 : 1) + (characterOf(place).extraWork ?? 0);
  const pay = (1 + 0.05 * rep) * (characterOf(place).pay ?? 1);
  const others = w.places.filter((p) => isSettlement(p) && p.id !== place.id);
  const lairs = w.places.filter((p) => p.kind === "lair");
  const out: Contract[] = [];
  // No two jobs alike on one board: different foes, different destinations.
  const usedFoes = new Set<string>();
  const usedTo = new Set<string>();
  for (let i = 0; i < count; i++) {
    const id = `${place.id}-${batch}-${i}`;
    const freeTo = others.filter((p) => !usedTo.has(p.id));
    if (rng() < 0.6 || !freeTo.length) {
      // Hunt: something troubling the settlement, out in the country nearby.
      const lair = lairs.length && rng() < 0.5 ? lairs[Math.floor(rng() * lairs.length)]! : null;
      const pool = ["wolves", "bandits", "vermin", "undead", "goblins"].filter((f) => !usedFoes.has(f));
      const fromLair = lair ? (FACTION_FOE[lair.ref ?? ""] ?? "bandits") : null;
      const foe = fromLair && !usedFoes.has(fromLair) ? fromLair : pool[Math.floor(rng() * pool.length)]!;
      usedFoes.add(foe);
      const a = rng() * Math.PI * 2;
      const r = 60 + rng() * 70;
      const at = { x: Math.max(20, Math.min(980, place.x + Math.cos(a) * r)), y: Math.max(20, Math.min(620, place.y + Math.sin(a) * r)) };
      out.push({
        id,
        from: place.id,
        kind: "hunt",
        title: `Drive off the ${(FOES[foe]?.name ?? foe).toLowerCase().replace(/^the /, "")} troubling ${place.name}`,
        foe,
        at,
        reward: Math.round((num("company.huntPay") + num("company.huntPayPerLevel") * level) * pay),
        days: 3,
      });
    } else {
      // Deliver: a parcel for another settlement, against the clock.
      const to = freeTo[Math.floor(rng() * freeTo.length)]!;
      usedTo.add(to.id);
      const hours = travelHours(w, place, to);
      out.push({
        id,
        from: place.id,
        kind: "deliver",
        title: `Carry a sealed parcel to ${to.name}`,
        to: to.id,
        reward: Math.round((num("company.deliverPay") + dist(place, to) * num("company.deliverPayPerUnit")) * pay),
        days: Math.max(1, Math.ceil((hours * 1.8) / 24)),
      });
    }
  }
  return out;
}

// --- Each day on the road -----------------------------------------------------------------

export interface Payday {
  /** Gold paid out. */
  paid: number;
  /** Heroes who went unpaid today. */
  unpaid: string[];
  /** Rations eaten, and whether the company went hungry. */
  eaten: number;
  hungry: boolean;
}

/** A day's wages and rations: pay whoever the purse covers (in roster order), feed whoever is marching. */
export function payday(purse: number, roster: { key: string; level: number }[], marching: number, provisions: number): Payday {
  let left = purse;
  const unpaid: string[] = [];
  for (const h of roster) {
    const wage = wageOf(h.level);
    if (left >= wage) left -= wage;
    else unpaid.push(h.key);
  }
  const eaten = Math.min(provisions, marching);
  return { paid: purse - left, unpaid, eaten, hungry: eaten < marching };
}
