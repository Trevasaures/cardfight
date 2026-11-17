# Developer setup

1. Install PostgreSQL 18, set up the `cardfight` database and role, then follow
   the platform-specific dependency steps. [README](README.md#prerequisites)
2. Install development tools with `python -m pip install -r requirements-dev.txt`.
3. Initialize PostgreSQL with `python -m backend.postgres upgrade`, then start
   the API and React with `.\start.ps1` on Windows or the
   [manual commands](README.md#manual-startup). The default local mode runs
   without sign-in. [Database setup](docs/database-migrations.md#initialize-postgresql)
4. Run `python -m pytest -q` at the repository root, then `npm test`, `npm run lint`, and `npm run build` from `frontend-web`.
5. Run `python -m pip_audit -r requirements-dev.txt --no-deps --disable-pip` and `npm audit` after dependency changes. The development lock includes the runtime packages too.

Runtime packages are declared in `requirements.in`; test, formatting, and audit tools are declared in `requirements-dev.in`. Both generated `.txt` lockfiles pin package versions without hashes or dependency annotations. See the [dependency workflow](README.md#working-with-dependencies) before updating them.

The standard backend tests use in-memory SQLite. PostgreSQL integration tests
use disposable databases configured separately from the development connection.
Use a separate database for sign-in and migration tests. [Deployment notes](docs/deployment.md)
