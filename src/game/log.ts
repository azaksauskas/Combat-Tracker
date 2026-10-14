import type { GameEvent, GameState } from "./state";

export interface LogLine {
  id: number;
  text: string;
  tone: "turn" | "hit" | "miss" | "crit" | "heal" | "bad" | "info" | "win" | "lose";
}

const advText = (e: Extract<GameEvent, { type: "attack" }>) =>
  e.advantage === "normal" ? "" : ` with ${e.advantage === "adv" ? "Advantage" : "Disadvantage"}${e.reasons.length ? ` (${e.reasons.map((r) => r.slice(2)).join(", ")})` : ""}`;

/** Turns engine events into readable log lines. */
export function describeEvents(events: GameEvent[], s: GameState, startId: number): LogLine[] {
  const name = (id: string) => s.units.find((u) => u.id === id)?.name ?? "Someone";
  const side = (id: string) => s.units.find((u) => u.id === id)?.side;
  let id = startId;
  const out: LogLine[] = [];
  const add = (text: string, tone: LogLine["tone"]) => out.push({ id: id++, text, tone });

  for (const e of events) {
    switch (e.type) {
      case "round":
        add(`— Round ${e.round} —`, "turn");
        break;
      case "turn":
        add(`${name(e.unitId)}'s turn`, "turn");
        break;
      case "move":
        if (e.path.length) add(`${name(e.unitId)} moves ${e.cost} ft`, "info");
        break;
      case "stand":
        add(`${name(e.unitId)} stands up`, "info");
        break;
      case "attack": {
        const result = e.crit ? "CRITICAL HIT!" : e.hit ? "hit" : "miss";
        add(
          `${e.opportunity ? "Opportunity attack! " : ""}${name(e.attackerId)} → ${name(e.targetId)}, ${e.action}${advText(e)}: ${e.roll.total} — ${result}`,
          e.crit ? "crit" : e.hit ? "hit" : "miss",
        );
        break;
      }
      case "save":
        add(`${name(e.targetId)} ${e.ability} save vs DC ${e.dc}: ${e.autoFail ? "automatic failure" : e.roll.total} — ${e.success ? "success" : "failure"}`, e.success ? "miss" : "hit");
        break;
      case "damage":
        add(`${name(e.targetId)} takes ${e.amount} (${e.detail}) → ${e.hp} HP`, side(e.targetId) === "party" ? "bad" : "hit");
        break;
      case "heal":
        add(`${name(e.targetId)} regains ${e.amount} HP → ${e.hp} HP`, "heal");
        break;
      case "condition":
        add(`${name(e.targetId)} is ${e.added ? "now" : "no longer"} ${e.condition}`, "info");
        break;
      case "effect":
        add(`${e.effect[0]!.toUpperCase()}${e.effect.slice(1)}: ${name(e.source)} → ${name(e.target)}`, "info");
        break;
      case "down":
        add(`${name(e.unitId)} falls unconscious!`, "bad");
        break;
      case "dead":
        add(side(e.unitId) === "party" ? `${name(e.unitId)} dies.` : `${name(e.unitId)} is slain.`, side(e.unitId) === "party" ? "bad" : "hit");
        break;
      case "fortitude":
        add(`${name(e.unitId)} Undead Fortitude: ${e.roll.total} vs DC ${e.dc} — ${e.success ? "refuses to fall!" : "falls"}`, e.success ? "bad" : "hit");
        break;
      case "death-save": {
        const result = { success: "success", failure: "failure", stable: "stable!", dead: "dies.", revived: "natural 20 — back on their feet!" }[e.result];
        add(`${name(e.unitId)} death save: ${e.roll.total} — ${result} (${e.successes}✓ ${e.failures}✗)`, e.result === "dead" || e.result === "failure" ? "bad" : "heal");
        break;
      }
      case "feature":
        add(`${name(e.unitId)}: ${e.name} (${e.detail})`, "info");
        break;
      case "outcome":
        add(e.outcome === "victory" ? "Victory!" : s.fled ? "The party retreats." : "Defeat…", e.outcome === "victory" ? "win" : "lose");
        break;
    }
  }
  return out;
}
