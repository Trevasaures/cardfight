import { useEffect, type RefObject } from "react";

import { animateCommandCenter } from "./commandCenterMotion";

export function useCommandCenterMotion(
  rootRef: RefObject<HTMLElement | null>,
  ready: boolean,
) {
  useEffect(() => {
    if (!ready) return;
    return animateCommandCenter(rootRef.current);
  }, [ready, rootRef]);
}
