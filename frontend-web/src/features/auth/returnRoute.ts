import { safeReturnPath } from "./session.ts";

// Route-only tab context survives a clean provider-error redirect. No query,
// invitation, record content, credential, or authentication decision belongs here.
export const RETURN_ROUTE_KEY = "cardfight.auth.return-route.v1";
export const RETURN_ROUTE_LIFETIME = 30 * 60 * 1000;
type RouteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function clearReturnRoute(storage: RouteStorage): void {
  try { storage.removeItem(RETURN_ROUTE_KEY); } catch { /* Losing a return route cannot block sign-out. */ }
}

export function saveReturnRoute(storage: RouteStorage, path: string, now = Date.now()): void {
  try { storage.setItem(RETURN_ROUTE_KEY, JSON.stringify({ path: safeReturnPath(path), createdAt: now, expiresAt: now + RETURN_ROUTE_LIFETIME })); }
  catch { /* The server still owns the successful attempt's validated return path. */ }
}

export function readReturnRoute(storage: RouteStorage, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(RETURN_ROUTE_KEY);
    if (!raw) return null;
    if (raw.length > 512) { clearReturnRoute(storage); return null; }
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") { clearReturnRoute(storage); return null; }
    const route = value as { path?: unknown; createdAt?: unknown; expiresAt?: unknown };
    if (typeof route.path !== "string" || safeReturnPath(route.path) !== route.path || typeof route.createdAt !== "number" || typeof route.expiresAt !== "number" || !Number.isFinite(route.createdAt) || !Number.isFinite(route.expiresAt) || route.createdAt > now || route.expiresAt <= now || route.expiresAt <= route.createdAt || route.expiresAt - route.createdAt > RETURN_ROUTE_LIFETIME) {
      clearReturnRoute(storage); return null;
    }
    return route.path;
  } catch { clearReturnRoute(storage); return null; }
}
