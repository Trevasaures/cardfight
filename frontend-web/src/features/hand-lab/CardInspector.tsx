import { CardAbilityText } from "../../components/cards/CardAbilityText";
import { CardArtwork } from "../../components/cards/CardArtwork";
import type { DeckCardEntry } from "../../types/api";
import { ZONES, type TableCard, type Zone } from "./playtest";
import { formatPower } from "./cardDisplay";
import { isCrestEntry } from "./crests";
import { PersonaTicketArtwork } from "./PersonaTicketArtwork";
import "./card-inspector.css";

type Props = {
  card: TableCard;
  entry: DeckCardEntry;
  zone: Zone;
  effectiveGrade?: number | null;
  showName?: boolean;
};

/** Details are deliberately inspectable in this solo sandbox, including face-down cards. */
export function CardInspector({
  card,
  entry,
  zone,
  effectiveGrade,
  showName = true,
}: Props) {
  if (!entry.card) return null;
  const crest = Boolean(card.crest || isCrestEntry(entry));
  const ticket = card.ticket === "personaShield";
  return (
    <section
      className={`pt-card-detail ${crest ? "is-crest" : ""}`}
      aria-label="Selected card"
    >
      <div className="pt-detail-overview">
        {ticket ? (
          <PersonaTicketArtwork />
        ) : (
          <CardArtwork card={entry.card} printing={entry.printing} detail />
        )}
        <div>
          <span className="pt-detail-zone">
            {ZONES[zone]}
            {card.faceDown ? " · Face down" : card.rested ? " · Rest" : ""}
          </span>
          {showName && <strong>{entry.card.name}</strong>}
          {!crest && !ticket && (
            <div className="pt-detail-stats">
              <span>G{effectiveGrade ?? entry.card.grade ?? "?"}</span>
              <strong>{formatPower(card, entry.card.power)}</strong>
              <span>★{(entry.card.critical ?? 1) + card.critical}</span>
            </div>
          )}
          {!crest && !ticket && Boolean(card.power || card.critical) && (
            <small>
              Bonus {card.power >= 0 ? "+" : ""}
              {card.power.toLocaleString()} / {card.critical >= 0 ? "+" : ""}
              {card.critical}★
            </small>
          )}
        </div>
      </div>
      <div
        className="pt-detail-ability"
        role="region"
        aria-label="Card abilities"
        tabIndex={0}
      >
        <CardAbilityText text={entry.card.skill_text} />
      </div>
    </section>
  );
}
