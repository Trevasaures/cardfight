import { useEffect, type RefObject } from "react";

import { animateRoutePage } from "./routePageReveal";

export function useRoutePageReveal(
  rootRef: RefObject<HTMLElement | null>,
  trigger: string,
) {
  useEffect(() => {
    const cleanup = animateRoutePage(rootRef.current);

    return () => {
      cleanup();
    };
  }, [rootRef, trigger]);
}