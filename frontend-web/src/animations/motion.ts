import { animate, type AnimationParams } from "animejs";

export type AnimationHandle = {
  cancel?: () => unknown;
  revert?: () => unknown;
};

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Revert restores inline styles as well as stopping work when a page unmounts. */
export function cleanupAnimation(handle: AnimationHandle | null) {
  if (!handle) return;
  if (typeof handle.revert === "function") {
    handle.revert();
  } else {
    handle.cancel?.();
  }
}

export function runAnimation(
  targets: Element | NodeListOf<Element> | null,
  params: AnimationParams,
  handles: AnimationHandle[],
) {
  if (!targets) return;
  if (targets instanceof NodeList && targets.length === 0) return;

  handles.push(animate(targets, params));
}
