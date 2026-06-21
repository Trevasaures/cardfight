import { apiRequest } from "./client";
import type { StatsRow } from "../types/api";

export function getStatsTable() {
  return apiRequest<StatsRow[]>("/api/stats/table");
}