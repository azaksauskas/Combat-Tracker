import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getDoc, getFirestore, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import type { DocKey } from "../domain/types";
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

const KEYS: DocKey[] = ["combat", "library", "notes"];

export function createFirestoreAdapter(appId: string): SyncAdapter {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Stays under the same public path as the original app so existing
  // security rules keep working.
  const base = ["artifacts", appId, "public", "data"] as const;
  const ref = (key: DocKey) => doc(db, ...base, "tracker", key);
  let unsubs: Unsubscribe[] = [];

  return {
    async connect(onDoc, onError) {
      await signInAnonymously(auth);
      unsubs = KEYS.map((key) =>
        onSnapshot(
          ref(key),
          (snap) => onDoc(key, snap.exists() ? snap.data() : null),
          onError,
        ),
      );
    },
    async save(key, value) {
      await setDoc(ref(key), value);
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
