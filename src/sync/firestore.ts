import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { deleteDoc, doc, getDoc, getFirestore, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { DOC_KEYS, type DocKey } from "../domain/types";
import type { SyncAdapter } from "./adapter";

const env = import.meta.env;

// Firebase web config is public by design; access is governed by Firestore
// security rules. Override via VITE_FIREBASE_* (see .env.example).
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyCzPeM7LPRtRx-ptHA0T2XqYXuRuoPIYuc",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "dnd-combat-b3441.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "dnd-combat-b3441",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "dnd-combat-b3441.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "735138870990",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:735138870990:web:2991e9e1f9608018d5c29f",
};

export function createFirestoreAdapter(appId: string): SyncAdapter {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Stays under the same public path as the original app so existing
  // security rules keep working.
  const base = ["artifacts", appId, "public", "data"] as const;
  const ref = (key: DocKey) => doc(db, ...base, "tracker", key);
  // One document per player, so security rules can later give each player
  // their own (see firestore.rules.draft).
  const playerRef = (id: string) => doc(db, ...base, "players", id);
  let unsubs: Unsubscribe[] = [];

  return {
    async connect(onDoc, onError) {
      await signInAnonymously(auth);
      unsubs = DOC_KEYS.map((key) =>
        onSnapshot(
          ref(key),
          (snap) => onDoc(key, snap.exists() ? snap.data() : null),
          (err) => {
            // The game's player directory is newer than the tracker: if the
            // project's rules don't allow it yet, keep the tracker working.
            if (key === "players") {
              console.warn("Player profiles unavailable", err);
              onDoc(key, null);
            } else onError(err);
          },
        ),
      );
    },
    async save(key, value) {
      await setDoc(ref(key), value);
    },
    watchPlayer(id, onDoc, onError) {
      return onSnapshot(playerRef(id), (snap) => onDoc(snap.exists() ? snap.data() : null), onError);
    },
    async savePlayer(id, value) {
      await setDoc(playerRef(id), value);
    },
    async deletePlayer(id) {
      await deleteDoc(playerRef(id));
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
