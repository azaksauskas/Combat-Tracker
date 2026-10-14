import type { CampaignState } from "./adventure";
import { useCampaign } from "./campaign-store";
import type { LogLine } from "./log";
import type { Scenario } from "./scenarios";
import type { GameState } from "./state";
import type { UnitSetup } from "./engine";
import { runAi, usePlay, type TownBattleContext } from "./store";
import { CLIENT_ID, updatePlayer, useActiveProfile, usePlayers } from "../store/players";

/**
 * Keeps the game's in-memory stores (the battle and the adventure) in step
 * with the active player's synced document: loads them when a player is
 * picked or another device saves, and writes them back shortly after every
 * change. Imported once, by the Play page.
 */

interface SavedBattle {
  game: GameState;
  scenario: (Scenario & { custom?: UnitSetup[] }) | null;
  mode: "skirmish" | "campaign" | "town";
  context?: TownBattleContext | null;
  log: LogLine[];
}

let boundTo: string | null = null;
let lastRev = -1;
let hydrating = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function hydrate(id: string) {
  const doc = usePlayers.getState().docs[id];
  if (!doc) return;
  hydrating = true;
  const battle = doc.battle as SavedBattle | null;
  usePlay.setState({
    game: battle?.game ?? null,
    scenario: battle?.scenario ?? null,
    mode: battle?.mode ?? "skirmish",
    context: battle?.context ?? null,
    log: battle?.log ?? [],
    fx: [],
    aiRunning: false,
  });
  useCampaign.setState({ state: (doc.campaign as CampaignState | null) ?? null });
  hydrating = false;
  lastRev = doc.rev;
  // A reload during the monsters' turn picks up where it left off.
  if (battle?.game) runAi();
}

function follow() {
  const id = useActiveProfile.getState().id;
  const doc = id ? usePlayers.getState().docs[id] : undefined;
  if (id !== boundTo) {
    flush();
    boundTo = null;
    if (!id) {
      hydrating = true;
      usePlay.setState({ game: null, scenario: null, log: [], fx: [], aiRunning: false });
      useCampaign.setState({ state: null });
      hydrating = false;
      return;
    }
    if (!doc) return; // wait for it to arrive
    boundTo = id;
    hydrate(id);
    return;
  }
  // Another page or device saved this player's game: take its version.
  if (id && doc && doc.rev !== lastRev) {
    if (doc.savedBy !== CLIENT_ID) hydrate(id);
    else lastRev = doc.rev;
  }
}

function save() {
  timer = null;
  const id = boundTo;
  if (!id) return;
  const { game, scenario, mode, context, log } = usePlay.getState();
  const campaign = useCampaign.getState().state;
  updatePlayer(id, (d) => ({ ...d, campaign, battle: game ? { game, scenario, mode, context: context ?? null, log } : null }));
  lastRev = usePlayers.getState().docs[id]?.rev ?? lastRev;
}

function schedule() {
  if (hydrating || !boundTo) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 600);
}

/** Saves right away if a save is waiting (switching player, closing the page). */
export function flush() {
  if (!timer) return;
  clearTimeout(timer);
  save();
}

let started = false;
export function bindSaves() {
  if (started) return;
  started = true;
  useActiveProfile.subscribe(follow);
  usePlayers.subscribe(follow);
  usePlay.subscribe((s, prev) => {
    if (s.game !== prev.game || s.scenario !== prev.scenario || s.mode !== prev.mode) schedule();
  });
  useCampaign.subscribe((s, prev) => {
    if (s.state !== prev.state) schedule();
  });
  window.addEventListener("pagehide", flush);
  follow();
  // Dev-only handle for automated browser tests.
  if (import.meta.env.DEV)
    Object.assign(window, {
      __game: {
        battle: () => usePlay.getState().game,
        campaign: () => useCampaign.getState().state,
        setBattle: (game: GameState) => usePlay.setState({ game }),
      },
    });
}
