import { PARTY, type ContentEntry } from "../content/srd";
import type { CharacterSpec } from "../domain/character";
import { update, useGame } from "../store/game";
import { activeDoc, addChronicle, updatePlayer, useActiveProfile } from "../store/players";
import { toast } from "sonner";
import { INJURIES, applyInjuries, type Aftermath } from "./injuries";
import { characterEntry } from "./builder";
import { withMods } from "./crafting";
import { withProgress } from "./party";

/**
 * Which heroes go on the next adventure or skirmish (1–4), by content key.
 * Stored in the active player's document, so the choice follows the player.
 */

export const MAX_PARTY = 4;
export const DEFAULT_PICKS = PARTY.map((p) => p.key);

/** Ready-made heroes plus characters built by the DM (shared) and by this player. */
export const availableMembers = (characters: CharacterSpec[]): ContentEntry[] => [...PARTY, ...characters.map(characterEntry)];

export function resolveParty(picks: string[], characters: CharacterSpec[], fallen: string[] = []): ContentEntry[] {
  const all = availableMembers(characters);
  const alive = (e: ContentEntry) => !fallen.includes(e.key);
  const chosen = picks.map((k) => all.find((e) => e.key === k)).filter((e): e is ContentEntry => !!e && alive(e));
  return chosen.length ? chosen.slice(0, MAX_PARTY) : PARTY.filter(alive);
}

/** Characters the active player can pick from: theirs plus any shared ones in the library. */
export const myCharacters = (): CharacterSpec[] => [...useGame.getState().library.characters, ...(activeDoc()?.characters ?? [])];

/** The party for the next fight or adventure: at the level they've reached, with their mods and their injuries. The fallen stay home. */
export const chosenParty = () => {
  const doc = activeDoc();
  return resolveParty(doc?.picks ?? [], myCharacters(), doc?.fallen ?? []).map((e) => withInjuries(withMods(withProgress(e, doc?.progress[e.key]), doc?.gear[e.key]), doc?.injuries[e.key]));
};

function withInjuries(e: ContentEntry, injuries: string[] | undefined): ContentEntry {
  if (!injuries?.length) return e;
  return { ...e, build: () => applyInjuries(e.build(), injuries) };
}

/** After a battle that counts: the dead are fallen, the badly hurt carry an injury. */
export function recordAftermath(results: Aftermath[]) {
  const id = useActiveProfile.getState().id;
  if (!id || !results.length) return;
  updatePlayer(id, (d) => {
    const injuries = { ...d.injuries };
    const fallen = [...d.fallen];
    for (const r of results) {
      if (r.fallen && !fallen.includes(r.key)) fallen.push(r.key);
      if (r.injury) injuries[r.key] = [...(injuries[r.key] ?? []), r.injury];
    }
    return { ...d, injuries, fallen };
  });
  addChronicle(
    id,
    results.map((r) => (r.fallen ? { kind: "death" as const, text: `${r.name} died. Only a shrine can bring them back.` } : { kind: "death" as const, text: `${r.name} survived but carries a lasting injury: ${INJURIES[r.injury!]?.name} (${INJURIES[r.injury!]?.effect}).` })),
  );
  for (const r of results) toast[r.fallen ? "error" : "warning"](r.fallen ? `✝ ${r.name} has fallen.` : `${r.name}: ${INJURIES[r.injury!]?.name} — ${INJURIES[r.injury!]?.effect}`);
}

/** The XP the chosen party carries into an adventure (the best of them; the others catch up). */
export const partyXp = () => {
  const doc = activeDoc();
  return Math.max(0, ...resolveParty(doc?.picks ?? [], myCharacters(), doc?.fallen ?? []).map((e) => doc?.progress[e.key]?.xp ?? 0));
};

/** Remember how far heroes have got (never goes down). */
export function recordProgress(heroes: { key: string; level: number }[], xp: number) {
  const id = useActiveProfile.getState().id;
  if (!id) return;
  updatePlayer(id, (d) => {
    const progress = { ...d.progress };
    for (const h of heroes) {
      const was = progress[h.key] ?? { level: 1, xp: 0 };
      progress[h.key] = { level: Math.max(was.level, h.level), xp: Math.max(was.xp, xp) };
    }
    return { ...d, progress };
  });
}

export function togglePick(key: string) {
  const id = useActiveProfile.getState().id;
  if (!id) return;
  updatePlayer(id, (d) => {
    const picks = d.picks;
    if (picks.includes(key)) return { ...d, picks: picks.filter((k) => k !== key) };
    if (picks.length < MAX_PARTY) return { ...d, picks: [...picks, key] };
    return d;
  });
}

/** Saves a built character: back where it came from (the shared library) or to the active player. */
export function saveCharacter(spec: CharacterSpec) {
  const library = useGame.getState().library.characters;
  if (library.some((c) => c.id === spec.id)) {
    update("library", (d) => {
      const i = d.characters.findIndex((c) => c.id === spec.id);
      if (i >= 0) d.characters[i] = spec;
    });
    return;
  }
  const id = useActiveProfile.getState().id;
  if (!id) return;
  updatePlayer(id, (d) => {
    const i = d.characters.findIndex((c) => c.id === spec.id);
    const characters = i >= 0 ? d.characters.map((c) => (c.id === spec.id ? spec : c)) : [...d.characters, spec];
    return { ...d, characters };
  });
}

export function deleteCharacter(specId: string) {
  const id = useActiveProfile.getState().id;
  if (useGame.getState().library.characters.some((c) => c.id === specId))
    update("library", (d) => {
      d.characters = d.characters.filter((c) => c.id !== specId);
    });
  if (id) updatePlayer(id, (d) => ({ ...d, characters: d.characters.filter((c) => c.id !== specId), picks: d.picks.filter((k) => k !== `custom-${specId}`) }));
}
