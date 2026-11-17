# Legacy SQLite recovery and transfer

Use this guide to recover an existing SQLite file, restore and verify a
checkpoint, or bring saved data into PostgreSQL. New workspaces start with
the [PostgreSQL baseline](database-migrations.md#initialize-postgresql).
Run the commands from the repository root in the project's Python environment.

## Select a legacy file

Open a current SQLite file by setting an absolute SQLite `DATABASE_URL` or,
on Windows, using `-DatabasePath`. SQLite backup and migration commands can
select the source directly with `--source` and `--database`, respectively.
This also works when the app's `.env` points to PostgreSQL.

```powershell
.\start.ps1 -DatabasePath "C:/path/to/cardfight.db"
```

The file must exist and be on the current SQLite revision. The Windows
launcher uses the configured sign-in mode. Add `-Fresh` for a local,
sign-in-free restart using the same file.

With `oidc-dev` or `oidc`, SQLite startup rejects custom triggers. A custom
unique index on a private table must include the account owner, owning parent,
or row ID in its key with `BINARY` collation. Review flagged custom objects
on a separate restored copy.

## Rehearse the transfer

Stop writes to the source before taking the final checkpoint. Take a backup
with `python -m backend.backup create --source instance/cardfight.db` and keep
its manifest next to it. Create an empty PostgreSQL 18 database using the
[PostgreSQL setup guide](database-migrations.md#initialize-postgresql). Set
`DATABASE_URL` explicitly in the terminal for the transfer. Use the checkpoint
filename returned by the backup command.

```powershell
$env:DATABASE_URL = "postgresql+psycopg://cardfight@127.0.0.1:5432/cardfight_rehearsal"
python -m backend.postgres upgrade
python -m migrations.postgresql.transfer "C:/path/to/backup.sqlite3"
python -m backend.postgres status --require-current
```

The transfer restores and upgrades a temporary SQLite copy. It refuses a target
with existing application rows, copies the data in one transaction, compares
each row by primary key (including artwork bytes), and advances each generated
ID sequence. It retains durable accounts, linked identities, ownership and audit
history. Stale sessions, login transactions, invitations and rate-limit buckets
stay behind. Unassigned data stays in the local workspace. Review the transfer
report and exercise read and write workflows against PostgreSQL before changing
the regular launcher configuration. Keep the original SQLite file and checkpoint.

### Back up PostgreSQL before cutover

[Create and restore a PostgreSQL archive](database-migrations.md#back-up-and-restore-postgresql)
before switching the regular app's database connection.

If cutover fails, stop the PostgreSQL-backed app and switch the launcher back to
the original SQLite configuration and compatible code. Preserve the PostgreSQL
database and a verified backup of any new writes before switching back. New writes
have to be reconciled before another transfer. See [#56](https://github.com/Trevasaures/cardfight/issues/56).

## Assign the local workspace to a PostgreSQL account

First establish the intended admitted Cardfight account and verify its UUID with
`/api/auth/session` while signed in. Google or email must use the expected Auth0
issuer. Account sign-in alone leaves imported local records unassigned. Decks,
matches, and acquisition plans are assigned together. Deck versions, entries,
plan items, and Rivalries follow those records through their existing links.

Stop application writes to the target and create a separately named PostgreSQL
database with an empty `public` schema for the restore. Select both databases in
a dedicated terminal. Use a database role that can read the target for backup,
update its workspace rows, and restore objects in the rehearsal database.
The example uses a shared port and credentials. A separate PostgreSQL server
also works. Keep passwords in your PostgreSQL password file or secret store.

```powershell
$env:DATABASE_URL = "postgresql+psycopg://cardfight@127.0.0.1:5432/cardfight_rehearsal"
$env:CARDFIGHT_REHEARSAL_DATABASE_URL = "postgresql+psycopg://cardfight@127.0.0.1:5432/cardfight_owner_restore"
$account = "<verified Cardfight account UUID>"
python -m migrations.postgresql.claim --account $account --pg-bin "C:/Program Files/PostgreSQL/18/bin"
```

The command saves a fresh PostgreSQL archive in `CARDFIGHT_BACKUP_DIR` or the
external default backup directory. It restores the archive, rehearses and rolls
back the assignment on the copy, then applies the same change to the target only
if the saved rows still match. Existing owned records, identities, and catalog
rows retain their values. A duplicate deck name within the selected account or
a cross-account reference involving the local workspace blocks assignment. The
restore database holds a full copy of the original data. Protect it like the
backup and remove the disposable database after verification.

For the assigned workspace, launch with the configured `oidc-dev` settings and
regular `./start.ps1`. `-Fresh` starts the sign-in-free workspace, which shows
only unassigned rows. Verify Deck Library, Match History, and Order Tracker
after a fresh sign-in. For recovery, restore the archive to a separate database,
reconcile identities and revoke restored sessions as described in the
[authentication recovery runbook](authentication-setup.md#recovery), then
repoint the application to the verified database.

## SQLite schema history

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

## Inspect SQLite without changing data

```sh
python -m backend.migrate status --database "instance/cardfight.db"
python -m backend.migrate status --database "instance/cardfight.db" --require-current
```

`status` reports missing, empty, supported-unversioned, pending, or current state.
`--require-current` fails unless both revision and schema match this application.
Unknown revisions, multiple/empty version rows, unsupported layouts, and partial
table-replacement remnants are errors. Inspection and application startup open
the existing file read-only; they do not create a missing file or stamp a version.

The SQLite migration commands require either `--database` or an explicit
absolute file-backed SQLite `DATABASE_URL`. Use `--source` to select the
file for `backend.backup create` when PostgreSQL is configured.

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

### Assign your existing workspace on the SQLite test copy

Configure the Auth0 provider in the ignored `.env` file, then use a dedicated
PowerShell terminal for the test database. Restore a verified checkpoint to a
new path with `--for-ownership`. Use `backend.migrate baseline` with
`--database $copy` if inspection reports `unversioned`, or `upgrade` if it
reports `pending`. [Authentication setup](authentication-setup.md#configure-the-server-locally)

```powershell
$copy = Join-Path $env:LOCALAPPDATA "Cardfight\auth-test\cardfight.db"
$python = ".\.venv\Scripts\python.exe"
& $python -m backend.backup restore "C:/path/to/backup.sqlite3" --destination $copy --for-ownership
if ($LASTEXITCODE -ne 0) { throw "Restore failed. Select a new file path." }
& $python -m backend.migrate status --database $copy
```

After the copy is on the current revision, select it for sign-in.

```powershell
$env:DATABASE_URL = "sqlite:///" + $copy.Replace('\', '/')
$env:CARDFIGHT_AUTH_MODE = "oidc-dev"
$env:CARDFIGHT_AUTH_PUBLIC_ORIGIN = "http://127.0.0.1:5173"
$env:CARDFIGHT_AUTH_ADMISSION_HOLD = "false"

& $python -m backend.migrate status --database $copy --require-current
if ($LASTEXITCODE -ne 0) { throw "The test copy is not ready." }
& $python -m backend.auth_admin invite --email "your-verified-email@example.com"
if ($LASTEXITCODE -ne 0) { throw "Cardfight could not create the invitation." }
.\start.ps1 -DatabasePath $copy
```

Stop any prior Cardfight services using ports 5000 or 5173 before launching.
Regular startup uses the sign-in settings above. `-Fresh` selects the local lab
without sign-in.

Open the private invitation URL printed by the command and sign in with the
matching email. Use the same sign-in method on later visits. Before creating
any new decks, matches, or acquisition plans, open
`http://127.0.0.1:5173/api/auth/session` in the same browser and copy
`account.id`. That value is the Cardfight account UUID.

```powershell
$account = "<account.id from the session page>"
$backupDir = Join-Path (Split-Path -Parent $copy) "backups"
& $python -m backend.ownership assign-copy --database $copy --account $account --backup-dir $backupDir
```

The assignment checkpoints the test database, rehearses against a restored
copy, and assigns the unowned decks, matches, and acquisition plans in one
transaction. Keep the `.ownership-restore.json` receipt generated by
`restore --for-ownership` beside that database. The receipt identifies the
original restored file through upgrades and sign-ins. For a test copy without
a receipt, checkpoint it and restore that backup to a new path with the flag.
The selected copy must contain only unowned workspace records. The result
reports the assigned counts and backup path. Reload Deck Library while signed
in to see the imported decks.

## Adopt existing unversioned data once

Stop the application and every other writer, including database editors. Keep
writes stopped through verification and the final upgrade. Then run:

```sh
python -m backend.migrate baseline --database "instance/cardfight.db"
python -m backend.migrate status --database "instance/cardfight.db" --require-current
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
python -m backend.backup create --source "instance/cardfight.db"
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
python -m backend.migrate upgrade --database "instance/cardfight.db"
python -m backend.migrate status --database "instance/cardfight.db" --require-current
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

## Adding a future SQLite revision

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
