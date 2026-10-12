import type { SyncAdapter } from "./adapter";

export type { SyncAdapter };

/** Backends are loaded lazily so local mode never downloads the Firebase SDK. */
export async function createSyncAdapter(): Promise<SyncAdapter> {
  const appId = import.meta.env.VITE_APP_ID ?? "default-dnd-app-id";
  if (import.meta.env.VITE_SYNC_BACKEND === "local") {
    const { createLocalAdapter } = await import("./local");
    return createLocalAdapter(appId);
  }
  const { createFirestoreAdapter } = await import("./firestore");
  return createFirestoreAdapter(appId);
}
