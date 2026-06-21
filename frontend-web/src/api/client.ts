const API_BASE_URL =
  import.meta.env.VITE_CARDFIGHT_API_URL ?? "http://127.0.0.1:5000";

type ApiOptions = RequestInit & {
  json?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const hasJson = contentType.includes("application/json");

  const payload = hasJson ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload?.error ??
      payload?.message ??
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}