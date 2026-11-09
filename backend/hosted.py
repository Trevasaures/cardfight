"""WSGI entry point for public HTTPS deployments with OIDC."""

import os

from dotenv import load_dotenv

from backend.config import PROJECT_ROOT


def _load_application():
    load_dotenv(PROJECT_ROOT / ".env")
    error = "Hosted startup requires CARDFIGHT_AUTH_MODE=oidc."
    if os.getenv("CARDFIGHT_AUTH_MODE") != "oidc":
        raise ValueError(error)

    from backend.app import app

    # The process may have imported the local entry point before this module.
    if app.extensions["cardfight_auth"]["settings"].mode != "oidc":
        raise ValueError(error)
    return app


app = _load_application()
