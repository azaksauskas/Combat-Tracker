import { produce, type Draft } from "immer";
import { useEffect, useRef, useState } from "react";
import { update } from "./game";
import type { LibraryDoc } from "../domain/types";

type Collection = "adventures" | "maps";
type Item<K extends Collection> = LibraryDoc[K][number];

/**
 * Edits one library item (an adventure, a map) as a local draft and saves it
 * half a second after the last change, so typing doesn't write on every key.
 */
export function useLibraryDraft<K extends Collection>(collection: K, saved: Item<K>) {
  const [draft, setDraft] = useState(saved);
  const pending = useRef<Item<K> | null>(null);
  const flush = () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    update("library", (d) => {
      const list = d[collection] as unknown as Item<K>[];
      const i = list.findIndex((a) => a.id === next.id);
      if (i >= 0) list[i] = next;
    });
  };
  useEffect(() => {
    if (draft === saved) return;
    pending.current = draft;
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
  }, [draft]);
  // Save whatever is left when leaving the editor.
  useEffect(() => flush, []);
  const edit = (recipe: (d: Draft<Item<K>>) => void) => setDraft((a) => produce(a, recipe));
  return { draft, setDraft, edit, flush };
}
