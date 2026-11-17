"""Start the packaged application or run an explicit operator command."""

import os
import sys

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from backend.auth.settings import loopback


def configure_database():
    error = "Set DATABASE_URL to the hosted PostgreSQL connection with a database and user."
    try:
        url = make_url(os.environ.get("DATABASE_URL", ""))
    except (ArgumentError, ValueError):
        raise SystemExit(error) from None
    if (
        url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}
        or not url.host
        or loopback(url.host.lower().rstrip("."))
        or not url.username
        or not url.database
    ):
        raise SystemExit(error)
    os.environ["DATABASE_URL"] = url.set(drivername="postgresql+psycopg").render_as_string(
        hide_password=False
    )


def main():
    configure_database()
    os.environ.setdefault("CARDFIGHT_AUTH_MODE", "oidc")
    if os.getenv("RENDER") == "true" and (origin := os.getenv("RENDER_EXTERNAL_URL")):
        os.environ.setdefault("CARDFIGHT_AUTH_PUBLIC_ORIGIN", origin)
    command = sys.argv[1:]
    if command:
        os.execvp(command[0], command)
    from waitress import serve
    from backend.hosted import app

    serve(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))


if __name__ == "__main__":
    main()
