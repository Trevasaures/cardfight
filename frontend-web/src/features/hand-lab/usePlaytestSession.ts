import { useMemo, useState } from "react";
import type { DeckVersion } from "../../types/api";
import type { TableCard } from "./playtest";
import {
  playtestSource,
  playtestStore,
  type PlaytestHistory,
  type PlaytestState,
} from "./sessionStore";

/** Persist committed game changes while keeping selection and drag updates transient. */
export function usePlaytestSession(
  version: DeckVersion,
  copies: readonly TableCard[],
) {
  const source = useMemo(() => playtestSource(version), [version]);
  const [restored] = useState(() => playtestStore.restore(source, copies));
  const [state, setState] = useState<PlaytestState>(
    () =>
      restored.state ?? {
        history: { past: [], present: null },
        starterKey: null,
      },
  );
  const [backedUp, setBackedUp] = useState(restored.backedUp);
  const [notice, setNotice] = useState(restored.notice);

  function saveHistory(
    history: PlaytestHistory,
    starterKey = state.starterKey,
  ) {
    const next = { history, starterKey };
    // Save immediately so clicking a route or refreshing cannot race a delayed effect.
    setBackedUp(playtestStore.save(source, next));
    setState(next);
    setNotice("");
  }

  return {
    history: state.history,
    savedStarterKey: state.starterKey,
    backedUp,
    notice,
    saveHistory,
  };
}
