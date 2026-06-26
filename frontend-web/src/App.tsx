import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { Analytics } from "./pages/Analytics";
import { Dashboard } from "./pages/Dashboard";
import { DeckBuilder } from "./pages/DeckBuilder";
import { DeckLibrary } from "./pages/DeckLibrary";
import { MatchHistory } from "./pages/MatchHistory";
import { PlayLab } from "./pages/PlayLab";
import { Rivalries } from "./pages/Rivalries";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/play" element={<PlayLab />} />
        <Route path="/decks" element={<DeckLibrary />} />
        <Route path="/deck-builder" element={<DeckBuilder />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/rivalries" element={<Rivalries />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}