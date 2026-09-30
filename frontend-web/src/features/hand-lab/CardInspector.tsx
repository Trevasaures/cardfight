import { CardAbilityText } from "../../components/cards/CardAbilityText";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import { ZONES, type TableCard, type Zone } from "./playtest";
import { formatPower } from "./cardDisplay";
import "./card-inspector.css";

type Props = {
  card: TableCard;
  entry: DeckCardEntry;
  zone: Zone;
  effectiveGrade?: number | null;
};

/** Details are deliberately inspectable in this solo sandbox, including face-down cards. */
export function CardInspector({
  card, entry, zone, effectiveGrade,
}: Props) {
  if (!entry.card) return null;
  return (
    <section className="pt-card-detail" aria-label="Selected card">
      <div className="pt-detail-overview">
        <CardArtwork card={entry.card} printing={entry.printing} detail />
        <div>
          <span className="pt-detail-zone">
            {ZONES[zone]}
            {card.faceDown ? " · Face down" : card.rested ? " · Rest" : ""}
          </span>
          <strong>{entry.card.name}</strong>
          <div className="pt-detail-stats">
            <span>G{effectiveGrade ?? entry.card.grade ?? "?"}</span>
            <strong>{formatPower(card, entry.card.power)}</strong>
            <span>★{(entry.card.critical ?? 1) + card.critical}</span>
          </div>
          {Boolean(card.power || card.critical) && (
            <small>
              Bonus {card.power >= 0 ? "+" : ""}
              {card.power.toLocaleString()} / {card.critical >= 0 ? "+" : ""}
              {card.critical}★
            </small>
          )}
        </div>
      </div>
      <CardAbilityText text={entry.card.skill_text} />
    </section>
  );
}
