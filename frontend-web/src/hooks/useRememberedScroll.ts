import { useLayoutEffect, useRef } from "react";
import { readScrollPosition, writeScrollPosition } from "../utils/viewState";

export function useRememberedScroll<T extends HTMLElement>(
  storageKey: string,
  ready = true,
) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !ready) return;
    element.scrollTop = readScrollPosition(storageKey);
    const save = () => writeScrollPosition(storageKey, element.scrollTop);
    element.addEventListener("scroll", save, { passive: true });
    return () => {
      // The incoming list may already have clamped this element's scrollTop.
      // Keep the offset captured by scroll events for the outgoing view.
      element.removeEventListener("scroll", save);
    };
  }, [storageKey, ready]);
  return ref;
}
