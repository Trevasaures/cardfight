import { useEffect, type RefObject } from "react";

import { animatePerformanceSpotlight } from "./performanceSpotlightMotion";

export function usePerformanceSpotlightMotion(
  rootRef: RefObject<HTMLElement | null>,
  deckId: number | null,
  winPercentage: number,
) {
  useEffect(() => {
    return animatePerformanceSpotlight(rootRef.current, winPercentage);
  }, [deckId, rootRef, winPercentage]);
}
