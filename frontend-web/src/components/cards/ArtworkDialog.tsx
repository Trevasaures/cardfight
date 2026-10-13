import { apiAssetUrl } from "../../api/client";
import { ModalDialog } from "../layout/ModalDialog";
import "./card-artwork.css";

export function ArtworkDialog({
  source,
  name,
  landscape = false,
  onClose,
}: {
  source: string;
  name: string;
  landscape?: boolean;
  onClose: () => void;
}) {
  return (
    <ModalDialog
      title={`${name} artwork`}
      onClose={onClose}
      className={`card-artwork-dialog${landscape ? " is-crest" : ""}`}
    >
      <img src={apiAssetUrl(source)} alt={`${name} card artwork`} />
    </ModalDialog>
  );
}
