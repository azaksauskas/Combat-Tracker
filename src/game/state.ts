import type { RollResult } from "../domain/dice";
import type { StatBlock } from "../domain/statblock";
import type { Board, Cell } from "./board";

export type Side = "party" | "enemy";

/** What a creature still has available this turn. */
export interface TurnBudget {
  /** Feet of movement left. */
  movement: number;
  action: boolean;
  bonusAction: boolean;
  disengaged: boolean;
  sneakAttackUsed: boolean;
  /** Attacks left in this Attack action (Extra Attack, Multiattack). */
  attacksLeft?: number;
  /** A dying hero's turn: waiting for the player to roll the death save. */
  needsDeathSave?: boolean;
  /** Already drew or stowed a weapon this turn. */
  swapped?: boolean;
  /** Already opened a door, pulled a lever or the like this turn. */
  interacted?: boolean;
}

export interface DeathSaves {
  successes: number;
  failures: number;
  stable: boolean;
  /** Most failures this creature reached in the battle (2+ leaves a lasting injury). */
  worst?: number;
}

export interface Unit {
  id: string;
  name: string;
  side: Side;
  image: string | null;
  stats: StatBlock;
  ac: number;
  hp: number;
  hpMax: number;
  tempHp: number;
  /** Walking speed in feet. */
  speed: number;
  pos: Cell;
  initiative: number;
  conditions: string[];
  dead: boolean;
  death: DeathSaves;
  turn: TurnBudget;
  /** Reactions refresh at the start of the creature's own turn. */
  reaction: boolean;
  /** Took the Dodge action; lasts until the start of its next turn. */
  dodging: boolean;
  /** Limited-use features and spell slots, e.g. { "second-wind": 2, slot1: 3 }. */
  resources: Record<string, number>;
  /** Name of the spell this creature is concentrating on. */
  concentration?: string | null;
  /** Ran off the board (also marked dead: it's out of the fight). */
  fled?: boolean;
  /** Dropped to 0 HP at some point in this battle (they'll need the infirmary). */
  wentDown?: boolean;
  /** The spare weapon is drawn (the main one is on the back). */
  wieldingSpare?: boolean;
  /** A monster that hasn't noticed the party yet: out of the fight until a hero sees it. */
  dormant?: boolean;
  /** Lies in wait: only seen from 10 ft away, and strikes first when it is. */
  ambush?: boolean;
}

/** What winning means, besides beating every foe. */
export type Objective =
  /** Hold out this many rounds. */
  | { kind: "survive"; rounds: number }
  /** Get every hero still on their feet onto these squares. */
  | { kind: "escape"; cells: { x: number; y: number }[] }
  /** A delve level: get every hero still on their feet to the way out. Beating the foes doesn't end it. */
  | { kind: "exit"; cells: { x: number; y: number }[] };

/** Things on the map besides creatures: doors, gates, traps, chests, the way in and out. */
export type MapObjectKind = "door" | "gate" | "lever" | "trap" | "chest" | "loot" | "barrel" | "entrance" | "exit";

/** What a level's way in or out looks like. */
export type PassageLook = "stairs-down" | "stairs-up" | "door" | "ladder" | "boat";

/** A trap: what it does to whoever steps on it. */
export type TrapKind = "spikes" | "darts" | "fire" | "net";

/** Gold and items picked up during a fight (taken home when it's won). */
export interface Haul {
  gold: number;
  items: string[];
}

export interface MapObject {
  id: string;
  kind: MapObjectKind;
  pos: Cell;
  /** Doors and gates: open (passable). Chests: opened (emptied). Levers: pulled. */
  open?: boolean;
  /** Doors: locked (pick it or force it; a key opens it). */
  locked?: boolean;
  /** Traps: not yet found (drawn only once revealed). */
  hidden?: boolean;
  /** Traps: still dangerous. */
  armed?: boolean;
  trap?: TrapKind;
  /** Difficulty of finding, disarming, picking or forcing it. */
  dc?: number;
  /** Damage dice (traps). */
  damage?: string;
  /** A lever opens the gates with the same group; a key opens the doors with it. */
  group?: string;
  /** Chests and floor loot: what's inside. Consumables go to the stash. */
  loot?: Haul & { stash?: Record<string, number> };
  /** Entrances and exits. */
  look?: PassageLook;
  /** Where it faces (doors: "h" runs left–right, "v" up–down). */
  dir?: "h" | "v";
  /** Traps: heroes who already searched for it (each gets one try). */
  searched?: string[];
}

/** Temporary effects from weapon masteries etc. */
export interface Effect {
  id: string;
  kind: "vex" | "sap" | "slow" | "guided" | "bless" | "shield" | "help" | "grapple" | "faith";
  source: string;
  target: string;
  /**
   * Ends at the start/end of this unit's turn, after `turns` such moments
   * (Vex lasts to the end of your *next* turn: 2 ends, counting this one).
   */
  expires: { unit: string; at: "start" | "end"; turns: number };
}

export interface GameState {
  board: Board;
  /** In initiative order. */
  units: Unit[];
  turnIndex: number;
  round: number;
  effects: Effect[];
  /** Seed for the next roll (mulberry32 state). */
  rngSeed: number;
  outcome: null | "victory" | "defeat";
  /** The party retreated (the outcome is then "defeat"). */
  fled?: boolean;
  objective?: Objective;
  nextId: number;
  /** The party's shared consumables, e.g. { "potion-healing": 2 }. */
  stash?: Record<string, number>;
  /** Doors, traps, chests… */
  objects?: MapObject[];
  /** What the party picked up. */
  haul?: Haul;
  /** Keys the party found (their groups). */
  keys?: string[];
  /** Fog of war: the heroes only see what's in their light, and discover the map as they go. */
  fog?: boolean;
  /** Squares the party has seen ("x,y"). */
  seen?: string[];
  /** Exploring: nobody is fighting, so there are no rounds; any hero can act, and the others follow. */
  explore?: boolean;
}

export type GameEvent =
  | { type: "round"; round: number }
  | { type: "turn"; unitId: string }
  | { type: "move"; unitId: string; path: Cell[]; cost: number }
  | { type: "stand"; unitId: string }
  | {
      type: "attack";
      attackerId: string;
      targetId: string;
      action: string;
      roll: RollResult;
      advantage: "normal" | "adv" | "dis";
      reasons: string[];
      hit: boolean;
      crit: boolean;
      opportunity?: boolean;
    }
  | { type: "save"; targetId: string; action: string; ability: string; dc: number; roll: RollResult; success: boolean; autoFail?: boolean }
  | { type: "damage"; targetId: string; amount: number; detail: string; hp: number }
  | { type: "heal"; targetId: string; amount: number; hp: number }
  | { type: "condition"; targetId: string; condition: string; added: boolean }
  | { type: "effect"; effect: Effect["kind"]; source: string; target: string }
  | { type: "down"; unitId: string }
  | { type: "dead"; unitId: string }
  | { type: "fortitude"; unitId: string; roll: RollResult; dc: number; success: boolean }
  | { type: "death-save"; unitId: string; roll: RollResult; successes: number; failures: number; result: "success" | "failure" | "stable" | "dead" | "revived" }
  | { type: "feature"; unitId: string; name: string; detail: string }
  | { type: "object"; objectId: string; unitId?: string; what: "opened" | "closed" | "unlocked" | "stuck" | "pulled" | "triggered" | "revealed" | "disarmed" | "looted" | "burst"; detail?: string }
  | { type: "outcome"; outcome: "victory" | "defeat" };

export class GameError extends Error {}
