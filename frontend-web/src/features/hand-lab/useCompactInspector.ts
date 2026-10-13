import { useEffect, useState, type RefObject } from "react";

const INSPECTOR_WIDTH = 1000;

/** Measure the table, not the window: collapsing navigation can make enough room
 * for a side inspector without changing the browser viewport. This matches the
 * tabletop CSS container query and never mounts two card-detail instances. */
export function useCompactInspector(root: RefObject<HTMLElement | null>) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      // contentRect excludes padding, matching the CSS query's content-box size.
      setCompact(entry.contentRect.width <= INSPECTOR_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);
  return compact;
}
