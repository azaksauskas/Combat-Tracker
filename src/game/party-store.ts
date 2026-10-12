import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { PARTY, type ContentEntry } from "../content/srd";
import type { CharacterSpec } from "../domain/character";
import { useGame } from "../store/game";
import { characterEntry } from "./builder";

/** Which heroes go on the next adventure or skirmish (1–4), by content key. Kept per browser. */
export const usePartyPicks = create<{ picks: string[] }>()(
  persist(() => ({ picks: PARTY.map((p) => p.key) }), {
    name: "combat-tracker:party",
    storage: createJSONStorage(() => localStorage),
  }),
);

export const MAX_PARTY = 4;

/** Ready-made heroes plus the characters you built. */
export const availableMembers = (characters: CharacterSpec[]): ContentEntry[] => [...PARTY, ...characters.map(characterEntry)];

export function resolveParty(picks: string[], characters: CharacterSpec[]): ContentEntry[] {
  const all = availableMembers(characters);
  const chosen = picks.map((k) => all.find((e) => e.key === k)).filter((e): e is ContentEntry => !!e);
  return chosen.length ? chosen.slice(0, MAX_PARTY) : PARTY;
}

/** The party for the next fight or adventure. */
export const chosenParty = () => resolveParty(usePartyPicks.getState().picks, useGame.getState().library.characters);

export function togglePick(key: string) {
  const { picks } = usePartyPicks.getState();
  if (picks.includes(key)) usePartyPicks.setState({ picks: picks.filter((k) => k !== key) });
  else if (picks.length < MAX_PARTY) usePartyPicks.setState({ picks: [...picks, key] });
}
