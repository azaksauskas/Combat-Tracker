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
}

export interface DeathSaves {
  successes: number;
  failures: number;
  stable: boolean;
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
  /** Limited-use features, e.g. { "second-wind": 2 }. */
  resources: Record<string, number>;
}

/** Temporary effects from weapon masteries etc. */
export interface Effect {
  id: string;
  kind: "vex" | "sap" | "slow";
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
  nextId: number;
  /** The party's shared consumables, e.g. { "potion-healing": 2 }. */
  stash?: Record<string, number>;
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
  | { type: "outcome"; outcome: "victory" | "defeat" };

export class GameError extends Error {}
