import { animate, createTimeline, stagger } from "animejs";

type AnimationHandle = {
  cancel?: () => unknown;
  revert?: () => unknown;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function cleanup(handle: AnimationHandle | null) {
  if (!handle) return;
  if (typeof handle.revert === "function") {
    handle.revert();
    return;
  }
  handle.cancel?.();
}

export function animatePerformanceSpotlight(
  root: HTMLElement | null,
  winPercentage: number,
) {
  if (!root || prefersReducedMotion()) return () => {};

  const hero = root.querySelector("[data-spotlight='hero']");
  const identity = root.querySelectorAll("[data-spotlight='identity']");
  const metrics = root.querySelectorAll("[data-spotlight='metric']");
  const panels = root.querySelectorAll("[data-spotlight='panel']");
  const results = root.querySelectorAll("[data-spotlight='result']");
  const insights = root.querySelectorAll("[data-spotlight='insight']");
  const ring = root.querySelector<SVGCircleElement>("[data-spotlight-ring]");
  const glow = root.querySelector("[data-spotlight='glow']");
  const targetOffset = 100 - Math.max(0, Math.min(winPercentage, 100));

  const timeline = createTimeline({
    defaults: {
      ease: "out(4)",
    },
  });

  if (hero) {
    timeline.add(
      hero,
      {
        opacity: [0, 1],
        scale: [0.985, 1],
        duration: 650,
      },
      0,
    );
  }

  if (identity.length) {
    timeline.add(
      identity,
      {
        opacity: [0, 1],
        y: [18, 0],
        duration: 560,
        delay: stagger(65),
      },
      100,
    );
  }

  if (ring) {
    timeline.add(
      ring,
      {
        strokeDashoffset: [100, targetOffset],
        duration: 1250,
        ease: "inOut(3)",
      },
      180,
    );
  }

  if (metrics.length) {
    timeline.add(
      metrics,
      {
        opacity: [0, 1],
        y: [16, 0],
        scale: [0.97, 1],
        duration: 520,
        delay: stagger(55),
      },
      260,
    );
  }

  if (panels.length) {
    timeline.add(
      panels,
      {
        opacity: [0, 1],
        y: [22, 0],
        duration: 620,
        delay: stagger(70),
      },
      400,
    );
  }

  if (results.length) {
    timeline.add(
      results,
      {
        opacity: [0, 1],
        scale: [0.72, 1],
        duration: 420,
        delay: stagger(48),
      },
      560,
    );
  }

  if (insights.length) {
    timeline.add(
      insights,
      {
        opacity: [0, 1],
        x: [18, 0],
        duration: 520,
        delay: stagger(70),
      },
      650,
    );
  }

  const glowAnimation = glow
    ? (animate(glow, {
        x: [-8, 10],
        y: [5, -7],
        scale: [0.98, 1.04],
        duration: 5200,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      }) as AnimationHandle)
    : null;

  return () => {
    cleanup(timeline as AnimationHandle);
    cleanup(glowAnimation);
  };
}
