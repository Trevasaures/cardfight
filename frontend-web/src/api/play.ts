import { apiRequest } from "./client";
import type { MatchFormat, RandomMatchupResponse } from "../types/api";

export function getRandomMatchup(format: MatchFormat = "Any") {
  return apiRequest<RandomMatchupResponse>(
    `/api/play/random?format=${encodeURIComponent(format)}`,
  );
}