import { AdventureEditorView } from "./views/AdventureEditorView";
import { MapsView } from "./views/MapsView";
import { PlayersView } from "./views/PlayersView";
import { FactionsView } from "./views/FactionsView";
import { BalanceView } from "./views/BalanceView";
import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { DmLayout, DmOnly, PlayerLayout } from "./components/Layout";
import { AuthGate } from "./components/SignIn";
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
      <AuthGate>
      <Suspense fallback={null}>
      <Routes>
        <Route element={<PlayerLayout />}>
          <Route index element={<PlayerView />} />
        </Route>
        <Route element={<DmLayout />}>
          <Route path="admin" element={<DmOnly><BattleOrderView /></DmOnly>} />
          <Route path="encounters" element={<DmOnly><EncountersView /></DmOnly>} />
          <Route path="campaign" element={<DmOnly><CampaignView /></DmOnly>} />
          <Route path="info" element={<DmOnly><RulesView /></DmOnly>} />
          <Route path="play" element={<PlayView />} />
          <Route path="adventures" element={<DmOnly><AdventureEditorView /></DmOnly>} />
          <Route path="maps" element={<DmOnly><MapsView /></DmOnly>} />
          <Route path="players" element={<DmOnly><PlayersView /></DmOnly>} />
          <Route path="factions" element={<DmOnly><FactionsView /></DmOnly>} />
          <Route path="balance" element={<DmOnly><BalanceView /></DmOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </AuthGate>
      <Toaster theme={theme} position="bottom-center" richColors />
    </HashRouter>
  );
}
