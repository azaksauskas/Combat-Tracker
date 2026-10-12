import type { DocKey, Docs } from "../domain/types";

/**
 * A sync backend keeps the three shared documents in step across clients.
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
  /** Reads the pre-rewrite single document, if the backend has one. */
  loadLegacy?(): Promise<unknown | null>;
  disconnect(): void;
}
