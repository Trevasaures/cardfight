"""The API boundary exposes intentional domain errors, never exception internals.

Services raise these types only for messages written for the caller. Ordinary
ValueError, database errors, and provider exceptions remain unexpected failures.
"""

from flask import current_app, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.database import db


class PublicError(Exception):
    """An expected failure with an explicitly safe API message and status."""

    status_code = 400

    def __init__(self, message: str, *, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(PublicError, ValueError):
    """Input failed a domain rule; its message tells the caller how to fix it."""


class NotFoundError(PublicError, LookupError):
    status_code = 404


class ConflictError(PublicError, ValueError):
    status_code = 409


def json_object(*, force: bool = False) -> dict:
    """Read a mutation payload without letting a JSON array reach dict helpers."""
    payload = request.get_json(force=force, silent=True)
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")
    return payload


def log_api_exception(message: str, error: Exception) -> None:
    if current_app.config["AUTH_MODE"] == "local":
        current_app.logger.exception(message)
        return

    # Driver and provider exception text can contain credentials or records,
    # even when SQLAlchemy hides bound parameters. Route rules omit path values.
    route = request.url_rule.rule if request.url_rule else "unmatched route"
    current_app.logger.error(
        "%s for %s %s (%s)", message, request.method, route, type(error).__name__
    )


def rollback_session() -> None:
    """Release a failed transaction without replacing the original API error."""
    try:
        db.session.rollback()
    except Exception as error:
        log_api_exception("Could not roll back the API transaction", error)
        db.session.remove()


def error_response(message: str, status_code: int, **details):
    """Return a fixed public message and discard any partial request changes."""
    rollback_session()
    return jsonify({**details, "error": message}), status_code


def register_api_errors(app) -> None:
    """Install one boundary for validation, transaction cleanup, and safe failures."""

    @app.errorhandler(PublicError)
    def domain_error(error):
        return error_response(error.message, error.status_code, **error.details)

    @app.errorhandler(Exception)
    def unexpected_error(error):
        if isinstance(error, HTTPException):
            # HTTP descriptions can include parser or framework internals. Keep
            # the useful status/headers (such as Allow for a 405), but use the
            # standard public name instead of copying its description.
            rollback_session()
            response = error.get_response()
            response.set_data(jsonify(error=error.name.lower()).get_data())
            response.content_type = "application/json"
            return response

        log_api_exception("Unexpected API failure", error)
        return error_response("internal server error", 500)
