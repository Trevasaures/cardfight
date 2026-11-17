# Authentication setup and verification

Cardfight uses Auth0-hosted Google and email-code authentication, then creates an
invitation-only Cardfight account and an opaque, revocable server session. The
application does not collect passwords, issue email codes, or expose provider
tokens to React. Account linking is deferred: use the original sign-in method
when Google and email represent separate identities with the same address.

The beta reserves contact addresses by case-folding the local mailbox spelling
and normalizing/lowercasing the domain. It does not remove dots, strip plus tags,
or infer provider aliases. This reservation can reject a conflicting signup; it
never establishes identity or links accounts. Exact issuer and subject remain
the identity key.

With admission open, the hosted workspace scopes decks, matches, and acquisition
data to the verified account. Admitted accounts share the catalog and artwork.
Catalog edits and maintenance recount require the administrator role and
provider-verified MFA within the last 15 minutes. Legacy records require
explicit owner assignment.

No tenant or credentials are included. Automated tests use a controlled provider
adapter and signed test tokens. Real Google authorization, email delivery, tenant
policies, and reverse-proxy cookies still require the staging checks below.

## Create a development identity provider

1. Create an Auth0 development tenant and a **Regular Web Application** named
   Cardfight. This is a confidential server application, not a browser SPA.
2. Register the exact callback `http://127.0.0.1:5173/auth/callback` and web origin
   `http://127.0.0.1:5173`. Register the matching base origin as an allowed logout
   URL if configuring provider logout later. Do not use wildcard callbacks.
3. Enable Google (`google-oauth2`) for this application. Configure your own Google
   credentials and approved redirect domains before production use.
4. Enable the passwordless Email connection (`email`) for this application and
   configure a Universal Login experience that supports email OTP. Configure
   delivery and test a real code; Cardfight's email button redirects to that
   connection rather than collecting a code itself. Provider configuration and
   feature availability must be checked in the actual tenant.
5. Use RS256 ID tokens and authorization-code flow. In the application's
   Credentials tab, select Client Secret Basic for token endpoint
   authentication. Keep the client secret on the server. Disable unneeded
   grants and automatic account-linking rules. Cardfight requests only
   `openid profile email`, uses PKCE S256 and
   validates issuer, audience, signature, nonce and authentication age.

Follow Auth0's current [Flask application setup](https://developer.auth0.com/resources/guides/web-app/flask/basic-authentication),
[email OTP configuration](https://auth0.com/docs/authenticate/passwordless/authentication-methods/email-otp)
and [passwordless connection selection in Universal Login](https://support.auth0.com/center/s/article/Passwordless-login-not-triggered-using-the-New-Universal-Login-with-Identifier-First-Profile).
Dashboard labels and email-login availability can vary by tenant configuration;
verify the actual flow instead of assuming a plan includes it.

## Configure the server locally

Install `requirements.txt` (or `requirements-dev.txt` for testing), then place
these values in the ignored root `.env`. Replace placeholders locally; never
put the client secret, encryption key, cookies or invite URLs in chat, Git,
screenshots, frontend code, or a `VITE_` variable.

```dotenv
CARDFIGHT_AUTH_ISSUER=https://YOUR-TENANT.auth0.com/
CARDFIGHT_AUTH_CLIENT_ID=YOUR_REGULAR_WEB_APPLICATION_CLIENT_ID
CARDFIGHT_AUTH_CLIENT_SECRET=YOUR_SERVER_CLIENT_SECRET
CARDFIGHT_AUTH_TRANSACTION_KEY=YOUR_FERNET_KEY
CARDFIGHT_AUTH_RESTORE_EPOCH=YOUR_RANDOM_EXTERNAL_GENERATION
CARDFIGHT_AUTH_GOOGLE_CONNECTION=google-oauth2
CARDFIGHT_AUTH_EMAIL_CONNECTION=email
```

Generate the encryption key and restore generation separately on your machine:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Save these in deployment secret storage, outside database backups. Keep the
issuer exactly equal to the tenant's discovery issuer, including its trailing
slash. Changing issuer/custom domain later is an identity migration, not an
email-based account merge.

Set the database URL, sign-in mode, and admission hold in the test terminal
using the PowerShell example below.

Modes are explicit:

| Mode | Boundary |
| --- | --- |
| `local` | Default single-user loopback lab; no login or account claim. |
| `oidc-dev` | Loopback-only provider integration testing; distinct development cookie permits HTTP. Entirely unconfigured mode can show setup-needed UI; partial credentials are rejected. |
| `oidc` | HTTPS origin and complete configuration required at startup; `__Host-cardfight_session` is Secure, HttpOnly, SameSite=Lax, Path=/ with no Domain. |

Unknown modes and incomplete production settings fail startup. Do not use
`oidc-dev` or `local` behind a public reverse proxy. Requests cannot choose the
deployment mode through Host or forwarded headers. The application does not
trust arbitrary forwarded client IPs for authentication throttling.

The current database-backed throttle uses the direct peer address. Behind one
reverse proxy, that is an aggregate application limit (20 login starts per
minute). Configure additional client limits at the edge for a public deployment;
do not enable blanket trust of forwarded headers to obtain client addresses.

## Test sign-in on loopback

Follow [PostgreSQL setup](database-migrations.md#initialize-postgresql) to create
a separate empty database named `cardfight_auth_test` with its own login role,
`cardfight_auth_test`. Create a password-file entry for that database and role.
Keep the provider settings in the ignored `.env` and select the test database
through environment variables in a dedicated PowerShell terminal. Run these
commands from the checkout with the project's virtual environment active.

```powershell
$env:DATABASE_URL = "postgresql+psycopg://cardfight_auth_test@127.0.0.1:5432/cardfight_auth_test"
$env:CARDFIGHT_AUTH_MODE = "oidc-dev"
$env:CARDFIGHT_AUTH_PUBLIC_ORIGIN = "http://127.0.0.1:5173"
$env:CARDFIGHT_AUTH_ADMISSION_HOLD = "false"

python -m backend.postgres upgrade
if ($LASTEXITCODE -ne 0) { throw "Cardfight could not initialize the test database." }
python -m backend.postgres status --require-current
if ($LASTEXITCODE -ne 0) { throw "The test database is not ready." }
python -m backend.auth_admin invite --email "your-verified-email@example.com"
if ($LASTEXITCODE -ne 0) { throw "Cardfight could not create the test invitation." }
.\start.ps1
```

Stop any prior Cardfight services using ports 5000 or 5173 before launching.
Use regular startup for sign-in testing. `-Fresh` starts the local lab without
sign-in.

Open the private invitation URL printed by the command and sign in with the
matching email. Use the same sign-in method on later visits. To test both methods,
create a separate invitation for a different verified email address and test it
in another browser profile. Use `http://127.0.0.1:5173/api/auth/session` in each
signed-in browser to check that its `account.id` stays the same on repeat sign-in.

For existing SQLite workspace records, use a verified copy and follow the
transfer and owner assignment steps. [Legacy recovery guide](legacy-sqlite-recovery.md)

### Run the API and frontend in separate terminals

Use the same test settings in the API terminal.

```powershell
waitress-serve --host=127.0.0.1 --port=5000 backend.app:app
```

```powershell
cd frontend-web
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` consistently. Vite proxies `/api`, `/auth` and `/join`
to Flask. Mixing `localhost` with `127.0.0.1` changes the origin and cookie scope.
Leave `VITE_CARDFIGHT_API_URL` unset for authentication.

The Windows `start.ps1` launcher uses the same proxies and prints the configured
development origin. Restart an older Vite process after updating the launcher or
client so it picks up the current API address. Startup checks for occupied ports
and validates the selected schema. Run migrations explicitly before starting.

## Create admission records explicitly

The operator commands run on the trusted server console; they do not call an
Auth0 management API and cannot prove a person's identity from an email address.
Select the exact Auth0 issuer and user ID out of band from the tenant's user
record. A provider identity still has to authenticate successfully before it
can receive a Cardfight session.

```powershell
python -m backend.auth_admin bootstrap --issuer "https://YOUR-TENANT.auth0.com/" --subject "google-oauth2|VERIFIED_USER_ID" --method google --email "you@example.com" --name "Your name"
python -m backend.auth_admin invite --email "invited-player@example.com" --days 7
```

Bootstrap selects one administrator explicitly; registration order and matching
email never promote an account. Invitations contain a random bearer value, are
stored only as hashes, expire, and can be consumed once. The CLI displays the
invitation URL once for manual delivery. Opening it captures bounded context and
cleans the URL; it does not create an account or consume the invitation. Only a
successful, browser-bound login with the invited verified email can accept it.

After reviewing all initial admission records, set
`CARDFIGHT_AUTH_ADMISSION_HOLD=false` and restart the server for sign-in testing.
On a test copy, admitted accounts can now open their own workspaces.

Account suspension and session revocation are also explicit console operations:

```powershell
python -m backend.auth_admin suspend --account ACCOUNT_UUID
python -m backend.auth_admin revoke-sessions --account ACCOUNT_UUID
python -m backend.auth_admin set-role --account ACCOUNT_UUID --role member
python -m backend.auth_admin revoke-invitation --invitation INVITATION_UUID
```

There is no browser administration interface in this slice. A future one must
require verified fresh MFA before privileged actions; an operator console is
not an excuse to trust client-supplied MFA or role flags.

Use the invitation UUID returned when issuing it to revoke an unused invitation.
For an invitation that was already accepted, review/suspend its account instead.

Run automated checks against disposable data from the repository root:

```powershell
python -m pytest -q
cd frontend-web
npm test
npm run lint
npm run build
```

The backend test bootstrap isolates the default regression app from your local
identity settings and database. Provider tests use controlled signing keys and
do not authenticate against your tenant.

The PR records validation for the current change. `npm audit --audit-level=high`
passed its high/critical gate but reported the existing moderate
[minimatch development-tool advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
through ESLint/TypeScript ESLint. Their current constraints select minimatch 10;
the patched release is 11.0.1. Resolve this through a compatible tooling update
in a separate change; do not apply `npm audit fix --force` and silently downgrade
the lint toolchain. These development packages are not the application identity
runtime.

## Staging verification before release

Use a separate HTTPS staging origin, Auth0 application, database and secrets.
Use `backend.hosted:app` with `CARDFIGHT_AUTH_MODE=oidc`. Route `/api/*`,
`/auth/*` and `/join` to Flask before the SPA fallback. Preserve the public
`Host` header on those requests and keep Waitress reachable only by the trusted
reverse proxy. Check `/api/auth/session` through the public URL before testing
the provider callbacks. [Hosted deployment steps](deployment.md#hosted-api)

Keep callback and invitation query strings, cookies, authorization codes, provider
tokens, client secrets and POST bodies out of access logs. Disable third-party analytics on auth
pages. Auth responses have no-store and no-referrer policies, but a proxy's
access logs need their own configuration.

Verify the actual provider flows with two browsers/accounts:

- An invited Google identity and a separate invited email identity create
  unique immutable account UUIDs. Repeated login retains the same UUID.
- Wrong/unverified email, expired/revoked/reused invitations and an unknown
  identity matching an existing contact do not create or merge accounts.
- Cancelled login, wrong browser/state, expired callback, duplicate callback and
  changed nonce cannot establish a session. Start again after a provider outage.
- Cookies have the production attributes above. No provider token appears in
  browser storage, URLs returned to React, application JSON or normal logs.
- Cross-origin mutations and absent/wrong CSRF tokens fail. Session polling
  does not extend idle expiry indefinitely. Logout revokes the server session;
  replaying a copied old cookie fails even if the provider is unavailable.
- Suspension, role/version changes and external generation changes take effect
  on the next request. Another tab and browser back/forward cache recheck state.
- Both admitted members and administrators can open their own decks, history,
  and acquisition plans. Check that foreign record IDs and writes fail in
  both directions, counts are isolated, and both accounts can read catalog
  data and artwork. Try an administrator write with and without recent MFA.
- Replace the browser session in another tab and confirm stale requests cannot
  read the new account's records. Check that private browser state resets when
  the account changes.
- The local legacy lab remains usable with unchanged data and preserved drafts.

Local tests cannot establish email delivery, provider policy or proxy behavior.
Keep #54 staging acceptance open until this evidence is recorded. Do not invite
players into the workspace before #55's two-account ownership tests pass.

## Recovery

Restoring a database must not revive sessions, old invitations, or a membership
that was suspended after the checkpoint:

1. Stop serving and set `CARDFIGHT_AUTH_ADMISSION_HOLD=true` in deployment state
   outside the backup. Keep serving closed while recovery is in progress.
2. Restore and verify to a separate database using the
   [PostgreSQL recovery instructions](database-migrations.md#back-up-and-restore-postgresql).
   For a legacy SQLite file, follow the [SQLite backup runbook](backup-and-restore.md).
3. Generate a new `CARDFIGHT_AUTH_RESTORE_EPOCH` and transaction encryption key
   outside the restored database. Old sessions, pending login transactions and
   invitation context fail against this generation. Rotate compromised provider
   client secrets separately when needed.
4. Reconcile **every** restored membership, suspension and role against trusted
   operator records. Do not review only administrators. For each explicitly
   approved account, set the intended role/status and then use
   `python -m backend.auth_admin reapprove --account ACCOUNT_UUID`. This updates
   admission generation and revokes old authorization versions. Do not bulk
   reapprove the snapshot. Reissue unused invitations rather than reviving them.
5. Recheck restored workspace data and sign-in behavior. Only after review, open
   admission by setting the external hold false and require fresh sign-in.

Keep a record of approvals outside the database backup. Old sessions/invitations
must never be made valid by restoring an earlier generation value. These
credential-reset operations do not alter decks, versions, matches, purchases or
artwork. Database migration itself preserves all old stored values; operational
recovery review is a separate, explicit step.
