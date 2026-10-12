import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ADVENTURES } from "../content/adventures";
import { acknowledge, choose, finishFight, finishShortRest, startAdventure, StoryError, type Adventure, type CampaignState } from "./adventure";
import { equip, heroSetups, potionStash, unequip } from "./party";
import { SCENARIOS, scenarioSetup } from "./scenarios";
import { quitGame, startBattle, usePlay } from "./store";

/** The adventure in progress, auto-saved after every step. */
export const useCampaign = create<{ state: CampaignState | null }>()(
  persist(() => ({ state: null as CampaignState | null }), {
    name: "combat-tracker:campaign",
    storage: createJSONStorage(() => localStorage),
  }),
);

export const adventureOf = (s: CampaignState | null): Adventure | undefined => ADVENTURES.find((a) => a.id === s?.adventureId);

const set = (state: CampaignState | null) => useCampaign.setState({ state });
const current = () => useCampaign.getState().state;

export function beginAdventure(adv: Adventure) {
  quitGame();
  set(startAdventure(adv));
}

export function pickChoice(choiceId: string, heroKey?: string) {
  const s = current();
  const adv = adventureOf(s);
  if (!s || !adv) return;
  try {
    set(choose(s, adv, choiceId, heroKey));
  } catch (err) {
    if (err instanceof StoryError) toast.error(err.message);
    else throw err;
  }
}

export const dismissLevelUp = () => {
  const s = current();
  if (s) set(acknowledge(s));
};

export const completeShortRest = (spend: Record<string, number>) => {
  const s = current();
  if (s) set(finishShortRest(s, spend));
};

export const equipItem = (heroKey: string, itemId: string) => {
  const s = current();
  if (s) set({ ...s, party: equip(s.party, heroKey, itemId) });
};

export const unequipItem = (heroKey: string, itemId: string) => {
  const s = current();
  if (s) set({ ...s, party: unequip(s.party, heroKey, itemId) });
};

/** Starts the pending fight on the battle screen with the adventure's party. */
export function goToBattle() {
  const s = current();
  const fight = s?.pending[0];
  if (!s || fight?.kind !== "fight") return;
  const sc = SCENARIOS.find((x) => x.id === fight.scenarioId);
  if (!sc) return;
  const base = scenarioSetup(sc);
  const starts = base.units.filter((u) => u.side === "party").map((u) => u.pos);
  const units = [...heroSetups(s.party, starts), ...base.units.filter((u) => u.side === "enemy")];
  startBattle(sc, base.board, units, { surprised: fight.surprised, stash: potionStash(s.party) }, "campaign");
}

/** Returns from a finished (or abandoned) battle to the story. */
export function returnFromBattle(retreat = false) {
  const s = current();
  const adv = adventureOf(s);
  const game = usePlay.getState().game;
  if (!s || !adv || !game) return;
  const done = retreat && !game.outcome ? { ...game, outcome: "defeat" as const } : game;
  set(finishFight(s, adv, done));
  quitGame();
}

export const abandonAdventure = () => {
  quitGame();
  set(null);
};
