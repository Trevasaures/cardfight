# PostgreSQL setup and migrations

Cardfight uses PostgreSQL 18 by default. One Alembic revision,
`0001_postgresql`, creates the catalog, identity, and workspace ownership
schema for a fresh database. The API checks the revision and schema at
startup. Schema changes require an explicit migration command.

## Initialize PostgreSQL

Create an empty database named `cardfight` and a login role named
`cardfight` that owns it. You can do this in pgAdmin under the server's
**Login/Group Roles** and **Databases**. For another database name, host,
port, or role, update `DATABASE_URL` in the repository's `.env` file.

```dotenv
DATABASE_URL=postgresql+psycopg://cardfight@127.0.0.1:5432/cardfight
CARDFIGHT_AUTH_MODE=local
```

Put the role's password in the PostgreSQL password file
(`%APPDATA%\postgresql\pgpass.conf` on Windows or `~/.pgpass` on Unix).
Use the same host, port, database, and role as in `DATABASE_URL`:

```text
127.0.0.1:5432:cardfight:cardfight:YOUR_PASSWORD
```

Replace `YOUR_PASSWORD` with the role's password and keep the file outside
the checkout. On Unix, set its permissions to `0600`. The API and PostgreSQL
schema command load the root `.env` with terminal environment variables
taking precedence.

From the repository root and the project's activated Python environment, run:

```sh
python -m backend.postgres upgrade
python -m backend.postgres status --require-current
```

The first upgrade creates the tables, indexes, constraints, sequences, and
Alembic revision in one transaction. Running it again against a valid current
schema returns without changes. To inspect an uninitialized database, use
`python -m backend.postgres status`.

Start Cardfight using the same database configuration. The default `local`
mode runs on loopback without sign-in. Use `oidc-dev` for Google or email
sign-in testing on loopback. In these sign-in sessions, Cardfight scopes decks,
matches, and acquisition plans to the signed-in account. See
[authentication setup](authentication-setup.md) and [deployment](deployment.md).

## Schema source

The runtime models live under `backend/models/`. The first PostgreSQL
revision uses a frozen copy of its schema in `migrations/postgresql/baseline.py`
to reproduce the same starting point after models change. Add a revision for
later schema changes and update the upgrade and startup validation paths for
the new head. Test new database creation and upgrades from released revisions.

Workspace and catalog timestamps use America/Chicago wall time. Identity
timestamps use UTC. The PostgreSQL integration tests check match times on both
sides of daylight saving time.

## Back up and restore PostgreSQL

Use PostgreSQL 18 client binaries and the configured password file. The
following example creates a custom-format archive and restores it to a
separately created, empty `cardfight_restore_test` database:

```powershell
pg_dump --host=127.0.0.1 --username=cardfight --dbname=cardfight --format=custom --file="C:/path/to/cardfight.dump"
pg_restore --host=127.0.0.1 --username=cardfight --dbname=cardfight_restore_test --single-transaction --no-owner --no-privileges "C:/path/to/cardfight.dump"
```

Keep archives outside the checkout. Point `DATABASE_URL` at the restored
database in a dedicated terminal, run `python -m backend.postgres status
--require-current`, and verify application data. Review accounts and revoke
restored sessions before serving recovered data with sign-in enabled. Follow
the [authentication recovery runbook](authentication-setup.md#recovery).

## Existing SQLite data

Use the [legacy recovery guide](legacy-sqlite-recovery.md) for SQLite backups,
schema compatibility, verified transfer, and owner assignment. Keep the
original SQLite file and its checkpoint through rehearsal and cutover.
