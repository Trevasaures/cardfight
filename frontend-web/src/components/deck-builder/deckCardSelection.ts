import type { Card, DeckCardZone, DeckVersion } from "../../types/api";
import { isCrestCard } from "../../utils/cards.ts";

/** Setup crests stay outside the playable decks, even after a saved zone changes. */
export function suggestedDeckCardZone(
  card: Card,
  currentZone: DeckCardZone,
): DeckCardZone {
  return isCrestCard(card)
    ? "crest"
    : currentZone === "crest"
      ? "main"
      : currentZone;
}

export function cardAdditionIssue(
  version: DeckVersion | null,
  card: Card | null,
  zone: DeckCardZone,
  quantity: number,
): string | null {
  if (!version || !card) return null;
  const { deck_rules: rules } = version;
  if (isCrestCard(card)) {
    if (zone !== "crest") return "Crests belong in the Crest section.";
    if (quantity !== 1) return "Include one copy of each crest.";
    if (
      version.cards.some(
        (entry) => entry.zone === "crest" && entry.card_id === card.id,
      )
    ) {
      return "This crest is already included.";
    }
    if (
      card.card_type === "Ride Deck Crest" &&
      version.cards.some(
        (entry) =>
          entry.zone === "crest" && entry.card?.card_type === "Ride Deck Crest",
      )
    )
      return "A Ride Deck Crest is already included.";
    return null;
  }
  if (zone === "crest") return "Only crests belong in the Crest section.";
  const { grade } = card;
  if (grade === null || grade < 0 || grade > 4)
    return "Deck cards need a grade from 0 to 4.";
  if (
    zone === "main" &&
    rules.main_deck_count + quantity > rules.main_deck_limit
  ) {
    return `Main deck is limited to ${rules.main_deck_limit} cards.`;
  }
  if (zone === "ride") {
    if (grade > 3) return "Ride deck needs grades 0–3.";
    if (quantity !== 1) return "Include one copy in the ride deck.";
    if (
      version.cards.some(
        (entry) => entry.zone === "ride" && entry.card?.grade === grade,
      )
    ) {
      return `Grade ${grade} is already in the ride deck.`;
    }
    if (rules.ride_deck_count >= rules.ride_deck_limit)
      return "Ride deck is full.";
  }
  return null;
}
