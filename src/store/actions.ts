import * as rules from "../domain/combat";
import { describeRoll, parseDice, rollTerms, withAdvantage } from "../domain/dice";
import { snapToGrid } from "../domain/grid";
import { MAX_ROLL_LOG, type Combatant, type GridType, type MapLine, type MapShape, type RollEntry } from "../domain/types";
import { update, useGame } from "./game";
import { useUi } from "./ui";

/**
 * Intent-level operations the UI calls. Each one is a thin wrapper that runs
 * a pure rule from `domain/` against the right synced document.
 */

export type CombatantDraft = rules.CombatantInput;

const spawnPoint = () => snapToGrid(useUi.getState().mapCenter, useGame.getState().combat.map.grid);

// --- Initiative & turns ----------------------------------------------------

export const addToCombat = (template: CombatantDraft, opts: { rollIfMonster?: boolean } = {}) => {
  let added: Combatant | undefined;
  update("combat", (d) => {
    added = rules.spawnCombatant(d, template, {
      position: spawnPoint(),
      rollInitiative: opts.rollIfMonster && template.isMonster,
    });
  });
  return added;
};

export const updateCombatant = (id: string, patch: Partial<CombatantDraft>) =>
  update("combat", (d) => {
    const c = d.combatants.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });

export const removeCombatant = (id: string) => update("combat", (d) => rules.removeCombatant(d, id));
export const moveCombatant = (fromId: string, toId: string) =>
  update("combat", (d) => rules.moveCombatant(d.combatants, fromId, toId));
export const sortInitiative = () => update("combat", (d) => rules.sortByInitiative(d.combatants));
// Changing turns un-pins the details panel so it follows the new active turn.
const followTurn = () => useUi.getState().set({ pinnedId: null });

export const setActive = (id: string | null) => {
  update("combat", (d) => rules.setActive(d, id));
  followTurn();
};
export const nextTurn = () => {
  update("combat", rules.nextTurn);
  followTurn();
};
export const previousTurn = () => {
  update("combat", rules.previousTurn);
  followTurn();
};
export const endCombat = () => update("combat", rules.endCombat);
export const clearCombat = () =>
  update("combat", (d) => {
    d.combatants = [];
    rules.endCombat(d);
  });

/** Applies quick-entry text ("7", "+5", "t5"). Returns false if it didn't parse. */
export const applyHpInput = (id: string, text: string) => {
  const change = rules.parseHpInput(text);
  if (!change) return false;
  const fn = { damage: rules.applyDamage, heal: rules.applyHealing, temp: rules.grantTempHp }[change.kind];
  update("combat", (d) => fn(d, id, change.amount));
  return true;
};

export const applyDamage = (id: string, n: number) => update("combat", (d) => rules.applyDamage(d, id, n));
export const applyHealing = (id: string, n: number) => update("combat", (d) => rules.applyHealing(d, id, n));
export const grantTempHp = (id: string, n: number) => update("combat", (d) => rules.grantTempHp(d, id, n));
export const addCondition = (id: string, cond: string) =>
  update("combat", (d) => rules.addCondition(d, id, cond));
export const removeCondition = (id: string, cond: string) =>
  update("combat", (d) => rules.removeCondition(d, id, cond));

// --- Roster & encounters ---------------------------------------------------

export const addToRoster = (template: CombatantDraft) =>
  update("library", (d) => {
    d.roster.push({
      ...structuredClone(template),
      id: rules.newId(),
      name: rules.baseName(template.name),
      conditions: [],
      x: 1000,
      y: 1000,
    });
  });

export const updateRosterEntry = (id: string, patch: Partial<CombatantDraft>) =>
  update("library", (d) => {
    const c = d.roster.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });

export const removeFromRoster = (id: string) =>
  update("library", (d) => {
    d.roster = d.roster.filter((c) => c.id !== id);
  });

export const saveEncounter = (name: string) => {
  const combat = useGame.getState().combat;
  update("library", (d) => {
    rules.saveEncounter(d, combat, name);
  });
};

export const loadEncounter = (encounterId: string) => {
  const enc = useGame.getState().library.encounters.find((e) => e.id === encounterId);
  if (enc) update("combat", (d) => rules.loadEncounter(d, enc));
};

export const deleteEncounter = (encounterId: string) =>
  update("library", (d) => {
    d.encounters = d.encounters.filter((e) => e.id !== encounterId);
  });

export const addRosterEntryToEncounter = (encounterId: string, rosterId: string) => {
  // Read the template outside the update: it must be plain data, not a draft.
  const template = useGame.getState().library.roster.find((r) => r.id === rosterId);
  if (template) update("library", (d) => rules.addToEncounter(d, encounterId, template));
};

export const removeFromEncounter = (encounterId: string, combatantId: string) =>
  update("library", (d) => {
    const enc = d.encounters.find((e) => e.id === encounterId);
    if (enc) enc.combatants = enc.combatants.filter((c) => c.id !== combatantId);
  });

// --- Notes -----------------------------------------------------------------

export const saveCampaignNotes = (text: string) =>
  update("notes", (d) => {
    d.campaign = text;
  });

// --- Battle map ------------------------------------------------------------

export const moveToken = (id: string, x: number, y: number) => updateCombatant(id, { x, y });

export const setGrid = (grid: GridType) =>
  update("combat", (d) => {
    d.map.grid = grid;
  });

export const addLine = (line: Omit<MapLine, "id">) =>
  update("combat", (d) => {
    d.map.lines.push({ ...line, id: rules.newId() });
  });

export const updateLine = (id: string, patch: Partial<Omit<MapLine, "id">>) =>
  update("combat", (d) => {
    const l = d.map.lines.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  });

export const removeLines = (ids: readonly string[]) =>
  update("combat", (d) => {
    d.map.lines = d.map.lines.filter((l) => !ids.includes(l.id));
  });

export const addShape = (shape: Omit<MapShape, "id">) => {
  const id = rules.newId();
  update("combat", (d) => {
    d.map.shapes.push({ ...shape, id });
  });
  return id;
};

export const updateShape = (id: string, patch: Partial<Omit<MapShape, "id">>) =>
  update("combat", (d) => {
    const s = d.map.shapes.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  });

export const removeShape = (id: string) =>
  update("combat", (d) => {
    d.map.shapes = d.map.shapes.filter((s) => s.id !== id);
  });

export const clearDrawings = () =>
  update("combat", (d) => {
    d.map.lines = [];
    d.map.shapes = [];
  });

// --- Dice ------------------------------------------------------------------

/**
 * Rolls dice notation and records it in the shared roll log (newest first).
 * Throws an Error with a readable message if the notation doesn't parse.
 */
export const rollDice = (
  input: string,
  opts: { label?: string; shown?: boolean; advantage?: "normal" | "adv" | "dis" } = {},
): RollEntry => {
  const result = rollTerms(withAdvantage(parseDice(input), opts.advantage ?? "normal"));
  const entry: RollEntry = {
    id: rules.newId(),
    at: Date.now(),
    label: opts.label ?? "",
    expression: result.expression,
    breakdown: describeRoll(result),
    total: result.total,
    natural: result.natural ?? null,
    shown: opts.shown ?? false,
  };
  update("combat", (d) => {
    d.rolls = [entry, ...d.rolls].slice(0, MAX_ROLL_LOG);
  });
  return entry;
};

export const clearRolls = () =>
  update("combat", (d) => {
    d.rolls = [];
  });
