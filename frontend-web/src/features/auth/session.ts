export type SignInMethod = "google" | "email";
export type AuthAccount = {
  id: string;
  display_name: string;
  sign_in_method: string;
  role: string;
};
export type AuthSession = {
  mode: "local" | "oidc";
  configured: boolean;
  authenticated: boolean;
  csrf_token: string | null;
  methods: SignInMethod[];
  account: AuthAccount | null;
  access: { workspace: boolean; reason: string | null };
  session: { idle_expires_at: string; absolute_expires_at: string } | null;
  generation: string | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** An invalid/unavailable identity response must never enable the local workspace. */
export function parseAuthSession(value: unknown): AuthSession {
  if (!record(value) || !["local", "oidc"].includes(String(value.mode)) || typeof value.configured !== "boolean" || typeof value.authenticated !== "boolean" || !record(value.access) || typeof value.access.workspace !== "boolean" || !Array.isArray(value.methods)) {
    throw new Error("Cardfight could not confirm its sign-in configuration.");
  }
  const account = value.account;
  if (value.authenticated && (!record(account) || typeof account.id !== "string" || !account.id || typeof account.display_name !== "string" || typeof account.sign_in_method !== "string" || typeof account.role !== "string")) {
    throw new Error("Cardfight could not confirm the current account.");
  }
  if (value.mode === "local" && (value.authenticated || account !== null || value.access.workspace !== true)) throw new Error("Cardfight returned an inconsistent local session.");
  if (!value.authenticated && account !== null) throw new Error("Cardfight returned an inconsistent sign-in state.");
  if (value.csrf_token !== null && typeof value.csrf_token !== "string") throw new Error("Cardfight could not confirm request protection.");
  if (value.generation !== null && typeof value.generation !== "string") throw new Error("Cardfight could not confirm the session generation.");
  if (value.session !== null && (!record(value.session) || typeof value.session.idle_expires_at !== "string" || typeof value.session.absolute_expires_at !== "string")) throw new Error("Cardfight could not confirm the session lifetime.");
  if (value.mode === "oidc" && value.authenticated && (!value.configured || !value.csrf_token || !value.generation || !record(value.session) || !Number.isFinite(Date.parse(String(value.session.idle_expires_at))) || !Number.isFinite(Date.parse(String(value.session.absolute_expires_at))))) throw new Error("Cardfight could not confirm the current session.");
  return {
    mode: value.mode as AuthSession["mode"], configured: value.configured,
    authenticated: value.authenticated, csrf_token: value.csrf_token as string | null,
    methods: [...new Set(value.methods.filter((method): method is SignInMethod => method === "google" || method === "email"))],
    account: account as AuthAccount | null,
    access: { workspace: value.access.workspace, reason: typeof value.access.reason === "string" ? value.access.reason : null },
    session: value.session as AuthSession["session"], generation: value.generation as string | null,
  };
}

/** #54 deliberately does not admit hosted accounts to the unscoped #55 workspace. */
export function canMountWorkspace(session: AuthSession): boolean {
  return session.mode === "local" && session.access.workspace;
}

const RETURN_ROUTES = new Set(["/", "/play", "/hand-lab", "/decks", "/cards", "/deck-builder", "/order-tracker", "/nation-quiz", "/matches", "/analytics", "/rivalries"]);
export function safeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || [...value].some(character => character.charCodeAt(0) <= 32) || /%2f|%5c/i.test(value)) return "/";
  try {
    const path = new URL(value, "https://cardfight.invalid");
    return path.origin === "https://cardfight.invalid" && RETURN_ROUTES.has(path.pathname) ? path.pathname : "/";
  } catch { return "/"; }
}

export function signInMethodLabel(method: string): string {
  return method === "google" ? "Google" : method === "email" ? "email" : "your sign-in provider";
}

const CALLBACK_ERRORS = new Set(["provider_unavailable", "invitation_required", "method_conflict", "invalid_auth", "account_unavailable", "admission_hold", "auth_required", "session_expired", "rate_limited"]);
export function callbackErrorFromSearch(search: string): string {
  const code = new URLSearchParams(search).get("auth_error");
  return code ? CALLBACK_ERRORS.has(code) ? code : "invalid_auth" : "";
}

export function authErrorCopy(code: string): { title: string; message: string } {
  switch (code) {
    case "invitation_required":
      return { title: "This beta is invite-only.", message: "Use the account on your invitation, or contact the person who invited you." };
    case "method_conflict":
      return { title: "Use your original sign-in method.", message: "Try the method you first used for Cardfight. Changing methods does not move your workspace." };
    case "account_unavailable":
    case "admission_hold":
      return { title: "Your access is unavailable.", message: "Contact the person who invited you. Your workspace has not been changed." };
    case "rate_limited":
      return { title: "Please wait before trying again.", message: "There have been too many attempts. You can return to sign-in in a moment." };
    case "invalid_auth":
      return { title: "Sign-in wasn't completed.", message: "Your sign-in may have expired or been cancelled. You can try again." };
    case "auth_required":
    case "session_expired":
      return { title: "Sign in again to continue.", message: "Your sign-in expired before this step finished. Return to sign-in and try again." };
    default:
      return { title: "We couldn't reach sign-in.", message: "Please try again in a moment. Nothing in your workspace has changed." };
  }
}
