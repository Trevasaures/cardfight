import { apiRequest } from "./client";
import type { Match } from "../types/api";

export function getMatches(limit?: number) {
  const query = limit ? `?limit=${limit}` : "";
  return apiRequest<Match[]>(`/api/matches${query}`);
}