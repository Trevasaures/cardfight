import { apiRequest } from "./client";
import type {
  AddDeckCardPayload,
  CreateDeckVersionPayload,
  DeckCardEntry,
  DeckVersion,
  DeckVersionSummary,
  UpdateDeckCardPayload,
  UpdateDeckVersionPayload,
} from "../types/api";

export function getDeckVersions(deckId: number) {
  return apiRequest<DeckVersionSummary[]>(`/api/decks/${deckId}/versions`);
}

export function createDeckVersion(
  deckId: number,
  payload: CreateDeckVersionPayload,
) {
  return apiRequest<DeckVersion>(`/api/decks/${deckId}/versions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getDeckVersion(versionId: number) {
  return apiRequest<DeckVersion>(`/api/deck-versions/${versionId}`);
}

export function updateDeckVersion(
  versionId: number,
  payload: UpdateDeckVersionPayload,
) {
  return apiRequest<DeckVersion>(`/api/deck-versions/${versionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteDeckVersion(versionId: number) {
  return apiRequest<{ deleted: boolean; id: number }>(
    `/api/deck-versions/${versionId}`,
    {
      method: "DELETE",
    },
  );
}

export function addCardToDeckVersion(
  versionId: number,
  payload: AddDeckCardPayload,
) {
  return apiRequest<DeckCardEntry>(`/api/deck-versions/${versionId}/cards`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDeckCard(
  deckCardId: number,
  payload: UpdateDeckCardPayload,
) {
  return apiRequest<DeckCardEntry>(`/api/deck-cards/${deckCardId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function removeDeckCard(deckCardId: number) {
  return apiRequest<{ deleted: boolean; id: number }>(
    `/api/deck-cards/${deckCardId}`,
    {
      method: "DELETE",
    },
  );
}