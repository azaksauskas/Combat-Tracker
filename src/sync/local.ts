import type { DocKey } from "../domain/types";
import type { SyncAdapter } from "./adapter";

/**
 * Offline backend: localStorage for persistence and BroadcastChannel so a
 * DM tab and a player tab on the same machine stay in sync.
 */
export function createLocalAdapter(appId: string): SyncAdapter {
  const KEYS: DocKey[] = ["combat", "library", "notes"];
  const storageKey = (key: DocKey) => `combat-tracker:${appId}:${key}`;
  const channel = new BroadcastChannel(`combat-tracker:${appId}`);

  const read = (key: DocKey): unknown | null => {
    try {
      const raw = localStorage.getItem(storageKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  return {
    async connect(onDoc) {
      for (const key of KEYS) onDoc(key, read(key));
      channel.onmessage = (e: MessageEvent<{ key: DocKey }>) => onDoc(e.data.key, read(e.data.key));
    },
    async save(key, value) {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
      channel.postMessage({ key });
    },
    disconnect() {
      channel.close();
    },
  };
}
