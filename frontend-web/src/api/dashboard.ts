import { apiRequest } from "./client";
import type { DashboardResponse } from "../types/api";

export function getDashboard() {
  return apiRequest<DashboardResponse>("/api/dashboard");
}