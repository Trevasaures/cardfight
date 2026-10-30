import type {
  AcquisitionPlanItem,
  AcquisitionRemovalAction,
} from "../../types/api";
import { ModalDialog } from "../layout/ModalDialog";
import { printingLabel } from "./order-printings";

type Props = {
  item: AcquisitionPlanItem;
  action: AcquisitionRemovalAction;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
};

const LABELS: Record<AcquisitionRemovalAction, string> = {
  confirm: "Mark removed",
  undo_confirmation: "Undo confirmation",
  restore_target: "Restore to build",
};

export function RemovalActionDialog({
  item,
  action,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const description =
    action === "confirm"
      ? `Confirm ${item.pending_removed_quantity} outgoing copies were taken out of this deck. Target stays ${item.target_quantity}.`
      : action === "undo_confirmation"
        ? `Clear the removal confirmation. Target stays ${item.target_quantity}; the outgoing copies will need review again.`
        : `Restore the target from ${item.target_quantity} to ${item.source_quantity}.`;
  return (
    <ModalDialog
      title={`${LABELS[action]}?`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="font-bold">{item.card.name}</p>
      <p className="collection-muted">{printingLabel(item.printing)}</p>
      <p className="text-sm leading-relaxed">{description}</p>
      <p className="collection-muted">
        {item.owned_quantity} on hand · {item.ordered_quantity} incoming stay
        recorded.
      </p>
      {item.ordered_quantity > 0 && (
        <p className="orders-dialog-incoming">
          The incoming order still needs resolution.
        </p>
      )}
      {error && (
        <p role="alert" className="orders-dialog-error">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="collection-button subtle"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="collection-button primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Saving…" : LABELS[action]}
        </button>
      </div>
    </ModalDialog>
  );
}
