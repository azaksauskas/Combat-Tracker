import { MAX_TOWN_LOG, levelOf, type BuildingType, type Town } from "../domain/town";
import { TRADE_FOR, assignments, built, pace } from "./town";

/**
 * Short goals that point the way: a few at a time, each with a reward.
 * They go in order, from the first farm to a famous town, so a new player
 * always has something to aim for.
 */

export interface Reward {
  gold?: number;
  materials?: number;
  food?: number;
  iron?: number;
  herbs?: number;
  dust?: number;
  potions?: number;
}

export interface Goal {
  id: string;
  icon: string;
  text: string;
  target: number;
  progress: (t: Town, renown: number) => number;
  reward: Reward;
}

const count = (type: BuildingType) => (t: Town) => built(t).filter((b) => b.type === type).length;
const stat = (key: string) => (t: Town) => t.stats[key] ?? 0;
const bestLevel = (type?: BuildingType) => (t: Town) => Math.max(0, ...built(t).filter((b) => !type || b.type === type).map((b) => levelOf(b)));
/** Workplaces run by someone of the right trade. */
const rightTrade = (t: Town) => {
  const who = assignments(t);
  return built(t).filter((b) => TRADE_FOR[b.type] && pace(t, b.id, who) >= 1).length;
};
const allRight = (t: Town) => {
  const jobs = built(t).filter((b) => TRADE_FOR[b.type]);
  return jobs.length >= 2 && rightTrade(t) === jobs.length ? 1 : 0;
};

export const GOALS: Goal[] = [
  { id: "farm", icon: "🌾", text: "Build a farm", target: 1, progress: count("farm"), reward: { gold: 10 } },
  { id: "settlers-2", icon: "🧑‍🌾", text: "Two settlers live in town", target: 2, progress: (t) => t.settlers.length, reward: { materials: 10 } },
  { id: "lumber", icon: "🪓", text: "Build a lumber camp", target: 1, progress: count("lumber"), reward: { gold: 10 } },
  { id: "patrol", icon: "⚔", text: "Ride out on a patrol and win", target: 1, progress: stat("patrols"), reward: { potions: 1 } },
  { id: "upgrade", icon: "⬆", text: "Upgrade any building to level 2", target: 2, progress: bestLevel(), reward: { gold: 15 } },
  { id: "house", icon: "🏠", text: "Build a house", target: 1, progress: count("house"), reward: { materials: 15 } },
  { id: "trades", icon: "★", text: "Every workplace run by the right trade", target: 1, progress: allRight, reward: { gold: 20 } },
  { id: "food-30", icon: "🍞", text: "Store 30 food", target: 30, progress: (t) => t.food, reward: { gold: 15 } },
  { id: "market", icon: "⚖", text: "Build a market", target: 1, progress: count("market"), reward: { gold: 15 } },
  { id: "contract", icon: "📜", text: "Finish a job from the board", target: 1, progress: stat("contracts"), reward: { gold: 20 } },
  { id: "hall-2", icon: "🏛", text: "Upgrade the town hall (more plots)", target: 2, progress: bestLevel("hall"), reward: { materials: 25 } },
  { id: "settlers-6", icon: "👥", text: "Six settlers live in town", target: 6, progress: (t) => t.settlers.length, reward: { gold: 25 } },
  { id: "tavern", icon: "🍺", text: "Build a tavern", target: 1, progress: count("tavern"), reward: { gold: 20 } },
  { id: "watch", icon: "🗼", text: "Build a watchtower", target: 1, progress: count("watchtower"), reward: { iron: 2 } },
  { id: "raid", icon: "🛡", text: "Drive off a raid", target: 1, progress: stat("raidsRepelled"), reward: { gold: 30 } },
  { id: "brew", icon: "🧪", text: "Brew 3 potions", target: 3, progress: stat("brews"), reward: { herbs: 4 } },
  { id: "smithy", icon: "⚒", text: "Build a smithy", target: 1, progress: count("smithy"), reward: { iron: 3 } },
  { id: "renown-2", icon: "⭐", text: "Heroes known in the valley (renown 2)", target: 2, progress: (_t, r) => r, reward: { gold: 40 } },
  { id: "level-3", icon: "⏫", text: "A building at level 3", target: 3, progress: bestLevel(), reward: { gold: 40, materials: 20 } },
  { id: "patrols-10", icon: "🐎", text: "Win 10 patrols", target: 10, progress: stat("patrols"), reward: { dust: 2 } },
  { id: "settlers-12", icon: "🏘", text: "Twelve settlers live in town", target: 12, progress: (t) => t.settlers.length, reward: { gold: 60 } },
  { id: "renown-3", icon: "🌟", text: "Heroes known across the region (renown 3)", target: 3, progress: (_t, r) => r, reward: { gold: 80 } },
  { id: "contracts-5", icon: "📜", text: "Finish 5 jobs from the board", target: 5, progress: stat("contracts"), reward: { dust: 3 } },
  { id: "level-5", icon: "👑", text: "A building at level 5", target: 5, progress: bestLevel(), reward: { gold: 150 } },
];

export const SHOWN_GOALS = 3;

/** The next few goals not yet rewarded, with how far along they are. */
export function currentGoals(t: Town, renown: number) {
  return GOALS.filter((g) => !t.goals.includes(g.id))
    .slice(0, SHOWN_GOALS)
    .map((g) => {
      const now = Math.min(g.target, g.progress(t, renown));
      return { goal: g, now, done: now >= g.target };
    });
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`🪙 ${r.gold}`);
  if (r.materials) parts.push(`🪵 ${r.materials}`);
  if (r.food) parts.push(`🍞 ${r.food}`);
  if (r.iron) parts.push(`⛓ ${r.iron}`);
  if (r.herbs) parts.push(`🌿 ${r.herbs}`);
  if (r.dust) parts.push(`✨ ${r.dust}`);
  if (r.potions) parts.push(`🧪 ${r.potions}`);
  return parts.join(" ");
}

/** Takes the reward of a finished goal. */
export function claimGoal(t: Town, id: string, renown: number): Town {
  const g = GOALS.find((x) => x.id === id);
  if (!g || t.goals.includes(id)) return t;
  if (g.progress(t, renown) < g.target) throw new Error("Not done yet");
  const r = g.reward;
  return {
    ...t,
    gold: t.gold + (r.gold ?? 0),
    materials: t.materials + (r.materials ?? 0),
    food: t.food + (r.food ?? 0),
    components: { iron: t.components.iron + (r.iron ?? 0), herbs: t.components.herbs + (r.herbs ?? 0), dust: t.components.dust + (r.dust ?? 0) },
    stash: r.potions ? { ...t.stash, "potion-healing": (t.stash["potion-healing"] ?? 0) + r.potions } : t.stash,
    goals: [...t.goals, id],
    log: [...t.log, { at: t.hours, text: `Goal reached: ${g.text}. Reward: ${rewardText(r)}.`, tone: "good" as const }].slice(-MAX_TOWN_LOG),
  };
}

