import { MAX_TOWN_LOG, type Contract, type Town } from "../domain/town";
import { COMPONENTS } from "./crafting";
import { day, working } from "./town";
import { num } from "./tuning";

/**
 * Small, steady money and quick fixes: trading stores at the market, patrols
 * that pay a little less each time on the same day, and contracts posted on
 * the town's board.
 */

// --- The market -------------------------------------------------------------------------

export const GOODS = ["food", "materials", "iron", "herbs", "dust"] as const;
export type Good = (typeof GOODS)[number];

export const GOOD_INFO: Record<Good, { name: string; icon: string; lot: number }> = {
  food: { name: "Food", icon: "🍞", lot: 5 },
  materials: { name: "Materials", icon: "🪵", lot: 5 },
  iron: { name: COMPONENTS.iron.name, icon: COMPONENTS.iron.icon, lot: 1 },
  herbs: { name: COMPONENTS.herbs.name, icon: COMPONENTS.herbs.icon, lot: 1 },
  dust: { name: COMPONENTS.dust.name, icon: COMPONENTS.dust.icon, lot: 1 },
};

/** Gold to buy one unit. */
export function buyPrice(g: Good): number {
  if (g === "food") return num("price.food");
  if (g === "materials") return num("price.materials");
  return COMPONENTS[g].price;
}
/** Gold for selling one unit (the market takes its cut). */
export const sellPrice = (g: Good) => Math.max(0, Math.floor(buyPrice(g) * num("price.sellShare") * 100) / 100);

export const stock = (t: Town, g: Good) => (g === "food" || g === "materials" ? t[g] : t.components[g]);
const withStock = (t: Town, g: Good, n: number): Town => (g === "food" || g === "materials" ? { ...t, [g]: n } : { ...t, components: { ...t.components, [g]: n } });

/** Buy (n > 0) or sell (n < 0) units of a good at a staffed market. */
export function tradeAtMarket(t: Town, g: Good, n: number): Town {
  if (!working(t, "market")) throw new Error("Trading needs a staffed market");
  if (n === 0) return t;
  const have = stock(t, g);
  const name = GOOD_INFO[g].name.toLowerCase();
  if (n > 0) {
    const cost = Math.ceil(buyPrice(g) * n);
    if (t.gold < cost) throw new Error(`Needs ${cost} gold`);
    return { ...withStock(t, g, have + n), gold: t.gold - cost };
  }
  if (have < -n) throw new Error(`Only ${have} ${name} to sell`);
  const paid = Math.floor(sellPrice(g) * -n);
  return {
    ...withStock(t, g, have + n),
    gold: t.gold + paid,
    log: [...t.log, { at: t.hours, text: `Sold ${-n} ${name} at the market for ${paid} gold.`, tone: "info" as const }].slice(-MAX_TOWN_LOG),
  };
}

// --- Patrols ------------------------------------------------------------------------------

/** Patrols already ridden on the town's current game day. */
export const patrolsToday = (t: Town) => (t.patrols.day === day(t.hours) ? t.patrols.count : 0);

/** What the next patrol would pay: less each time the same day. */
export const patrolBounty = (t: Town, level: number) =>
  Math.max(1, Math.round(num("patrol.bounty") * (1 + num("patrol.perLevel") * (Math.max(1, level) - 1)) * num("patrol.decay") ** patrolsToday(t)));

export const notePatrol = (t: Town): Town => ({ ...t, patrols: { day: day(t.hours), count: patrolsToday(t) + 1 } });

// --- Contracts ------------------------------------------------------------------------

export interface ContractTemplate {
  foe: string;
  title: string;
  text: string;
  reward: Partial<Contract["reward"]>;
}

/** Jobs that turn up on the board. Rewards are for level 1 and grow with the heroes. */
export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  { foe: "wolves", title: "Wolves at the sheepfold", text: "A pack has been taking lambs at night. The shepherds will pay, and add a cut of mutton.", reward: { gold: 15, food: 6 } },
  { foe: "bandits", title: "Bandits on the timber road", text: "Carts of timber keep going missing. The woodcutters' guild wants the road clear.", reward: { gold: 15, materials: 8 } },
  { foe: "goblins", title: "Goblins in the old mill", text: "Goblins have moved into the ruined mill and raid the fields. The farmers have pooled their coin.", reward: { gold: 25 } },
  { foe: "undead", title: "Restless graves", text: "Something walks the churchyard after dark. The sexton offers what the poor box holds, and a pouch of grave dust.", reward: { gold: 15, dust: 1 } },
  { foe: "vermin", title: "Rats in the granary", text: "Rats the size of dogs are eating the town's grain. Clear them out before winter.", reward: { gold: 10, food: 8 } },
  { foe: "cultists", title: "Lights in the marsh", text: "Robed figures gather by the marsh at night. The herb-wives won't go out until they're gone, and will pay in herbs.", reward: { gold: 15, herbs: 3 } },
];

/** Most contracts on the board at once: one, plus one for a staffed market and one for a staffed tavern. */
export const boardSize = (t: Town) => 1 + (working(t, "market") ? 1 : 0) + (working(t, "tavern") ? 1 : 0);

/** At dawn: expired contracts come down, and maybe a new one goes up. */
export function contractsDay(t: Town, h: number, rng: () => number, level: number, say: (text: string, tone: "good" | "bad" | "info") => void): Town {
  let contracts = t.contracts.filter((c) => c.expiresAt > h);
  if (contracts.length < boardSize(t) && rng() < num("contract.chance")) {
    const used = new Set(contracts.map((c) => c.foe));
    const options = CONTRACT_TEMPLATES.filter((x) => !used.has(x.foe));
    const tpl = options[Math.floor(rng() * options.length)];
    if (tpl) {
      const grow = (1 + num("contract.perLevel") * (Math.max(1, level) - 1)) * num("contract.rewardMultiplier");
      const r = (k: keyof Contract["reward"]) => Math.round((tpl.reward[k] ?? 0) * grow);
      const c: Contract = {
        id: `c${h}-${Math.floor(rng() * 1e6)}`,
        title: tpl.title,
        text: tpl.text,
        foe: tpl.foe,
        reward: { gold: r("gold"), food: r("food"), materials: r("materials"), herbs: r("herbs"), dust: r("dust") },
        expiresAt: h + num("contract.days") * 24,
        seed: Math.floor(rng() * 2 ** 31),
      };
      contracts = [...contracts, c];
      say(`A new job on the board: ${c.title} (${rewardText(c.reward)}).`, "info");
    }
  }
  return contracts.length === t.contracts.length && contracts.every((c, i) => c === t.contracts[i]) ? t : { ...t, contracts };
}

export function rewardText(r: Contract["reward"]): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`${r.gold} gold`);
  if (r.food) parts.push(`${r.food} food`);
  if (r.materials) parts.push(`${r.materials} materials`);
  if (r.herbs) parts.push(`${r.herbs} ${COMPONENTS.herbs.name.toLowerCase()}`);
  if (r.dust) parts.push(`${r.dust} ${COMPONENTS.dust.name.toLowerCase()}`);
  return parts.join(", ") || "nothing";
}

/** The contract is done: pay out and take it off the board. */
export function completeContract(t: Town, id: string): Town {
  const c = t.contracts.find((x) => x.id === id);
  if (!c) return t;
  const r = c.reward;
  return {
    ...t,
    gold: t.gold + r.gold,
    food: t.food + r.food,
    materials: t.materials + r.materials,
    components: { ...t.components, herbs: t.components.herbs + r.herbs, dust: t.components.dust + r.dust },
    contracts: t.contracts.filter((x) => x.id !== id),
    log: [...t.log, { at: t.hours, text: `Finished the job "${c.title}": ${rewardText(r)}.`, tone: "good" as const }].slice(-MAX_TOWN_LOG),
  };
}
