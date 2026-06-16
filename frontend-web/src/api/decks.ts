import { apiRequest } from "./client";
import type { Deck } from "../types/api";

export function getDecks(includeInactive = true) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<Deck[]>(`/api/decks${query}`);
}