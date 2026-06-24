import { useEffect, type RefObject } from "react";

import { animatePlayLabReveal } from "./playLabReveal";

export function usePlayLabReveal(
  rootRef: RefObject<HTMLElement | null>,
  trigger: number,
) {
  useEffect(() => {
    if (!trigger) return;

    const cleanup = animatePlayLabReveal(rootRef.current);

    return () => {
      cleanup();
    };
  }, [rootRef, trigger]);
}