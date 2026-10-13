import { produce, type Draft } from "immer";
import { toast } from "sonner";
import { create } from "zustand";
import { migrateLegacyState } from "../domain/legacy";
import { DOC_KEYS, emptyDocs, parseDoc, type DocKey, type Docs } from "../domain/types";
import { createSyncAdapter, type SyncAdapter } from "../sync";

/**
 * Shared, synced state. Every mutation goes through `update()`, which applies
 * an Immer recipe locally (instant UI) and then writes that one document to
 * the sync backend. Remote changes replace the document wholesale.
 */
interface GameState extends Docs {
  status: "connecting" | "ready" | "error";
  error: string | null;
}

export const useGame = create<GameState>(() => ({
  ...emptyDocs(),
  status: "connecting",
  error: null,
}));

let adapter: SyncAdapter | null = null;
/** The connected backend (null until connect() has run). */
export const getAdapter = () => adapter;

export function update<K extends DocKey>(key: K, recipe: (draft: Draft<Docs[K]>) => void) {
  const prev = useGame.getState()[key];
  let next: Docs[K];
  try {
    next = produce(prev, recipe);
  } catch (err) {
    // Never fail silently: a click that "does nothing" is worse than an error.
    console.error(`Updating "${key}" failed`, err);
    toast.error("That didn't work", { description: String(err) });
    return;
  }
  if (next !== prev) commit(key, next);
}

function commit<K extends DocKey>(key: K, next: Docs[K]) {
  useGame.setState({ [key]: next } as Pick<GameState, K>);
  adapter?.save(key, next).catch((err: unknown) => {
    console.error(`Saving "${key}" failed`, err);
    toast.error("Could not save changes", { description: String(err) });
  });
}

export async function connect() {
  if (adapter) return;
  try {
    adapter = await createSyncAdapter();
    const first = new Map<DocKey, unknown | null>();
    let resolveFirst!: () => void;
    let rejectFirst!: (err: Error) => void;
    const firstSnapshots = new Promise<void>((res, rej) => {
      resolveFirst = res;
      rejectFirst = rej;
    });

    await adapter.connect(
      (key, raw) => {
        if (!first.has(key)) {
          first.set(key, raw);
          if (first.size === DOC_KEYS.length) resolveFirst();
        }
        useGame.setState({ [key]: parseDoc(key, raw) } as Partial<GameState>);
      },
      (err) => {
        console.error("Sync listener failed", err);
        rejectFirst(err);
        useGame.setState({ status: "error", error: err.message });
      },
    );
    await firstSnapshots;

    // First run after the rewrite: import data from the old single document.
    if (first.get("combat") === null && first.get("library") === null && adapter.loadLegacy) {
      const legacy = await adapter.loadLegacy();
      if (legacy) {
        const docs = migrateLegacyState(legacy);
        commit("combat", docs.combat);
        commit("library", docs.library);
        commit("notes", docs.notes);
        toast.success("Imported data from the previous tracker");
      }
    }
    useGame.setState({ status: "ready" });
  } catch (err) {
    console.error("Sync connection failed", err);
    useGame.setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
}
