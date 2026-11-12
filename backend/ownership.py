"""Rehearse or assign ownership on an explicitly selected workspace copy."""

import argparse
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from backend.backup import (
    BackupError,
    PROJECT_ROOT,
    _quote,
    create_backup,
    default_backup_dir,
    file_identity,
    manifest_path,
    ownership_restore_receipt,
    restore_backup,
)
from backend.migrate import (
    MigrationError,
    _apply_migrations,
    _file_snapshot,
    _integrity,
    _read_engine,
    _row_snapshot,
    _snapshot,
    inspect_database,
)

OWNED_ROOTS = ("deck", "match", "acquisition_plan")


class OwnershipError(ValueError):
    """The checkpoint cannot be assigned safely."""


def _account_uuid(account_id):
    try:
        return str(UUID(str(account_id)))
    except ValueError as exc:
        raise OwnershipError("Provide the exact UUID of the selected account.") from exc


def _require_admitted_account(connection, account_id):
    status = connection.exec_driver_sql(
        "SELECT status FROM auth_account WHERE id = ?", (account_id,)
    ).scalar_one_or_none()
    if status != "admitted":
        raise OwnershipError(
            "Select an admitted account UUID already present in this workspace."
        )


def _preservation_snapshot(connection, snapshot=None):
    result = _snapshot(connection) if snapshot is None else snapshot
    original = {
        table: {
            "columns": [
                name
                for name in result["rows"][table]["columns"]
                if name != "owner_account_id"
            ]
        }
        for table in OWNED_ROOTS
    }
    result["rows"].update(_row_snapshot(connection, original))
    return result


def _legacy_counts(connection):
    counts = {}
    for table in OWNED_ROOTS:
        total, already_owned = connection.exec_driver_sql(
            f"SELECT COUNT(*), COUNT(owner_account_id) FROM {_quote(table)}"
        ).one()
        if already_owned:
            raise OwnershipError(
                "This workspace already contains owned records. Select an unassigned legacy workspace."
            )
        counts[table] = total
    return counts


def _assign_legacy_owner(connection, account_id, *, snapshot=None):
    _require_admitted_account(connection, account_id)
    counts = _legacy_counts(connection)
    before = _preservation_snapshot(connection, snapshot)
    for table, total in counts.items():
        changed = connection.exec_driver_sql(
            f"UPDATE {_quote(table)} SET owner_account_id = ? WHERE owner_account_id IS NULL",
            (account_id,),
        ).rowcount
        if changed != total:
            raise OwnershipError(
                "The assignment did not update the expected number of legacy records."
            )

    # Every private root must now have the same owner. Together with valid
    # foreign keys, this proves their children and cross-record links stay in
    # that account, including old links the app would no longer create.
    for table in OWNED_ROOTS:
        if connection.exec_driver_sql(
            f"SELECT 1 FROM {_quote(table)} WHERE owner_account_id IS NOT ? LIMIT 1",
            (account_id,),
        ).first():
            raise OwnershipError(
                "The checkpoint has inconsistent record ownership after assignment."
            )
    _integrity(connection)
    if _preservation_snapshot(connection) != before:
        raise OwnershipError(
            "The assignment changed saved values outside ownership fields."
        )

    return {
        "account_id": account_id,
        "revision": before["revision"],
        "assigned_counts": counts,
        "table_counts": {name: data["rows"] for name, data in before["rows"].items()},
        "saved_values_preserved": True,
        "related_records_verified": True,
    }


def _check_copy_path(path, expected_identity=None):
    usual_database = (PROJECT_ROOT / "instance" / "cardfight.db").resolve()
    resolved = path.resolve()
    if not path.is_file():
        raise OwnershipError("Select an existing SQLite test copy.")
    if resolved == usual_database or (
        usual_database.exists() and path.samefile(usual_database)
    ):
        raise OwnershipError(
            "Select a separate restored copy of the usual Cardfight database."
        )
    if manifest_path(resolved).exists():
        raise OwnershipError(
            "Restore this checkpoint to a separate copy before assigning ownership."
        )
    info = path.stat()
    if info.st_nlink != 1:
        raise OwnershipError("Select a restored test copy with no other hard links.")
    identity = file_identity(info)
    if expected_identity is None:
        try:
            receipt = json.loads(ownership_restore_receipt(resolved).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            receipt = None
        if receipt != {"destination": str(resolved), "identity": identity}:
            raise OwnershipError(
                "Select a new copy created with python -m backend.backup restore --for-ownership."
            )
    elif identity != expected_identity:
        raise OwnershipError(
            "The selected copy was replaced. Check the path and retry."
        )
    return identity


def _apply_assignment(path, account_id, *, expected=None, identity=None):
    if identity is not None:
        _check_copy_path(path, identity)
    engine = create_engine(
        "sqlite://",
        creator=lambda: sqlite3.connect(
            path.as_uri() + "?mode=rw", uri=True, timeout=5, isolation_level=None
        ),
    )
    try:
        with engine.connect() as connection:
            if identity is not None:
                _check_copy_path(path, identity)
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            snapshot = None
            if expected is not None:
                _check_copy_path(path, identity)
                snapshot = _snapshot(connection)
                if snapshot != expected:
                    raise OwnershipError(
                        "The selected copy changed after backup. Stop app writes and retry."
                    )
            report = _assign_legacy_owner(connection, account_id, snapshot=snapshot)
            if identity is not None:
                _check_copy_path(path, identity)
            connection.commit()
            return report
    finally:
        engine.dispose()


def rehearse_owner_assignment(backup, account_id):
    """Verify, migrate and assign a disposable copy of a checkpoint."""
    account_id = _account_uuid(account_id)

    with tempfile.TemporaryDirectory(prefix="cardfight-ownership-") as directory:
        restored = Path(directory).resolve() / "cardfight.db"
        restore_backup(backup, restored)
        state = inspect_database(restored)
        if state["revision"] in {None, "0001_baseline"}:
            raise OwnershipError(
                "Select a checkpoint that already contains the admitted account."
            )
        with _read_engine(restored) as connection:
            _require_admitted_account(connection, account_id)
        if state["status"] == "pending":
            _apply_migrations(restored)

        report = _apply_assignment(restored, account_id)

    return {
        "restored_copy_verified": True,
        "previous_revision": state["revision"],
        **report,
    }


def assign_owner_to_copy(database, account_id, *, backup_dir=None):
    """Assign a current test copy after verifying and rehearsing its checkpoint."""
    account_id = _account_uuid(account_id)
    path = Path(database).expanduser().resolve()
    identity = _check_copy_path(path)
    inspect_database(path, require_current=True)
    with _read_engine(path) as connection:
        _require_admitted_account(connection, account_id)
        _legacy_counts(connection)

    directory = backup_dir if backup_dir is not None else default_backup_dir()
    backup = create_backup(path, directory)
    expected = _file_snapshot(backup)
    rehearsal = rehearse_owner_assignment(backup, account_id)
    report = _apply_assignment(path, account_id, expected=expected, identity=identity)
    return {
        "database": str(path),
        "backup": str(backup),
        "rehearsal": rehearsal,
        **report,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    rehearsal = commands.add_parser(
        "rehearse", help="Assign ownership on a disposable copy"
    )
    rehearsal.add_argument("backup", type=Path)
    rehearsal.add_argument(
        "--account", required=True, help="Admitted account UUID in the checkpoint"
    )
    assignment = commands.add_parser(
        "assign-copy", help="Assign ownership on a separately restored test copy"
    )
    assignment.add_argument("--database", required=True, type=Path)
    assignment.add_argument(
        "--account", required=True, help="Admitted account UUID in the copy"
    )
    assignment.add_argument("--backup-dir", type=Path)
    arguments = parser.parse_args(argv)
    try:
        if arguments.command == "rehearse":
            result = rehearse_owner_assignment(arguments.backup, arguments.account)
        else:
            result = assign_owner_to_copy(
                arguments.database, arguments.account, backup_dir=arguments.backup_dir
            )
    except (
        OwnershipError,
        BackupError,
        MigrationError,
        OSError,
        sqlite3.Error,
        SQLAlchemyError,
    ) as exc:
        operation = "rehearsal" if arguments.command == "rehearse" else "assignment"
        print(f"Ownership {operation} failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"operation": arguments.command, **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
