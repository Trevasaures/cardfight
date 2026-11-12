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

Install the version-pinned runtime lock in a virtual environment:

```sh
python -m pip install -r requirements.txt
waitress-serve --host=127.0.0.1 --port=5000 backend.app:app
```

Waitress supports Windows and Unix. This command runs on loopback with debug
disabled. The Windows `start.ps1` launcher uses the same local entry point and
starts Vite on the configured loopback origin.

## Hosted API

Configure the provider and HTTPS public origin, then start the hosted entry
point. [Authentication setup](authentication-setup.md)

```sh
CARDFIGHT_AUTH_MODE=oidc waitress-serve --host=127.0.0.1 --port=5000 backend.hosted:app
```

`backend.hosted:app` requires `CARDFIGHT_AUTH_MODE=oidc` before serving requests.

Hosted SQLite startup rejects custom triggers and requires custom unique indexes
on private tables to include the account owner, owning parent, or row ID in the
index key with `BINARY` collation. The startup check also applies to `oidc-dev`.
Review reported custom schema objects on a separate restored copy. Local startup
and the migration tools retain supported custom objects.
Startup also validates the HTTPS origin and complete OIDC settings. Keep the
upstream listener reachable only by the HTTPS reverse proxy.

Persistent databases must be initialized or upgraded explicitly before launching
the WSGI process. For a new database use `python -m backend.migrate upgrade`;
existing unversioned data first uses `python -m backend.migrate baseline`.
Stop all writers before either command. Existing data receives a verified backup
and disposable upgrade rehearsal before migration. Gate startup/deployment with
`python -m backend.migrate status --require-current`. Startup itself performs
read-only schema checks and never applies upgrades. Follow the
[migration runbook](database-migrations.md) for recovery and legacy support.

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

- `DATABASE_URL` selects the SQLAlchemy database. SQLite remains the default;
  keep `instance/cardfight.db` and back it up before changing deployment or schema.
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

Before changing hosting, dependencies that affect stored data, or database schema,
create a SQLite checkpoint and verify a disposable restored copy with the matching
application version:

```sh
python -m backend.backup create
python -m backend.backup verify "C:/path/to/your/backups/BACKUP.sqlite3" --app-check
```

Use the full backup path returned by `create`. Set `CARDFIGHT_BACKUP_DIR` to an
absolute directory outside the checkout, such as your OneDrive backup folder;
without it, backups use the per-user application-data directory. Migration
checkpoints use the same destination. Each database must remain beside its
`.manifest.json` file. The online backup includes committed WAL data, but stop
application writes for the final pre-upgrade or cutover checkpoint. Keep a
verified copy off the machine. Backup scheduling, retention, and cloud copies
require separate configuration.

Restore to a new path, then switch `DATABASE_URL` after stopping the app; the
restore command refuses to overwrite an existing target or its sidecars. Follow
the [backup and recovery runbook](backup-and-restore.md) for retention, verification
gates, compatible-code rehearsal, and rollback after a failed upgrade. Do not
reseed as a recovery step.

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
