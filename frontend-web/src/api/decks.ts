import { apiRequest } from "./client";
import type { Deck, DeckOptionsResponse, DeckType, DeckUpdatePayload } from "../types/api";

export type CreateDeckPayload = {
  name: string;
  type: DeckType;
  nation?: string | null;
  active?: boolean;
};

export function getDecks(includeInactive = true) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<Deck[]>(`/api/decks${query}`);
}

export function getDeckOptions() {
  return apiRequest<DeckOptionsResponse>("/api/decks/options");
}

export function createDeck(payload: CreateDeckPayload) {
  return apiRequest<Deck>("/api/decks", {
    method: "POST",
    json: payload,
  });
}

export function updateDeck(deckId: number, payload: DeckUpdatePayload) {
  return apiRequest<Deck>(`/api/decks/${deckId}`, {
    method: "PATCH",
    json: payload,
  });
}

export function deleteDeck(deckId: number) {
  return apiRequest<void>(`/api/decks/${deckId}`, {
    method: "DELETE",
  });
}