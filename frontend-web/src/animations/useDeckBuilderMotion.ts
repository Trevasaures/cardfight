import { useEffect, type RefObject } from "react";

import { animateDeckBuilderMotion } from "./deckBuilderMotion";

export function useDeckBuilderMotion(
  rootRef: RefObject<HTMLElement | null>,
  trigger: string,
) {
  useEffect(() => {
    if (!trigger) return;

    const cleanup = animateDeckBuilderMotion(rootRef.current);

    return () => {
      cleanup();
    };
  }, [rootRef, trigger]);
}