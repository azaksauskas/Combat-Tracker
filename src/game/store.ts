import { chosenParty } from "./party-store";
import { toast } from "sonner";
import { create } from "zustand";
import { nextAiCommand } from "./ai";
import type { Board } from "./board";
import { apply, canAct, createGame, currentUnit, type Command, type GameOptions } from "./engine";
import { describeEvents, type LogLine } from "./log";
import { randomSeed } from "./rng";
import { setupFor, type Scenario } from "./scenarios";
import { GameError, type GameEvent, type GameState } from "./state";
import type { UnitSetup } from "./engine";

/** Floating combat text (damage numbers etc.), shown briefly over tokens. */
export interface Fx {
  id: number;
  unitId: string;
  text: string;
  tone: "damage" | "heal" | "miss" | "crit";
}

interface PlayState {
  game: GameState | null;
  scenario: (Scenario & { custom?: UnitSetup[] }) | null;
  /** "campaign": the battle belongs to an adventure; "town": a raid or a lair attack for the player's town. */
  mode: "skirmish" | "campaign" | "town";
  /** For town battles: what's being fought for. */
  context?: { kind: "raid" | "lair"; faction: string; heroes?: string[] } | null;
  log: LogLine[];
  fx: Fx[];
  aiRunning: boolean;
}

const MAX_LOG = 300;
let fxId = 1;

/** The battle in progress. Saved to the active player's document (see save-bind.ts). */
export const usePlay = create<PlayState>()((): PlayState => ({ game: null, scenario: null, mode: "skirmish", log: [], fx: [], aiRunning: false }));

function record(events: GameEvent[], state: GameState) {
  const { log } = usePlay.getState();
  const startId = (log.at(-1)?.id ?? 0) + 1;
  const lines = describeEvents(events, state, startId);
  const fx: Fx[] = [];
  for (const e of events) {
    if (e.type === "damage") fx.push({ id: fxId++, unitId: e.targetId, text: `−${e.amount}`, tone: "damage" });
    if (e.type === "heal") fx.push({ id: fxId++, unitId: e.targetId, text: `+${e.amount}`, tone: "heal" });
    if (e.type === "attack" && !e.hit) fx.push({ id: fxId++, unitId: e.targetId, text: "miss", tone: "miss" });
    if (e.type === "attack" && e.crit) fx.push({ id: fxId++, unitId: e.targetId, text: "CRIT!", tone: "crit" });
    if (e.type === "save") fx.push({ id: fxId++, unitId: e.targetId, text: e.success ? "saved" : "failed", tone: e.success ? "miss" : "damage" });
  }
  usePlay.setState((p) => ({ game: state, log: [...p.log, ...lines].slice(-MAX_LOG), fx: [...p.fx, ...fx] }));
  if (fx.length) {
    const ids = new Set(fx.map((f) => f.id));
    setTimeout(() => usePlay.setState((p) => ({ fx: p.fx.filter((f) => !ids.has(f.id)) })), 1400);
  }
}

/** Whose turn needs the computer: enemies, until a hero can act or the battle ends. */
const aiShouldAct = (s: GameState | null) => {
  if (!s || s.outcome) return false;
  const u = currentUnit(s);
  // A dying hero waits for the player to roll their death save.
  return !!u && !(u.side === "party" && u.turn.needsDeathSave) && (u.side === "enemy" || !canAct(u));
};

const AI_STEP_MS = 550;

/** Plays monster turns one command at a time, so moves and hits can be followed. */
export function runAi() {
  if (usePlay.getState().aiRunning) return;
  const step = () => {
    const { game } = usePlay.getState();
    if (!aiShouldAct(game)) {
      usePlay.setState({ aiRunning: false });
      return;
    }
    try {
      const { state, events } = apply(game!, nextAiCommand(game!));
      record(events, state);
    } catch (err) {
      // Never let a bad AI decision freeze the game: end that creature's turn.
      console.error("AI command failed", err);
      const u = currentUnit(game!)!;
      const { state, events } = apply(game!, { type: "end-turn", unitId: u.id });
      record(events, state);
    }
    setTimeout(step, AI_STEP_MS);
  };
  usePlay.setState({ aiRunning: true });
  setTimeout(step, AI_STEP_MS);
}

export function startGame(scenario: Scenario & { custom?: UnitSetup[] }) {
  const { board, units } = setupFor(scenario, chosenParty());
  startBattle(scenario, board, units, {}, "skirmish");
}

/** Starts any battle: a skirmish, or a fight inside an adventure. */
export function startBattle(
  scenario: Scenario & { custom?: UnitSetup[] },
  board: Board,
  units: UnitSetup[],
  opts: GameOptions,
  mode: PlayState["mode"],
  context: PlayState["context"] = null,
) {
  const { state, events } = createGame(board, units, randomSeed(), opts);
  usePlay.setState({ scenario, mode, context, log: [], fx: [], aiRunning: false });
  record(events, state);
  runAi();
}

/** Player command. Returns an error message instead of throwing. */
export function dispatch(cmd: Command): string | null {
  const { game, aiRunning } = usePlay.getState();
  if (!game || aiRunning) return "Wait for the monsters to finish";
  try {
    const { state, events } = apply(game, cmd);
    record(events, state);
    runAi();
    return null;
  } catch (err) {
    if (err instanceof GameError) {
      toast.error(err.message);
      return err.message;
    }
    throw err;
  }
}

export function quitGame() {
  usePlay.setState({ game: null, scenario: null, mode: "skirmish", context: null, log: [], fx: [], aiRunning: false });
}
