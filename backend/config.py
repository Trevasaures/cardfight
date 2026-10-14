"""Application defaults shared by development, tests, and the WSGI server."""

import os
from pathlib import Path
from urllib.parse import urlsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_FRONTEND_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


def frontend_origins():
    """Accept literal origins, never a wildcard or a regular expression."""
    configured = os.getenv("CARDFIGHT_CORS_ORIGINS")
    if configured is None:
        return list(LOCAL_FRONTEND_ORIGINS)
    origins = []
    for value in configured.split(","):
        origin = value.strip().rstrip("/")
        if not origin:
            continue
        try:
            parts = urlsplit(origin)
            parts.port  # Parsing is lazy; this rejects malformed/out-of-range ports.
        except ValueError as exc:
            raise ValueError(
                "CARDFIGHT_CORS_ORIGINS must contain HTTP(S) origins"
            ) from exc
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username is not None
            or parts.password is not None
            or parts.path
            or parts.query
            or parts.fragment
            or any(
                character.isspace() or ord(character) < 32 or ord(character) == 127
                for character in origin
            )
            or any(character in origin for character in "*\\\r\n")
        ):
            raise ValueError("CARDFIGHT_CORS_ORIGINS must contain HTTP(S) origins")
        origins.append(origin)
    return origins


def default_config():
    return {
        "DEBUG": False,
        "SQLALCHEMY_DATABASE_URI": os.getenv(
            "DATABASE_URL",
            f"sqlite:///{(PROJECT_ROOT / 'instance/cardfight.db').as_posix()}",
        ),
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "CORS_ORIGINS": frontend_origins(),
        # Image endpoints retain their stricter 8 MB file limit. Bound other
        # request bodies too, without depending on the chosen WSGI server.
        "MAX_CONTENT_LENGTH": 16 * 1024 * 1024,
    }
