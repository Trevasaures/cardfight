import { stagger } from "animejs";
import {
  cleanupAnimation,
  prefersReducedMotion,
  runAnimation,
  type AnimationHandle,
} from "./motion";

export function animateDeckBuilderMotion(root: HTMLElement | null) {
  if (!root || prefersReducedMotion()) {
    return () => {};
  }

  const handles: AnimationHandle[] = [];

  const stats = root.querySelectorAll("[data-builder-anime='stat']");
  const searchResults = root.querySelectorAll("[data-builder-anime='card-result']");
  const zoneSections = root.querySelectorAll("[data-builder-anime='zone']");
  const deckEntries = root.querySelectorAll("[data-builder-anime='deck-entry']");

  runAnimation(
    stats,
    {
      opacity: [0, 1],
      y: [8, 0],
      duration: 260,
      delay: stagger(35),
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    searchResults,
    {
      opacity: [0, 1],
      y: [12, 0],
      scale: [0.985, 1],
      duration: 320,
      delay: stagger(35),
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    zoneSections,
    {
      opacity: [0, 1],
      y: [14, 0],
      duration: 320,
      delay: stagger(45),
      ease: "out(3)",
    },
    handles,
  );

  runAnimation(
    deckEntries,
    {
      opacity: [0, 1],
      x: [18, 0],
      scale: [0.985, 1],
      duration: 360,
      delay: stagger(45),
      ease: "out(3)",
    },
    handles,
  );

  return () => {
    handles.forEach(cleanupAnimation);
  };
}
