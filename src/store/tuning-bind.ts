import { setTuning } from "../game/tuning";
import { useGame } from "./game";

/** Applies the DM's balance settings from the synced library as soon as they arrive or change. */
let last: unknown = undefined;
useGame.subscribe((s) => {
  if (s.library.tuning === last) return;
  last = s.library.tuning;
  setTuning(s.library.tuning);
});
setTuning(useGame.getState().library.tuning);
