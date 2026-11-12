/** Request identity is memory-only and changes atomically at account boundaries. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;

  constructor(message: string, status: number, code = "request_failed", retryAfter: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

type Identity = {
  mode: "unknown" | "local" | "oidc";
  accountId: string | null;
  serverGeneration: string | null;
  csrfToken: string | null;
};

type TransportOptions = {
  baseUrl?: string;
  origin?: string;
  fetcher?: typeof fetch;
};

export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Math.min(Number(value), 3600);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(Math.ceil((date - now) / 1000), 3600)) : null;
}

export function createApiTransport({ baseUrl = "", origin, fetcher = fetch }: TransportOptions = {}) {
  let identity: Identity = { mode: "unknown", accountId: null, serverGeneration: null, csrfToken: null };
  let generation = 0;
  const pending = new Set<AbortController>();
  const listeners = new Set<(error: ApiError) => void>();
  let notifiedGeneration = -1;

  function invalidate() {
    generation++;
    identity = { ...identity, serverGeneration: null, csrfToken: null };
    for (const controller of pending) controller.abort();
    pending.clear();
  }

  function setIdentity(next: Identity) {
    if (identity.mode !== next.mode || identity.accountId !== next.accountId || identity.serverGeneration !== next.serverGeneration) invalidate();
    identity = { ...next };
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      throw new ApiError("This request has an invalid address.", 0, "invalid_request_path");
    }
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    if (identity.mode !== "local" && origin && new URL(url, origin).origin !== origin) {
      throw new ApiError("Hosted sign-in requires the API at the same address as Cardfight.", 0, "cross_origin_identity");
    }
    const method = (options.method ?? "GET").toUpperCase();
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
    const headers = new Headers(options.headers);
    headers.delete("X-Cardfight-Session");
    if (identity.mode === "oidc" && identity.serverGeneration) {
      headers.set("X-Cardfight-Session", identity.serverGeneration);
    }
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (options.body !== undefined && options.body !== null && !(typeof FormData !== "undefined" && options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (mutation && identity.mode !== "local") {
      if (!identity.csrfToken) throw new ApiError("Check your sign-in before trying again.", 401, "session_required");
      headers.set("X-CSRF-Token", identity.csrfToken);
    }

    const started = generation;
    const controller = new AbortController();
    const onCancel = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) onCancel();
    else options.signal?.addEventListener("abort", onCancel, { once: true });
    pending.add(controller);
    try {
      const response = await fetcher(url, {
        ...options,
        headers,
        credentials: "same-origin",
        redirect: identity.mode === "oidc" ? "error" : options.redirect,
        signal: controller.signal,
      });
      if (started !== generation) throw new ApiError("The account changed before this request finished.", 0, "stale_account_response");
      let data: unknown;
      try {
        data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
      } catch {
        // A broken proxy/error body must not hide an authentication failure.
        if (response.ok) throw new ApiError("Cardfight returned an unreadable response. Check before trying again.", response.status, "invalid_response");
        data = null;
      }
      if (started !== generation) throw new ApiError("The account changed before this request finished.", 0, "stale_account_response");
      if (!response.ok) {
        const body = data && typeof data === "object" ? data as Record<string, unknown> : {};
        const error = new ApiError(
          typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`,
          response.status,
          typeof body.code === "string" ? body.code : "request_failed",
          retryAfterSeconds(response.headers.get("retry-after")),
        );
        const identityFailure = identity.mode === "oidc" && (
          error.status === 401 ||
          (error.status === 403 && ["account_unavailable", "admission_hold"].includes(error.code))
        );
        if (!path.startsWith("/api/auth/") && identityFailure && notifiedGeneration !== started) {
          notifiedGeneration = started;
          for (const listener of listeners) listener(error);
        }
        throw error;
      }
      return data as T;
    } catch (error) {
      if (started !== generation && !(error instanceof ApiError)) throw new ApiError("The account changed before this request finished.", 0, "stale_account_response");
      throw error;
    } finally {
      pending.delete(controller);
      options.signal?.removeEventListener("abort", onCancel);
    }
  }

  return {
    request, setIdentity, invalidate,
    subscribe(listener: (error: ApiError) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
