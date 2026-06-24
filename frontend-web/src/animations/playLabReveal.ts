import { animate } from "animejs";

type AnimationHandle = {
  cancel?: () => unknown;
  revert?: () => unknown;
};

type AnimationTarget = Element | NodeListOf<Element> | null;
type AnimationParams = Record<string, unknown>;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function hasTargets(targets: AnimationTarget) {
  if (!targets) return false;
  if (targets instanceof NodeList) return targets.length > 0;
  return true;
}

function runAnimation(
  targets: AnimationTarget,
  params: AnimationParams,
  handles: AnimationHandle[],
) {
  if (!hasTargets(targets)) return;

  const handle = animate(targets as never, params as never) as AnimationHandle;
  handles.push(handle);
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

export function animatePlayLabReveal(root: HTMLElement | null) {
  if (!root || prefersReducedMotion()) {
    return () => {};
  }

  const handles: AnimationHandle[] = [];

  const deckLeft = root.querySelector("[data-anime='deck-left']");
  const deckRight = root.querySelector("[data-anime='deck-right']");
  const versusBadge = root.querySelector("[data-anime='vs-badge']");
  const nationIcons = root.querySelectorAll("[data-anime='nation-icon']");
  const controlPanels = root.querySelectorAll("[data-anime='match-control-panel']");
  const notesPanel = root.querySelector("[data-anime='notes-panel']");

  runAnimation(
    deckLeft,
    {
      opacity: [0, 1],
      x: [-48, 0],
      scale: [0.96, 1],
      duration: 720,
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    deckRight,
    {
      opacity: [0, 1],
      x: [48, 0],
      scale: [0.96, 1],
      duration: 720,
      delay: 80,
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    versusBadge,
    {
      opacity: [0, 1],
      scale: [0.45, 1.16, 1],
      rotate: [-10, 0],
      duration: 720,
      delay: 120,
      ease: "out(4)",
    },
    handles,
  );

  runAnimation(
    nationIcons,
    {
      scale: [0.72, 1.18, 1],
      rotate: [-5, 5, 0],
      duration: 720,
      delay: 180,
      ease: "out(4)",
    },
    handles,
  );

  runAnimation(
    controlPanels,
    {
      opacity: [0, 1],
      y: [20, 0],
      duration: 600,
      delay: 340,
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    notesPanel,
    {
      opacity: [0, 1],
      y: [18, 0],
      duration: 600,
      delay: 420,
      ease: "out(3)",
    },
    handles,
  );

  return () => {
    handles.forEach(cleanupAnimation);
  };
}