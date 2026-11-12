# Versioned SQLite database migrations

Persistent database changes are explicit commands backed by Alembic revisions.
The current revision is `0003_ownership`, following `0001_baseline` and
`0002_identity`. At startup, the API validates the schema and revision.
Install `requirements.txt` before using these commands and run them from the
repository root with the project's Python environment active.

This baseline supports SQLite. PostgreSQL deployment and data transfer remain
separate work. Tests may explicitly create disposable in-memory schemas; that
does not bypass the guard for a persistent database, even with `TESTING=True`.

Revision `0002_identity` adds seven empty identity tables for accounts, external
identities, invitations, sessions, login transactions, audit events and throttles.
It leaves every existing workspace table and value unchanged, creates no users,
and assigns no legacy owner. Already-baselined databases use `upgrade`; older
unversioned databases use `baseline`, which rehearses the complete revision chain.
The frozen v1 schema and migration remain unchanged. After identity is enabled,
restoration also requires the external-generation and membership review in the
[authentication runbook](authentication-setup.md#recovery).

An identity rehearsal on November 5, 2026 upgraded a verified checkpoint of the
existing workspace to `0002_identity`. All pre-existing table values and artwork
bytes were preserved; the restored application passed 1,398 read-only API/artwork
checks. The original file checksum and logical data summary stayed identical.
The private report is retained in the external project archive described below.
This is rehearsal evidence only: the live database was not migrated.

Revision `0003_ownership` adds account references to decks, matches, and
acquisition plans. Existing records stay in the local workspace until an
explicit owner assignment. Deck names are unique within each account and
within the unassigned local workspace. See the
[ownership policy](identity-delivery-plan.md#account-owned-workspace-data).

## Schema history and the PostgreSQL transfer

The `migrations/` directory is application source: it defines the schema versions
that the current code can initialize, validate and upgrade. It contains no saved
decks, matches or artwork. Keep it with the application and its tests; Alembic's
[migration environment](https://alembic.sqlalchemy.org/en/latest/tutorial.html#the-migration-environment)
is maintained alongside application source.

[PostgreSQL work #56](https://github.com/Trevasaures/cardfight/issues/56) separately
adds engine support, a PostgreSQL schema and a repeatable transfer from a verified
SQLite checkpoint into a new target. A SQLite SQL dump may be an intermediate
artifact, but its types and statements need conversion and verification. The
transfer must retain IDs, relationships, quantities, history and artwork, validate
timestamps and generated-ID sequences, and exercise the PostgreSQL-backed app
before cutover. Tools such as [pgloader](https://pgloader.readthedocs.io/en/latest/ref/sqlite.html)
support SQLite input and explicit type conversions; tool selection belongs to
that implementation. Current startup still rejects non-SQLite databases.

Schema source and transfer tests remain in Cardfight. Backups, retained restored
copies and run-specific reports belong outside the checkout. No additional
service or separate orchestration repository is needed for these commands.

## Inspect without changing data

```sh
python -m backend.migrate status
python -m backend.migrate status --require-current
```

`status` reports missing, empty, supported-unversioned, pending, or current state.
`--require-current` fails unless both revision and schema match this application.
Unknown revisions, multiple/empty version rows, unsupported layouts, and partial
table-replacement remnants are errors. Inspection and application startup open
the existing file read-only; they do not create a missing file or stamp a version.

Commands load the root `.env` and use the configured absolute file-backed SQLite
`DATABASE_URL`, or `instance/cardfight.db` when it is absent. Select another file
explicitly with `--database "path/to/cardfight.db"`. Migration commands never
import `backend.app` to discover configuration.

## Initialize a new database

```sh
python -m backend.migrate upgrade
python -m backend.migrate status --require-current
python -m backend.seed
```

Use this only for a new/empty database. The optional seed adds starter decks; it
does not recover saved data. The frozen baseline creates all required tables,
constraints, indexes, and the Alembic revision marker in one transaction.

## Rehearse assigning a local workspace to an account

Use a verified SQLite backup containing the legacy workspace and the
designated admitted account. Use the account UUID from the operator's account
record. For a rehearsal before account setup, restore the backup to a disposable
file, create a test account there, then checkpoint that file.

```sh
python -m backend.ownership rehearse "/path/to/backup.sqlite3" --account "<account-uuid>"
```

The rehearsal restores a temporary copy, upgrades it, and verifies that all
local decks, matches, and acquisition plans can be assigned together. It checks
foreign keys and compares saved values, including artwork bytes. The result
reports the assigned counts. The backup stays available for repeat runs.

To keep the assignment on a test database after signing in, follow the
[account setup and assignment steps](authentication-setup.md#assign-your-existing-workspace-on-the-test-copy).

The November 10, 2026 rehearsal verified a copy of the existing workspace.
The upgraded copy passed 1,398 read-only API and artwork checks. A separate
copy assigned its 19 decks, 142 matches, and 9 acquisition plans to a test
account and preserved the saved values, relationships, and artwork bytes.

For a local Windows smoke test, restore to a new path, upgrade that file, and
select it explicitly when restarting.

```powershell
$copy = Join-Path $env:LOCALAPPDATA "Cardfight\auth-test\cardfight.db"
python -m backend.backup restore "C:/path/to/backup.sqlite3" --destination $copy --for-ownership
python -m backend.migrate upgrade --database $copy
.\start.ps1 -Fresh -DatabasePath $copy
```

The application check in the backup workflow uses the local workspace and
shared catalog. Raw backup verification covers the complete database. Test
account-owned API access on a separate copy with authenticated test accounts.

## Adopt existing unversioned data once

Stop the application and every other writer, including database editors. Keep
writes stopped through verification and the final upgrade. Then run:

```sh
python -m backend.migrate baseline
python -m backend.migrate status --require-current
```

For a separate restored database, specify its path:

```sh
python -m backend.migrate baseline --database "instance/recovered/cardfight.db"
```

This is a checked transition, not a blind Alembic stamp. The workflow:

1. Recognizes a supported schema and checks SQLite integrity/references.
2. Creates a consistent backup plus manifest using the
   [backup workflow](backup-and-restore.md), then verifies a raw restore.
3. Restores another disposable copy, applies the baseline there, compares all
   pre-existing column values and row counts, and exercises its read-only API,
   relationships, full-size artwork, and thumbnails with the new application.
4. Acquires the target's SQLite writer lock and compares its complete pre-upgrade
   snapshot with the backup. If a writer changed it meanwhile, the command fails
   and asks for a fresh checkpoint after writes stop.
5. Applies schema changes, verifies original saved values and foreign keys, and
   records the revision inside one explicit SQLite DDL transaction.

The command reports the retained backup path. An already-current, valid database
is a no-op. `upgrade` refuses nonempty unversioned databases, requiring this
explicit baseline step instead. Failed validation or rehearsal does not stamp or
repair the original. No CLI option skips the rehearsal or backup for saved data.

## Supported historical layouts

The bridge is frozen with revision 0001; it does not inspect today's models to
guess a past schema. It supports the prior deck/match-only application and known
later feature tables. The following historical omissions/changes are recognized:

- Deck nation/icon and exact match-version columns.
- Stored-artwork references and their index; feature tables absent in older apps.
- Purchase-plan archive time and outgoing/source/removal fields.
- The old deck-zone constraint without `crest` and the positive-only purchase
  target constraint before zero targets were supported.
- Match-version columns added without foreign keys/indexes, and the historical
  quantity defaults/missing quantity checks left by startup compatibility helpers.

Changed application tables are copied by column name to the frozen definition;
IDs, existing values, stored images, and incoming references are preserved.
Only a newly introduced `source_quantity` is derived from matching source deck
entries. Existing owned quantities and other old fields are never reinterpreted.
Custom auxiliary tables, views, indexes, and triggers are retained. Unknown
application columns, incompatible types/keys/defaults, and unexpected core
constraints are rejected rather than silently adopted.

Foreign-key enforcement is disabled before the locked transaction only for the
controlled copy, preventing cascading deletes during table replacement. All
references are checked before commit, and enforcement is restored afterward.
The old `ensure_schema_upgrades` startup path has been removed; it cannot race
the versioned revisions or apply the same changes a second time.

## Rehearse a checkpoint without changing its source

```sh
python -m backend.backup create
python -m backend.backup verify "C:/path/to/your/backups/BACKUP.sqlite3"
python -m backend.migrate rehearse "C:/path/to/your/backups/BACKUP.sqlite3"
```

Replace the placeholder filename with the one printed by `create`. The migration
rehearsal upgrades only a temporary restored copy and then checks it with the new
app. It leaves both the backup and the original database unchanged.

An untouched unversioned checkpoint intentionally fails the new app's startup
guard. To check its original application behavior, use the matching pre-migration
code and `backup verify --app-check`. With the new code, use raw `backup verify`
followed by `migrate rehearse`; do not stamp the backup itself to bypass the guard.

## Later upgrades and recovery

```sh
python -m backend.migrate upgrade
python -m backend.migrate status --require-current
```

Later revisions use the same backup, rehearsal, locked transaction and
saved-value verification gates. Stop writers first, retain the matching previous
code/dependencies and checkpoint, then run the current code's upgrade. The API
will refuse an older revision until the explicit command succeeds.

Checkpoints use `CARDFIGHT_BACKUP_DIR`, or the external per-user backup directory
when unset; `--backup-dir` explicitly overrides it. No default checkpoint is
written under `instance/`. Temporary rehearsal databases are removed when the
command completes.

If an upgrade fails, do not delete revision metadata, rerun the former helpers,
or manually stamp a revision to make startup pass. A failed transaction is rolled
back; keep its checkpoint and diagnostics. For a failed or incompatible upgrade,
stop all writers and follow the [backup recovery runbook](backup-and-restore.md):
restore the verified checkpoint to a new filename, select its matching code and
dependencies, and switch `DATABASE_URL` to that recovered path. Destructive
baseline downgrades are disabled. New writes after the checkpoint require separate
reconciliation; a restored checkpoint cannot contain later changes.

## Adding a future revision

Create a new revision file instead of changing the released baseline or bridge:

```sh
python -m alembic -c migrations/alembic.ini revision -m "describe schema change"
```

Review fixed upgrade operations, set the correct parent revision, and update the
application's `HEAD_REVISION` and schema compatibility contract deliberately.
Add migration/preservation/failure tests using disposable databases. Future
intentional data transformations need an explicit reviewed preservation policy;
the current runner rejects changes to pre-existing saved values.

The template is for reviewed manual revisions. Runtime migrations must not import
mutable application models or perform implicit network operations. Direct
Alembic upgrade/stamp commands are blocked: the supported application CLI supplies
the verified connection and owns backups, rehearsal, locking, and transactions.

## Existing-data rehearsal record

A measured rehearsal passed on November 5, 2026 (America/Chicago), using the
issue #45 working tree based on commit `4410a6d`. A fresh checkpoint of the
existing unversioned database was restored to a separate file, baselined to
`0001_baseline`, and checked with the new application. All original column values
in all ten saved tables were preserved, including artwork bytes and references.
The migrated copy passed 1,398 read-only API requests, including complete image
decoding. Restoring its retained pre-migration checkpoint to another file exactly
reproduced the original schema and content summaries.

The live source remained unversioned and its file checksum was unchanged during
the final rehearsal. An earlier checkpoint was refreshed after the running app
saved another match; that source change was detected rather than treated as a
failed migration or overwritten. No baseline was applied to the live database as
part of preparing this branch.

Detailed reports, copied databases, and recovery checkpoints were later relocated
to a dated `cardfight-project-archive-*` folder under the configured external
backup directory. Its archive manifest preserves the original relative paths
and verified hashes; historical JSON reports remain unchanged. The full backend
suite passed 418 tests, including forced failures
before revision stamping, rollback/restoration, concurrent-edit detection, and a
synthetic later revision. Dependency consistency and the dependency audit passed.
