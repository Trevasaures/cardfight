# Identity implementation and verification plan

This is the implementation sequence for [#54](https://github.com/Trevasaures/cardfight/issues/54),
following the [identity ADR](adr/0001-identity-and-access.md) and
[experience contract](identity-experience.md). The present slice implements the
additive identity schema, provider adapter, invitations, opaque sessions,
authorization gate and client sign-in experience. Provider configuration and
integrated staging evidence are still pending; legacy-owner assignment and
private-record access remain #55 work. The [setup guide](authentication-setup.md)
contains the operational steps and distinguishes tested code from tenant proof.

## Small implementation slices

| Slice | Deliverable and evidence |
| --- | --- |
| Identity decision and provider spike | Configure the selected Google/email methods and verify the proposed email-code flow, hosted branding, MFA, production mail delivery, callback/logout configuration, cost and region. Prove Authlib uses trusted server-held state/nonce/PKCE and no provider tokens in browser cookies/storage. Use a disposable staging application, not production data. |
| Additive account storage | Add a new Alembic revision for accounts, external identities, invitations, auth transactions, sessions and audit metadata. Keep the released baseline immutable. Rehearse against a verified existing-data copy and preserve all old table values/IDs/BLOBs. No network calls or first-user ownership claims in the migration. |
| Provider and session lifecycle | Implement the code exchange, exact identity resolution, atomic invitation acceptance, opaque session issuance/rotation, expiry, revocation and local logout. Add a controlled operator bootstrap. Test the account interface before private routes depend on it. |
| Application authorization | Deny private routes by default in hosted mode; add member/admin permissions, CSRF/origin enforcement, bounded attempts and safe errors. Remove the mutating GET recount path and classify artwork/private caching. Keep hosted access gated on #55 readiness. |
| Native client integration | Add a single session coordinator and typed API errors, session bootstrap, provider handoff, account menu, safe return paths and recoverable expiry. Implement draft/late-response/store-reset boundaries with #55. Match the agreed preview and accessibility contract. |
| Integrated staging proof | Exercise real provider callbacks, email delivery, cancellation, MFA, multi-tab/account transitions and network faults with disposable accounts. Combine #54 checks with #55 ownership checks before inviting players. Retain traces without credentials or private records. |

Each implementation slice should be reviewable on its own. A merged identity
slice does not imply that the application is ready for multiple users. The
public-release gate remains closed until the combined evidence is complete.

## Browser and API contract

The first five routes below exist in this slice. Administration currently uses
explicit trusted-console commands; browser administration remains deferred until
fresh provider MFA can be enforced and verified.

| Operation | Request and result |
| --- | --- |
| GET `/api/auth/session` | No-store JSON with authenticated/anonymous state, enabled methods, minimal current-account display/capabilities when authenticated, expiry information and a session/pre-auth-bound CSRF token. No provider/session bearer token. Missing storage dependency returns a bounded `503`, not anonymous success. |
| POST `/auth/start` | Native top-level form submission with CSRF, enabled method, safe relative return path and optional server-held invitation context. Returns a provider redirect. Do not follow this redirect through fetch. |
| GET `/auth/callback` | Server-only code/state exchange and validation; success rotates the application session and redirects to a clean same-origin route. Failure returns to an actionable application state with a safe error category. Redact sensitive callback query values from diagnostics. |
| POST `/api/auth/logout` | Session-bound CSRF; revoke local session and expire its cookie before any optional upstream logout. Repeated logout has a consistent signed-out result. |
| GET `/join` | May capture a supplied link token into bounded server-held context and redirect to a clean URL, but does not consume the invitation or confer membership. Explicit continuation plus verified identity establishes acceptance intent. |
| Administrative invitation/access actions | Operator CLI for this slice. Future web POST/PATCH operations require fresh authentication/MFA; no public self-promotion or arbitrary provider-management proxy. |

The shared API client must retain HTTP status, a stable error code, safe display
message, and optional request correlation/retry metadata. Private API failures
stay JSON. Authentication failure starts one coordinated reauthentication state;
it is not a route-by-route redirect. Permissions, disabled admission, rate limits,
and upstream outages have distinct handling. Browser requests use same-origin
credentials; the development proxy sends `/api` and auth routes to Flask.

Expose a small server-side current-account interface, for example an immutable
account context obtained from request state. Its UUID, role, admission status,
authentication time and authorization version come from validated server data.
Untrusted JSON, URL owner IDs, email claims without token validation, or frontend
role flags cannot construct this context.

## Configuration and failure boundaries

Use explicit, validated local/hosted access mode, canonical public origin,
configured OIDC issuer/client ID/client secret, callback/logout allowlists,
auth-transaction encryption configuration, and an external restore epoch.
Final environment names belong with implementation. Provider secrets and keys
are server-only; `.env.example` contains names/placeholders, never credentials.
Do not add an authentication-disable flag as a hosted fallback.

Authlib examples are starting points for the protocol, not a license to copy
provider tokens or transaction secrets into Flask's default signed client-side
session. The first spike must prove the selected server-side state/session
adapter, transaction lifecycle and nonce validation. Request minimal scopes and
avoid provider refresh tokens unless a later requirement justifies them.

After restoring an identity-containing checkpoint, rotate the externally held
restore epoch, invalidate restored sessions/pending auth transactions/unused
invitations, and hold admission closed outside the restored database until every
membership, suspension and role has been reconciled/reapproved from trusted
operator records. A fresh login must not revive a suspension lost by restoring
an older admitted-account row. Test this separately from data restoration: preserving player records
must not revive old access credentials or undo an intentional revocation.

## Existing code that needs deliberate changes

| Current location | Required treatment |
| --- | --- |
| `backend/app.py`, `backend/config.py`, route registration | Integrate identity/session resolution and explicit access mode while retaining read-only migration readiness. Missing hosted configuration or storage cannot downgrade to anonymous access. |
| `backend/routes/admin.py` | `/api/admin/recount` uses POST. Hosted access stays gated until #55 can enforce administrator permission and CSRF protection on workspace routes. |
| `backend/routes/card_images.py` | Stored artwork currently sends public immutable cache headers. Define admitted/private caching before gating routes; use private/no-store behavior until #55's public catalog policy is explicit. |
| `backend/errors.py` and `frontend-web/src/api/client.ts` | Add safe authentication/authorization error categories and client status-aware handling without weakening existing rollback/error behavior. |
| `frontend-web/src/App.tsx`, `components/layout/AppShell.tsx` | Gate the private tree after session bootstrap and replace the personal-lab footer with an account menu. Preserve approved deep links. |
| `frontend-web/src/hooks/usePersistentState.ts` | Prevent old in-memory values being written under a new account's key; remount/reset safely before enabling persistence. |
| `frontend-web/src/features/hand-lab/sessionStore.ts` | Add an explicit account lifecycle to the module singleton, including cached loaded state and Undo/recovery. A React unmount alone is insufficient. |
| Dashboard, Hand Lab and localState utilities | Inventory direct storage reads/writes, outstanding requests and private drafts in addition to the shared hook. Quarantine/claim legacy recovery explicitly under #55. |

## Verification matrix

| Boundary | Required proof |
| --- | --- |
| OIDC exchange | Reject wrong signature/algorithm/issuer/audience, missing or mismatched nonce, expired identity, wrong browser/state, replayed/expired transaction, code/PKCE mismatch and untrusted callback/return URLs. Concurrent tabs retain separate transactions. |
| Invitation/admission | Reject missing/expired/revoked/used/wrong-recipient invitations; email alone cannot join or link an account. Unknown external identity plus conflicting existing verified contact is denied without consuming the invite or creating another workspace. Race two valid callbacks and prove one invitation consumption/account binding. First login cannot become admin or legacy owner. |
| Sessions | Rotation invalidates the old identifier; idle/absolute expiry, logout, account suspension, role changes and restore-epoch rotation revoke access. Restored admission remains closed until all memberships/roles are reconciled; fresh login cannot revive a later-revoked member. Cookie flags/path/domain and token absence are checked. Provider outage preserves valid local sessions while new login fails closed. |
| Authorization and CSRF | Anonymous/member/admin matrix enforced server-side for every protected operation. CSRF/origin failures reject mutations; ordinary GET/HEAD cannot recount or accept invitations. Only the browser-bound OIDC callback may complete a previously CSRF-protected join intent, with full state/nonce/PKCE/code validation. A bare callback grants nothing. CORS alone does not grant access. |
| Recovery and linking | Google/email with the same address do not silently merge or create a misleading empty workspace. Provider recovery and invitation reissue cannot transfer a previous account's data. Privileged changes require the defined fresh authentication/MFA evidence. |
| Browser boundary | Initial load shows no private data before auth; logout locks other tabs and bfcache restores; a late A response cannot populate B's UI. Account-key reset and Hand Lab singleton tests prove no A-to-B storage write or recovery. |
| Interrupted work | A form survives same-account redirect/reauth within its recovery lifetime; wrong-account return quarantines it until return-to-original or explicit discard, never renders it to the new account. Storage failure has an honest fallback. Expired drafts are handled explicitly; uncertain mutations never auto-replay. |
| Data preservation | New identity migration retains original records/keys/relationships/quantities/image bytes on an existing-data copy. Backup restoration works, and later operational credential invalidation does not remove player records. |
| End-to-end experience | Two real staging accounts, desktop/mobile, keyboard/screen reader and reduced motion; invitation, method selection, provider cancellation, deep link, outage, session expiry/draft, sign-out and privileged access journeys. |

Protocol behavior should be exercised through the maintained library with mocked
provider exchanges and controlled signing keys in tests. Real staged callbacks,
mail and MFA need separate evidence; unit tests or a clickable mockup cannot
certify that tenant configuration. Tests use disposable accounts/databases and
never point at the personal database or production tenant.

## Ownership and release coordination

- #54 owns application identity, sign-in UI, sessions, admission/roles and the
  server account-context contract.
- #55 owns private-record relationships, scoped queries/aggregates, related-ID
  checks, legacy owner backfill, and complete private browser-state separation.
- #56 owns the hosted PostgreSQL transfer and its deployment behavior; #54's
  schema must remain portable without silently provisioning a database service.
- #57 owns hosting/secrets/proxy/provider-environment setup and promotion gates.
- Match-service #1 owns the versioned admission/snapshot/result contract. It
  consumes the stable Cardfight account ID and verifies its own grants rather
  than introducing a second account system.
- #46 contributes integrated browser coverage, and #47 coordinates release.
  These are validation/release relationships, not blockers that prevent
  implementing the first identity slice.

The implemented first slice does not close #54's staging acceptance criteria.
Real provider and deployment evidence above remains required; private workspace
ownership and form recovery integration remain #55. No paid infrastructure,
provider identities, invitation emails, credentials or live database migrations
were created by implementing this slice.
