import { apiRequest } from "./client";
import type {
  Card,
  CardPrinting,
  CardSearchParams,
  CreateCardPayload,
  CreateCardPrintingPayload,
  UpdateCardPayload,
} from "../types/api";

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