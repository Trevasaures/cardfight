# Cardfight sign-in experience

The first account experience should feel like entering the same personal lab,
with a clear route back to the deck or form the player was using. Authentication
is a short provider-hosted step; Cardfight owns the invitation, return journey,
account menu, and understandable recovery states. This is the product contract
for [identity design](adr/0001-identity-and-access.md). The first #54 runtime
implements the welcome, provider handoff, account menu and admission hold screen.
The [setup guide](authentication-setup.md) describes staging verification for
sign-in and account-scoped workspaces.

## Visual direction

Keep the current charcoal surfaces, warm gold actions, Inter/system typography,
restrained card borders, and existing Cardfight mark. Use a focused welcome
surface with one clear action rather than placing a login form inside the full
dashboard shell. Do not show another player's workspace behind a login overlay.
Provider-hosted pages should share the mark, colors, naming, and approved
callback flow where the chosen provider supports that branding.

Use descriptive copy and familiar controls, visible keyboard focus, persistent
labels, a logical tab order, and a single-column mobile layout. Primary actions
have at least a 44px target. Status changes are announced through an appropriate
live region; errors keep a useful action and do not rely on color. Respect
reduced motion and avoid animated transitions that hide progress or steal focus.

## Primary journey

1. An invited player opens Cardfight or a valid invitation. A brief neutral
   loading state checks the application session before mounting any private page.
2. The welcome screen says **Welcome to your lab** and explains **Build decks,
   track your matches, and pick up where you left off.** Google and email are
   the selected beta methods. Email one-time codes remain the proposed email
   flow, subject to the final provider configuration.
3. Selecting a method creates one login attempt and navigates in the same tab
   to the branded provider. Google account selection or the email-code form is
   handled there. Cardfight never recreates the provider's password/OTP fields.
4. On return, show **Opening your workspace…** only while admission/session
   checks finish. A valid invitation is consumed atomically; cancellation and
   wrong-account paths remain recoverable.
5. Restore the approved return route after the server establishes the current
   account. Do not redirect every successful sign-in to the dashboard or require
   repeated profile/onboarding questions before an invited player can begin.

The beta has no open sign-up funnel or artificial waitlist. A provider may create
its own identity profile during authentication; that alone does not create an
admitted Cardfight workspace. Keep invitation failures neutral enough to avoid
disclosing membership or whether a particular email was approved.

## Screens and states

| State | Player-facing content and action | Behavior |
| --- | --- | --- |
| Checking session | Opening Cardfight… | Neutral shell/skeleton; private routes stay unmounted. One request determines current identity. |
| Welcome | Welcome to your lab. Continue with Google / Continue with email. | Full-page same-tab handoff. Show only enabled methods; do not collect a pretend email or OTP locally. |
| Provider handoff | Continuing securely… / Back to sign in. | Disable duplicate submits. Cancellation returns to the welcome screen; do not leave an endless spinner. |
| Approved callback | Opening your workspace… | Establish admission/current account before any data fetch; restore safe route afterward. |
| Invitation required or wrong account | This beta is invite-only. Use the account on your invitation or contact the person who invited you. | Offer Use another account and Back to sign in. Do not reveal another address or membership status. |
| Expired/revoked invitation | This invitation can't be used. Ask the person who invited you for a new one. | No automatic account creation, hidden acceptance or resending to an arbitrary email. |
| Session expired | Sign in again to continue. Your draft is kept in this tab while you sign back in. | Lock private interaction, prepare short-lived draft recovery, and offer Sign in again / Discard draft and sign out. |
| Provider unavailable | We couldn't reach sign-in. Try again in a moment. | Preserve the return route/draft and offer Retry / Back. Distinguish this from an incorrect account; do not loop through redirects. |
| Too many attempts | Please wait before trying again. | Respect Retry-After with an accessible timed or manually refreshed retry action; allow leaving the page. |
| Suspended/revoked account | Your access is unavailable. Contact the person who invited you. | Stop requests, lock the private tree, revoke local access; a retry does not bypass admission. |
| Signed in | Account name, sign-in method, account settings, Sign out. | Put the account menu where Your personal lab currently appears. Avoid an always-visible email address in the sidebar. |
| Explicit sign out | Sign out of Cardfight? Unsaved drafts on this browser will be cleared. | Stay here / Sign out. Skip the confirmation when there is no unsaved work. Revoke server session, clear private state, then show signed-out screen. |

The screen wording is proposed product copy, not a promise that authentication
already exists. The design preview simulates these states without credentials,
network requests, invitations, or provider interaction.

## Session expiry and interrupted work

Treat session expiry, denied access, network loss, and an uncertain save as
different states. Preserve input during ordinary recoverable connection errors.
When authentication expires, stop new writes and coalesce concurrent `401`
responses into one reauthentication journey. API responses carry typed status
and error codes so the client does not infer the cause from an English message.

A same-tab provider redirect destroys JavaScript memory. Before navigating for
reauthentication, place only the needed draft in a short-lived recovery envelope
in that tab's sessionStorage, keyed by the last server-confirmed account UUID,
draft schema, route and record/version reference. The proposed retention window
is 30 minutes. Never put provider tokens, session cookies, PKCE verifiers or
CSRF secrets there. Do not save on a failed storage operation and claim success:
show a keep-this-tab/copy-draft fallback or let the user remain on the page.

On return, load the verified account first. Restore the envelope only for the
same account and after current access to its referenced record is confirmed.
Refetch server state and check for a concurrent edit before offering to resume.
Clear the envelope after restoration, expiry, or explicit sign-out. On a
different-account return, keep it briefly quarantined and mount neither the prior
draft nor the new account's private tree until the player chooses. Offer
**Return to previous account** (end the new session, then use account selection)
or **Continue and discard draft** (purge the old envelope, then mount the new
account). Expiry still applies. A different account never imports or renders the
prior account's draft; do not clear it before offering a return that needs it.

sessionStorage is browser-local storage, not an authorization or encryption
boundary. Keep this recovery minimal and temporary, purge it on explicit logout,
and do not promise protection from someone who controls the browser profile.
Existing local-only saved Hand Lab recovery needs a deliberate #55 claim or
quarantine path for the trusted owner; do not wipe it or assign it to the first
person who signs in.

Never automatically replay POST/PATCH/DELETE after login or a timeout. A lost
response may mean the save already happened. Refetch and let the user review the
result before submitting again. Safe GETs may retry once after reauthentication.
A recovered draft remains a draft until the player explicitly saves it.

## Account boundaries in the existing client

Changing a storage-key prefix alone is insufficient. The current
`usePersistentState` initializes React state only once, then writes that state
when its key changes. It can write account A's value under account B's new key.
Reset/remount account-bound state before persistence effects are allowed to run.

The Hand Lab `playtestStore` is a module-level singleton with cached state.
Unmounting React does not clear it. Add an explicit account-bound lifecycle/reset
that clears loaded state, Undo/history, selected cards, and pending saves before
another account is mounted. Dashboard and Hand Lab also call localState utilities
directly, so inventory those accesses alongside the hook and recovery store.

The authenticated app boundary must:

- Resolve `/api/auth/session` before mounting private routes.
- Key the private tree to verified account UUID plus an account-state generation.
- Cancel outstanding requests and reject late responses from a previous account
  generation, even if the network request cannot actually be cancelled.
- Clear private in-memory caches, selection, search/history snippets, private
  browser drafts, and Hand Lab state on explicit logout or account change.
- Notify other same-origin tabs about logout/account change using a small event,
  never by broadcasting credentials or private records. Each tab checks server
  state and locks itself; restored bfcache pages must recheck authentication.
- Persist harmless global choices such as theme separately from private data.

A browser tab sends the generation from its last verified session with private
API requests. A stale tab must verify the current session before reading the
workspace again.

## Recovery and choice of sign-in method

Email sign-in uses a provider-delivered one-time code; it avoids maintaining an
application password/reset workflow. Google users recover their Google account
through Google. Reissuing a Cardfight invitation does not prove control of a
previous identity and must not transfer its workspace.

If someone switches between Google and email with the same address, do not
silently create a second empty workspace or attach them to an existing one.
Explain **Use the method you originally used for Cardfight** without revealing
another account's details. Show the current sign-in method in the authenticated
account menu/settings. Explicit proof-based linking is a later feature.

Sign-out copy says Cardfight, not Google. After local logout, use another account
must request provider account selection; an existing upstream SSO session must
not cause an unexplained bounce straight back into the same Cardfight workspace.
If upstream logout fails, Cardfight still confirms its local session was ended.

## Experience acceptance

Review these journeys at desktop and 360px mobile width using keyboard-only input
and reduced motion: invitation to first entry, returning player deep link,
provider cancellation/outage, email resend behavior on the provider, expired
session with a draft, wrong-account reauthentication, multi-tab sign-out and
explicit logout with unsaved work. Keep route transitions stable and give focus
to the new heading or actionable error. Real provider email/MFA delivery,
screen-reader behavior, and network failures need staging verification; a visual
mockup does not establish them.
