import { characterOf } from "./settlement";
import { MAGIC_ITEMS, recipes, type Recipe } from "./treasure";
import { num } from "./tuning";
import type { Place } from "./world";

/**
 * Orders at the smiths and mages of other settlements (Battle Brothers
 * style): the better the workshop, the finer what it makes, and the longer
 * it takes. The work goes on while the company is on the road; the order is
 * collected where it was placed. An old piece can be traded in toward a
 * better one of the same kind.
 */

/** An order in the making. */
export interface Order {
  id: string;
  /** The settlement making it. */
  place: string;
  /** The magic item (see treasure.ts). */
  item: string;
  /** World hour it's ready. */
  ready: number;
  /** The hero the traded-in piece was on: the new one goes to them. */
  on?: string;
}

/** How good a settlement's workshops are (the levels of treasure.ts recipes they can make). */
export function workshopOf(place: Place): { smith: number; tower: number } {
  if (place.kind !== "town" && place.kind !== "city") return { smith: 0, tower: 0 };
  const own = characterOf(place).building;
  const smith = own === "forge" ? 5 : place.kind === "city" ? 3 : 2;
  const tower = own === "college" ? 3 : own === "temple" && place.kind === "city" ? 1 : 0;
  return { smith, tower };
}

/** What can be ordered here, at the settlement's prices and pace. */
export function ordersAt(place: Place): (Recipe & { wait: number; price: number })[] {
  const { smith, tower } = workshopOf(place);
  return recipes()
    .filter((r) => (r.at === "smithy" ? r.level <= smith : r.level <= tower))
    .map((r) => ({ ...r, price: Math.round(r.gold * num("craft.orderPrice")), wait: Math.round(r.hours * num("craft.orderWait")) }));
}

/** The slot and strength of a "+N" item, if it is one. */
const plusOf = (id: string) => {
  const m = /^(weapon|armor|shield)-plus-(\d)$/.exec(id);
  return m ? { slot: m[1]!, n: Number(m[2]) } : null;
};

/**
 * The best piece to trade in toward an item: a weaker "+N" of the same kind.
 * Returns its uid and the credit it brings.
 */
export function tradeInFor(item: string, treasure: { uid: string; id: string; on?: string }[]): { uid: string; credit: number; on?: string; name: string } | null {
  const want = plusOf(item);
  if (!want) return null;
  const old = treasure
    .map((t) => ({ t, p: plusOf(t.id) }))
    .filter((x) => x.p && x.p.slot === want.slot && x.p.n < want.n)
    .sort((a, b) => b.p!.n - a.p!.n)[0];
  if (!old) return null;
  const def = MAGIC_ITEMS[old.t.id]!;
  return { uid: old.t.uid, credit: Math.round(num(`treasure.value.${def.rarity}`) * num("craft.tradeIn")), on: old.t.on, name: def.name };
}
