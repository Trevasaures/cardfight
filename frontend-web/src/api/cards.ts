import { apiRequest } from "./client";
import type {
  Card,
  CardFormOptions,
  CardImageAnalysisResult,
  CardLibraryParams,
  CardPrinting,
  CardSetOption,
  CardSearchParams,
  CreateCardPayload,
  CreateCardPrintingPayload,
  PaginatedCardsResponse,
  UpdateCardPayload,
  ManagedCardSet,
} from "../types/api";

export function getCardFormOptions() {
  return apiRequest<CardFormOptions>("/api/cards/options");
}

export function saveCardSet(code: string, name: string) {
  return apiRequest<CardSetOption>("/api/cards/sets", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  });
}

export function getManagedCardSets() {
  return apiRequest<ManagedCardSet[]>("/api/cards/sets");
}

export function updateCardSet(
  currentCode: string,
  code: string,
  name: string,
) {
  return apiRequest<ManagedCardSet>(
    `/api/cards/sets/${encodeURIComponent(currentCode)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ code, name }),
    },
  );
}

export function deleteCardSet(code: string) {
  return apiRequest<void>(`/api/cards/sets/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

function toQueryString(params: CardSearchParams = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function searchCards(params: CardSearchParams = {}) {
  return apiRequest<Card[]>(`/api/cards/search${toQueryString(params)}`);
}

export function getCards(params: CardSearchParams = {}) {
  return apiRequest<Card[]>(`/api/cards${toQueryString(params)}`);
}

export function getCard(cardId: number) {
  return apiRequest<Card>(`/api/cards/${cardId}`);
}

export function createCard(payload: CreateCardPayload) {
  return apiRequest<Card>("/api/cards", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCard(cardId: number, payload: UpdateCardPayload) {
  return apiRequest<Card>(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function addCardPrinting(
  cardId: number,
  payload: CreateCardPrintingPayload,
) {
  return apiRequest<CardPrinting>(`/api/cards/${cardId}/printings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCardPrinting(
  printingId: number,
  payload: CreateCardPrintingPayload,
) {
  return apiRequest<CardPrinting>(`/api/cards/printings/${printingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function analyzeCardImage(file: File) {
  const formData = new FormData();
  formData.set("image", file);

  return apiRequest<CardImageAnalysisResult>("/api/cards/analyze-image", {
    method: "POST",
    body: formData,
  });
}

export function getCardLibraryPage(params: CardLibraryParams = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedCardsResponse>(
    `/api/cards/library${toQueryString(params)}`,
    { signal },
  );
}
