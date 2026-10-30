import { PackageCheck, PackagePlus, X } from "lucide-react";
import type { AcquisitionBatchAction } from "../../api/acquisition";
import type { AcquisitionPlanItem } from "../../types/api";
import { isItemDraftDirty, type PurchaseItemDraft } from "./order-drafts";

type Props = {
  visibleItems: AcquisitionPlanItem[];
  selectedItems: AcquisitionPlanItem[];
  drafts: Record<string, PurchaseItemDraft>;
  dirtyCount: number;
  disabled: boolean;
  onSelect: (ids: number[]) => void;
  onBatch: (action: AcquisitionBatchAction) => void;
};

export function PurchaseSelectionBar({
  visibleItems,
  selectedItems,
  drafts,
  dirtyCount,
  disabled,
  onSelect,
  onBatch,
}: Props) {
  const ids = selectedItems.map((item) => item.id);
  const visibleIds = visibleItems
    .filter(
      (item) =>
        item.target_quantity > 0 &&
        (!drafts[String(item.id)] ||
          !isItemDraftDirty(item, drafts[String(item.id)])),
    )
    .map((item) => item.id);
  const incoming = selectedItems.reduce(
    (sum, item) => sum + item.ordered_quantity,
    0,
  );
  const missing = selectedItems.reduce(
    (sum, item) => sum + item.missing_quantity,
    0,
  );

  return (
    <div className="orders-selection-bar" aria-label="Checklist selection">
      <label className="orders-select-visible">
        <input
          type="checkbox"
          aria-label="Select visible next-build cards"
          className="orders-select-box"
          checked={
            visibleIds.length > 0 && visibleIds.every((id) => ids.includes(id))
          }
          disabled={disabled || !visibleIds.length}
          onChange={(event) =>
            onSelect(
              event.target.checked
                ? [...new Set([...ids, ...visibleIds])]
                : ids.filter((id) => !visibleIds.includes(id)),
            )
          }
        />
        {ids.length ? `${ids.length} selected` : "Select visible"}
      </label>
      {ids.length > 0 && (
        <>
          <button
            type="button"
            disabled={disabled || !missing}
            className="collection-button"
            onClick={() => onBatch("mark_incoming")}
          >
            <PackagePlus /> Mark {missing} incoming
          </button>
          <button
            type="button"
            disabled={disabled || !incoming}
            className="collection-button"
            onClick={() => onBatch("receive")}
          >
            <PackageCheck /> Receive {incoming}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="collection-button subtle"
            aria-label="Clear card selection"
            onClick={() => onSelect([])}
          >
            <X />
          </button>
        </>
      )}
      {dirtyCount > 0 && (
        <span className="orders-draft-notice" role="status">
          {dirtyCount} {dirtyCount === 1 ? "draft" : "drafts"} saved on this
          device
        </span>
      )}
    </div>
  );
}
