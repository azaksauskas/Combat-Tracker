import { toast } from "sonner";
import { newId } from "../domain/combat";
import type { PlayerDoc } from "../domain/players";
import { ARMORS, WEAPONS, loadoutProblem, startingKit, type Loadout } from "./arsenal";
import { ALL_UNLOCKS, DELVE, STARTING_UNLOCKS, isKit, isMagic, levelSetup } from "./delve";
import { POTIONS, THROWABLES } from "./engine";
import { XP_FOR_LEVEL } from "./party";
import { carrying, chosenParty, heroAsNow, magicOn } from "./party-store";
import { quitGame, startBattle, usePlay } from "./store";
import { awardXp } from "./town-store";
import { MAGIC_ITEMS, cantEquip } from "./treasure";
import { addChronicle, updatePlayer, useActiveProfile, usePlayers } from "../store/players";

/** The delve's progress and the quartermaster: start a level, take home what was found, kit out the heroes. */

type Delve = PlayerDoc["delve"];

const me = () => useActiveProfile.getState().id;
export const delveOf = (doc: PlayerDoc | undefined): Delve => doc?.delve ?? { cleared: [], gold: 0, stash: {}, unlocked: [], tester: false };

/** While the delve is being tried out, every level is open to everybody. Set to false to make them unlock in order again. */
export const ALL_LEVELS_OPEN = true;

/** A level can be entered once the one before it is cleared. */
export const levelOpen = (d: Delve, n: number) => ALL_LEVELS_OPEN || d.tester || n === 1 || d.cleared.includes(n - 1);

/** What the quartermaster has: the basics, everything unlocked so far (all of it with the test kit). */
export const unlockedOf = (d: Delve) => new Set([...STARTING_UNLOCKS, ...d.unlocked, ...(d.tester ? ALL_UNLOCKS : [])]);

/** Consumables for sale, by price. */
export const SUPPLIES: { id: string; price: number; count?: number }[] = [
  { id: "potion-healing", price: 25 },
  { id: "potion-greater-healing", price: 100 },
  { id: "alchemists-fire", price: 25 },
  { id: "holy-water", price: 25 },
  { id: "javelin", price: 5, count: 3 },
];
export const supplyName = (id: string) => POTIONS[id]?.name ?? THROWABLES[id]?.name ?? id;

function change(f: (d: Delve, doc: PlayerDoc) => Delve | null, extra?: (doc: PlayerDoc) => Partial<PlayerDoc>) {
  const id = me();
  if (!id) return;
  updatePlayer(id, (doc) => {
    const next = f(delveOf(doc), doc);
    return next ? { ...doc, delve: next, ...extra?.(doc) } : doc;
  });
}

export function startDelveLevel(n: number) {
  const id = me();
  const doc = id ? usePlayers.getState().docs[id] : undefined;
  const level = DELVE[n - 1];
  const d = delveOf(doc);
  if (!level || !levelOpen(d, n)) return void toast.error("Clear the level before it first");
  const party = chosenParty();
  if (!party.length) return void toast.error("No one is fit to go down");
  const { scenario, board, units, objects, objective } = levelSetup(level, party);
  startBattle(scenario, board, units, { objects, objective, stash: d.stash, fog: true }, "delve", { kind: "delve", level: n, heroes: party.map((e) => e.key) });
}

/** Back from a level: the packs as they are now; on a win, the gold, the finds and the next level. */
export function finishDelve() {
  const id = me();
  const { game, context } = usePlay.getState();
  const level = DELVE[(context?.level ?? 0) - 1];
  if (!id || !game || !level) return quitGame();
  const won = game.outcome === "victory" && !game.fled;
  const haul = game.haul ?? { gold: 0, items: [] };
  const gold = won ? haul.gold + level.reward : 0;
  const finds = won ? [...level.unlocks, ...haul.items] : [];
  updatePlayer(id, (doc) => {
    const d = delveOf(doc);
    const owned = new Set(doc.treasure.map((t) => t.id));
    const magic = finds.filter((x) => isMagic(x) && !owned.has(x));
    return {
      ...doc,
      delve: {
        ...d,
        stash: Object.fromEntries(Object.entries(game.stash ?? {}).filter(([, k]) => k > 0)),
        gold: d.gold + gold,
        cleared: won && !d.cleared.includes(level.n) ? [...d.cleared, level.n] : d.cleared,
        unlocked: [...new Set([...d.unlocked, ...finds])],
      },
      treasure: [...doc.treasure, ...magic.map((m) => ({ uid: newId(), id: m }))],
    };
  });
  if (won) {
    awardXp(id, game, context?.heroes ?? [], undefined);
    const news = finds.filter((x) => isKit(x) || isMagic(x));
    toast.success(`${level.name} cleared: +${gold} gold${news.length ? ` · new gear at the quartermaster` : ""}`);
    addChronicle(id, [{ kind: "fight", text: `Cleared the delve's level ${level.n}, ${level.name}.` }]);
  }
  quitGame();
}

export function buySupply(itemId: string) {
  const s = SUPPLIES.find((x) => x.id === itemId);
  if (!s) return;
  change((d) => {
    if (d.gold < s.price) {
      toast.error("Not enough gold");
      return null;
    }
    return { ...d, gold: d.gold - s.price, stash: { ...d.stash, [itemId]: (d.stash[itemId] ?? 0) + (s.count ?? 1) } };
  });
}

/** For trying things out: gold, full packs, every level open, every item unlocked, heroes at level 3. */
export function takeTestKit() {
  const heroes = chosenParty().map((e) => e.key);
  change(
    (d) => ({
      ...d,
      tester: true,
      gold: d.gold + 1000,
      stash: Object.fromEntries(SUPPLIES.map((s) => [s.id, Math.max(d.stash[s.id] ?? 0, s.id === "javelin" ? 9 : 5)])),
    }),
    (doc) => {
      const owned = new Set(doc.treasure.map((t) => t.id));
      const magic = ALL_UNLOCKS.filter((x) => isMagic(x) && !owned.has(x));
      const progress = { ...doc.progress };
      for (const k of heroes) {
        const was = progress[k] ?? { level: 1, xp: 0 };
        if (was.level < 3) progress[k] = { level: 3, xp: Math.max(was.xp, XP_FOR_LEVEL[3]!) };
      }
      return { treasure: [...doc.treasure, ...magic.map((m) => ({ uid: newId(), id: m }))], progress };
    },
  );
  toast.success("Test kit: 1000 gold, full packs, every level open, all gear unlocked, heroes at level 3");
}

/** A hero's weapons and armour as they are now. */
export const loadoutOf = (doc: PlayerDoc | undefined, key: string, className: string | null | undefined): Loadout => doc?.loadouts[key] ?? startingKit(className);

/** Changes one slot of a hero's kit (from what the quartermaster has). Returns a problem instead of saving. */
export function equip(key: string, slot: keyof Loadout, itemId: string | undefined): string | null {
  const id = me();
  const doc = id ? usePlayers.getState().docs[id] : undefined;
  const hero = heroAsNow(key)?.build();
  if (!id || !doc || !hero?.stats) return "No such hero";
  const now = loadoutOf(doc, key, hero.stats.className);
  if (itemId && !unlockedOf(delveOf(doc)).has(itemId) && !Object.values(now).includes(itemId)) return "The quartermaster doesn't have that yet";
  const next: Loadout = { ...now, [slot]: itemId };
  if (!itemId) delete next[slot];
  // A two-handed weapon leaves no hand for the shield or a second weapon.
  if (slot === "main" && itemId && WEAPONS[itemId]?.props.includes("two-handed")) delete next.off;
  const problem = loadoutProblem(hero.stats, next);
  if (problem) {
    toast.error(problem);
    return problem;
  }
  updatePlayer(id, (d) => ({ ...d, loadouts: { ...d.loadouts, [key]: next } }));
  return null;
}

/** Gives a magic item from the treasury to a hero, or takes it back (`to` undefined). */
export function handMagic(uid: string, to: string | undefined): string | null {
  const id = me();
  const doc = id ? usePlayers.getState().docs[id] : undefined;
  const t = doc?.treasure.find((x) => x.uid === uid);
  const def = t && MAGIC_ITEMS[t.id];
  if (!id || !doc || !t || !def) return "No such item";
  if (to) {
    const hero = heroAsNow(to)?.build();
    const problem = cantEquip(def, magicOn(doc, to), carrying(hero?.stats?.className, doc.loadouts[to]));
    if (problem) {
      toast.error(problem);
      return problem;
    }
  }
  updatePlayer(id, (d) => ({ ...d, treasure: d.treasure.map((x) => (x.uid === uid ? { uid: x.uid, id: x.id, ...(to ? { on: to } : {}) } : x)) }));
  return null;
}

/** Weapons and armour the quartermaster has for this hero, grouped for a picker. */
export function kitChoices(d: Delve) {
  const have = unlockedOf(d);
  return {
    weapons: Object.values(WEAPONS).filter((w) => have.has(w.id)),
    armors: Object.values(ARMORS).filter((a) => a.kind !== "shield" && have.has(a.id)),
    shield: have.has("shield"),
  };
}
