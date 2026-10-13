import { useEffect, type RefObject } from "react";

type Options = {
  root: RefObject<HTMLElement | null>;
  disabled: boolean;
  dragging: boolean;
  canUndo: boolean;
  hasSelection: boolean;
  onUndo: () => void;
  onClearSelection: () => void;
};

/** Table shortcuts must not consume text-editing or modal/drag keyboard actions. */
export function useTableShortcuts({
  root,
  disabled,
  dragging,
  canUndo,
  hasSelection,
  onUndo,
  onClearSelection,
}: Options) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || disabled || dragging)
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target !== document.body && !root.current?.contains(target)) return;
      if (
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="textbox"], [role="combobox"]',
        )
      )
        return;

      const undo =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "z";
      const clear =
        event.key === "Escape" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey;
      if (undo && canUndo) {
        event.preventDefault();
        onUndo();
      } else if (clear && hasSelection) {
        event.preventDefault();
        onClearSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    root,
    disabled,
    dragging,
    canUndo,
    hasSelection,
    onUndo,
    onClearSelection,
  ]);
}
