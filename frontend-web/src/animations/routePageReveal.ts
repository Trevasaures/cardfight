import { stagger } from "animejs";
import {
  cleanupAnimation,
  prefersReducedMotion,
  runAnimation,
  type AnimationHandle,
} from "./motion";

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
