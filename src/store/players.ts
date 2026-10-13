import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newId } from "../domain/combat";
import { MAX_CHRONICLE, PROFILE_COLORS, PlayerDocSchema, emptyPlayerDoc, type ChronicleEntry, type PlayerDoc, type Profile } from "../domain/players";
import { getAdapter, update, useGame } from "./game";

/**
 * Player profiles and their own documents. A page follows every profile's
 * document (there are only a handful), so the DM sees everyone's progress
 * and a player's saves follow them from device to device.
 *
 * "Who's playing" is remembered per device for now; with logins it becomes
 * the signed-in user.
 */

/** Identifies this open page, so it can ignore the echo of its own saves. */
export const CLIENT_ID = newId();

export const useActiveProfile = create<{ id: string | null }>()(
  persist(() => ({ id: null as string | null }), {
    name: "combat-tracker:profile",
    storage: createJSONStorage(() => localStorage),
  }),
);

interface PlayersState {
  docs: Record<string, PlayerDoc>;
  /** Profiles whose document has arrived at least once. */
  loaded: Record<string, true>;
}

export const usePlayers = create<PlayersState>(() => ({ docs: {}, loaded: {} }));

const watching = new Map<string, () => void>();

/** Follows exactly the documents of the profiles in the directory. */
function syncWatches() {
  const adapter = getAdapter();
  const { status, players } = useGame.getState();
  if (!adapter || status !== "ready") return;
  const ids = new Set(players.profiles.map((p) => p.id));
  for (const [id, stop] of watching)
    if (!ids.has(id)) {
      stop();
      watching.delete(id);
      usePlayers.setState((s) => {
        const docs = { ...s.docs };
        delete docs[id];
        return { docs };
      });
    }
  for (const id of ids) {
    if (watching.has(id)) continue;
    const stop = adapter.watchPlayer(
      id,
      (raw) => usePlayers.setState((s) => ({ docs: { ...s.docs, [id]: PlayerDocSchema.parse(raw ?? {}) }, loaded: { ...s.loaded, [id]: true } })),
      (err) => toast.error("Could not load a player's save", { description: err.message }),
    );
    watching.set(id, stop);
  }
}
useGame.subscribe(syncWatches);

export const profiles = () => useGame.getState().players.profiles;
export const activeProfile = (): Profile | undefined => profiles().find((p) => p.id === useActiveProfile.getState().id);
export const activeDoc = (): PlayerDoc | undefined => {
  const id = useActiveProfile.getState().id;
  return id ? usePlayers.getState().docs[id] : undefined;
};

/** Games are saved per player, so starting one needs someone playing. Tells the user if not. */
export function ensurePlaying(): boolean {
  const p = activeProfile();
  if (p && usePlayers.getState().loaded[p.id]) return true;
  toast.info("Pick who's playing first, then start it again.");
  return false;
}

/** Changes one player's document and saves it. */
export function updatePlayer(id: string, change: (doc: PlayerDoc) => PlayerDoc) {
  const base = usePlayers.getState().docs[id] ?? emptyPlayerDoc();
  const next: PlayerDoc = { ...change(base), savedBy: CLIENT_ID, rev: base.rev + 1, updatedAt: Date.now() };
  usePlayers.setState((s) => ({ docs: { ...s.docs, [id]: next } }));
  getAdapter()
    ?.savePlayer(id, next)
    .catch((err: unknown) => toast.error("Could not save the game", { description: String(err) }));
}

/** Adds entries to a player's chronicle (newest last). */
export function addChronicle(id: string, entries: Omit<ChronicleEntry, "id" | "at" | "status">[]) {
  if (!entries.length) return;
  const at = Date.now();
  updatePlayer(id, (d) => ({
    ...d,
    chronicle: [...d.chronicle, ...entries.map((e): ChronicleEntry => ({ ...e, id: newId(), at, status: "new" }))].slice(-MAX_CHRONICLE),
  }));
}

export function setChronicleStatus(playerId: string, entryId: string, status: ChronicleEntry["status"]) {
  updatePlayer(playerId, (d) => ({ ...d, chronicle: d.chronicle.map((e) => (e.id === entryId ? { ...e, status } : e)) }));
}

// --- Profiles ------------------------------------------------------------------------------

export function createProfile(name: string, role: Profile["role"] = "player", defaultPicks: string[] = []): string {
  const existing = profiles();
  const profile: Profile = {
    id: newId(),
    name: name.trim() || "Player",
    color: PROFILE_COLORS[existing.length % PROFILE_COLORS.length]!,
    role,
    createdAt: Date.now(),
  };
  let doc: PlayerDoc = { ...emptyPlayerDoc(), picks: defaultPicks };
  // The very first profile inherits what this browser had before profiles existed.
  if (existing.length === 0) {
    const legacy = readLegacySaves(localStorage);
    const shared = useGame.getState().library.characters;
    doc = { ...doc, ...legacy, picks: legacy.picks?.length ? legacy.picks : defaultPicks, characters: shared };
    if (shared.length)
      update("library", (d) => {
        d.characters = [];
      });
    clearLegacySaves(localStorage);
  }
  update("players", (d) => {
    d.profiles.push(profile);
  });
  usePlayers.setState((s) => ({ docs: { ...s.docs, [profile.id]: doc }, loaded: { ...s.loaded, [profile.id]: true } }));
  updatePlayer(profile.id, () => doc);
  useActiveProfile.setState({ id: profile.id });
  return profile.id;
}

export function renameProfile(id: string, name: string) {
  update("players", (d) => {
    const p = d.profiles.find((x) => x.id === id);
    if (p && name.trim()) p.name = name.trim();
  });
}

export function setRole(id: string, role: Profile["role"]) {
  update("players", (d) => {
    const p = d.profiles.find((x) => x.id === id);
    if (p) p.role = role;
  });
}

export function deleteProfile(id: string) {
  update("players", (d) => {
    d.profiles = d.profiles.filter((p) => p.id !== id);
  });
  void getAdapter()?.deletePlayer(id);
  if (useActiveProfile.getState().id === id) useActiveProfile.setState({ id: null });
}

// --- Saves from before profiles ----------------------------------------------------------

const LEGACY = { campaign: "combat-tracker:campaign", game: "combat-tracker:game", party: "combat-tracker:party" } as const;

const persisted = (storage: Pick<Storage, "getItem">, key: string): Record<string, unknown> | null => {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { state?: Record<string, unknown> }) : null;
    return parsed?.state ?? null;
  } catch {
    return null;
  }
};

/** The adventure, battle and party this browser saved before profiles existed. */
export function readLegacySaves(storage: Pick<Storage, "getItem">): Partial<Pick<PlayerDoc, "campaign" | "battle" | "picks">> {
  const out: Partial<Pick<PlayerDoc, "campaign" | "battle" | "picks">> = {};
  const campaign = persisted(storage, LEGACY.campaign);
  if (campaign?.state) out.campaign = campaign.state;
  const game = persisted(storage, LEGACY.game);
  if (game?.game) out.battle = { game: game.game, scenario: game.scenario ?? null, mode: game.mode ?? "skirmish", log: game.log ?? [] };
  const party = persisted(storage, LEGACY.party);
  if (Array.isArray(party?.picks)) out.picks = party.picks.filter((x): x is string => typeof x === "string");
  return out;
}

function clearLegacySaves(storage: Pick<Storage, "removeItem">) {
  for (const k of Object.values(LEGACY)) storage.removeItem(k);
}
