import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ZONES, type Zone } from "./playtest";

export type DragView = {
  keys: string[];
  x: number;
  y: number;
  target: Zone | null;
  valid: boolean;
  hidden: boolean;
};
type Options = {
  root: RefObject<HTMLElement | null>;
  canDrop: (keys: string[], zone: Zone) => boolean;
  onDrop: (keys: string[], zone: Zone) => void;
  onCancel: () => void;
};

// Pointer capture keeps a drag alive across cards, scroll containers, and touch input.
// The game state changes only on a valid release; cancelling leaves the table intact.
export function useCardDrag({ root, canDrop, onDrop, onCancel }: Options) {
  const [drag, setDrag] = useState<DragView | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => cleanup.current?.(), []);

  function start(
    event: ReactPointerEvent<HTMLElement>,
    keys: string[],
    hidden = false,
  ) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      !keys.length ||
      cleanup.current
    ) {
      return;
    }
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let x = startX;
    let y = startY;
    let active = false;
    let frame = 0;
    let stopped = false;
    element.setPointerCapture(pointerId);

    function hitZone(): Zone | null {
      // Pointer capture fixes event.target to the source, so hit-test the current position.
      const target = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drop-zone]");
      const zone = target?.dataset.dropZone;
      return target && root.current?.contains(target) && zone && zone in ZONES
        ? (zone as Zone)
        : null;
    }

    function update() {
      const target = hitZone();
      const valid = target !== null && canDrop(keys, target);
      setDrag((previous) =>
        previous?.x === x &&
        previous.y === y &&
        previous.target === target &&
        previous.valid === valid
          ? previous
          : { keys, x, y, target, valid, hidden },
      );
    }

    function scrollFrame() {
      if (stopped) return;
      // Scroll the nearest hand/field/list first, then the page near its viewport edges.
      const scrollable = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drag-scroll]");
      if (scrollable && root.current?.contains(scrollable)) {
        const rect = scrollable.getBoundingClientRect();
        if (scrollable.scrollWidth > scrollable.clientWidth) {
          const dx = x < rect.left + 38 ? -10 : x > rect.right - 38 ? 10 : 0;
          scrollable.scrollLeft += dx;
        }
        if (scrollable.scrollHeight > scrollable.clientHeight) {
          const dy = y < rect.top + 32 ? -8 : y > rect.bottom - 32 ? 8 : 0;
          scrollable.scrollTop += dy;
        }
      }
      if (y < 100) {
        window.scrollBy(0, -Math.min(16, (100 - y) / 4));
      } else if (y > window.innerHeight - 60) {
        window.scrollBy(0, Math.min(16, (y - window.innerHeight + 60) / 4));
      }
      // Scrolling can change the drop target even when the pointer has not moved.
      update();
      frame = requestAnimationFrame(scrollFrame);
    }

    function stop() {
      // All exit paths share teardown; releasing capture can itself raise another event.
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      element.removeEventListener("lostpointercapture", cancelPointer);
      cleanup.current = null;
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    }

    function cancel() {
      stop();
      if (active) {
        suppressClick.current = true;
        onCancel();
      }
      setDrag(null);
    }

    function cancelPointer(event: PointerEvent) {
      if (event.pointerId === pointerId) cancel();
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    }

    function move(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      x = event.clientX;
      y = event.clientY;
      // A small movement still counts as a click, which preserves selection on touch.
      if (!active && Math.hypot(x - startX, y - startY) < 8) return;
      event.preventDefault();
      if (!active) {
        active = true;
        frame = requestAnimationFrame(scrollFrame);
      }
      update();
    }

    function release(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      x = event.clientX;
      y = event.clientY;
      const target = hitZone();
      stop();
      setDrag(null);
      if (!active) return;
      suppressClick.current = true;
      if (target && canDrop(keys, target)) onDrop(keys, target);
      else onCancel();
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    element.addEventListener("lostpointercapture", cancelPointer);
    cleanup.current = stop;
  }

  return {
    drag,
    start,
    onPointerDownCapture: () => {
      suppressClick.current = false;
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      // Swallow the synthetic click after a drag, but allow keyboard activation (detail 0).
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
