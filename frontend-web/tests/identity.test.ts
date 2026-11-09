import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiTransport, retryAfterSeconds } from "../src/api/transport.ts";
import { authErrorCopy, callbackErrorFromSearch, canMountWorkspace, parseAuthSession, safeReturnPath } from "../src/features/auth/session.ts";
import { clearDraftRecovery, readDraftRecovery, recoveryAccess, RECOVERY_KEY, RECOVERY_LIFETIME, saveDraftRecovery, type RecoveryEnvelope } from "../src/features/auth/draftRecovery.ts";
import { clearReturnRoute, readReturnRoute, RETURN_ROUTE_KEY, RETURN_ROUTE_LIFETIME, saveReturnRoute } from "../src/features/auth/returnRoute.ts";

const anonymous = {
  mode: "oidc", configured: true, authenticated: false, csrf_token: "anonymous-csrf",
  methods: ["google", "email"], account: null,
  access: { workspace: false, reason: null }, session: null, generation: "preauth-session",
};
const member = {
  ...anonymous, authenticated: true, generation: "member-session",
  account: { id: "account-a", display_name: "Player", sign_in_method: "google", role: "member" },
  access: { workspace: false, reason: "ownership_pending" },
  session: { idle_expires_at: "2026-11-05T20:00:00Z", absolute_expires_at: "2026-11-06T06:00:00Z" },
};
const local = { ...anonymous, mode: "local", configured: false, csrf_token: null, generation: null, methods: [], access: { workspace: true, reason: null } };
const identity = { mode: "oidc" as const, accountId: "account-a", serverGeneration: "generation-a", csrfToken: "csrf-a" };

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

test("identity bootstrap fails closed and #54 never opens hosted global data", () => {
  assert.equal(canMountWorkspace(parseAuthSession(local)), true);
  assert.equal(canMountWorkspace(parseAuthSession(anonymous)), false);
  assert.equal(canMountWorkspace(parseAuthSession(member)), false);
  assert.equal(canMountWorkspace(parseAuthSession({ ...member, access: { workspace: true, reason: null } })), false);
  for (const bad of [{}, { ...local, mode: "unknown" }, { ...local, account: member.account }, { ...member, account: null }, { ...member, generation: 1 }, { ...member, generation: null }, { ...member, session: null }, { ...member, session: { idle_expires_at: "invalid", absolute_expires_at: "invalid" } }, { ...anonymous, csrf_token: {} }]) {
    assert.throws(() => parseAuthSession(bad));
  }
});

test("callback admission and expiry failures keep an actionable cause without exposing unknown input", () => {
  assert.equal(callbackErrorFromSearch(""), "");
  for (const code of ["admission_hold", "auth_required", "session_expired"]) {
    assert.equal(callbackErrorFromSearch(`?auth_error=${code}`), code);
    assert.notEqual(authErrorCopy(code).title, "We couldn't reach sign-in.");
  }
  assert.match(authErrorCopy("admission_hold").message, /Contact/);
  assert.match(authErrorCopy("session_expired").message, /Return to sign-in/);
  assert.equal(callbackErrorFromSearch("?auth_error=unknown-private-server-value"), "invalid_auth");
});

test("return paths retain only known internal workspaces without callback/invitation context", () => {
  assert.equal(safeReturnPath("/deck-builder?invitation=secret&code=secret"), "/deck-builder");
  for (const path of ["https://other.example/decks", "//other.example/decks", "/\\other.example", "/auth/callback", "/join?invitation=secret", "/decks%2fother", "/%252fexample", "/decks\n", "/unknown"]) assert.equal(safeReturnPath(path), "/");
});

test("requests keep credentials same-origin and attach memory-only CSRF to mutations", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const transport = createApiTransport({ fetcher: (async (url, options) => {
    calls.push({ url: String(url), options: options! }); return json({ ok: true });
  }) as typeof fetch });
  transport.setIdentity(identity);
  await transport.request("/api/auth/logout", { method: "POST", body: "{}", credentials: "include", headers: new Headers({ "X-Custom": "preserved" }) });
  const headers = new Headers(calls[0].options.headers);
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(headers.get("X-CSRF-Token"), "csrf-a");
  assert.equal(headers.get("X-Custom"), "preserved");
  assert.equal(headers.get("Content-Type"), "application/json");
  await transport.request("/api/auth/session");
  assert.equal(new Headers(calls[1].options.headers).has("X-CSRF-Token"), false);
});

test("local mutations retain compatibility while unidentified/foreign hosted writes are refused", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return json({ ok: true }); }) as typeof fetch;
  const transport = createApiTransport({ fetcher });
  await assert.rejects(transport.request("/api/decks", { method: "POST", body: "{}" }), (error: unknown) => error instanceof ApiError && error.code === "session_required");
  transport.setIdentity({ mode: "local", accountId: null, serverGeneration: null, csrfToken: null });
  await transport.request("/api/decks", { method: "POST", body: "{}" });
  assert.equal(calls, 1);
  const foreign = createApiTransport({ fetcher, baseUrl: "https://other.example", origin: "https://lab.example" });
  await assert.rejects(foreign.request("/api/auth/session"), (error: unknown) => error instanceof ApiError && error.code === "cross_origin_identity");
  foreign.setIdentity(identity);
  await assert.rejects(foreign.request("/api/auth/logout", { method: "POST" }), (error: unknown) => error instanceof ApiError && error.code === "cross_origin_identity");
  assert.equal(calls, 1);
});

test("malformed proxy error JSON cannot mask an expired session", async () => {
  const transport = createApiTransport({ fetcher: (async () => new Response("not-json", { status: 401, headers: { "Content-Type": "application/json" } })) as typeof fetch });
  transport.setIdentity(identity);
  const failures: ApiError[] = [];
  transport.subscribe(error => failures.push(error));
  await assert.rejects(transport.request("/api/decks"), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(failures.length, 1);
});

test("API failures preserve status/code/retry guidance, without replaying writes", async () => {
  let calls = 0;
  const transport = createApiTransport({ fetcher: (async () => { calls++; return json({ error: "Wait before trying again.", code: "rate_limited" }, 429, { "Retry-After": "37" }); }) as typeof fetch });
  transport.setIdentity(identity);
  await assert.rejects(transport.request("/api/decks", { method: "POST", body: "{}" }), (error: unknown) => error instanceof ApiError && error.status === 429 && error.code === "rate_limited" && error.retryAfter === 37);
  assert.equal(calls, 1);
  assert.equal(retryAfterSeconds("invalid"), null);
  assert.equal(retryAfterSeconds("999999"), 3600);
  assert.equal(retryAfterSeconds("Thu, 05 Nov 2026 20:00:30 GMT", Date.parse("2026-11-05T20:00:00Z")), 30);
});

test("record denial does not trigger reauthentication; session failure is coalesced", async () => {
  let response = json({ error: "Not permitted", code: "record_forbidden" }, 403);
  const transport = createApiTransport({ fetcher: (async () => response.clone()) as typeof fetch });
  transport.setIdentity(identity);
  const failures: ApiError[] = [];
  transport.subscribe(error => failures.push(error));
  await assert.rejects(transport.request("/api/decks/1"));
  assert.equal(failures.length, 0);
  response = json({ error: "Sign in", code: "session_expired" }, 401);
  await assert.rejects(transport.request("/api/decks/1"));
  await assert.rejects(transport.request("/api/decks/2"));
  assert.equal(failures.length, 1);
});

test("account change aborts outstanding requests and rejects even uncancellable late data", async () => {
  let complete!: (response: Response) => void;
  let sentSignal: AbortSignal | null | undefined;
  const transport = createApiTransport({ fetcher: ((_url, options) => {
    sentSignal = options?.signal;
    return new Promise<Response>(resolve => { complete = resolve; });
  }) as typeof fetch });
  transport.setIdentity(identity);
  const pending = transport.request("/api/decks");
  transport.setIdentity({ ...identity, accountId: "account-b", serverGeneration: "generation-b", csrfToken: "csrf-b" });
  assert.equal(sentSignal?.aborted, true);
  complete(json([{ id: 1, name: "Account A private deck" }]));
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === "stale_account_response");
});

test("an account change during response decoding also rejects prior private data", async () => {
  let finish!: (value: unknown) => void;
  const response = json({});
  response.json = () => new Promise(resolve => { finish = resolve; });
  const transport = createApiTransport({ fetcher: (async () => response) as typeof fetch });
  transport.setIdentity(identity);
  const pending = transport.request("/api/decks");
  await new Promise(resolve => setImmediate(resolve));
  transport.invalidate();
  finish({ name: "Prior account" });
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === "stale_account_response");
});

function memoryStorage() {
  const values = new Map<string, string>([["cardfight.play-lab.notes", "Legacy local notes"], ["cardfight.hand-lab.session", "Legacy local playtest"]]);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test("provider-error retries retain only a bounded approved route and clear it separately", () => {
  const storage = memoryStorage();
  const now = 100000;
  saveReturnRoute(storage, "/deck-builder?invitation=private&code=private#private", now);
  assert.equal(readReturnRoute(storage, now + 1), "/deck-builder");
  assert.equal(storage.getItem(RETURN_ROUTE_KEY)?.includes("private"), false);
  assert.equal(readReturnRoute(storage, now + RETURN_ROUTE_LIFETIME), null);
  for (const path of ["https://other.example", "//other.example", "/auth/callback", "/api/decks", "/join", "/decks?code=private"]) {
    storage.setItem(RETURN_ROUTE_KEY, JSON.stringify({ path, createdAt: now, expiresAt: now + 1000 }));
    assert.equal(readReturnRoute(storage, now + 1), null);
  }
  saveReturnRoute(storage, "/decks", now);
  clearReturnRoute(storage);
  assert.equal(storage.getItem(RETURN_ROUTE_KEY), null);
  assert.equal(storage.getItem("cardfight.hand-lab.session"), "Legacy local playtest");
});
const envelope = (now: number): RecoveryEnvelope => ({ schema: 1, accountId: "account-a", route: "/deck-builder", createdAt: now, expiresAt: now + RECOVERY_LIFETIME, drafts: [{ kind: "deck-version", recordId: "7", versionId: "12", value: { notes: "Unsaved hosted draft" } }] });

test("recovery stays account-bound and never claims or removes legacy local state", () => {
  const storage = memoryStorage();
  const now = 100000;
  assert.equal(saveDraftRecovery(storage, envelope(now)), true);
  const recovery = readDraftRecovery(storage, now + 1);
  assert.equal(recoveryAccess(recovery, "account-a"), "same-account");
  assert.equal(recoveryAccess(recovery, "account-b"), "different-account");
  assert.equal(recoveryAccess(recovery, null), "none");
  assert.equal(storage.values.get("cardfight.play-lab.notes"), "Legacy local notes");
  assert.equal(clearDraftRecovery(storage), true);
  assert.equal(storage.values.get("cardfight.hand-lab.session"), "Legacy local playtest");
  assert.equal(storage.values.has(RECOVERY_KEY), false);
});

test("expired, oversized, malformed, or unavailable recovery never claims success", () => {
  const storage = memoryStorage();
  const now = 100000;
  assert.equal(saveDraftRecovery(storage, { ...envelope(now), expiresAt: now + RECOVERY_LIFETIME + 1 }), false);
  assert.equal(saveDraftRecovery(storage, { ...envelope(now), accountId: "" }), false);
  assert.equal(saveDraftRecovery(storage, { ...envelope(now), drafts: [{ kind: "x", recordId: null, versionId: null, value: "x".repeat(70000) }] }), false);
  assert.equal(saveDraftRecovery(storage, envelope(now)), true);
  assert.equal(readDraftRecovery(storage, now + RECOVERY_LIFETIME), null);
  assert.equal(storage.values.has(RECOVERY_KEY), false);
  storage.values.set(RECOVERY_KEY, "not json");
  assert.equal(readDraftRecovery(storage, now), null);
  const denied = { getItem() { throw new Error("Blocked"); }, setItem() { throw new Error("Blocked"); }, removeItem() { throw new Error("Blocked"); } };
  assert.equal(saveDraftRecovery(denied, envelope(now)), false);
  assert.equal(readDraftRecovery(denied, now), null);
  assert.equal(clearDraftRecovery(denied), false);
});
