import { useRef } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Package,
  Pencil,
  RotateCcw,
} from "lucide-react";

import type { AcquisitionPlanItem } from "../../types/api";
import { CardArtwork } from "../cards/CardArtwork";
import { isItemDraftDirty, type PurchaseItemDraft } from "./order-drafts";
import { acquisitionLineLabel, printingLabel } from "./order-printings";
import "./outgoing-section.css";

type RemovalAction = "confirm" | "undo_confirmation" | "restore_target";

type Props = {
  items: AcquisitionPlanItem[];
  busy: boolean;
  readOnly: boolean;
  drafts: Record<string, PurchaseItemDraft>;
  forceOpen?: boolean;
  onInspect: (item: AcquisitionPlanItem) => void;
  onEdit: (item: AcquisitionPlanItem) => void;
  onRemovalAction: (item: AcquisitionPlanItem, action: RemovalAction) => void;
};

type RowProps = Pick<
  Props,
  "busy" | "readOnly" | "onInspect" | "onEdit" | "onRemovalAction"
> & {
  item: AcquisitionPlanItem;
  dirty: boolean;
};

function OutgoingRow({
  item,
  busy,
  readOnly,
  dirty,
  onInspect,
  onEdit,
  onRemovalAction,
}: RowProps) {
  const lineLabel = acquisitionLineLabel(item);
  const pending = item.pending_removed_quantity;
  const actionDisabled = busy || dirty;
  const actionHint = dirty
    ? "Save or discard this line's edits before changing its removal state."
    : undefined;

  return (
    <article className="orders-outgoing-row" aria-label={`Outgoing ${lineLabel}`}>
      <button
        type="button"
        className="orders-outgoing-card"
        aria-label={`Inspect ${lineLabel}`}
        onClick={() => onInspect(item)}
      >
        <div className="collection-artwork">
          <CardArtwork card={item.card} printing={item.printing} />
        </div>
        <span className="orders-outgoing-card-label">
          <strong>{item.card.name}</strong>
          <span>{printingLabel(item.printing)}</span>
        </span>
      </button>

      <div className="orders-outgoing-change">
        <strong aria-label={`${item.source_quantity} to ${item.target_quantity}`}>
          {item.source_quantity}
          <ArrowRight size={12} aria-hidden="true" />
          {item.target_quantity}
        </strong>
        <span>{item.removed_quantity} outgoing</span>
      </div>

      <div className="orders-outgoing-state">
        {pending > 0 ? (
          <span className="orders-outgoing-pending">{pending} to remove</span>
        ) : (
          <span className="orders-outgoing-confirmed">
            <Check size={12} aria-hidden="true" /> Removed
          </span>
        )}
        <span>{item.owned_quantity} on hand</span>
        {item.ordered_quantity > 0 && (
          <span className="orders-outgoing-incoming">
            {item.ordered_quantity} incoming
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="orders-outgoing-actions">
          {pending > 0 && (
            <button
              type="button"
              className="collection-button subtle"
              aria-label={`Mark ${lineLabel} removed`}
              disabled={actionDisabled}
              title={actionHint}
              onClick={() => onRemovalAction(item, "confirm")}
            >
              <Check /> Mark removed
            </button>
          )}
          {item.confirmed_removed_quantity > 0 && (
            <button
              type="button"
              className="collection-button subtle"
              aria-label={`Undo removal confirmation for ${lineLabel}`}
              disabled={actionDisabled}
              title={actionHint}
              onClick={() => onRemovalAction(item, "undo_confirmation")}
            >
              Undo confirmation
            </button>
          )}
          <button
            type="button"
            className="collection-button subtle"
            aria-label={`Restore ${lineLabel} to build`}
            disabled={actionDisabled}
            title={actionHint}
            onClick={() => onRemovalAction(item, "restore_target")}
          >
            <RotateCcw /> Restore to build
          </button>
          <button
            type="button"
            className="collection-button subtle"
            aria-label={`Edit outgoing ${lineLabel}`}
            disabled={busy}
            onClick={() => onEdit(item)}
          >
            {item.ordered_quantity > 0 ? <Package /> : <Pencil />}
            {item.ordered_quantity > 0 ? "Review incoming" : "Details"}
            {dirty && <span className="orders-outgoing-draft-dot" />}
          </button>
        </div>
      )}

      {(item.notes || item.removal_confirmed_at || dirty) && (
        <div className="orders-outgoing-notes">
          {item.notes && <span>{item.notes}</span>}
          {item.removal_confirmed_at && (
            <span>
              Confirmed {new Date(item.removal_confirmed_at).toLocaleDateString()}
            </span>
          )}
          {dirty && <span className="orders-outgoing-pending">Unsaved edits</span>}
        </div>
      )}
    </article>
  );
}

/** Full cuts leave the purchase checklist, but incoming copies never disappear into history. */
export function OutgoingSection({
  items,
  busy,
  readOnly,
  drafts,
  forceOpen = false,
  onInspect,
  onEdit,
  onRemovalAction,
}: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  if (!items.length) return null;

  function hasDraft(item: AcquisitionPlanItem) {
    const draft = drafts[String(item.id)];
    return Boolean(draft && isItemDraftDirty(item, draft));
  }

  // A confirmed cut with an outstanding delivery remains in the review list.
  const isHistory = (item: AcquisitionPlanItem) =>
    item.pending_removed_quantity === 0 &&
    item.ordered_quantity === 0 &&
    !hasDraft(item);
  const pendingItems = items.filter((item) => !isHistory(item));
  const history = items.filter(isHistory);
  const pendingCopies = items.reduce(
    (sum, item) => sum + item.pending_removed_quantity,
    0,
  );
  const incoming = items.reduce((sum, item) => sum + item.ordered_quantity, 0);
  const dirtyCount = items.filter(hasDraft).length;

  function renderRow(item: AcquisitionPlanItem) {
    return (
      <OutgoingRow
        key={item.id}
        item={item}
        busy={busy}
        readOnly={readOnly}
        dirty={hasDraft(item)}
        onInspect={onInspect}
        onEdit={onEdit}
        onRemovalAction={onRemovalAction}
      />
    );
  }

  return (
    <section className="orders-outgoing" aria-label="Outgoing cards">
      {incoming > 0 && (
        <div className="orders-outgoing-alert">
          <span>
            <Package size={14} aria-hidden="true" />
            {incoming} incoming on outgoing cards
          </span>
          <button
            type="button"
            className="collection-button subtle"
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = true;
            }}
          >
            Review incoming
          </button>
        </div>
      )}
      <details ref={detailsRef} open={forceOpen || dirtyCount > 0 || undefined}>
        <summary>
          <ChevronDown size={15} aria-hidden="true" />
          <strong>Outgoing</strong>
          <span>{items.length} {items.length === 1 ? "line" : "lines"}</span>
          <span className="orders-outgoing-summary-status">
            {pendingCopies > 0 ? `${pendingCopies} to remove` : "Confirmed"}
            {history.length > 0 && ` · ${history.length} in history`}
          </span>
        </summary>
        {pendingItems.map(renderRow)}
        {history.length > 0 && (
          <details className="orders-outgoing-history">
            <summary>
              <ChevronDown size={14} aria-hidden="true" />
              <strong>Removed history</strong>
              <span>{history.length}</span>
            </summary>
            {history.map(renderRow)}
          </details>
        )}
      </details>
    </section>
  );
}
