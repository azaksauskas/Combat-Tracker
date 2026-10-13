import { PARTY, type ContentEntry } from "../content/srd";
import type { CharacterSpec } from "../domain/character";
import { update, useGame } from "../store/game";
import { activeDoc, updatePlayer, useActiveProfile } from "../store/players";
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

export function resolveParty(picks: string[], characters: CharacterSpec[]): ContentEntry[] {
  const all = availableMembers(characters);
  const chosen = picks.map((k) => all.find((e) => e.key === k)).filter((e): e is ContentEntry => !!e);
  return chosen.length ? chosen.slice(0, MAX_PARTY) : PARTY;
}

/** Characters the active player can pick from: theirs plus any shared ones in the library. */
export const myCharacters = (): CharacterSpec[] => [...useGame.getState().library.characters, ...(activeDoc()?.characters ?? [])];

/** The party for the next fight or adventure: at the level they've reached, with the mods the smithy fitted. */
export const chosenParty = () => {
  const doc = activeDoc();
  return resolveParty(doc?.picks ?? [], myCharacters()).map((e) => withMods(withProgress(e, doc?.progress[e.key]), doc?.gear[e.key]));
};

/** The XP the chosen party carries into an adventure (the best of them; the others catch up). */
export const partyXp = () => {
  const doc = activeDoc();
  return Math.max(0, ...resolveParty(doc?.picks ?? [], myCharacters()).map((e) => doc?.progress[e.key]?.xp ?? 0));
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
