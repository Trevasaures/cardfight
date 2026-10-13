import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./modal-dialog.css";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  className?: string;
};

/** Native dialogs provide focus containment and make the background inert. */
export function ModalDialog({
  title,
  onClose,
  children,
  footer,
  variant = "modal",
  className = "",
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`workspace-dialog ${variant === "drawer" ? "workspace-drawer" : ""} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        // The parent decides whether a dirty draft can be closed.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="workspace-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="workspace-dialog-body">{children}</div>
      {footer && <footer className="workspace-dialog-footer">{footer}</footer>}
    </dialog>
  );
}
