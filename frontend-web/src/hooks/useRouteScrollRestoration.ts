import { useLayoutEffect, type RefObject } from "react";
import { readScrollPosition, writeScrollPosition } from "../utils/viewState";

export function useRouteScrollRestoration(
  pathname: string,
  rootRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const key = `cardfight.scroll.route:${pathname}`;
    const target = readScrollPosition(key);
    let position = target;
    let restoring = true;
    let frame = 0;

    const stopRestoring = () => {
      restoring = false;
      observer.disconnect();
      position = window.scrollY;
    };
    const restore = () => {
      if (!restoring) return;
      window.scrollTo({ top: target, left: 0, behavior: "instant" });
      if (Math.abs(window.scrollY - target) < 2) stopRestoring();
    };
    // Lists arrive asynchronously. Retry on layout changes, never in a polling loop.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    if (rootRef.current) observer.observe(rootRef.current);
    frame = requestAnimationFrame(restore);
    const timeout = window.setTimeout(stopRestoring, 5000);
    const save = () => {
      if (!restoring) position = window.scrollY;
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("wheel", stopRestoring, { passive: true });
    window.addEventListener("touchstart", stopRestoring, { passive: true });
    window.addEventListener("pointerdown", stopRestoring);
    return () => {
      writeScrollPosition(key, position);
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", save);
      window.removeEventListener("wheel", stopRestoring);
      window.removeEventListener("touchstart", stopRestoring);
      window.removeEventListener("pointerdown", stopRestoring);
    };
  }, [pathname, rootRef]);
}
