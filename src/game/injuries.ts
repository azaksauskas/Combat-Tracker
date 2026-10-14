import type { StatAction } from "../domain/statblock";
import type { CombatantDraft } from "../store/actions";
import { mulberry32 } from "./rng";
import { num } from "./tuning";
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
  /** Dropped to 0 HP in the battle. */
  downed?: true;
  /** Share of their hit points they ended the battle without (0–1). */
  hurt?: number;
}

/**
 * Game hours in the infirmary after a battle: about a day for a hero who went
 * down (more with a lasting injury), less for lesser wounds, nothing for
 * scratches. A staffed shrine tends them in half the time (all tunable).
 */
export function recoveryHours(r: Aftermath, shrine: boolean): number {
  if (r.fallen) return 0;
  let h = 0;
  if (r.downed) h = num("infirmary.downedHours") + (r.injury ? num("infirmary.injuryHours") : 0);
  else if ((r.hurt ?? 0) >= num("infirmary.woundedShare")) h = Math.round(num("infirmary.woundedHours") * (r.hurt ?? 0));
  return Math.ceil(h * (shrine ? num("infirmary.shrineFactor") : 1));
}

/** What a battle left on the heroes: who died, who carries a new injury, who is hurt. */
export function aftermath(game: GameState, keyOf: (unitId: string) => string | undefined): Aftermath[] {
  const rng = mulberry32(game.rngSeed ^ 0x5eed).rng;
  const ids = Object.keys(INJURIES);
  const out: Aftermath[] = [];
  for (const u of game.units) {
    if (u.side !== "party") continue;
    const key = keyOf(u.id);
    if (!key) continue;
    if (u.dead && !u.fled) {
      out.push({ key, name: u.name, fallen: true });
      continue;
    }
    const r: Aftermath = { key, name: u.name };
    if ((u.death.worst ?? 0) >= 2) r.injury = ids[Math.floor(rng() * ids.length)]!;
    if (u.wentDown) r.downed = true;
    const hurt = u.hpMax > 0 ? Math.round((1 - Math.max(0, u.hp) / u.hpMax) * 100) / 100 : 0;
    if (hurt > 0) r.hurt = hurt;
    if (r.injury || r.downed || r.hurt) out.push(r);
  }
  return out;
}
