import { ChevronDown } from "lucide-react";

import { AcquisitionItemRow } from "./AcquisitionItemRow";
import type { PurchaseItemDraft } from "./order-drafts";
import type {
  AcquisitionPlanItem,
  UpdateAcquisitionItemPayload,
} from "../../types/api";

type AcquisitionGradeSectionProps = {
  label: string;
  items: AcquisitionPlanItem[];
  busyItemId: number | null;
  open: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  drafts: Record<string, PurchaseItemDraft>;
  selectedIds: number[];
  onSelectionChange: (itemId: number, selected: boolean) => void;
  onDraftChange: (itemId: number, draft: PurchaseItemDraft | null) => void;
  onInspect: (item: AcquisitionPlanItem) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (
    itemId: number,
    payload: UpdateAcquisitionItemPayload,
  ) => Promise<void>;
  onReceive: (itemId: number, quantity: number) => Promise<string | null>;
  onRemove: (item: AcquisitionPlanItem) => Promise<void>;
};

export function AcquisitionGradeSection({
  label,
  items,
  busyItemId,
  open,
  readOnly = false,
  disabled = false,
  drafts,
  selectedIds,
  onSelectionChange,
  onDraftChange,
  onInspect,
  onOpenChange,
  onSave,
  onReceive,
  onRemove,
}: AcquisitionGradeSectionProps) {
  const incoming = items.reduce((sum, item) => sum + item.ordered_quantity, 0);
  const missing = items.reduce((sum, item) => sum + item.missing_quantity, 0);
  const target = items.reduce((sum, item) => sum + item.target_quantity, 0);
  const outgoing = items.reduce((sum, item) => sum + item.removed_quantity, 0);

  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="orders-grade"
    >
      <summary>
        <ChevronDown />
        <strong>{label}</strong>
        <span className="collection-muted">
          {items.length} card {items.length === 1 ? "line" : "lines"}
        </span>
        <span className="ml-auto text-[10px] text-slate-400">
          {incoming > 0
            ? `${incoming} incoming`
            : missing > 0
              ? `${missing} to buy`
              : target === 0 && outgoing > 0
                ? `${outgoing} outgoing`
                : "Ready"}
        </span>
      </summary>
      <div>
        {items.map((item) => (
          <AcquisitionItemRow
            key={item.id}
            item={item}
            draft={drafts[String(item.id)]}
            selected={selectedIds.includes(item.id)}
            onSelectionChange={(selected) =>
              onSelectionChange(item.id, selected)
            }
            onDraftChange={onDraftChange}
            onInspect={onInspect}
            busy={disabled || busyItemId !== null}
            readOnly={readOnly}
            onSave={onSave}
            onReceive={onReceive}
            onRemove={onRemove}
          />
        ))}
      </div>
    </details>
  );
}
