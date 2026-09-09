import { animate, createTimeline, stagger } from "animejs";

type AnimationHandle = {
  cancel?: () => unknown;
  revert?: () => unknown;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cleanup(handle: AnimationHandle | null) {
  if (!handle) return;
  if (typeof handle.revert === "function") {
    handle.revert();
    return;
  }
  handle.cancel?.();
}

export function animateCommandCenter(root: HTMLElement | null) {
  if (!root || prefersReducedMotion()) return () => {};

  const hero = root.querySelector("[data-command='hero']");
  const heroItems = root.querySelectorAll("[data-command='hero-item']");
  const resumeCards = root.querySelectorAll("[data-command='resume']");
  const panels = root.querySelectorAll("[data-command='panel']");
  const attention = root.querySelectorAll("[data-command='attention']");
  const activity = root.querySelectorAll("[data-command='activity']");
  const glow = root.querySelector("[data-command='glow']");
  const pulse = root.querySelector("[data-command='pulse']");

  const timeline = createTimeline({ defaults: { ease: "out(4)" } });

  if (hero) {
    timeline.add(hero, { opacity: [0, 1], scale: [0.985, 1], duration: 620 }, 0);
  }
  if (heroItems.length) {
    timeline.add(
      heroItems,
      { opacity: [0, 1], y: [18, 0], duration: 520, delay: stagger(65) },
      100,
    );
  }
  if (resumeCards.length) {
    timeline.add(
      resumeCards,
      { opacity: [0, 1], y: [18, 0], scale: [0.98, 1], duration: 520, delay: stagger(70) },
      250,
    );
  }
  if (panels.length) {
    timeline.add(
      panels,
      { opacity: [0, 1], y: [22, 0], duration: 590, delay: stagger(80) },
      380,
    );
  }
  if (attention.length) {
    timeline.add(
      attention,
      { opacity: [0, 1], x: [14, 0], duration: 470, delay: stagger(55) },
      520,
    );
  }
  if (activity.length) {
    timeline.add(
      activity,
      { opacity: [0, 1], x: [12, 0], duration: 440, delay: stagger(45) },
      620,
    );
  }

  const glowAnimation = glow
    ? (animate(glow, {
        x: [-10, 12],
        y: [8, -10],
        scale: [0.98, 1.05],
        duration: 5600,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      }) as AnimationHandle)
    : null;
  const pulseAnimation = pulse
    ? (animate(pulse, {
        opacity: [0.35, 0.85],
        scale: [0.85, 1.45],
        duration: 1500,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      }) as AnimationHandle)
    : null;

  return () => {
    cleanup(timeline as AnimationHandle);
    cleanup(glowAnimation);
    cleanup(pulseAnimation);
  };
}
