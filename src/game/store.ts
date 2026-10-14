import { chosenParty } from "./party-store";
import { toast } from "sonner";
import { create } from "zustand";
import { nextAiCommand } from "./ai";
import type { Board, Cell } from "./board";
import { apply, canAct, createGame, currentUnit, type Command, type GameOptions } from "./engine";
import { describeEvents, type LogLine } from "./log";
import { randomSeed } from "./rng";
import { objectiveOf, setupFor, type Scenario } from "./scenarios";
import { GameError, type GameEvent, type GameState } from "./state";
import type { UnitSetup } from "./engine";

/** Short-lived effects on the board: floating text, shots, lunges, hits, bursts. */
export type Fx =
  | { id: number; kind: "text"; unitId: string; text: string; tone: "damage" | "heal" | "miss" | "crit" }
  /** Something flies from one square to another: an arrow, a bolt of magic. */
  | { id: number; kind: "shot"; from: Cell; to: Cell; tone: ShotTone }
  /** A melee attacker lunges towards its target. */
  | { id: number; kind: "lunge"; unitId: string; to: Cell }
  /** A creature is struck: it flashes and shakes. */
  | { id: number; kind: "hit"; unitId: string; crit: boolean }
  /** A flash on a square: a spell going off, healing light. */
  | { id: number; kind: "burst"; at: Cell; tone: ShotTone }
  /** A creature falls. */
  | { id: number; kind: "fall"; unitId: string };
export type ShotTone = "arrow" | "magic" | "fire" | "cold" | "radiant" | "heal";

/** Who did what in this battle, for the summary at the end. */
export interface Tally {
  dealt: number;
  taken: number;
  healed: number;
  downed: number;
}

/** What a town battle is for: defending against a raid, a lair, a patrol, or a job from the board. */
export interface TownBattleContext {
  kind: "raid" | "lair" | "patrol" | "contract" | "reclaim";
  /** Raids and lairs. */
  faction?: string;
  /** Contracts. */
  contract?: string;
  /** Taking the town back from a guild. */
  guild?: string;
  /** Hero keys, in the order of the party's units (p0, p1, …). */
  heroes?: string[];
}

interface PlayState {
  game: GameState | null;
  scenario: (Scenario & { custom?: UnitSetup[] }) | null;
  /** "campaign": the battle belongs to an adventure; "town": a fight for the player's town (raid, lair, patrol, contract). */
  mode: "skirmish" | "campaign" | "town";
  /** For town battles: what's being fought for. */
  context?: TownBattleContext | null;
  log: LogLine[];
  fx: Fx[];
  /** The squares each creature last moved through, for animating the walk. */
  paths: Record<string, Cell[]>;
  tally: Record<string, Tally>;
  aiRunning: boolean;
}

const MAX_LOG = 300;
let fxId = 1;

/** The battle in progress. Saved to the active player's document (see save-bind.ts). */
export const usePlay = create<PlayState>()((): PlayState => ({ game: null, scenario: null, mode: "skirmish", log: [], fx: [], paths: {}, tally: {}, aiRunning: false }));

const FX_MS = 1400;
const DAMAGE_TONE: Record<string, ShotTone> = { fire: "fire", cold: "cold", radiant: "radiant", force: "magic", lightning: "magic", necrotic: "magic", poison: "magic", acid: "magic", thunder: "magic", psychic: "magic" };

/** What an attack looks like: a shot for ranged and spells, a lunge for melee. */
function shotTone(state: GameState, attackerId: string, action: string): ShotTone | null {
  const a = state.units.find((u) => u.id === attackerId);
  const act = a?.stats.actions.find((x) => x.name === action);
  if (!act) return null;
  const spell = !!act.slot || !!act.cantrip;
  const type = "damage" in act ? act.damage?.[0]?.type : undefined;
  if (spell) return (type && DAMAGE_TONE[type]) ?? "magic";
  if (act.kind === "attack" && act.attackType === "ranged") return "arrow";
  return null;
}

function record(events: GameEvent[], state: GameState, before?: GameState | null) {
  const { log } = usePlay.getState();
  const startId = (log.at(-1)?.id ?? 0) + 1;
  const lines = describeEvents(events, state, startId);
  const fx: Fx[] = [];
  const paths: Record<string, Cell[]> = {};
  const tally = { ...usePlay.getState().tally };
  const add = (id: string, k: keyof Tally, n: number) => {
    const t = tally[id] ?? { dealt: 0, taken: 0, healed: 0, downed: 0 };
    tally[id] = { ...t, [k]: t[k] + n };
  };
  const pos = (id: string) => state.units.find((u) => u.id === id)?.pos;
  // Damage belongs to the last attacker, or else to whoever's turn it was (spells, traps of their making).
  let source = before ? currentUnit(before)?.id : undefined;
  let lastCrit = false;
  for (const e of events) {
    if (e.type === "move") {
      const from = before?.units.find((u) => u.id === e.unitId)?.pos;
      paths[e.unitId] = from ? [from, ...e.path] : e.path;
    }
    if (e.type === "attack") {
      source = e.attackerId;
      lastCrit = e.crit;
      const from = pos(e.attackerId);
      const to = pos(e.targetId);
      const tone = shotTone(state, e.attackerId, e.action);
      if (from && to) fx.push(tone ? { id: fxId++, kind: "shot", from, to, tone } : { id: fxId++, kind: "lunge", unitId: e.attackerId, to });
      if (!e.hit) fx.push({ id: fxId++, kind: "text", unitId: e.targetId, text: "MISS", tone: "miss" });
      if (e.crit) fx.push({ id: fxId++, kind: "text", unitId: e.targetId, text: "CRIT!", tone: "crit" });
    }
    if (e.type === "save") {
      const at = pos(e.targetId);
      if (at) fx.push({ id: fxId++, kind: "burst", at, tone: "magic" });
      fx.push({ id: fxId++, kind: "text", unitId: e.targetId, text: e.success ? "saved" : "failed", tone: e.success ? "miss" : "damage" });
    }
    if (e.type === "damage") {
      fx.push({ id: fxId++, kind: "text", unitId: e.targetId, text: `−${e.amount}`, tone: "damage" });
      fx.push({ id: fxId++, kind: "hit", unitId: e.targetId, crit: lastCrit });
      add(e.targetId, "taken", e.amount);
      if (source && source !== e.targetId) add(source, "dealt", e.amount);
    }
    if (e.type === "heal") {
      fx.push({ id: fxId++, kind: "text", unitId: e.targetId, text: `+${e.amount}`, tone: "heal" });
      const at = pos(e.targetId);
      if (at) fx.push({ id: fxId++, kind: "burst", at, tone: "heal" });
      if (source) add(source, "healed", e.amount);
    }
    if (e.type === "down" || e.type === "dead") {
      fx.push({ id: fxId++, kind: "fall", unitId: e.unitId });
      if (source && source !== e.unitId && e.type === "down") add(source, "downed", 1);
      if (source && source !== e.unitId && e.type === "dead" && !before?.units.find((u) => u.id === e.unitId && u.hp <= 0)) add(source, "downed", 1);
    }
  }
  usePlay.setState((p) => ({ game: state, log: [...p.log, ...lines].slice(-MAX_LOG), fx: [...p.fx, ...fx], paths: { ...p.paths, ...paths }, tally }));
  if (fx.length) {
    const ids = new Set(fx.map((f) => f.id));
    setTimeout(() => usePlay.setState((p) => ({ fx: p.fx.filter((f) => !ids.has(f.id)) })), FX_MS);
  }
}

/** Whose turn needs the computer: enemies, until a hero can act or the battle ends. */
const aiShouldAct = (s: GameState | null) => {
  if (!s || s.outcome) return false;
  const u = currentUnit(s);
  // A dying hero waits for the player to roll their death save.
  return !!u && !(u.side === "party" && u.turn.needsDeathSave) && (u.side === "enemy" || !canAct(u));
};

/** Time between monster commands: long enough to see each move and blow land. */
const AI_STEP_MS = 750;

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
      record(events, state, game);
    } catch (err) {
      // Never let a bad AI decision freeze the game: end that creature's turn.
      console.error("AI command failed", err);
      const u = currentUnit(game!)!;
      const { state, events } = apply(game!, { type: "end-turn", unitId: u.id });
      record(events, state, game);
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
  const { state, events } = createGame(board, units, randomSeed(), { objective: objectiveOf(scenario), ...opts });
  usePlay.setState({ scenario, mode, context, log: [], fx: [], paths: {}, tally: {}, aiRunning: false });
  record(events, state);
  runAi();
}

/** Player command. Returns an error message instead of throwing. */
export function dispatch(cmd: Command): string | null {
  const { game, aiRunning } = usePlay.getState();
  if (!game || aiRunning) return "Wait for the monsters to finish";
  try {
    const { state, events } = apply(game, cmd);
    record(events, state, game);
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
  usePlay.setState({ game: null, scenario: null, mode: "skirmish", context: null, log: [], fx: [], paths: {}, tally: {}, aiRunning: false });
}
