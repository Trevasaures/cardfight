# Versioned SQLite database migrations

Persistent database changes are explicit commands backed by Alembic revisions.
The initial revision is `0001_baseline`. The API only validates schema/revision
at startup: it no longer creates tables or runs the old compatibility helpers.
Install `requirements.txt` before using these commands and run them from the
repository root with the project's Python environment active.

This baseline supports SQLite. PostgreSQL deployment and data transfer remain
separate work. Tests may explicitly create disposable in-memory schemas; that
does not bypass the guard for a persistent database, even with `TESTING=True`.

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
python -m backend.backup verify "instance/backups/BACKUP.sqlite3"
python -m backend.migrate rehearse "instance/backups/BACKUP.sqlite3"
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

Detailed reports, copied databases, and recovery checkpoints are retained under
ignored `instance/migration-rehearsals/` and `instance/backups/`, not in the public
repository. The full backend suite passed 418 tests, including forced failures
before revision stamping, rollback/restoration, concurrent-edit detection, and a
synthetic later revision. Dependency consistency and the dependency audit passed.
