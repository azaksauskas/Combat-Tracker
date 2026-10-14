import type { PlayerDoc } from "../domain/players";

/** A signed-in player. */
export interface Account {
  uid: string;
  /** The name they signed up with. */
  username: string;
}

export interface AuthApi {
  /** Calls back now and on every sign-in / sign-out. Returns a stop function. */
  onAccount(cb: (account: Account | null) => void): () => void;
  signIn(username: string, password: string): Promise<void>;
  signUp(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

/** A sign-in problem the player can fix, in plain words. */
export class AuthError extends Error {}

/**
 * Accounts are a name and a password. The backend needs an e-mail address,
 * so the name becomes one that is never mailed: "Aurimas" → aurimas@players.combat-tracker.
 */
export function usernameToEmail(username: string): string {
  const slug = username
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (slug.length < 2) throw new AuthError("A name needs at least two letters or digits");
  if (slug.length > 30) throw new AuthError("That name is too long (30 at most)");
  return `${slug}@players.combat-tracker`;
}
export const MIN_PASSWORD = 6;
import type { DocKey, Docs } from "../domain/types";

/**
 * A sync backend keeps the shared documents (and each player's own
 * document) in step across clients.
 * The store only talks to this interface, so Firestore can later be swapped
 * for a game server (WebSocket, Colyseus, Supabase...) without touching UI.
 */
export interface SyncAdapter {
  /**
   * Starts listening. `onDoc` fires with raw (unvalidated) data on every
   * remote change, and with `null` when the document does not exist yet.
   * `onError` reports a listener that failed (e.g. permission denied).
   */
  connect(
    onDoc: <K extends DocKey>(key: K, raw: unknown | null) => void,
    onError: (err: Error) => void,
  ): Promise<void>;
  save<K extends DocKey>(key: K, value: Docs[K]): Promise<void>;
  /** Follows every player's document (id → raw data). Returns a stop function. */
  watchPlayers(onDocs: (docs: Record<string, unknown>) => void, onError: (err: Error) => void): () => void;
  savePlayer(id: string, value: PlayerDoc): Promise<void>;
  deletePlayer(id: string): Promise<void>;
  /** Follows the list of DM account ids. */
  watchRoles(onDms: (uids: string[]) => void, onError: (err: Error) => void): () => void;
  saveRoles(uids: string[]): Promise<void>;
  /** Accounts: sign in with a name and a password. */
  auth: AuthApi;
  /** Reads the pre-rewrite single document, if the backend has one. */
  loadLegacy?(): Promise<unknown | null>;
  disconnect(): void;
}
