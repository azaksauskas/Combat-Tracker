import { toast } from "sonner";
import { create } from "zustand";
import { newId } from "../domain/combat";
import { MAX_CHRONICLE, PROFILE_COLORS, PlayerDocSchema, emptyPlayerDoc, type ChronicleEntry, type PlayerDoc, type Profile } from "../domain/players";
import { getAdapter, onSession, update, useGame } from "./game";
import type { Account } from "../sync/adapter";
import { PARTY } from "../content/srd";

/**
 * Players and their own documents. Every signed-in page follows all player
 * documents (there are only a handful), so the DM sees everyone's progress,
 * towns can see their neighbours, and a player's saves follow them from
 * device to device. The player at this page is the signed-in account.
 */

/** Identifies this open page, so it can ignore the echo of its own saves. */
export const CLIENT_ID = newId();

/** The signed-in player's id (their account id), or null when signed out. */
export const useActiveProfile = create<{ id: string | null }>(() => ({ id: null }));

interface PlayersState {
  docs: Record<string, PlayerDoc>;
  /** Players whose document has arrived (every account's, once the first snapshot is in). */
  loaded: Record<string, true>;
  /** True once the first snapshot of player documents has arrived. */
  ready: boolean;
  /** Everyone with an account, oldest first. */
  profiles: Profile[];
  /** Account ids of the DMs. */
  dms: string[];
}

export const usePlayers = create<PlayersState>(() => ({ docs: {}, loaded: {}, ready: false, profiles: [], dms: [] }));

const toProfiles = (docs: Record<string, PlayerDoc>, dms: string[]): Profile[] =>
  Object.entries(docs)
    .filter(([, d]) => d.profile)
    .map(([id, d]) => ({ id, name: d.profile!.name, color: d.profile!.color, createdAt: d.profile!.createdAt, role: dms.includes(id) ? ("dm" as const) : ("player" as const) }))
    .sort((a, b) => a.createdAt - b.createdAt);

let stops: (() => void)[] = [];

onSession(
  (account) => {
    const adapter = getAdapter();
    if (!adapter) return;
    useActiveProfile.setState({ id: account.uid });
    stops.push(
      adapter.watchPlayers(
        (raws) => {
          const docs = Object.fromEntries(Object.entries(raws).map(([id, raw]) => [id, PlayerDocSchema.parse(raw ?? {})]));
          const loaded = Object.fromEntries(Object.keys(docs).map((id) => [id, true as const]));
          // Our own document may not exist yet: it counts as loaded (empty) once the snapshot is in.
          loaded[account.uid] = true;
          usePlayers.setState((s) => ({ docs, loaded, ready: true, profiles: toProfiles(docs, s.dms) }));
          ensureProfile(account);
        },
        (err) => toast.error("Could not load the players' saves", { description: err.message }),
      ),
      adapter.watchRoles(
        (dms) => usePlayers.setState((s) => ({ dms, profiles: toProfiles(s.docs, dms) })),
        (err) => console.warn("Roles unavailable", err),
      ),
    );
  },
  () => {
    stops.forEach((f) => f());
    stops = [];
    useActiveProfile.setState({ id: null });
    usePlayers.setState({ docs: {}, loaded: {}, ready: false, profiles: [], dms: [] });
  },
);

/** A new account gets a profile (named as they signed up) the first time they're seen. */
function ensureProfile(account: Account) {
  const { docs } = usePlayers.getState();
  if (docs[account.uid]?.profile) return;
  const taken = Object.values(docs).filter((d) => d.profile).length;
  const profile = { name: account.username, color: PROFILE_COLORS[taken % PROFILE_COLORS.length]!, createdAt: Date.now() };
  let fresh: Partial<PlayerDoc> = {};
  // The very first player inherits what this browser had saved before profiles existed.
  if (taken === 0 && !docs[account.uid]) {
    const legacy = readLegacySaves(localStorage);
    fresh = { ...legacy };
    clearLegacySaves(localStorage);
  }
  queueMicrotask(() => updatePlayer(account.uid, (d) => ({ ...d, picks: d.picks.length ? d.picks : PARTY.map((e) => e.key), ...fresh, profile })));
}

export const profiles = () => usePlayers.getState().profiles;
export const activeProfile = (): Profile | undefined => profiles().find((p) => p.id === useActiveProfile.getState().id);
export const activeDoc = (): PlayerDoc | undefined => {
  const id = useActiveProfile.getState().id;
  return id ? usePlayers.getState().docs[id] : undefined;
};
/** Is the signed-in player a DM? */
export const isDm = () => {
  const id = useActiveProfile.getState().id;
  return !!id && usePlayers.getState().dms.includes(id);
};
export const useIsDm = () => usePlayers((s) => s.dms.includes(useActiveProfile.getState().id ?? ""));

/** Games are saved per player, so starting one needs the player's save loaded. Tells the user if not. */
export function ensurePlaying(): boolean {
  const id = useActiveProfile.getState().id;
  if (id && usePlayers.getState().loaded[id]) return true;
  toast.info("Your save is still loading. Try again in a moment.");
  return false;
}

/** Changes one player's document and saves it. */
export function updatePlayer(id: string, change: (doc: PlayerDoc) => PlayerDoc) {
  const base = usePlayers.getState().docs[id] ?? emptyPlayerDoc();
  const next: PlayerDoc = { ...change(base), savedBy: CLIENT_ID, rev: base.rev + 1, updatedAt: Date.now() };
  usePlayers.setState((s) => ({ docs: { ...s.docs, [id]: next } }));
  // A subscriber may have saved a newer version meanwhile; always store the latest.
  const latest = usePlayers.getState().docs[id] ?? next;
  getAdapter()
    ?.savePlayer(id, latest)
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

// --- Profiles and roles --------------------------------------------------------------

export function renameProfile(id: string, name: string) {
  if (!name.trim()) return;
  updatePlayer(id, (d) => (d.profile ? { ...d, profile: { ...d.profile, name: name.trim() } } : d));
}

const saveRoles = (uids: string[]) =>
  getAdapter()
    ?.saveRoles(uids)
    .catch((err: unknown) => toast.error("Could not change roles", { description: String(err) }));

/** Nobody is the DM yet: the signed-in player takes the role. */
export function becomeDm() {
  const id = useActiveProfile.getState().id;
  if (!id || usePlayers.getState().dms.length) return;
  void saveRoles([id]);
}

export function setRole(id: string, role: Profile["role"]) {
  const dms = usePlayers.getState().dms;
  const next = role === "dm" ? [...new Set([...dms, id])] : dms.filter((x) => x !== id);
  if (!next.length) return toast.error("Someone has to stay the DM");
  void saveRoles(next);
}

/** Removes a player's save (their account stays; signing in again starts afresh). */
export function deleteProfile(id: string) {
  void getAdapter()?.deletePlayer(id);
}

/** What a save holds, without who it belongs to. */
const saveOf = (d: PlayerDoc): PlayerDoc => ({ ...d, profile: undefined });

/** Moves a whole save to another account (a forgotten password, a new account). The source starts afresh. */
export function moveSave(fromId: string, toId: string) {
  const { docs } = usePlayers.getState();
  const from = docs[fromId];
  if (!from || fromId === toId) return;
  updatePlayer(toId, (d) => ({ ...saveOf(from), profile: d.profile, rev: d.rev }));
  if (from.profile) updatePlayer(fromId, (d) => ({ ...emptyPlayerDoc(), profile: d.profile, rev: d.rev }));
  else void getAdapter()?.deletePlayer(fromId);
}

/** Saves from before logins: documents without an owner, named from the old directory. */
export function legacySaves(): { id: string; name: string }[] {
  const { docs } = usePlayers.getState();
  const names = new Map(useGame.getState().players.profiles.map((p) => [p.id, p.name]));
  return Object.entries(docs)
    .filter(([, d]) => !d.profile)
    .filter(([id]) => id !== useActiveProfile.getState().id)
    .map(([id]) => ({ id, name: names.get(id) ?? "A save without a name" }));
}

/** "That was me": an old save becomes the signed-in player's. */
export function claimSave(oldId: string) {
  const me = useActiveProfile.getState().id;
  if (!me) return;
  moveSave(oldId, me);
  update("players", (d) => {
    d.profiles = d.profiles.filter((p) => p.id !== oldId);
  });
  toast.success("The save is yours now");
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
