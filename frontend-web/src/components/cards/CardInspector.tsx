import { useState, type ReactNode } from "react";
import { ModalDialog } from "../layout/ModalDialog";
import { CardArtwork } from "./CardArtwork";
import { CardAbilityText } from "./CardAbilityText";
import {
  cardGradeBadge,
  formatCardNation,
  isCrestCard,
} from "../../utils/cards";
import type { Card, CardPrinting } from "../../types/api";
import "./card-inspector.css";

type Props = {
  card: Card;
  printing?: CardPrinting | null;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  title?: string;
  editingPrimary?: boolean;
};

export function CardInspector({
  card,
  printing,
  onClose,
  children,
  footer,
  title,
  editingPrimary = false,
}: Props) {
  const [printingId, setPrintingId] = useState(
    printing?.id ?? card.primary_printing?.id ?? null,
  );
  const selectedPrinting = editingPrimary
    ? card.primary_printing
    : (card.printings.find((item) => item.id === printingId) ??
      printing ??
      card.primary_printing);

  return (
    <ModalDialog
      title={title ?? card.name}
      onClose={onClose}
      variant="drawer"
      footer={footer}
    >
      <div className="card-inspector-overview">
        <CardArtwork card={card} printing={selectedPrinting} detail />
        <div className="card-inspector-meta">
          <span className="card-inspector-grade">{cardGradeBadge(card)}</span>
          <p>{formatCardNation(card.nation)}</p>
          {card.card_type.trim().toLowerCase() !== "crest" && (
            <p>{card.card_type}</p>
          )}
          {!isCrestCard(card) && (
            <dl>
              {[
                ["Power", card.power],
                ["Shield", card.shield],
                ["Critical", card.critical],
              ].map(
                ([label, value]) =>
                  value !== null && (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {typeof value === "number"
                          ? value.toLocaleString()
                          : value}
                      </dd>
                    </div>
                  ),
              )}
            </dl>
          )}
        </div>
      </div>
      {card.printings.length > 0 && (
        <label className="card-inspector-printing">
          <span>{editingPrimary ? "Primary printing" : "Printing"}</span>
          <select
            disabled={editingPrimary}
            className="workspace-control"
            value={
              editingPrimary
                ? (card.primary_printing?.id ?? "")
                : (printingId ?? "")
            }
            onChange={(event) => setPrintingId(Number(event.target.value))}
          >
            {card.printings.map((item) => (
              <option key={item.id} value={item.id}>
                {[item.set_code, item.card_number, item.rarity]
                  .filter(Boolean)
                  .join(" · ") || `Printing ${item.id}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <CardAbilityText text={card.skill_text} />
      {children && <div className="card-inspector-editor">{children}</div>}
    </ModalDialog>
  );
}
