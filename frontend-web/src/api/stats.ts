import { apiRequest } from "./client";
import type { PerformanceSpotlightResponse, StatsRow } from "../types/api";

export function getStatsTable() {
  return apiRequest<StatsRow[]>("/api/stats/table");
}

export function getPerformanceSpotlight(deckId: number) {
  return apiRequest<PerformanceSpotlightResponse>(
    `/api/stats/spotlight/${deckId}`,
  );
}
