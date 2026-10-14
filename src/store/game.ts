import { produce, type Draft } from "immer";
import { toast } from "sonner";
import { create } from "zustand";
import { migrateLegacyState } from "../domain/legacy";
import { DOC_KEYS, emptyDocs, parseDoc, type DocKey, type Docs } from "../domain/types";
import { createSyncAdapter, type SyncAdapter } from "../sync";
import type { Account } from "../sync/adapter";

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

// --- Session: signing in connects, signing out disconnects ---------------------------

interface SessionState {
  /** False until the backend has said whether someone is signed in. */
  checked: boolean;
  account: Account | null;
}
export const useSession = create<SessionState>(() => ({ checked: false, account: null }));

let connected = false;
let started = false;
const onSignIn: ((account: Account) => void)[] = [];
const onSignOut: (() => void)[] = [];
/** Other stores hook in here (player documents, roles). */
export function onSession(signIn: (account: Account) => void, signOut: () => void) {
  onSignIn.push(signIn);
  onSignOut.push(signOut);
}

/** Creates the backend and follows sign-ins; the shared documents load once someone is signed in. */
export async function start() {
  if (started) return;
  started = true;
  try {
    adapter = await createSyncAdapter();
  } catch (err) {
    useGame.setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
    useSession.setState({ checked: true });
    return;
  }
  adapter.auth.onAccount((account) => {
    const was = useSession.getState().account;
    useSession.setState({ checked: true, account });
    if (account && (!connected || was?.uid !== account.uid)) {
      if (connected) disconnectData();
      void connectData();
      onSignIn.forEach((f) => f(account));
    } else if (!account && connected) {
      disconnectData();
    }
  });
}

function disconnectData() {
  adapter?.disconnect();
  connected = false;
  onSignOut.forEach((f) => f());
  useGame.setState({ ...emptyDocs(), status: "connecting", error: null });
}

async function connectData() {
  if (!adapter) return;
  connected = true;
  try {
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
      const legacy = await adapter.loadLegacy().catch(() => null);
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

const beforeSignOut: (() => void)[] = [];
/** Runs before signing out, while the account can still save (e.g. a pending game save). */
export const onBeforeSignOut = (f: () => void) => void beforeSignOut.push(f);

/** Saves what's pending, then signs out. */
export async function signOut() {
  beforeSignOut.forEach((f) => f());
  // Give the last saves a moment to leave while still signed in.
  await new Promise((r) => setTimeout(r, 400));
  await adapter?.auth.signOut();
}

/** Account actions for the sign-in screen and the account menu. */
export const auth = () => {
  if (!adapter) throw new Error("Not connected yet");
  return adapter.auth;
};
