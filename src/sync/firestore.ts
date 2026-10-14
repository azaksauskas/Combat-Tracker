import { initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { DOC_KEYS, type DocKey } from "../domain/types";
import { AuthError, MIN_PASSWORD, usernameToEmail, type Account, type SyncAdapter } from "./adapter";

const env = import.meta.env;

// Firebase web config is public by design; access is governed by Firestore
// security rules (firestore.rules). Override via VITE_FIREBASE_* (see .env.example).
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyCzPeM7LPRtRx-ptHA0T2XqYXuRuoPIYuc",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "dnd-combat-b3441.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "dnd-combat-b3441",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "dnd-combat-b3441.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "735138870990",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:735138870990:web:2991e9e1f9608018d5c29f",
};

/** Firebase's error codes, in words a player understands. */
function friendly(err: unknown): Error {
  const code = (err as { code?: string }).code ?? "";
  const words: Record<string, string> = {
    "auth/invalid-credential": "Wrong name or password",
    "auth/wrong-password": "Wrong name or password",
    "auth/user-not-found": "Wrong name or password",
    "auth/invalid-email": "That name can't be used",
    "auth/email-already-in-use": "That name is taken. Sign in instead, or pick another",
    "auth/weak-password": `The password needs at least ${MIN_PASSWORD} characters`,
    "auth/too-many-requests": "Too many tries. Wait a minute and try again",
    "auth/network-request-failed": "No connection to the server",
    "auth/operation-not-allowed": "Name-and-password sign-in is switched off in Firebase (Authentication → Sign-in method → Email/Password)",
    "auth/requires-recent-login": "Sign out and in again, then try once more",
  };
  return words[code] ? new AuthError(words[code]) : err instanceof Error ? err : new Error(String(err));
}

export function createFirestoreAdapter(appId: string): SyncAdapter {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Optional fields left undefined (a settler back to choosing their own job,
  // a notice taken down…) are simply not stored, as JSON would do.
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  // Stays under the same public path as the original app.
  const base = ["artifacts", appId, "public", "data"] as const;
  const ref = (key: DocKey) => doc(db, ...base, "tracker", key);
  const playerRef = (id: string) => doc(db, ...base, "players", id);
  const rolesRef = doc(db, ...base, "roles", "dm");
  let unsubs: Unsubscribe[] = [];
  const listeners = new Set<(a: Account | null) => void>();

  const account = (): Account | null => {
    const u = auth.currentUser;
    if (!u || u.isAnonymous) return null;
    return { uid: u.uid, username: u.displayName || (u.email ?? "").split("@")[0] || "Player" };
  };

  return {
    auth: {
      onAccount(cb) {
        listeners.add(cb);
        const stop = onAuthStateChanged(auth, (u) => {
          // The app used to sign in anonymously; those sessions don't count.
          if (u?.isAnonymous) {
            void signOut(auth);
            return;
          }
          cb(account());
        });
        return () => {
          listeners.delete(cb);
          stop();
        };
      },
      async signIn(username, password) {
        try {
          await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
        } catch (err) {
          throw friendly(err);
        }
      },
      async signUp(username, password) {
        if (password.length < MIN_PASSWORD) throw new AuthError(`The password needs at least ${MIN_PASSWORD} characters`);
        try {
          const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
          await updateProfile(cred.user, { displayName: username.trim() });
          // The sign-in was announced before the name was set: announce it again.
          listeners.forEach((cb) => cb(account()));
        } catch (err) {
          throw friendly(err);
        }
      },
      async signOut() {
        await signOut(auth);
      },
      async changePassword(current, next) {
        const u = auth.currentUser;
        if (!u?.email) throw new AuthError("Not signed in");
        if (next.length < MIN_PASSWORD) throw new AuthError(`The password needs at least ${MIN_PASSWORD} characters`);
        try {
          await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
          await updatePassword(u, next);
        } catch (err) {
          throw friendly(err);
        }
      },
    },
    async connect(onDoc, onError) {
      unsubs = DOC_KEYS.map((key) =>
        onSnapshot(
          ref(key),
          (snap) => onDoc(key, snap.exists() ? snap.data() : null),
          (err) => {
            // The old player directory is optional: without it, there's just nothing to claim.
            if (key === "players") {
              console.warn("Old player directory unavailable", err);
              onDoc(key, null);
            } else onError(err);
          },
        ),
      );
    },
    async save(key, value) {
      await setDoc(ref(key), value);
    },
    watchPlayers(onDocs, onError) {
      const stop = onSnapshot(
        collection(db, ...base, "players"),
        (snap) => onDocs(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))),
        onError,
      );
      unsubs.push(stop);
      return stop;
    },
    async savePlayer(id, value) {
      await setDoc(playerRef(id), value);
    },
    async deletePlayer(id) {
      await deleteDoc(playerRef(id));
    },
    watchRoles(onDms, onError) {
      const stop = onSnapshot(
        rolesRef,
        (snap) => {
          const uids = snap.exists() ? (snap.data().uids as unknown) : [];
          onDms(Array.isArray(uids) ? uids.filter((x): x is string => typeof x === "string") : []);
        },
        onError,
      );
      unsubs.push(stop);
      return stop;
    },
    async saveRoles(uids) {
      await setDoc(rolesRef, { uids });
    },
    async loadLegacy() {
      const snap = await getDoc(doc(db, ...base, "encounter", "state"));
      return snap.exists() ? snap.data() : null;
    },
    disconnect() {
      unsubs.forEach((u) => u());
      unsubs = [];
    },
  };
}
