import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BookmarkCheck, Check, ChevronDown, CloudOff, LockKeyhole, LogOut, Mail, RefreshCw, ShieldCheck, Swords } from "lucide-react";
import { apiRequest, apiTransport } from "../../api/client";
import { ApiError } from "../../api/transport";
import { playtestStore } from "../hand-lab/sessionStore";
import { clearDraftRecovery, readDraftRecovery, recoveryAccess, type RecoveryEnvelope } from "./draftRecovery";
import { authErrorCopy, callbackErrorFromSearch, canMountWorkspace, parseAuthSession, safeReturnPath, signInMethodLabel, type AuthSession, type SignInMethod } from "./session";
import { clearReturnRoute, readReturnRoute, saveReturnRoute } from "./returnRoute";
import "./identity.css";

type Model = { phase: "checking" | "ready" | "expired" | "error"; session: AuthSession | null; error: string; retryUntil: number };
const EVENT_KEY = "cardfight.auth.boundary-event";

function pendingDraft(): RecoveryEnvelope | null {
  try { return readDraftRecovery(window.sessionStorage); } catch { return null; }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<Model>({ phase: "checking", session: null, error: "", retryUntil: 0 });
  const [callbackError, setCallbackError] = useState(() => callbackErrorFromSearch(window.location.search));
  const [recovery, setRecovery] = useState(pendingDraft);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [actionError, setActionError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [priorAccountId, setPriorAccountId] = useState<string | null>(null);
  const [returnTo] = useState(() => {
    try { if (window.location.pathname === "/sign-in") return readReturnRoute(window.sessionStorage) ?? "/"; } catch { /* Use a neutral route when tab storage is unavailable. */ }
    return safeReturnPath(window.location.pathname + window.location.search);
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const applySession = useCallback((session: AuthSession) => {
    const previous = sessionRef.current;
    if (session.account) {
      setPriorAccountId(session.account.id);
      try { clearReturnRoute(window.sessionStorage); } catch { /* Route context is optional. */ }
    }
    if (session.mode === "oidc" && (previous?.account?.id !== session.account?.id || previous?.generation !== session.generation)) {
      // Hosted pages are closed in #54. Do not claim/delete the local lab's save.
      playtestStore.resetMemory();
      setMenuOpen(false);
    }
    apiTransport.setIdentity({ mode: session.mode, accountId: session.account?.id ?? null, serverGeneration: session.generation, csrfToken: session.csrf_token });
    sessionRef.current = session;
  }, []);

  const refresh = useCallback(async (reason: "initial" | "recheck" | "expired" = "recheck") => {
    if (reason === "recheck" && requestRef.current && !requestRef.current.signal.aborted) return;
    const sequence = ++sequenceRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const previous = sessionRef.current;
    if (previous?.mode !== "local" || reason !== "recheck") setModel(current => ({ ...current, phase: "checking", error: "" }));
    try {
      const session = parseAuthSession(await apiRequest<unknown>("/api/auth/session", { signal: controller.signal, cache: "no-store" }));
      if (sequence !== sequenceRef.current) return;
      applySession(session);
      setRecovery(pendingDraft());
      setModel({ phase: session.mode === "oidc" && !session.authenticated && reason === "expired" ? "expired" : "ready", session, error: "", retryUntil: 0 });
    } catch (error) {
      if (sequence !== sequenceRef.current || controller.signal.aborted) return;
      const temporaryFailure = error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
      // A background network outage must not discard edits in the local lab.
      if (reason === "recheck" && previous?.mode === "local" && temporaryFailure) return;
      apiTransport.invalidate();
      setModel({ phase: "error", session: null, error: error instanceof Error ? error.message : "Cardfight could not check sign-in.", retryUntil: error instanceof ApiError && error.retryAfter ? Date.now() + error.retryAfter * 1000 : 0 });
    } finally {
      if (sequence === sequenceRef.current) requestRef.current = null;
    }
  }, [applySession]);

  const cancelSessionCheck = useCallback(() => {
    sequenceRef.current++;
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => {
    void refresh("initial");
    return cancelSessionCheck;
  }, [refresh, cancelSessionCheck]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth_error")) {
      url.searchParams.delete("auth_error");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => apiTransport.subscribe((error) => {
    apiTransport.invalidate();
    setActionError("");
    setCallbackError(error.code === "account_unavailable" ? "account_unavailable" : "");
    void refresh("expired");
  }), [refresh]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== "hidden") void refresh("recheck");
    };
    const restoredPage = (event: PageTransitionEvent) => { if (event.persisted) { setHandoff(false); cancelSessionCheck(); apiTransport.invalidate(); recheck(); } };
    const receivedBoundary = (signedOut = false) => {
      cancelSessionCheck();
      apiTransport.invalidate();
      if (signedOut) {
        try {
          clearReturnRoute(window.sessionStorage);
          if (clearDraftRecovery(window.sessionStorage)) setRecovery(null);
          else setActionError("Your session ended in another tab, but this tab could not clear its recovery draft. Close it on a shared device.");
        } catch { setActionError("Your session ended in another tab. Close this tab on a shared device."); }
      }
      if (sessionRef.current?.mode === "oidc") {
        playtestStore.resetMemory();
        setModel(current => ({ ...current, phase: "checking" }));
      }
      recheck();
    };
    const storageEvent = (event: StorageEvent) => {
      if (event.key !== EVENT_KEY) return;
      try { receivedBoundary(JSON.parse(event.newValue ?? "{}").type === "signed-out"); }
      catch { receivedBoundary(); }
    };
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel("cardfight-auth-boundary");
      channelRef.current.onmessage = (event: MessageEvent) => receivedBoundary(event.data?.type === "signed-out");
    }
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", restoredPage);
    window.addEventListener("storage", storageEvent);
    return () => {
      channelRef.current?.close(); channelRef.current = null;
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", restoredPage);
      window.removeEventListener("storage", storageEvent);
    };
  }, [refresh, cancelSessionCheck]);

  useEffect(() => {
    if (model.retryUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [model.retryUntil]);

  const idleExpiry = model.session?.authenticated ? model.session.session?.idle_expires_at : undefined;
  const absoluteExpiry = model.session?.authenticated ? model.session.session?.absolute_expires_at : undefined;
  useEffect(() => {
    if (!idleExpiry || !absoluteExpiry) return;
    const expiry = Math.min(Date.parse(idleExpiry), Date.parse(absoluteExpiry));
    if (!Number.isFinite(expiry)) return;
    const timer = window.setTimeout(() => { void refresh("expired"); }, Math.max(1000, Math.min(expiry - Date.now(), 2_147_483_647)));
    return () => window.clearTimeout(timer);
  }, [idleExpiry, absoluteExpiry, refresh]);

  useEffect(() => {
    if (model.session?.mode !== "local") headingRef.current?.focus({ preventScroll: true });
  }, [model.phase, callbackError, confirmLogout, signedOut, handoff, model.session?.mode]);

  function notifyBoundary(preserveRecovery: boolean) {
    const event = { type: preserveRecovery ? "session-changed" : "signed-out", nonce: `${Date.now()}:${Math.random()}` };
    channelRef.current?.postMessage(event);
    try { window.localStorage.setItem(EVENT_KEY, JSON.stringify(event)); } catch { /* A denied preference store cannot prevent server logout. */ }
  }

  function clearRecovery(): boolean {
    try {
      if (!clearDraftRecovery(window.sessionStorage)) return false;
      setRecovery(null);
      return true;
    } catch { return false; }
  }

  async function logout(preserveRecovery = false) {
    if (signingOut) return;
    setSigningOut(true); setActionError("");
    try {
      const session = parseAuthSession(await apiRequest<unknown>("/api/auth/logout", { method: "POST", body: "{}" }));
      cancelSessionCheck();
      apiTransport.invalidate();
      applySession(session);
      playtestStore.resetMemory();
      try { clearReturnRoute(window.sessionStorage); } catch { /* Route context is optional. */ }
      if (!preserveRecovery && !clearRecovery()) setActionError("Your Cardfight session ended, but this tab could not clear its recovery draft. Close this tab on a shared device.");
      setMenuOpen(false); setConfirmLogout(false); setCallbackError("");
      setSignedOut(!preserveRecovery);
      setModel({ phase: "ready", session, error: "", retryUntil: 0 });
      notifyBoundary(preserveRecovery);
      // Logout removes the cookie and its CSRF token. Reopen the account
      // chooser with a fresh anonymous session when keeping the draft.
      if (preserveRecovery) await refresh("initial");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not confirm sign-out. Please try again.");
      if (error instanceof ApiError && error.status === 401) void refresh("expired");
    } finally { setSigningOut(false); }
  }

  function startSignIn(event: FormEvent<HTMLFormElement>) {
    if (!model.session?.configured || !model.session.csrf_token || handoff) { event.preventDefault(); return; }
    // These forms contain only server-issued CSRF and sign-in intent. The
    // provider owns the credential/code screen; no tokens enter browser storage.
    event.preventDefault();
    try { saveReturnRoute(window.sessionStorage, returnTo); } catch { /* Native submission remains available without tab storage. */ }
    // Submit while the native form is connected, before its loading view mounts.
    HTMLFormElement.prototype.submit.call(event.currentTarget);
    setHandoff(true); setActionError("");
  }

  const session = model.session;
  if (session && model.phase === "ready" && canMountWorkspace(session)) return children;

  const waiting = Math.max(0, Math.ceil((model.retryUntil - now) / 1000));
  const account = session?.account ?? null;
  const mismatch = recoveryAccess(recovery, account?.id ?? null) === "different-account";
  const ownDraft = recovery && recovery.accountId === (account?.id ?? priorAccountId);
  const unavailable = session?.mode === "oidc" && !session.configured;
  const callbackCopy = callbackError ? authErrorCopy(callbackError) : null;

  function methods() {
    return <div className="identity-actions">{session?.methods.map((method: SignInMethod) => <form key={method} action="/auth/start" method="post" onSubmit={startSignIn}>
      <input type="hidden" name="csrf_token" value={session.csrf_token ?? ""} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button className={`identity-button ${method === "email" ? "is-primary" : ""}`} type="submit" disabled={!session.configured || !session.csrf_token || handoff || waiting > 0}>
        {method === "email" ? <Mail size={18} aria-hidden="true" /> : <span className="identity-google" aria-hidden="true">G</span>}
        Continue with {method === "email" ? "email" : "Google"}
      </button>
    </form>)}</div>;
  }

  let content: ReactNode;
  if (model.phase === "checking") {
    content = <><p className="identity-eyebrow">Your personal lab</p><h1 ref={headingRef} tabIndex={-1}>Opening Cardfight…</h1><p className="identity-copy" role="status">Checking your sign-in before opening your workspace.</p></>;
  } else if (model.phase === "error") {
    content = <><CloudOff className="identity-state-icon" aria-hidden="true" /><h1 ref={headingRef} tabIndex={-1}>Couldn't check sign-in.</h1><p className="identity-copy" role="alert">{model.error}</p><button className="identity-button is-primary" type="button" disabled={waiting > 0} onClick={() => { void refresh("initial"); }}><RefreshCw size={17} aria-hidden="true" />{waiting ? `Try again in ${waiting}s` : "Try again"}</button></>;
  } else if (handoff) {
    content = <><p className="identity-eyebrow">One secure step</p><h1 ref={headingRef} tabIndex={-1}>Continuing securely…</h1><p className="identity-copy" role="status">Finish sign-in with your provider. We'll bring you back to Cardfight.</p><button className="identity-button is-quiet" type="button" onClick={() => { setHandoff(false); void refresh(); }}>Back to sign in</button></>;
  } else if (mismatch) {
    content = <><LockKeyhole className="identity-state-icon" aria-hidden="true" /><h1 ref={headingRef} tabIndex={-1}>Keep your draft separate.</h1><p className="identity-copy">You signed in to a different account. Your earlier draft stays locked until you choose what to do.</p><div className="identity-notice"><LockKeyhole size={18} aria-hidden="true" /><p>Your previous account's draft hasn't been opened here.</p></div><div className="identity-actions"><button className="identity-button is-primary" type="button" disabled={signingOut} onClick={() => { void logout(true); }}>Return to previous account</button><button className="identity-button is-destructive" type="button" onClick={() => { if (!clearRecovery()) setActionError("Could not clear the recovery draft. Keep this tab open and try again."); }}>Continue and discard draft</button></div></>;
  } else if (confirmLogout) {
    content = <><p className="identity-eyebrow">Before you go</p><h1 ref={headingRef} tabIndex={-1}>Sign out of Cardfight?</h1><p className="identity-copy">The unsaved recovery draft for this hosted account will be cleared from this tab. Your local-only lab is kept separately.</p><div className="identity-actions"><button className="identity-button is-primary" type="button" onClick={() => setConfirmLogout(false)} disabled={signingOut}>Stay here</button><button className="identity-button is-destructive" type="button" onClick={() => { void logout(); }} disabled={signingOut}>{signingOut ? "Signing out…" : "Clear draft and sign out"}</button></div></>;
  } else if (callbackCopy) {
    content = <><CloudOff className="identity-state-icon" aria-hidden="true" /><h1 ref={headingRef} tabIndex={-1}>{callbackCopy.title}</h1><p className="identity-copy" role="alert">{callbackCopy.message}</p><button className="identity-button is-primary" type="button" onClick={() => { setCallbackError(""); void refresh(); }}>Back to sign in</button></>;
  } else if (session?.authenticated && account) {
    content = <><p className="identity-eyebrow">Your personal workspace</p><h1 ref={headingRef} tabIndex={-1}>You're signed in.</h1><p className="identity-copy">{session.access.reason === "admission_hold" ? "Hosted access is temporarily on hold. Your workspace hasn't been changed." : "Your account is ready. Your personal workspace will open when the hosted beta is available."}</p><div className="identity-account"><button ref={accountButtonRef} className="identity-button identity-account-button" type="button" aria-expanded={menuOpen} aria-controls="identity-account-actions" onClick={() => setMenuOpen(!menuOpen)}><span className="identity-avatar" aria-hidden="true">{account.display_name.trim().slice(0, 2).toUpperCase() || "CF"}</span><span>{account.display_name || "Your account"}</span><ChevronDown size={17} aria-hidden="true" /></button>{menuOpen && <div id="identity-account-actions" className="identity-account-menu" onKeyDown={(event) => { if (event.key === "Escape") { setMenuOpen(false); accountButtonRef.current?.focus(); } }}><p>Signed in with {signInMethodLabel(account.sign_in_method)}</p><button className="identity-button is-quiet" type="button" disabled={signingOut} onClick={() => { if (ownDraft) setConfirmLogout(true); else void logout(); }}><LogOut size={17} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out of Cardfight"}</button></div>}</div>{ownDraft && <div className="identity-notice"><BookmarkCheck size={18} aria-hidden="true" /><p>Your draft remains closed in this tab until workspace access is available.</p></div>}<p className="identity-holding" role="status"><ShieldCheck size={17} aria-hidden="true" />Your private workspace stays closed during beta preparation.</p><button className="identity-button is-quiet" type="button" onClick={() => { void refresh(); }}><RefreshCw size={17} aria-hidden="true" />Check access</button></>;
  } else if (signedOut) {
    content = <><Check className="identity-state-icon" aria-hidden="true" /><h1 ref={headingRef} tabIndex={-1}>You're signed out.</h1><p className="identity-copy">Your Cardfight session has ended. This does not sign you out of Google.</p><button className="identity-button is-primary" type="button" onClick={() => { setSignedOut(false); void refresh("initial"); }}>Sign in again<ArrowRight size={17} aria-hidden="true" /></button></>;
  } else {
    content = <><p className="identity-eyebrow">Your personal workspace</p><h1 ref={headingRef} tabIndex={-1}>{model.phase === "expired" ? "Sign in again to continue." : "Welcome to your lab."}</h1><p className="identity-copy">{unavailable ? "Sign-in is not available yet. The hosted beta isn't accepting sign-ins until setup is complete." : "Build decks, track your matches, and pick up where you left off."}</p>{ownDraft && <div className="identity-notice"><BookmarkCheck size={18} aria-hidden="true" /><p>Your draft is kept in this tab while you sign back in to the same account.</p></div>}{methods()}<p className="identity-copy identity-small">Use the account on your invitation. Your sign-in provider handles Google and email verification.</p>{ownDraft && <button className="identity-button is-quiet" type="button" onClick={() => { if (clearRecovery()) { setSignedOut(true); setModel(current => ({ ...current, phase: "ready" })); } else setActionError("Could not clear the draft in this tab. Close it on a shared device."); }}>Discard recovery draft</button>}</>;
  }

  return <div className="identity-page"><section className="identity-card" aria-label="Cardfight sign-in" onKeyDown={(event) => { if (event.key === "Escape" && menuOpen) { setMenuOpen(false); accountButtonRef.current?.focus(); } }}><header className="identity-brand"><span className="identity-brand-mark"><Swords size={22} strokeWidth={1.5} aria-hidden="true" /></span><span><strong>CARDFIGHT.</strong><small>THE VANGUARD LAB</small></span></header><div className="identity-content">{content}</div>{actionError && <p className="identity-error" role="alert">{actionError}</p>}<footer className="identity-footer"><ShieldCheck size={15} aria-hidden="true" />Invite-only beta</footer></section></div>;
}
