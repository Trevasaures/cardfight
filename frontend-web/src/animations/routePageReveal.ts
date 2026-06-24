import { animate, stagger } from "animejs";

type AnimationHandle = {
  cancel?: () => unknown;
  revert?: () => unknown;
};

type AnimationParams = Record<string, unknown>;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function cleanupAnimation(handle: AnimationHandle) {
  if (typeof handle.revert === "function") {
    handle.revert();
    return;
  }

  if (typeof handle.cancel === "function") {
    handle.cancel();
  }
}

function runAnimation(
  targets: Element | NodeListOf<Element> | null,
  params: AnimationParams,
  handles: AnimationHandle[],
) {
  if (!targets) return;
  if (targets instanceof NodeList && targets.length === 0) return;

  const handle = animate(targets as never, params as never) as AnimationHandle;
  handles.push(handle);
}

export function animateRoutePage(root: HTMLElement | null) {
  if (!root || prefersReducedMotion()) {
    return () => {};
  }

  const handles: AnimationHandle[] = [];

  const pageHeader = root.querySelector("[data-anime='page-header']");
  const motionCards = root.querySelectorAll("[data-anime='motion-card']");
  const motionPanels = root.querySelectorAll("[data-anime='motion-panel']");

  runAnimation(
    root,
    {
      opacity: [0, 1],
      y: [10, 0],
      duration: 340,
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    pageHeader,
    {
      opacity: [0, 1],
      y: [14, 0],
      duration: 420,
      delay: 60,
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    motionPanels,
    {
      opacity: [0, 1],
      y: [18, 0],
      duration: 600,
      delay: stagger(45, { start: 120 }),
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    motionCards,
    {
      opacity: [0, 1],
      y: [22, 0],
      scale: [0.985, 1],
      duration: 600,
      delay: stagger(55, { start: 160 }),
      ease: "out(3)",
    },
    handles,
  );

  return () => {
    handles.forEach(cleanupAnimation);
  };
}