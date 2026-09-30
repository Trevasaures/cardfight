import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { apiAssetUrl } from "../../api/client";
import "./card-artwork.css";

export function ArtworkDialog({
  source,
  name,
  onClose,
}: {
  source: string;
  name: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="card-artwork-dialog"
      aria-label={`${name} artwork`}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="card-artwork-dialog-heading">
        <strong>{name}</strong>
        <button
          type="button"
          aria-label="Close artwork"
          className="icon-button"
          onClick={() => dialogRef.current?.close()}
        >
          <X size={20} />
        </button>
      </div>
      <img src={apiAssetUrl(source)} alt={`${name} card artwork`} />
    </dialog>
  );
}
