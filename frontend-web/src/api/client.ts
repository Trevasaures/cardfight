import { createApiTransport } from "./transport";

// Vite serves /api through its same-origin proxy. Ignore older launchers and
// frontend .env files that still point development requests directly at Flask.
const API_BASE_URL = import.meta.env.DEV ? "" : import.meta.env.VITE_CARDFIGHT_API_URL ?? "";
export const apiTransport = createApiTransport({
  baseUrl: API_BASE_URL,
  origin: typeof window === "undefined" ? undefined : window.location.origin,
});

// Hosted artwork and the API share Cardfight's origin through the dev proxy.
export function apiAssetUrl(path: string) {
  return path.startsWith("/api/")
    ? `${API_BASE_URL.replace(/\/$/, "")}${path}`
    : path;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return apiTransport.request<T>(path, options);
}
