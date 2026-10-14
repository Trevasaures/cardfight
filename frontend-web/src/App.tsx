import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { Dashboard } from "./pages/Dashboard";

// Keep the landing page immediate; download other workspaces only when opened.
const PlayLab = lazy(() =>
  import("./pages/PlayLab").then(({ PlayLab }) => ({ default: PlayLab })),
);
const DeckLibrary = lazy(() =>
  import("./pages/DeckLibrary").then(({ DeckLibrary }) => ({ default: DeckLibrary })),
);
const CardLibrary = lazy(() =>
  import("./pages/CardLibrary").then(({ CardLibrary }) => ({ default: CardLibrary })),
);
const DeckBuilder = lazy(() =>
  import("./pages/DeckBuilder").then(({ DeckBuilder }) => ({ default: DeckBuilder })),
);
const NationQuiz = lazy(() =>
  import("./pages/NationQuiz").then(({ NationQuiz }) => ({ default: NationQuiz })),
);
const MatchHistory = lazy(() =>
  import("./pages/MatchHistory").then(({ MatchHistory }) => ({ default: MatchHistory })),
);
const OrderTracker = lazy(() =>
  import("./pages/OrderTracker").then(({ OrderTracker }) => ({ default: OrderTracker })),
);
const Analytics = lazy(() =>
  import("./pages/Analytics").then(({ Analytics }) => ({ default: Analytics })),
);
const Rivalries = lazy(() =>
  import("./pages/Rivalries").then(({ Rivalries }) => ({ default: Rivalries })),
);
const HandLab = lazy(() =>
  import("./pages/HandLab").then(({ HandLab }) => ({ default: HandLab })),
);

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/play" element={<PlayLab />} />
        <Route path="/hand-lab" element={<HandLab />} />
        <Route path="/decks" element={<DeckLibrary />} />
        <Route path="/cards" element={<CardLibrary />} />
        <Route path="/deck-builder" element={<DeckBuilder />} />
        <Route path="/order-tracker" element={<OrderTracker />} />
        <Route path="/nation-quiz" element={<NationQuiz />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/rivalries" element={<Rivalries />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
