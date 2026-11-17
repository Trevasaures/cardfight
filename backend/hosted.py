"""WSGI entry point for public HTTPS deployments with OIDC and optional React."""

import os
from pathlib import Path
import re

from dotenv import load_dotenv
from flask import request, send_file
from werkzeug.exceptions import NotFound

from backend.config import PROJECT_ROOT


_BACKEND_PATHS = {"api", "auth", "join", "health", "ready"}
_HASHED_ASSET = re.compile(r".+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+")


def _register_frontend(app, location):
    error = "CARDFIGHT_FRONTEND_DIST must point to a build containing index.html."
    try:
        directory = (PROJECT_ROOT / Path(location)).resolve(strict=True)
        index = (directory / "index.html").resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise ValueError(error) from exc
    if not index.is_relative_to(directory) or not index.is_file():
        raise ValueError(error)

    @app.before_request
    def frontend_fallback():
        # Run after the public Host check and only for unmatched reads. Flask
        # retains its own route handling, including method errors and redirects.
        if request.method not in {"GET", "HEAD"} or not isinstance(
            request.routing_exception, NotFound
        ):
            return None
        path = request.path.removeprefix("/")
        first = path.partition("/")[0]
        if first in _BACKEND_PATHS or any(
            segment.startswith(".") or "\\" in segment or ":" in segment
            for segment in path.split("/")
        ):
            return None
        try:
            candidate = (directory / path).resolve()
            if not candidate.is_relative_to(directory):
                return None
            if candidate.is_file():
                immutable = first == "assets" and _HASHED_ASSET.fullmatch(
                    candidate.name
                )
                response = send_file(candidate, max_age=31_536_000 if immutable else 0)
                if immutable:
                    response.cache_control.immutable = True
                return response
            if path and (
                first == "assets"
                or Path(path).suffix
                or (directory / first).is_dir()
            ):
                return None
        except (OSError, RuntimeError, ValueError):
            return None
        return send_file(index, max_age=0)


def _load_application():
    load_dotenv(PROJECT_ROOT / ".env")
    error = "Hosted startup requires CARDFIGHT_AUTH_MODE=oidc."
    if os.getenv("CARDFIGHT_AUTH_MODE") != "oidc":
        raise ValueError(error)

    from backend.app import app

    # The process may have imported the local entry point before this module.
    if app.extensions["cardfight_auth"]["settings"].mode != "oidc":
        raise ValueError(error)
    frontend_dist = os.getenv("CARDFIGHT_FRONTEND_DIST")
    if frontend_dist:
        _register_frontend(app, frontend_dist)
    return app


app = _load_application()
