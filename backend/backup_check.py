"""Read-only application checks for a disposable restored database, not a server."""

import argparse
from contextlib import closing
from io import BytesIO
import json
import os
from pathlib import Path
import sqlite3
import sys

from backend.backup import BackupError, _read_connection, database_summary


def check_application(database):
    database = Path(database).resolve()
    before = database_summary(database)
    # This must precede the import: backend.app creates its default app at import.
    # Read-only SQLite also prevents startup helpers or a GET from modifying it.
    os.environ["DATABASE_URL"] = f"sqlite:///{database.as_uri()}?mode=ro&uri=true"
    os.environ["FLASK_DEBUG"] = "false"
    # Recovery validation is a loopback-only, read-only subprocess over a
    # disposable copy. It must not depend on a live identity provider or admit
    # restored sessions. Never use this mode as a hosted serving configuration.
    os.environ["CARDFIGHT_AUTH_MODE"] = "local"
    from PIL import Image
    from backend.app import app
    from backend.database import db

    app.config.update(TESTING=True)
    requests = 0

    def get_json(client, path):
        nonlocal requests
        response = client.get(path)
        requests += 1
        if response.status_code != 200 or not response.is_json:
            raise BackupError(f"Restored API read failed: {path} (HTTP {response.status_code}).")
        return response.get_json()

    def require(condition, message):
        if not condition:
            raise BackupError(message)

    counts = {}
    try:
        with closing(_read_connection(database)) as connection, app.test_client() as client:
            connection.row_factory = sqlite3.Row
            for path in ("/api/health", "/api/decks", "/api/matches",
                         "/api/acquisition-plans", "/api/cards/sets"):
                get_json(client, path)
            for table, route in (("deck", "/api/decks/"),
                                 ("match", "/api/matches/"),
                                 ("deck_version", "/api/deck-versions/"),
                                 ("acquisition_plan", "/api/acquisition-plans/"),
                                 ("card", "/api/cards/")):
                count = 0
                for row in connection.execute(f'SELECT id FROM "{table}" ORDER BY id'):
                    saved_id = row["id"]
                    data = get_json(client, route + str(saved_id))
                    require(isinstance(data, dict) and data.get("id") == saved_id,
                            f"Restored {table} detail did not return its saved ID.")
                    if table == "deck":
                        versions = get_json(client, f"/api/decks/{saved_id}/versions")
                        expected = [item[0] for item in connection.execute(
                            "SELECT id FROM deck_version WHERE deck_id=? ORDER BY id", (saved_id,)
                        )]
                        require(sorted(item["id"] for item in versions) == expected,
                                "Restored deck version relationships differ.")
                    for parent, child, key, field in (
                        ("deck_version", "deck_card", "deck_version_id", "cards"),
                        ("acquisition_plan", "acquisition_plan_item", "plan_id", "items"),
                        ("card", "card_printing", "card_id", "printings"),
                    ):
                        if table == parent:
                            expected = [item[0] for item in connection.execute(
                                f'SELECT id FROM "{child}" WHERE "{key}"=? ORDER BY id', (saved_id,)
                            )]
                            require(sorted(item["id"] for item in data[field]) == expected,
                                    f"Restored {parent} child relationships differ.")
                    count += 1
                counts[table] = count

            images = 0
            for row in connection.execute("SELECT * FROM card_image ORDER BY id"):
                for variant, column, size_column in (
                    ("full", "full_data", "byte_size"),
                    ("thumbnail", "thumbnail_data", "thumbnail_byte_size"),
                ):
                    response = client.get(f"/api/card-images/{row['id']}/{variant}")
                    requests += 1
                    require(response.status_code == 200 and response.data == row[column],
                            "Restored artwork endpoint differs from saved bytes.")
                    require(len(response.data) == row[size_column],
                            "Restored artwork size metadata differs from saved bytes.")
                    expected_mime = row["mimetype"] if variant == "full" else "image/webp"
                    require(response.mimetype == expected_mime,
                            "Restored artwork MIME type differs.")
                    with Image.open(BytesIO(response.data)) as image:
                        image.verify()
                    # verify() alone does not decode JPEG/WebP pixel data and
                    # can accept truncated images that the UI cannot display.
                    with Image.open(BytesIO(response.data)) as image:
                        image.load()
                        if variant == "full":
                            require(image.size == (row["width"], row["height"]),
                                    "Restored artwork dimensions differ.")
                images += 1
            counts["card_image"] = images
    finally:
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
    require(database_summary(database) == before, "Application reads changed restored data.")
    return {"read_only": True, "requests_checked": requests, "records_checked": counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    arguments = parser.parse_args()
    try:
        print(json.dumps(check_application(arguments.database)))
        return 0
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
