# SQLite backup and recovery

Run these commands from the repository root with the project's Python environment
active. The `python` commands and forward-slash relative paths below work in
PowerShell and Unix shells. Use `python3` if that is your environment's Python
command.

## What to preserve

The default database is `instance/cardfight.db`. An absolute, file-backed SQLite
`DATABASE_URL` can select another location. The database contains decks, versions,
matches, card and printing metadata, purchase plans, and stored artwork bytes.
Git does not preserve this local data.

A backup consists of two adjacent files: a timestamped, uniquely named `.sqlite3`
database and its `<filename>.manifest.json` manifest. Keep both files together,
with their original names. The manifest records the file checksum, schema and
table digests, and row counts used for verification; row digests include BLOB
artwork bytes. Treat both files as private data, with the same access controls as
the source database.

The backup does not include `.env`, credentials, browser-only Hand Lab recovery
or unfinished drafts, external image contents referenced by URL, or other files
outside the database. Preserve needed configuration separately and securely.

## Create a checkpoint

```sh
python -m backend.backup create
```

The command loads the root `.env` without importing `backend.app` or running its
startup schema upgrades. It uses the configured absolute SQLite file path, or
`instance/cardfight.db` when `DATABASE_URL` is not configured. This utility backs
up file-backed SQLite databases; it is not a backup command for other database
engines. Explicit paths override the configured source and backup directory:

```sh
python -m backend.backup create --source "instance/cardfight.db" --backup-dir "instance/backups"
```

The default destination, `instance/backups/`, is ignored by Git. If you select
another directory, keep both the database and manifest out of source control.
Use the resulting backup path printed by the command in subsequent commands.
In the examples below, replace `BACKUP.sqlite3` with that actual filename.

The source is opened read-only and copied with SQLite's online backup API. This
captures committed data, including committed data in a WAL file, while the app
may be running. A checkpoint does not include changes committed afterward. Stop
application writes before creating the final pre-upgrade or cutover checkpoint;
keep writes stopped until the checkpoint passes verification. Do not substitute
a raw copy of a running database file for this command.

## Verify before relying on a backup

```sh
python -m backend.backup verify "instance/backups/BACKUP.sqlite3" --app-check
```

Verification checks the manifest and database checksum, SQLite integrity and
foreign keys, schema, and all table rows against their recorded digests. The
`--app-check` option additionally exercises a disposable restored database with
read-only Flask/API smoke checks in a subprocess. It checks every saved deck,
version, match, purchase plan, and card through its detail endpoint, verifies
saved child relationships, and fully decodes every stored full-size image and
thumbnail after comparing the served bytes with SQLite. It does not start the live
application against the backup or point those checks at your original database.
The temporary restored copy is for rehearsal, not a new live database.

Use a code version compatible with the checkpoint for this rehearsal. To
establish an exact pre-upgrade recovery point, verify it with the code version
that created it before testing a newer version. A successful SQLite check alone
does not establish compatibility with every future application version.

Require a successful `verify --app-check` before a migration, a hosting cutover,
or deleting an older recovery point. After copying a backup off the machine,
verify that copy as well. A failed or missing-manifest verification is not a
passed checkpoint: keep the source and earlier verified backups, investigate the
failure, and create and verify a replacement before proceeding.

## Retention and external copies

A practical starting policy is seven daily checkpoints and four weekly
checkpoints, plus a verified checkpoint before each upgrade or migration. Keep
the checkpoint for the last known working release until the new release and its
data have been validated. Retention is manual; this utility does not schedule
backups or prune old files.

Keep at least one verified copy on another device or an appropriately protected
external backup destination. Copies on the same disk do not cover loss of that
disk. Copy each `.sqlite3` file together with its manifest, verify the copied
pair, and only then consider removing an older pair. Cloud backups are not
enabled by these commands; configure any external backup service separately.

## Restore to a new path

```sh
python -m backend.backup restore "instance/backups/BACKUP.sqlite3" --destination "instance/recovered/cardfight-restored.db"
```

Choose a new destination filename each time. Restore validates the backup and
the restored target. It refuses an existing destination, including an empty file,
or existing SQLite journal sidecars at that destination. There is no overwrite
option. Never use restore to replace a live database in place.

Before switching the application, stop it, finish the compatible-code rehearsal,
and set `DATABASE_URL` to the absolute path of the verified recovered database.
Use the existing environment settings or edit the local `.env`; for example:

```dotenv
# Windows: replace the example with your recovered file's absolute path.
DATABASE_URL=sqlite:///C:/Users/you/cardfight/instance/recovered/cardfight-restored.db

# Unix: use four slashes before an absolute filesystem path.
# DATABASE_URL=sqlite:////home/you/cardfight/instance/recovered/cardfight-restored.db
```

Restart the matching application version and check the dashboard, saved decks
and versions, match history, purchase plans, and stored artwork. Retain the
verified backup pair. Do not seed the database as a recovery step: seeding adds
starter decks and does not recover your saved records.

## Roll back a failed upgrade

1. Stop the application and all processes that can write to its database. Do not
   inspect a failed database by starting an app version that runs schema upgrades.
2. Preserve the failed database for diagnosis. Only after writers are stopped,
   quarantine it together with any adjacent `-wal`, `-shm`, and `-journal` files.
   Keep the complete set together; do not discard sidecars or mix them with a
   different database. Verify the paths before moving anything.
3. Return to the code and dependency versions used by the last verified
   pre-upgrade checkpoint. Verify that checkpoint with `--app-check`.
4. Restore the checkpoint to a separate, new filename with the command above.
   Keep the failed database and the backup pair intact.
5. Point `DATABASE_URL` at the absolute path of the newly restored, verified
   database, then restart the matching application version. Do not overwrite the
   failed database and do not reseed.
6. Review the restored workflows and record the recovery point used. Changes
   made after that checkpoint are not part of this rollback; reconcile them
   separately if they are needed.

## Recovery rehearsal record

Record the code revision, date, source table counts, backup verification result,
restored table counts, stored-artwork checks, and API smoke result for a rehearsal.
Keep local paths and private card, match, and purchase details out of public
reports. A completed rehearsal should demonstrate that the source was preserved
and the restored copy retained its records and artwork.

A measured rehearsal passed on November 5, 2026 (America/Chicago), using the
issue #44 working tree based on commit `f567f567ec80efb89cbf9238c9ac61e828708201`.
A checkpoint of the existing local database was restored both to disposable
storage for application checks and to a separate retained recovery database.
All ten saved tables retained identical schema and row digests, including artwork
BLOBs. The restored copy passed 1,397 read-only API requests, including full pixel
decoding of stored full-size images and thumbnails. The original database's
SHA-256 and complete logical summary were identical before and after the rehearsal.

The detailed report, counts, hashes, and local artifact paths are retained under
ignored `instance/recovery-rehearsals/`; the backup pair is under
`instance/backups/`, and the retained restored database is under
`instance/restores/`. This verifies local recovery with this code version. It does
not establish an off-device backup, scheduled retention, or compatibility with a
future migration. Repeat the rehearsal for each pre-upgrade checkpoint.
