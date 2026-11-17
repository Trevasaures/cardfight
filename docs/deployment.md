# Running outside the development server

The API has debug disabled by default and supports a standard WSGI server.
Default `local` mode is a loopback-only personal lab. The OIDC modes add managed
Google/email sign-in, invitation-only application accounts and server sessions.
Follow the [authentication setup](authentication-setup.md) to configure Auth0.
CORS is a browser policy, not a replacement for access control.

The hosted API scopes private records to the verified account. Admission hold
keeps workspace access closed while an operator reviews membership or verifies
staging. See the [identity design](adr/0001-identity-and-access.md).

## Local API

Install the runtime dependencies in a virtual environment and initialize
the database before starting the service.

```sh
python -m pip install -r requirements.txt
python -m backend.postgres upgrade
waitress-serve --host=127.0.0.1 --port=5000 backend.app:app
```

Waitress supports Windows and Unix. This command runs on loopback with debug
disabled. The Windows `start.ps1` launcher uses the same local entry point and
starts Vite on the configured loopback origin.

## Database readiness

PostgreSQL 18 is the default database. Create it first, run
`python -m backend.postgres upgrade`, and confirm readiness with
`python -m backend.postgres status --require-current`. Startup validates
the selected schema and revision read-only. [PostgreSQL setup](database-migrations.md#initialize-postgresql)

Use the [legacy recovery guide](legacy-sqlite-recovery.md) to open, verify,
or transfer an existing SQLite workspace.

### PostgreSQL smoke test

Set `DATABASE_URL` to the separate PostgreSQL 18 rehearsal database and use the
[PostgreSQL initialization steps](database-migrations.md#initialize-postgresql).
After the readiness check succeeds, run the API in the same PowerShell terminal.

```powershell
$env:CARDFIGHT_AUTH_MODE = "local"
waitress-serve --host=127.0.0.1 --port=5000 backend.app:app
```

Use a free loopback port if another API instance is already running. From
another PowerShell terminal, check that the API responds and that the new,
unseeded database has an empty deck list.

```powershell
Invoke-WebRequest http://127.0.0.1:5000/api/health | Select-Object -ExpandProperty Content
Invoke-WebRequest http://127.0.0.1:5000/api/decks | Select-Object -ExpandProperty Content
```

`.\start.ps1 -Fresh` restarts the loopback lab using the selected database
and rebuilds the frontend cache. `-DatabasePath` explicitly selects an existing
SQLite file.

## Hosted API

For a first staging deployment of the built frontend and API together, follow
the [hosted staging runbook](staging.md).

Set `DATABASE_URL` to your hosted PostgreSQL 18 database and initialize its
schema. Configure the provider and HTTPS public origin before starting the
hosted entry point. [Authentication setup](authentication-setup.md)

```sh
CARDFIGHT_AUTH_MODE=oidc waitress-serve --host=127.0.0.1 --port=5000 backend.hosted:app
```

`backend.hosted:app` requires `CARDFIGHT_AUTH_MODE=oidc` before serving requests.

Startup also validates the HTTPS origin and complete OIDC settings. Keep the
upstream listener reachable only by the HTTPS reverse proxy. Use a separate
staging database and verify sign-in and account isolation there before enabling
admission on the hosted service.

## Frontend

Build the React app with Node 24 LTS:

```sh
cd frontend-web
npm ci
npm run build
```

Serve `frontend-web/dist` using a static web host with an SPA fallback to
`index.html`. Route `/api/*`, `/auth/*` and `/join` to Flask before the SPA
fallback. Serve the frontend and these routes on the configured HTTPS origin.
Forward its public `Host` header to Flask, including any non-default port. For
example, set `proxy_set_header Host $http_host;` in the Nginx upstream location.
[Nginx proxy header settings](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)

Leave `VITE_CARDFIGHT_API_URL` empty for same-origin requests. Verify
`GET /api/auth/session` through the public URL returns `mode: oidc`. Verify an
anonymous request to `/api/decks` returns `401`. A health check alone bypasses
the Host validation and cannot establish that the auth routes are reachable.

## Configuration and data

- `DATABASE_URL` selects the database. The default development URL is
  `postgresql+psycopg://cardfight@127.0.0.1:5432/cardfight`. For a remote
  server, use certificate and hostname verification with `sslmode=verify-full`
  and the server's trusted CA configuration. Supply database credentials
  through the service's secret configuration or PostgreSQL password file.
- `CARDFIGHT_DB_POOL_SIZE` and `CARDFIGHT_DB_MAX_OVERFLOW` tune the PostgreSQL
  connection pool per API process. Size the total across processes for the
  database connection budget. The pool checks connections before reuse.
- `CARDFIGHT_CORS_ORIGINS` accepts comma-separated literal HTTP(S) frontend
  origins. Its default contains localhost/127.0.0.1 on ports 5173 and 4173. Set it
  to your frontend's exact origin for local tooling. Local API writes accept
  same-origin requests, configured origins, and loopback tools that omit
  `Origin`. OIDC modes require same-origin browser requests.
- JSON/multipart request bodies have a 16 MB application limit. Artwork imports
  retain the existing 8 MB image limit, decode validation, and approved URL hosts.
- `.env` is local configuration and stays out of Git. Neither the server setup
  nor dependency cleanup changes existing deck, match, artwork, or purchase data.

Expected validation and conflict errors retain useful messages. Unexpected
failures return a fixed JSON error and roll back the transaction; diagnostics
remain in server logs. The local launcher writes logs under `instance/`.

## Backups and recovery

Keep a PostgreSQL archive outside the checkout and verify its restore in a
separate database before schema changes or cutover. Use the
[PostgreSQL backup and restore commands](database-migrations.md#back-up-and-restore-postgresql).
For a SQLite file or its checkpoint, see the
[legacy recovery and transfer guide](legacy-sqlite-recovery.md).

## Checks before release

Install `requirements-dev.txt` for tests and audit tools. CI runs the complete
backend suite, frontend tests, lint, build, and dependency audits. Routine dependency
upgrades are manual: Dependabot version-update PRs are disabled for Python, npm,
and GitHub Actions. Security-update PRs, when enabled in GitHub's repository
settings, are grouped per ecosystem. This configuration takes effect on the
default branch; existing bot PRs and branches can be closed or removed separately.
See [GitHub's security-update configuration](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates).
A clean local audit reports known dependency advisories; GitHub's CodeQL results
are verified separately after the branch is pushed.

References: [Flask deployment guidance](https://flask.palletsprojects.com/en/stable/deploying/),
[Waitress setup](https://flask.palletsprojects.com/en/stable/deploying/waitress/),
[Flask configuration](https://flask.palletsprojects.com/en/stable/config/).
