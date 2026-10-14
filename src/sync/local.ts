import { DOC_KEYS, type DocKey } from "../domain/types";
import { AuthError, MIN_PASSWORD, usernameToEmail, type Account, type SyncAdapter } from "./adapter";

/**
 * Offline backend: localStorage for persistence and BroadcastChannel so a
 * DM tab and a player tab on the same machine stay in sync. Accounts are
 * kept in localStorage too (for development and tests only: not secure);
 * who is signed in is per tab, so two tabs can be two players.
 */
export function createLocalAdapter(appId: string): SyncAdapter {
  const prefix = `combat-tracker:${appId}:`;
  const storageKey = (key: DocKey) => `${prefix}${key}`;
  const playerKey = (id: string) => `${prefix}player:${id}`;
  const rolesKey = `${prefix}roles`;
  const accountsKey = `${prefix}accounts`;
  const sessionKey = `${prefix}session`;
  const channel = new BroadcastChannel(`combat-tracker:${appId}`);
  const playerWatchers = new Set<(docs: Record<string, unknown>) => void>();
  const roleWatchers = new Set<(uids: string[]) => void>();
  const accountWatchers = new Set<(a: Account | null) => void>();

  const readKey = (k: string): unknown | null => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const read = (key: DocKey) => readKey(storageKey(key));
  const allPlayers = () => {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(`${prefix}player:`)) out[k.slice(`${prefix}player:`.length)] = readKey(k);
    }
    return out;
  };
  const roles = () => {
    const r = readKey(rolesKey) as { uids?: unknown } | null;
    return Array.isArray(r?.uids) ? (r.uids as string[]) : [];
  };
  const notifyPlayers = () => playerWatchers.forEach((cb) => cb(allPlayers()));
  const notifyRoles = () => roleWatchers.forEach((cb) => cb(roles()));

  type Stored = Record<string, { uid: string; username: string; hash: string }>;
  const accounts = () => (readKey(accountsKey) as Stored | null) ?? {};
  const hash = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const current = (): Account | null => {
    const uid = sessionStorage.getItem(sessionKey);
    const a = Object.values(accounts()).find((x) => x.uid === uid);
    return a ? { uid: a.uid, username: a.username } : null;
  };
  const announce = () => accountWatchers.forEach((cb) => cb(current()));

  return {
    auth: {
      onAccount(cb) {
        accountWatchers.add(cb);
        queueMicrotask(() => cb(current()));
        return () => accountWatchers.delete(cb);
      },
      async signIn(username, password) {
        const a = accounts()[usernameToEmail(username)];
        if (!a || a.hash !== (await hash(password))) throw new AuthError("Wrong name or password");
        sessionStorage.setItem(sessionKey, a.uid);
        announce();
      },
      async signUp(username, password) {
        const email = usernameToEmail(username);
        if (password.length < MIN_PASSWORD) throw new AuthError(`The password needs at least ${MIN_PASSWORD} characters`);
        const all = accounts();
        if (all[email]) throw new AuthError("That name is taken. Sign in instead, or pick another");
        const uid = `u${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
        all[email] = { uid, username: username.trim(), hash: await hash(password) };
        localStorage.setItem(accountsKey, JSON.stringify(all));
        sessionStorage.setItem(sessionKey, uid);
        announce();
      },
      async signOut() {
        sessionStorage.removeItem(sessionKey);
        announce();
      },
      async changePassword(currentPassword, next) {
        const me = current();
        const all = accounts();
        const entry = Object.entries(all).find(([, a]) => a.uid === me?.uid);
        if (!entry) throw new AuthError("Not signed in");
        if (entry[1].hash !== (await hash(currentPassword))) throw new AuthError("Wrong name or password");
        if (next.length < MIN_PASSWORD) throw new AuthError(`The password needs at least ${MIN_PASSWORD} characters`);
        all[entry[0]] = { ...entry[1], hash: await hash(next) };
        localStorage.setItem(accountsKey, JSON.stringify(all));
      },
    },
    async connect(onDoc) {
      for (const key of DOC_KEYS) onDoc(key, read(key));
      channel.onmessage = (e: MessageEvent<{ key?: DocKey; player?: string; roles?: true }>) => {
        if (e.data.key) onDoc(e.data.key, read(e.data.key));
        if (e.data.player) notifyPlayers();
        if (e.data.roles) notifyRoles();
      };
    },
    async save(key, value) {
      localStorage.setItem(storageKey(key), JSON.stringify(value));
      channel.postMessage({ key });
    },
    watchPlayers(onDocs) {
      playerWatchers.add(onDocs);
      queueMicrotask(() => onDocs(allPlayers()));
      return () => playerWatchers.delete(onDocs);
    },
    async savePlayer(id, value) {
      localStorage.setItem(playerKey(id), JSON.stringify(value));
      // Like Firestore: this page's own watchers hear the write too.
      notifyPlayers();
      channel.postMessage({ player: id });
    },
    async deletePlayer(id) {
      localStorage.removeItem(playerKey(id));
      notifyPlayers();
      channel.postMessage({ player: id });
    },
    watchRoles(onDms) {
      roleWatchers.add(onDms);
      queueMicrotask(() => onDms(roles()));
      return () => roleWatchers.delete(onDms);
    },
    async saveRoles(uids) {
      localStorage.setItem(rolesKey, JSON.stringify({ uids }));
      notifyRoles();
      channel.postMessage({ roles: true });
    },
    disconnect() {
      channel.onmessage = null;
    },
  };
}
