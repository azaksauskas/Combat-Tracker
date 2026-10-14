import type { StatAction } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";
import { mulberry32 } from "./rng";
import type { GameState } from "./state";

/**
 * Lasting injuries: a hero who reached two failed death saves in a battle
 * carries a wound out of it; three, and they're dead. Injuries change the
 * hero's sheet until treated at a shrine; the dead stay dead until raised.
 */

export interface InjuryDef {
  name: string;
  effect: string;
}

export const INJURIES: Record<string, InjuryDef> = {
  "broken-hand": { name: "Broken hand", effect: "−1 to weapon attack rolls" },
  "twisted-knee": { name: "Twisted knee", effect: "−5 ft speed" },
  "cracked-ribs": { name: "Cracked ribs", effect: "−1 AC" },
  concussion: { name: "Concussion", effect: "−1 to spell attacks and spell save DCs" },
  "deep-wound": { name: "Deep wound", effect: "−4 maximum HP" },
};

const isSpell = (a: StatAction) => !!a.slot || !!a.cantrip;

/** A hero's sheet with their injuries applied. */
export function applyInjuries<T extends Pick<CombatantDraft, "ac" | "speed" | "hpMax" | "hpCurrent" | "stats">>(c: T, injuries: string[]): T {
  if (!injuries.length || !c.stats) return c;
  const has = (id: string) => injuries.filter((x) => x === id).length;
  const actions = c.stats.actions.map((a): StatAction => {
    if (a.kind === "attack" && !isSpell(a) && has("broken-hand")) return { ...a, toHit: a.toHit - has("broken-hand") };
    if (isSpell(a) && has("concussion")) {
      if (a.kind === "attack") return { ...a, toHit: a.toHit - has("concussion") };
      if (a.kind === "save") return { ...a, dc: a.dc - has("concussion") };
    }
    return a;
  });
  const hpMax = Math.max(1, c.hpMax - 4 * has("deep-wound"));
  return {
    ...c,
    ac: c.ac - has("cracked-ribs"),
    speed: Math.max(5, c.speed - 5 * has("twisted-knee")),
    hpMax,
    hpCurrent: Math.min(c.hpCurrent, hpMax),
    stats: { ...c.stats, actions },
  };
}

export interface Aftermath {
  key: string;
  name: string;
  fallen?: true;
  injury?: string;
}

/** What a battle left on the heroes: who died, who carries a new injury. */
export function aftermath(game: GameState, keyOf: (unitId: string) => string | undefined): Aftermath[] {
  const rng = mulberry32(game.rngSeed ^ 0x5eed).rng;
  const ids = Object.keys(INJURIES);
  const out: Aftermath[] = [];
  for (const u of game.units) {
    if (u.side !== "party") continue;
    const key = keyOf(u.id);
    if (!key) continue;
    if (u.dead) out.push({ key, name: u.name, fallen: true });
    else if ((u.death.worst ?? 0) >= 2) out.push({ key, name: u.name, injury: ids[Math.floor(rng() * ids.length)]! });
  }
  return out;
}
