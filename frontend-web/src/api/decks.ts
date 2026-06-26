import { apiRequest } from "./client";
import type {
  Deck,
  DeckOptionsResponse,
  DeckType,
  DeckUpdatePayload,
} from "../types/api";

type CreateDeckPayload = {
  name: string;
  type: DeckType;
  nation?: string | null;
  active?: boolean;
};

export function getDecks(includeInactive = false) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<Deck[]>(`/api/decks${query}`);
}

export function getDeckOptions() {
  return apiRequest<DeckOptionsResponse>("/api/decks/options");
}

export function getDeck(deckId: number) {
  return apiRequest<Deck>(`/api/decks/${deckId}`);
}

export function createDeck(payload: CreateDeckPayload) {
  return apiRequest<Deck>("/api/decks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDeck(deckId: number, payload: DeckUpdatePayload) {
  return apiRequest<Deck>(`/api/decks/${deckId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}