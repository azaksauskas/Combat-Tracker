import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ADVENTURES } from "../content/adventures";
import { acknowledge, choose, finishFight, finishShortRest, startAdventure, StoryError, type Adventure, type CampaignState } from "./adventure";
import { equip, heroSetups, potionStash, unequip } from "./party";
import { SCENARIOS, encounterScenario, setupFor, type Scenario } from "./scenarios";
import type { UnitSetup } from "./engine";
import { mapScenario } from "./maps";
import { quitGame, startBattle, usePlay } from "./store";
import { chosenParty } from "./party-store";
import { useGame } from "../store/game";

/** The adventure in progress, auto-saved after every step. */
export const useCampaign = create<{ state: CampaignState | null }>()(
  persist(() => ({ state: null as CampaignState | null }), {
    name: "combat-tracker:campaign",
    storage: createJSONStorage(() => localStorage),
  }),
);

/** Built-in adventures first, then the DM's own from the library. */
export const allAdventures = (): Adventure[] => [...ADVENTURES, ...useGame.getState().library.adventures];
export const adventureOf = (s: CampaignState | null): Adventure | undefined => allAdventures().find((a) => a.id === s?.adventureId);

const set = (state: CampaignState | null) => useCampaign.setState({ state });
const current = () => useCampaign.getState().state;

export function beginAdventure(adv: Adventure) {
  quitGame();
  set(startAdventure(adv, undefined, chosenParty()));
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

/** A built-in scenario, "map:<id>" for one of the DM's maps, or "encounter:<id>" for a saved encounter. */
export function findScenario(id: string): (Scenario & { custom?: UnitSetup[] }) | undefined {
  if (id.startsWith("map:")) {
    const { maps, roster } = useGame.getState().library;
    const map = maps.find((m) => `map:${m.id}` === id);
    return map ? mapScenario(map, roster) : undefined;
  }
  if (id.startsWith("encounter:")) {
    const enc = useGame.getState().library.encounters.find((e) => `encounter:${e.id}` === id);
    return enc ? { ...encounterScenario(enc.name, enc.combatants), id } : undefined;
  }
  return SCENARIOS.find((x) => x.id === id);
}

/** Starts the pending fight on the battle screen with the adventure's party. */
export function goToBattle() {
  const s = current();
  const fight = s?.pending[0];
  if (!s || fight?.kind !== "fight") return;
  const sc = findScenario(fight.scenarioId);
  if (!sc) return toast.error(`This adventure's fight "${fight.scenarioId}" no longer exists`);
  const base = setupFor(sc, []);
  const starts = base.partyCells;
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
