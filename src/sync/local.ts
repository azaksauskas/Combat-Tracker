import { DOC_KEYS, type DocKey } from "../domain/types";
import type { SyncAdapter } from "./adapter";

/**
 * Offline backend: localStorage for persistence and BroadcastChannel so a
 * DM tab and a player tab on the same machine stay in sync.
 */
export function createLocalAdapter(appId: string): SyncAdapter {
  const storageKey = (key: DocKey) => `combat-tracker:${appId}:${key}`;
  const playerKey = (id: string) => `combat-tracker:${appId}:player:${id}`;
  const channel = new BroadcastChannel(`combat-tracker:${appId}`);
  const playerWatchers = new Map<string, Set<(raw: unknown | null) => void>>();

  const readKey = (k: string): unknown | null => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const read = (key: DocKey) => readKey(storageKey(key));
  const notifyPlayer = (id: string) => playerWatchers.get(id)?.forEach((cb) => cb(readKey(playerKey(id))));

  return {
    async connect(onDoc) {
      for (const key of DOC_KEYS) onDoc(key, read(key));
      channel.onmessage = (e: MessageEvent<{ key?: DocKey; player?: string }>) => {
        if (e.data.key) onDoc(e.data.key, read(e.data.key));
        if (e.data.player) notifyPlayer(e.data.player);
      };
    },
    async save(key, value) {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
      channel.postMessage({ key });
    },
    watchPlayer(id, onDoc) {
      const set = playerWatchers.get(id) ?? new Set();
      playerWatchers.set(id, set);
      set.add(onDoc);
      queueMicrotask(() => onDoc(readKey(playerKey(id))));
      return () => set.delete(onDoc);
    },
    async savePlayer(id, value) {
      localStorage.setItem(playerKey(id), JSON.stringify(value));
      // Like Firestore: this page's own watchers hear the write too.
      notifyPlayer(id);
      channel.postMessage({ player: id });
    },
    async deletePlayer(id) {
      localStorage.removeItem(playerKey(id));
      notifyPlayer(id);
      channel.postMessage({ player: id });
    },
    disconnect() {
      channel.close();
    },
  };
}
