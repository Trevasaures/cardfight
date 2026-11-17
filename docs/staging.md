# Hosted staging

Run staging with its own PostgreSQL 18 database, Auth0 application, credentials,
and synthetic test records. Use the same build for the React frontend and Flask
API at one HTTPS origin. Keep development data and production credentials out
of staging.

## Build and initialize

The repository Dockerfile builds React, installs the pinned Python dependencies,
and runs Waitress. The image sets `CARDFIGHT_FRONTEND_DIST` to the built files.
The hosted app serves those files and SPA deep links alongside `/api/*`,
`/auth/*` and `/join`. Leave `VITE_CARDFIGHT_API_URL` unset so browser requests
use the same origin. The platform must send requests to the configured
`PORT` and preserve the public `Host` header.

Build from a reviewed commit and record its SHA and the image digest, if the
host exposes it. To check the build locally, run `docker build -t cardfight-stage .`
from the repository root. Use manual staging deploys while testing.

Before deploying, initialize a new staging database from the same commit. Set
`DATABASE_URL` to the direct staging connection in a dedicated terminal. Use
certificate and hostname verification (`sslmode=verify-full`) and the
appropriate CA trust when connecting over the public network. Run these commands
with the project's Python environment active.

```sh
python -m deploy.container python -m backend.postgres upgrade
python -m deploy.container python -m backend.postgres status --require-current
```

The wrapper requires an explicit hosted PostgreSQL URL in the environment.
The web service checks the configured PostgreSQL schema before serving.
[PostgreSQL setup](database-migrations.md#initialize-postgresql)

## Configure the HTTPS origin and identity

Use a separate Auth0 Regular Web Application configured for staging. If the
public URL is `https://cardfight-staging.example.com`, register the exact
callback `https://cardfight-staging.example.com/auth/callback` and web origin
`https://cardfight-staging.example.com`. Use the actual generated HTTPS
hostname if the platform supplies one. Use a lowercase hostname and omit the
default HTTPS port.

Set these variables at runtime in the hosting dashboard.

| Variable | Staging value |
| --- | --- |
| `DATABASE_URL` | Staging PostgreSQL URL from the hosting platform. The container accepts `postgres://`, `postgresql://`, and `postgresql+psycopg://`. |
| `CARDFIGHT_AUTH_MODE` | `oidc` |
| `CARDFIGHT_AUTH_PUBLIC_ORIGIN` | Exact public HTTPS origin without a trailing slash. The container defaults to Render's generated HTTPS origin on Render. |
| `CARDFIGHT_AUTH_ISSUER` | Exact staging Auth0 issuer, including its trailing slash |
| `CARDFIGHT_AUTH_CLIENT_ID`, `CARDFIGHT_AUTH_CLIENT_SECRET` | Staging Auth0 application credentials |
| `CARDFIGHT_AUTH_TRANSACTION_KEY`, `CARDFIGHT_AUTH_RESTORE_EPOCH` | Fresh Fernet key and random restore generation for staging |
| `CARDFIGHT_AUTH_ADMISSION_HOLD` | `true` for the initial deploy |

Configure and verify the Google connection, email code delivery, and
administrator MFA in the staging tenant. Generate the runtime secrets on the
operator's machine and save them in the host's secret settings.
[Authentication setup](authentication-setup.md)

## Short rehearsal on Render

Render offers a free web service with a public HTTPS `onrender.com` URL and
managed PostgreSQL 18. The free database has 1 GB of storage and expires after
30 days. It has no managed backups. The free web service sleeps after 15
minutes of inactivity and may take about a minute to wake. The lowest paid
web and database compute plans total about $13 per month, before any storage
or usage charges. Check the selected plans and current limits when creating
the resources. [Render free limits](https://render.com/docs/free)
[Pricing](https://render.com/pricing)

1. Use the public Cardfight repository URL and select the reviewed staging
   branch in **New → Blueprint**. The [staging blueprint](../render.yaml)
   defines a Free Docker web service and a Free PostgreSQL 18 database in Ohio.
   It turns off automatic web deploys, uses the database's **internal** URL, and
   blocks public database connections. Enter the requested staging-only Auth0
   values in Render. The blueprint generates the Fernet key and restore
   generation. Set the Auth0 callback and web origin
   to the generated web service URL once Render assigns it.
   [Render Blueprints](https://render.com/docs/infrastructure-as-code)
2. To initialize the empty database over Render's private network, temporarily
   set the staging service's `dockerCommand` in the Blueprint to the command
   below and sync that change. A Free web service has no pre-deploy command or
   shell access. Check the deployment log for `"status": "current"` and
   `"revision": "0001_postgresql"`. The operator command exits after the
   upgrade, so Render can report an early exit before the web service binds
   its port.

   ```sh
   python -m deploy.container python -m backend.postgres upgrade
   ```

   [Render Blueprint Docker commands](https://render.com/docs/blueprint-spec#docker)
   [Render deploy lifecycle](https://render.com/docs/deploys)
3. Restore `dockerCommand: python -m deploy.container` and sync the Blueprint.
   Confirm Render starts a new deploy of the reviewed commit, or deploy it
   manually if needed. The Blueprint uses `/api/ready` to check that the
   service can read the staging schema. Keep verification evidence outside the
   disposable service and database.
   [Render health checks](https://render.com/docs/health-checks)

## Verify the public service

With admission held, use the public HTTPS URL and a fresh browser profile.

- Check `/api/health` and `/api/ready` return 200. Liveness reports the
  application is running. Readiness also checks the configured database and
  its revision.
- Open `/decks` directly and reload. The SPA should load the sign-in gate.
  `/api/auth/session` should report OIDC and an unauthenticated account.
  Anonymous `/api/decks` should return 401, and a missing `/api/*` route must
  never return the SPA document.
- Check that the proxy preserves the canonical host and that its logs omit auth
  and invitation query strings, cookies, and request bodies. Confirm the
  trusted client-IP policy and sign-in throttle behind the proxy before opening
  admission.
- Create invitations or bootstrap the staging administrator with the
  `backend.auth_admin` commands using the staging database and Auth0 settings.
  Set admission hold to `false` during verification and redeploy to apply it.
  Test Google with one synthetic account and email code with another, in
  separate browser profiles. Confirm the hosted session cookie flags,
  first-play flow, isolation of records and analytics in both directions,
  rejection of foreign IDs, and logout and account-switch behavior.
  Restore the hold and redeploy when testing ends.
  [Admission commands](authentication-setup.md#create-admission-records-explicitly)

Record the commit and image identity, date, endpoint statuses, provider flows,
and isolation results. Keep tokens, invitation URLs, and test records out of
shared evidence. [Staging auth checks](authentication-setup.md#staging-verification-before-release)

Before inviting beta players, use separate production resources and verify the
production deployment and rollback, scheduled PostgreSQL backups with a restore
rehearsal, health monitoring and support ownership. Promote a tested immutable
build through an explicit production gate.
[Deployment issue #57](https://github.com/Trevasaures/cardfight/issues/57)
