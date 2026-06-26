import { apiRequest } from "./client";
import type {
  CreateMatchPayload,
  Match,
  PaginatedMatchesResponse,
} from "../types/api";

export function getMatches(limit?: number) {
  const query = limit ? `?limit=${limit}` : "";
  return apiRequest<Match[]>(`/api/matches${query}`);
}

export async function getMatchesPage(page = 1, pageSize = 12) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  const response = await apiRequest<PaginatedMatchesResponse | Match[]>(
    `/api/matches?${params.toString()}`,
  );

  if (Array.isArray(response)) {
    return {
      items: response,
      pagination: {
        page,
        page_size: pageSize,
        total_items: response.length,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      },
    };
  }

  return {
    items: response.items ?? [],
    pagination: response.pagination ?? {
      page,
      page_size: pageSize,
      total_items: response.items?.length ?? 0,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
  };
}

export function createMatch(payload: CreateMatchPayload) {
  return apiRequest<Match>("/api/matches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteMatch(matchId: number) {
  return apiRequest<void>(`/api/matches/${matchId}`, {
    method: "DELETE",
  });
}