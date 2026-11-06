"""Recovery rehearsals use disposable databases, never the saved player workspace."""

from datetime import datetime
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

from PIL import Image
import pytest

from backend.app import create_app
from backend.backup import (
    BackupError,
    check_backup,
    create_backup,
    database_summary,
    restore_backup,
    verify_backup,
)
from backend.database import db
from backend.models import (
    AcquisitionPlan,
    AcquisitionPlanItem,
    Card,
    CardPrinting,
    CardSet,
    Deck,
    DeckCard,
    DeckVersion,
    Match,
)
from backend.services.card_images import prepare_image


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def file_digest(path):
    return sha256(path.read_bytes()).hexdigest()


def manifest_path(backup):
    return backup.with_name(backup.name + ".manifest.json")


def image_data(color):
    output = BytesIO()
    Image.new("RGB", (70, 100), color).save(output, format="PNG")
    return output.getvalue()


@pytest.fixture()
def saved_database(tmp_path):
    """Keep every current entity and several easy-to-lose relationships populated."""
    source = tmp_path / "player workspace.db"
    application = create_app(
        {"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{source.as_posix()}"}
    )
    when = datetime(2026, 11, 5, 10, 30)
    with application.app_context():
        first_image = prepare_image(image_data("navy"))
        second_image = prepare_image(image_data("gold"))
        card = Card(
            name="Recovery unit — alternate artwork",
            card_type="Normal Unit",
            grade=3,
            nation="Keter Sanctuary",
            power=13000,
            shield=0,
            critical=1,
            skill_text="[AUTO](VC): Preserve this rules text.\nAnd its second line.",
        )
        db.session.add_all(
            [card, CardSet(code="SAVE", name="Recovery fixture set")]
        )
        db.session.flush()
        printings = [
            CardPrinting(
                card_id=card.id,
                set_code="SAVE",
                set_name="Recovery fixture set",
                card_number="001",
                rarity="RRR",
                image_id=first_image.id,
            ),
            CardPrinting(
                card_id=card.id,
                set_code="SAVE",
                set_name="Recovery fixture set",
                card_number="001-SP",
                rarity="SP",
                image_id=second_image.id,
            ),
        ]
        decks = [
            Deck(name="Recovery deck", type="Standard", nation="Keter Sanctuary", wins=1),
            Deck(name="Opponent", type="Stride", nation="Dark States", losses=1),
        ]
        db.session.add_all([*printings, *decks])
        db.session.flush()
        versions = [
            DeckVersion(
                deck_id=decks[0].id,
                version_name="Saved original",
                notes="Before upgrade",
            ),
            DeckVersion(deck_id=decks[1].id, version_name="Opponent original"),
        ]
        db.session.add_all(versions)
        db.session.flush()
        db.session.add_all(
            [
                DeckCard(
                    deck_version_id=versions[0].id,
                    card_id=card.id,
                    printing_id=printings[0].id,
                    quantity=3,
                    zone="main",
                ),
                DeckCard(
                    deck_version_id=versions[0].id,
                    card_id=card.id,
                    printing_id=printings[1].id,
                    quantity=1,
                    zone="ride",
                ),
                DeckCard(
                    deck_version_id=versions[1].id,
                    card_id=card.id,
                    printing_id=printings[1].id,
                    quantity=4,
                    zone="main",
                ),
                Match(
                    deck1_id=decks[0].id,
                    deck2_id=decks[1].id,
                    deck1_version_id=versions[0].id,
                    deck2_version_id=versions[1].id,
                    winner_id=decks[0].id,
                    first_player_id=decks[1].id,
                    date_played=when,
                    notes="Keep historical versions and notes",
                ),
            ]
        )
        archived = AcquisitionPlan(
            name="Finished purchase",
            plan_type="existing_deck",
            list_source="deck_version",
            status="complete",
            archived_at=when,
            deck_id=decks[0].id,
            deck_version_id=versions[0].id,
            source_deck_version_id=versions[0].id,
            notes="Retain archived prices",
        )
        active = AcquisitionPlan(name="Incoming purchase", status="waiting")
        db.session.add_all([archived, active])
        db.session.flush()
        db.session.add_all(
            [
                AcquisitionPlanItem(
                    plan_id=archived.id,
                    card_id=card.id,
                    printing_id=printings[0].id,
                    required_quantity=4,
                    source_quantity=4,
                    owned_quantity=4,
                    unit_price_cents=225,
                    notes="Original printing",
                ),
                AcquisitionPlanItem(
                    plan_id=archived.id,
                    card_id=card.id,
                    printing_id=printings[1].id,
                    required_quantity=0,
                    source_quantity=2,
                    removed_quantity=2,
                    confirmed_removed_quantity=1,
                    removal_confirmed_at=when,
                    owned_quantity=2,
                    unit_price_cents=3000,
                    notes="Keep the outgoing change record",
                ),
                AcquisitionPlanItem(
                    plan_id=active.id,
                    card_id=card.id,
                    printing_id=printings[1].id,
                    required_quantity=3,
                    owned_quantity=1,
                    ordered_quantity=1,
                    unit_price_cents=3300,
                ),
            ]
        )
        db.session.commit()
        db.session.remove()
        db.engine.dispose()
    return source


def test_round_trip_preserves_all_records_relationships_and_artwork(
    saved_database, tmp_path
):
    before = database_summary(saved_database)
    source_digest = file_digest(saved_database)
    backup = create_backup(saved_database, tmp_path / "backups")
    assert backup.is_file() and manifest_path(backup).is_file()
    assert isinstance(check_backup(backup), dict)
    destination = tmp_path / "restored" / "cardfight.db"
    restore_backup(backup, destination)
    assert database_summary(destination) == before
    assert file_digest(saved_database) == source_digest

    with sqlite3.connect(destination) as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute(
            'SELECT deck1_version_id, deck2_version_id, winner_id FROM "match"'
        ).fetchone() == (1, 2, 1)
        assert connection.execute(
            "SELECT quantity, zone, printing_id FROM deck_card ORDER BY id"
        ).fetchall() == [(3, "main", 1), (1, "ride", 2), (4, "main", 2)]
        assert connection.execute(
            "SELECT required_quantity, source_quantity, removed_quantity, "
            "confirmed_removed_quantity, owned_quantity, ordered_quantity, unit_price_cents "
            "FROM acquisition_plan_item ORDER BY id"
        ).fetchall() == [
            (4, 4, 0, 0, 4, 0, 225),
            (0, 2, 2, 1, 2, 0, 3000),
            (3, 0, 0, 0, 1, 1, 3300),
        ]
        assert connection.execute(
            "SELECT archived_at, notes FROM acquisition_plan WHERE id=1"
        ).fetchone() == ("2026-11-05 10:30:00.000000", "Retain archived prices")
        images = connection.execute(
            "SELECT full_data, thumbnail_data, byte_size, thumbnail_byte_size "
            "FROM card_image ORDER BY id"
        ).fetchall()
        assert len(images) == 2 and images[0][0] != images[1][0]
        for full, thumbnail, full_size, thumbnail_size in images:
            assert len(full) == full_size and len(thumbnail) == thumbnail_size
            for data in (full, thumbnail):
                with Image.open(BytesIO(data)) as image:
                    image.verify()
        assert connection.execute("SELECT code, name FROM card_set").fetchone() == (
            "SAVE", "Recovery fixture set"
        )


def test_verification_rehearses_application_reads_without_modifying_sources(
    saved_database, tmp_path
):
    source_digest = file_digest(saved_database)
    backup = create_backup(saved_database, tmp_path / "backups")
    backup_digest = file_digest(backup)
    assert isinstance(verify_backup(backup, app_check=True), dict)
    assert file_digest(saved_database) == source_digest
    assert file_digest(backup) == backup_digest


def test_online_backup_includes_committed_wal_but_not_uncommitted_writes(
    saved_database, tmp_path
):
    with sqlite3.connect(saved_database) as writer:
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("UPDATE deck SET name='Committed WAL deck' WHERE id=1")
        writer.commit()
        writer.execute("UPDATE deck SET name='Uncommitted deck' WHERE id=1")
        backup = create_backup(saved_database, tmp_path / "backups")
        with sqlite3.connect(backup) as restored:
            assert (
                restored.execute("SELECT name FROM deck WHERE id=1").fetchone()[0]
                == "Committed WAL deck"
            )
        writer.rollback()


def test_application_verification_rejects_artwork_that_cannot_be_decoded(
    saved_database, tmp_path
):
    output = BytesIO()
    Image.new("RGB", (100, 140), "navy").save(output, format="JPEG")
    truncated = output.getvalue()[:-2]
    # Structural validation alone accepts this missing JPEG end marker.
    with Image.open(BytesIO(truncated)) as image:
        image.verify()
    with sqlite3.connect(saved_database) as connection:
        connection.execute(
            "UPDATE card_image SET full_data=?, byte_size=?, mimetype='image/jpeg', "
            "width=100, height=140 WHERE id=(SELECT MIN(id) FROM card_image)",
            (truncated, len(truncated)),
        )
    before = file_digest(saved_database)
    backup = create_backup(saved_database, tmp_path / "backups")
    # The snapshot faithfully preserves the original; it is the app-read gate
    # that must reject pre-existing, unusable artwork.
    check_backup(backup)
    with pytest.raises(BackupError, match="application check failed"):
        verify_backup(backup, app_check=True)
    assert file_digest(saved_database) == before


@pytest.mark.parametrize("sidecar", ["", "-wal", "-shm", "-journal"])
def test_restore_refuses_existing_target_or_journals(saved_database, tmp_path, sidecar):
    backup = create_backup(saved_database, tmp_path / "backups")
    destination = tmp_path / "existing.db"
    protected = Path(str(destination) + sidecar)
    protected.write_bytes(b"Do not replace an existing recovery target")
    with pytest.raises(BackupError):
        restore_backup(backup, destination)
    assert protected.read_bytes() == b"Do not replace an existing recovery target"
    if sidecar:
        assert not destination.exists()


def test_restore_refuses_source_and_backup_as_destination(saved_database, tmp_path):
    original = file_digest(saved_database)
    backup = create_backup(saved_database, tmp_path / "backups")
    snapshot = file_digest(backup)
    for destination in (saved_database, backup):
        with pytest.raises(BackupError):
            restore_backup(backup, destination)
    assert file_digest(saved_database) == original
    assert file_digest(backup) == snapshot


@pytest.mark.parametrize("kind", ["missing", "empty", "corrupt", "unrelated"])
def test_backup_rejects_missing_or_invalid_database_without_creating_source(
    tmp_path, kind
):
    source = tmp_path / "invalid.db"
    if kind == "empty":
        source.touch()
    elif kind == "corrupt":
        source.write_bytes(b"This is not an SQLite database")
    elif kind == "unrelated":
        with sqlite3.connect(source) as connection:
            connection.execute("CREATE TABLE unrelated(id INTEGER PRIMARY KEY)")
    before = source.read_bytes() if source.exists() else None
    with pytest.raises(BackupError):
        create_backup(source, tmp_path / "backups")
    assert (source.read_bytes() if source.exists() else None) == before
    assert not list((tmp_path / "backups").glob("*.sqlite3"))


def test_backup_rejects_dangling_references(saved_database, tmp_path):
    # Native sqlite3 connections default to foreign_keys=OFF, simulating a legacy defect.
    with sqlite3.connect(saved_database) as connection:
        connection.execute("UPDATE deck_card SET card_id=99999 WHERE id=1")
    before = file_digest(saved_database)
    with pytest.raises(BackupError):
        create_backup(saved_database, tmp_path / "backups")
    assert file_digest(saved_database) == before


@pytest.mark.parametrize("contents", [None, "{invalid json", "[]", "{}"])
def test_verify_and_restore_require_a_valid_manifest(saved_database, tmp_path, contents):
    backup = create_backup(saved_database, tmp_path / "backups")
    manifest = manifest_path(backup)
    if contents is None:
        manifest.unlink()
    else:
        manifest.write_text(contents, encoding="utf-8")
    with pytest.raises(BackupError):
        verify_backup(backup)
    destination = tmp_path / "restore.db"
    with pytest.raises(BackupError):
        restore_backup(backup, destination)
    assert not destination.exists()


def test_altered_backup_is_rejected_before_restore(saved_database, tmp_path):
    backup = create_backup(saved_database, tmp_path / "backups")
    with sqlite3.connect(backup) as connection:
        connection.execute('UPDATE "match" SET notes=\'Changed after snapshot\'')
    with pytest.raises(BackupError):
        check_backup(backup)
    destination = tmp_path / "restore.db"
    with pytest.raises(BackupError):
        restore_backup(backup, destination)
    assert not destination.exists()


def test_manifest_cannot_claim_unverified_table_contents(saved_database, tmp_path):
    backup = create_backup(saved_database, tmp_path / "backups")
    manifest = manifest_path(backup)
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    payload["database"]["tables"]["deck"]["rows"] += 1
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(BackupError):
        check_backup(backup)


def test_changed_values_are_detected_even_when_counts_and_file_checksum_match(
    saved_database, tmp_path
):
    backup = create_backup(saved_database, tmp_path / "backups")
    with sqlite3.connect(backup) as connection:
        connection.execute("UPDATE acquisition_plan_item SET unit_price_cents=1 WHERE id=1")
    manifest = manifest_path(backup)
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    payload["sha256"] = file_digest(backup)
    payload["size_bytes"] = backup.stat().st_size
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(BackupError):
        check_backup(backup)


def test_verification_uses_the_frozen_snapshot_after_live_source_changes(
    saved_database, tmp_path
):
    backup = create_backup(saved_database, tmp_path / "backups")
    snapshot = database_summary(backup)
    with sqlite3.connect(saved_database) as connection:
        connection.execute("UPDATE deck SET name='Changed after backup' WHERE id=1")
    assert database_summary(saved_database) != snapshot
    assert isinstance(verify_backup(backup), dict)
    destination = tmp_path / "historical.db"
    restore_backup(backup, destination)
    assert database_summary(destination) == snapshot


def test_repeated_backups_get_distinct_complete_artifacts(saved_database, tmp_path):
    first = create_backup(saved_database, tmp_path / "backups")
    second = create_backup(saved_database, tmp_path / "backups")
    assert first != second
    for backup in (first, second):
        assert isinstance(check_backup(backup), dict)


def test_cli_uses_configured_source_and_never_imports_the_application(saved_database, tmp_path):
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{saved_database.as_posix()}"}
    imported = subprocess.run(
        [sys.executable, "-c", "import backend.backup, sys; print('backend.app' in sys.modules)"],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert imported.stdout.strip() == "False"
    backup_dir = tmp_path / "cli backups"
    created = subprocess.run(
        [sys.executable, "-m", "backend.backup", "create", "--backup-dir", str(backup_dir)],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    assert created.returncode == 0, created.stderr
    assert isinstance(json.loads(created.stdout), dict)
    backups = list(backup_dir.glob("*.sqlite3"))
    assert len(backups) == 1
    assert database_summary(backups[0]) == database_summary(saved_database)


@pytest.mark.parametrize("url", ["sqlite:///:memory:", "postgresql://example/unused"])
def test_cli_rejects_non_file_configuration_instead_of_using_default_data(tmp_path, url):
    result = subprocess.run(
        [sys.executable, "-m", "backend.backup", "create", "--backup-dir", str(tmp_path)],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert not list(tmp_path.glob("*.sqlite3"))
