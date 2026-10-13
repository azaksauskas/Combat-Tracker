import { AdventureEditorView } from "./views/AdventureEditorView";
import { MapsView } from "./views/MapsView";
import { PlayersView } from "./views/PlayersView";
import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { DmLayout, PlayerLayout } from "./components/Layout";
import { useUi } from "./store/ui";
import { PlayerView } from "./views/PlayerView";

// DM screens pull in the rich text editor and drag & drop; players never load them.
const BattleOrderView = lazy(() => import("./views/BattleOrderView").then((m) => ({ default: m.BattleOrderView })));
const EncountersView = lazy(() => import("./views/EncountersView").then((m) => ({ default: m.EncountersView })));
const CampaignView = lazy(() => import("./views/CampaignView").then((m) => ({ default: m.CampaignView })));
const PlayView = lazy(() => import("./views/PlayView").then((m) => ({ default: m.PlayView })));
const RulesView = lazy(() => import("./views/RulesView").then((m) => ({ default: m.RulesView })));

export function App() {
  const theme = useUi((s) => s.theme);
  return (
    <HashRouter>
      <Suspense fallback={null}>
      <Routes>
        <Route element={<PlayerLayout />}>
          <Route index element={<PlayerView />} />
        </Route>
        <Route element={<DmLayout />}>
          <Route path="admin" element={<BattleOrderView />} />
          <Route path="encounters" element={<EncountersView />} />
          <Route path="campaign" element={<CampaignView />} />
          <Route path="info" element={<RulesView />} />
          <Route path="play" element={<PlayView />} />
          <Route path="adventures" element={<AdventureEditorView />} />
          <Route path="maps" element={<MapsView />} />
          <Route path="players" element={<PlayersView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <Toaster theme={theme} position="bottom-center" richColors />
    </HashRouter>
  );
}
