import { PARTY, type ContentEntry } from "../content/srd";
import type { CharacterSpec } from "../domain/character";
import { update, useGame } from "../store/game";
import { activeDoc, addChronicle, updatePlayer, useActiveProfile } from "../store/players";
import { toast } from "sonner";
import type { PlayerDoc } from "../domain/players";
import { applyLoadout, startingKit, type Loadout } from "./arsenal";
import { INJURIES, applyInjuries, recoveryHours, type Aftermath } from "./injuries";
import { applySpells } from "./spellbook";
import { working } from "./town";
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

/** The party for the next fight or adventure: at the level they've reached, with their gear, spells, mods and injuries. The fallen and the recovering stay home. */
export const chosenParty = () => {
  const doc = activeDoc();
  const home = [...(doc?.fallen ?? []), ...Object.keys(doc?.recovery ?? {}).filter((k) => recoveryLeft(doc, k) > 0)];
  return resolveParty(doc?.picks ?? [], myCharacters(), home).map((e) => asNow(e, doc));
};

/** Game hours a hero still has to spend in the infirmary (0: fit). */
export function recoveryLeft(doc: PlayerDoc | null | undefined, key: string): number {
  const until = doc?.recovery[key];
  if (until === undefined || !doc?.town) return 0;
  return Math.max(0, Math.ceil(until - doc.town.hours));
}

/** A hero at the level they've reached, with their loadout, prepared spells, mods and injuries. */
function asNow(e: ContentEntry, doc: PlayerDoc | null | undefined): ContentEntry {
  const k = e.key;
  return withInjuries(withMods(withSpells(withLoadout(withProgress(e, doc?.progress[k]), doc?.loadouts[k]), doc?.spells[k], doc?.loadouts[k]), doc?.gear[k]), doc?.injuries[k]);
}

/** One of the player's heroes as they are now: level, loadout, spells, mods and injuries. */
export function heroAsNow(key: string): ContentEntry | undefined {
  const e = availableMembers(myCharacters()).find((x) => x.key === key);
  return e && asNow(e, activeDoc());
}

/** A hero with the weapons and armour they carry (their built-in kit when nothing was changed). */
export function withLoadout(e: ContentEntry, loadout: Loadout | undefined): ContentEntry {
  if (!loadout) return e;
  return { ...e, build: () => applyLoadout(e.build(), loadout) };
}

/** A caster with the spells they prepared in town (their built-in list when nothing was changed). */
export function withSpells(e: ContentEntry, spells: string[] | undefined, loadout: Loadout | undefined): ContentEntry {
  if (!spells) return e;
  return {
    ...e,
    build: () => {
      const c = e.build();
      return applySpells(c, spells, !(loadout ?? startingKit(c.stats?.className)).armor);
    },
  };
}

function withInjuries(e: ContentEntry, injuries: string[] | undefined): ContentEntry {
  if (!injuries?.length) return e;
  return { ...e, build: () => applyInjuries(e.build(), injuries) };
}

/** After a battle that counts: the dead are fallen, the badly hurt carry an injury. */
export function recordAftermath(results: Aftermath[]) {
  const id = useActiveProfile.getState().id;
  if (!id || !results.length) return;
  // Time in the infirmary, counted on the town's clock (no town: they heal on the road).
  const town = activeDoc()?.town;
  const shrine = !!town && working(town, "shrine") > 0;
  const rest = new Map(town ? results.map((r) => [r.key, recoveryHours(r, shrine)] as const).filter(([, h]) => h > 0) : []);
  updatePlayer(id, (d) => {
    const injuries = { ...d.injuries };
    const fallen = [...d.fallen];
    const recovery = { ...d.recovery };
    const now = Math.floor(d.town?.hours ?? 0);
    for (const r of results) {
      if (r.fallen && !fallen.includes(r.key)) fallen.push(r.key);
      if (r.injury) injuries[r.key] = [...(injuries[r.key] ?? []), r.injury];
      const h = rest.get(r.key);
      if (h) recovery[r.key] = Math.max(recovery[r.key] ?? 0, now + h);
    }
    return { ...d, injuries, fallen, recovery };
  });
  const lines = results.flatMap((r) => {
    if (r.fallen) return [{ kind: "death" as const, text: `${r.name} died. Only a shrine can bring them back.` }];
    const out: { kind: "death" | "story"; text: string }[] = [];
    if (r.injury) out.push({ kind: "death", text: `${r.name} survived but carries a lasting injury: ${INJURIES[r.injury]?.name} (${INJURIES[r.injury]?.effect}).` });
    const h = rest.get(r.key);
    if (h) out.push({ kind: "story", text: `${r.name} ${r.downed ? "was carried" : "limped"} to the infirmary: ${h} hours of rest${shrine ? " (the shrine tends them)" : ""}.` });
    return out;
  });
  if (lines.length) addChronicle(id, lines);
  for (const r of results) {
    if (r.fallen) toast.error(`✝ ${r.name} has fallen.`);
    else if (r.injury) toast.warning(`${r.name}: ${INJURIES[r.injury]?.name} — ${INJURIES[r.injury]?.effect}`);
    if (rest.get(r.key)) toast(`🛏 ${r.name}: ${rest.get(r.key)} h in the infirmary`);
  }
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
