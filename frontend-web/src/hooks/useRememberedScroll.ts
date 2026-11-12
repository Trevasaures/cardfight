import { useLayoutEffect, useRef } from "react";
import { useWorkspace } from "../features/auth/workspaceContext";

export function useRememberedScroll<T extends HTMLElement>(
  storageKey: string,
  ready = true,
) {
  const { storage } = useWorkspace();
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !ready) return;
    element.scrollTop = storage.readScroll(storageKey);
    const save = () => storage.writeScroll(storageKey, element.scrollTop);
    element.addEventListener("scroll", save, { passive: true });
    return () => {
      // The incoming list may already have clamped this element's scrollTop.
      // Keep the offset captured by scroll events for the outgoing view.
      element.removeEventListener("scroll", save);
    };
  }, [storage, storageKey, ready]);
  return ref;
}
