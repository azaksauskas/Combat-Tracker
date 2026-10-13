import { toast } from "sonner";
import { create } from "zustand";
import { ADVENTURES } from "../content/adventures";
import { acknowledge, choose, finishFight, finishShortRest, startAdventure, StoryError, type Adventure, type CampaignState } from "./adventure";
import { equip, heroSetups, potionStash, unequip } from "./party";
import { SCENARIOS, encounterScenario, setupFor, type Scenario } from "./scenarios";
import type { UnitSetup } from "./engine";
import { mapScenario } from "./maps";
import { quitGame, startBattle, usePlay } from "./store";
import { chosenParty } from "./party-store";
import { chronicleFight, chronicleStep } from "./chronicle";
import { addChronicle, useActiveProfile } from "../store/players";
import { homecoming, noteLevel, packForAdventure, passTime } from "./town-store";
import { useGame } from "../store/game";

/** The adventure in progress. Saved to the active player's document after every step (see save-bind.ts). */
export const useCampaign = create<{ state: CampaignState | null }>()(() => ({ state: null as CampaignState | null }));

/** Built-in adventures first, then the DM's own from the library. */
export const allAdventures = (): Adventure[] => [...ADVENTURES, ...useGame.getState().library.adventures];
export const adventureOf = (s: CampaignState | null): Adventure | undefined => allAdventures().find((a) => a.id === s?.adventureId);

/** Every change to the adventure goes through here, and leaves a trail in the player's chronicle. */
function set(state: CampaignState | null) {
  const before = useCampaign.getState().state;
  useCampaign.setState({ state });
  const player = useActiveProfile.getState().id;
  const title = adventureOf(state ?? before)?.title ?? "an adventure";
  if (!player) return;
  addChronicle(player, chronicleStep(before, state, title));
  // Renown follows the best hero; the end of an adventure brings the party home.
  const best = (s: CampaignState | null) => Math.max(0, ...(s?.party.heroes.map((h) => h.level) ?? []));
  if (state && best(state) > best(before)) noteLevel(best(state));
  const ending = (state?.ended && !before?.ended) || (before && !before.ended && !state);
  if (ending) {
    const last = state ?? before!;
    const potions = Object.fromEntries(Object.entries(last.party.items).filter(([k, n]) => k.startsWith("potion") && n > 0));
    // The adventure's starting purse stays behind; what they earned comes home.
    const earned = Math.max(0, last.party.gold - (adventureOf(last)?.startingGold ?? 0));
    homecoming(title, earned, potions, state?.ended === "victory" ? (last.recruits ?? []) : [], best(last));
  }
}
const current = () => useCampaign.getState().state;

export function beginAdventure(adv: Adventure) {
  quitGame();
  const s = startAdventure(adv, undefined, chosenParty());
  // Potions brewed in town go along.
  const potions = packForAdventure();
  const items = { ...s.party.items };
  for (const [k, n] of Object.entries(potions)) items[k] = (items[k] ?? 0) + n;
  set({ ...s, party: { ...s.party, items } });
}

export function pickChoice(choiceId: string, heroKey?: string) {
  const s = current();
  const adv = adventureOf(s);
  if (!s || !adv) return;
  try {
    set(choose(s, adv, choiceId, heroKey));
    // Each choice takes about an hour; a night's camp takes eight more.
    const choice = adv.scenes[s.sceneId]?.choices.find((c) => c.id === choiceId);
    const sleeps = [choice?.success, choice?.failure].some((o) => o?.effects?.some((e) => e.type === "rest" && e.kind === "long"));
    passTime(sleeps ? 9 : 1);
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
  passTime(1);
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
  const player = useActiveProfile.getState().id;
  const battle = usePlay.getState().scenario?.name ?? "a battle";
  if (player) addChronicle(player, [chronicleFight(adv.title, battle, done.outcome ?? "defeat", retreat && !game.outcome, done.round)]);
  set(finishFight(s, adv, done));
  passTime(1);
  quitGame();
}

export const abandonAdventure = () => {
  quitGame();
  set(null);
};
