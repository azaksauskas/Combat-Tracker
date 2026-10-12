import { useEffect, useRef, useState } from "react";
import { saveCampaignNotes } from "../store/actions";
import { useGame } from "../store/game";

export function CampaignView() {
  const remote = useGame((s) => s.notes.campaign);
  const [text, setText] = useState(remote);
  const dirty = useRef(false);

  // Take remote edits unless the user is mid-edit here.
  useEffect(() => {
    if (!dirty.current) setText(remote);
  }, [remote]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      saveCampaignNotes(text);
      dirty.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="mb-4 text-3xl font-bold text-accent">Campaign notes</h2>
      <textarea
        className="h-[70vh] w-full p-4 leading-relaxed"
        aria-label="Campaign notes"
        value={text}
        onChange={(e) => {
          dirty.current = true;
          setText(e.target.value);
        }}
      />
      <p className="mt-1 text-xs text-faint">Saved automatically and shared with every DM screen.</p>
    </div>
  );
}
