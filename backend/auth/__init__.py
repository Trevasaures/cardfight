"""Opaque browser sessions and managed OIDC admission; no fake login endpoint."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import hmac
import json
import math
import secrets
import time
from urllib.parse import urlencode, unquote, urlsplit

from cryptography.fernet import Fernet, InvalidToken
from flask import Blueprint, current_app, g, jsonify, redirect, request
from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from backend.database import db
from backend.auth_models import (
    AppSession,
    AuthAccount,
    AuthAuditEvent,
    AuthInvitation,
    AuthThrottle,
    AuthTransaction,
    ExternalIdentity,
    new_id,
    utcnow,
)
from backend.auth.protocol import InvalidIdentity, OidcClient, ProviderUnavailable
from backend.auth.settings import AuthSettings, loopback

# #55 must replace this capability after scoped queries and ownership tests ship.
# It is deliberately not an environment/config switch.
OWNERSHIP_READY = False


class AuthError(Exception):
    def __init__(self, code, status=403):
        self.code, self.status = code, status


@dataclass(frozen=True)
class AccountContext:
    account_id: str
    role: str
    status: str
    authorization_version: int
    authenticated_at: datetime


def current_account():
    return getattr(g, "account_context", None)


def settings():
    return current_app.extensions["cardfight_auth"]["settings"]


def _digest(value):
    return sha256(value.encode("utf-8")).hexdigest()


def email_key(value):
    """Beta contact reservation: case-fold mailbox spelling, never expand aliases."""
    if (
        not isinstance(value, str)
        or not 3 <= len(value) <= 320
        or value != value.strip()
    ):
        raise AuthError("invalid_identity")
    if value.count("@") != 1 or any(
        character.isspace() or ord(character) < 32 for character in value
    ):
        raise AuthError("invalid_identity")
    local, domain = value.rsplit("@", 1)
    if not local or len(local) > 64 or not domain or local.startswith('"'):
        raise AuthError("invalid_identity")
    try:
        normalized = domain.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise AuthError("invalid_identity") from exc
    if any(
        not part or part.startswith("-") or part.endswith("-")
        for part in normalized.split(".")
    ):
        raise AuthError("invalid_identity")
    result = local.casefold() + "@" + normalized
    if len(result) > 320:
        raise AuthError("invalid_identity")
    return result


def safe_return_path(value):
    if not isinstance(value, str) or not value.startswith("/") or len(value) > 2048:
        return "/"
    decoded = value
    for _ in range(3):
        decoded = unquote(decoded)
    if (
        decoded.startswith("//")
        or "\\" in decoded
        or any(ord(c) < 32 for c in decoded)
        or urlsplit(decoded).scheme
        or urlsplit(decoded).netloc
    ):
        return "/"
    path = urlsplit(decoded).path
    if path.startswith(("/auth", "/api", "/join", "/sign-in")):
        return "/"
    # Current client routes are plain paths. Drop queries/fragments instead of
    # retaining invitation values, callbacks or arbitrary nested destinations.
    return path if path.startswith("/") else "/"


def _audit(category, outcome, account_id=None):
    db.session.add(
        AuthAuditEvent(category=category, outcome=outcome, account_id=account_id)
    )


def _audit_failure(category, code):
    if not settings().configured or not getattr(g, "auth_audit_allowed", False):
        return
    try:
        _audit(category, code[:32])
        db.session.commit()
    except SQLAlchemyError:
        # Authentication's original safe failure takes precedence over optional
        # audit persistence when its database dependency is unavailable.
        db.session.rollback()


def _rate_limit(scope, limit, seconds=60):
    g.auth_audit_allowed = False
    now = utcnow()
    bucket = int(time.time()) // seconds
    key = _digest(f"{scope}|{request.remote_addr}|{bucket}")
    row = db.session.get(AuthThrottle, key)
    if row is None:
        db.session.add(
            AuthThrottle(
                key_hash=key,
                attempts=1,
                expires_at=now + timedelta(seconds=seconds * 2),
            )
        )
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            db.session.execute(
                update(AuthThrottle)
                .where(AuthThrottle.key_hash == key)
                .values(attempts=AuthThrottle.attempts + 1)
            )
            db.session.commit()
    else:
        db.session.execute(
            update(AuthThrottle)
            .where(AuthThrottle.key_hash == key)
            .values(attempts=AuthThrottle.attempts + 1)
        )
        db.session.commit()
    attempts = db.session.get(AuthThrottle, key, populate_existing=True).attempts
    # Short-lived records have bounded retention without touching player data.
    db.session.execute(delete(AuthThrottle).where(AuthThrottle.expires_at < now))
    db.session.execute(
        delete(AuthTransaction).where(
            AuthTransaction.expires_at < now - timedelta(hours=1)
        )
    )
    db.session.execute(
        delete(AppSession).where(
            AppSession.absolute_expires_at < now - timedelta(days=1)
        )
    )
    db.session.commit()
    g.auth_audit_allowed = attempts <= limit + 1
    if attempts > limit:
        raise AuthError("rate_limited", 429)


def _lookup_session():
    if hasattr(g, "auth_session"):
        return g.auth_session
    g.auth_session = None
    g.auth_account = None
    raw = request.cookies.get(settings().cookie_name, "")
    if not raw or len(raw) > 128:
        return None
    record = db.session.get(AppSession, _digest(raw))
    now = utcnow()
    if (
        record is None
        or record.revoked_at is not None
        or record.restore_epoch != settings().epoch
        or record.idle_expires_at <= now
        or record.absolute_expires_at <= now
    ):
        g.auth_invalid = "session_expired"
        return None
    if record.account_id:
        account = db.session.get(AuthAccount, record.account_id)
        if (
            account is None
            or account.status != "admitted"
            or account.admission_epoch != settings().epoch
            or account.auth_version != record.account_auth_version
        ):
            g.auth_invalid = "account_unavailable"
            return None
        g.auth_account = account
        g.account_context = AccountContext(
            account.id,
            account.role,
            account.status,
            account.auth_version,
            record.authenticated_at,
        )
    g.auth_session = record
    return record


def _load_session():
    try:
        return _lookup_session()
    except SQLAlchemyError:
        db.session.rollback()
        raise AuthError("auth_storage_unavailable", 503)


def _new_session(account=None, *, method=None, claims=None, invitation_hash=None):
    now, raw = utcnow(), secrets.token_urlsafe(32)
    authenticated = account is not None
    absolute = now + timedelta(
        seconds=(
            settings().absolute_seconds
            if authenticated
            else settings().transaction_seconds
        )
    )
    idle = min(
        absolute,
        now
        + timedelta(
            seconds=(
                settings().idle_seconds
                if authenticated
                else settings().transaction_seconds
            )
        ),
    )
    provider_time = None
    mfa = False
    if claims:
        value = claims.get("auth_time")
        if (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        ):
            try:
                provider_time = datetime.fromtimestamp(value, timezone.utc).replace(
                    tzinfo=None
                )
            except (OverflowError, OSError, ValueError):
                raise AuthError("invalid_auth", 400)
        mfa = isinstance(claims.get("amr"), list) and "mfa" in claims["amr"]
    record = AppSession(
        token_hash=_digest(raw),
        account_id=account.id if account else None,
        csrf_secret=secrets.token_urlsafe(32),
        restore_epoch=settings().epoch,
        account_auth_version=account.auth_version if account else None,
        method=method,
        invitation_hash=invitation_hash,
        created_at=now,
        last_seen_at=now,
        idle_expires_at=idle,
        absolute_expires_at=absolute,
        authenticated_at=now if authenticated else None,
        provider_auth_time=provider_time,
        mfa_verified=mfa,
    )
    db.session.add(record)
    return record, raw


def _cookie(response, raw, record):
    response.set_cookie(
        settings().cookie_name,
        raw,
        secure=settings().secure,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


def _ensure_browser():
    session = _load_session()
    raw = None
    if session is None:
        _rate_limit("browser", 30)
        session, raw = _new_session()
        db.session.commit()
        g.auth_session = session
    return session, raw


def _csrf(session):
    origin = request.headers.get("Origin")
    if origin != settings().origin:
        raise AuthError("origin_denied", 403)
    token = request.headers.get("X-CSRF-Token")
    if token is None:
        token = request.form.get("csrf_token")
        if token is None and request.is_json:
            data = request.get_json(silent=True)
            token = data.get("csrf_token") if isinstance(data, dict) else None
    if (
        not isinstance(token, str)
        or len(token) > 128
        or not token.isascii()
        or not hmac.compare_digest(token, session.csrf_secret)
    ):
        raise AuthError("csrf_failed", 403)


def _session_payload(session=None):
    config = settings()
    account = getattr(g, "auth_account", None) if session else None
    authenticated = account is not None
    reason = "admission_hold" if config.admission_hold else "ownership_pending"
    return {
        "mode": "local" if config.mode == "local" else "oidc",
        "configured": config.configured if config.mode != "local" else True,
        "authenticated": authenticated,
        "csrf_token": session.csrf_secret if session else None,
        "methods": (
            ["google", "email"] if config.configured and config.mode != "local" else []
        ),
        "account": (
            {
                "id": account.id,
                "display_name": account.display_name,
                "sign_in_method": session.method,
                "role": account.role,
            }
            if authenticated
            else None
        ),
        "access": {
            "workspace": config.mode == "local",
            "reason": None if config.mode == "local" else reason,
        },
        "session": (
            {
                "idle_expires_at": session.idle_expires_at.isoformat() + "Z",
                "absolute_expires_at": session.absolute_expires_at.isoformat() + "Z",
            }
            if authenticated
            else None
        ),
        "generation": session.public_id if session else None,
    }


def _clean_error(code):
    response = redirect("/sign-in?" + urlencode({"auth_error": code}), code=302)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def _identity_claims(claims):
    if not isinstance(claims, dict) or claims.get("iss") != settings().issuer:
        raise AuthError("invalid_auth", 400)
    subject = claims.get("sub")
    if (
        not isinstance(subject, str)
        or not 1 <= len(subject) <= 255
        or not subject.isascii()
    ):
        raise AuthError("invalid_auth", 400)
    if claims.get("email_verified") is not True:
        raise AuthError("invitation_required")
    key = email_key(claims.get("email"))
    return subject, key


def _resolve_account(claims, method, invitation_hash):
    subject, key = _identity_claims(claims)
    if settings().admission_hold:
        raise AuthError("admission_hold")
    identity = ExternalIdentity.query.filter_by(
        issuer=settings().issuer, subject=subject
    ).one_or_none()
    contact = AuthAccount.query.filter_by(contact_email_key=key).one_or_none()
    if identity:
        account = db.session.get(
            AuthAccount, identity.account_id, populate_existing=True
        )
        if (
            account is None
            or account.status != "admitted"
            or account.admission_epoch != settings().epoch
        ):
            raise AuthError("account_unavailable")
        if identity.method != method or (
            contact is not None and contact.id != account.id
        ):
            raise AuthError("method_conflict", 409)
        account.contact_email, account.contact_email_key = claims["email"], key
        return account
    if contact:
        raise AuthError("method_conflict", 409)
    if not invitation_hash:
        raise AuthError("invitation_required")
    invitation = AuthInvitation.query.filter_by(
        token_hash=invitation_hash
    ).one_or_none()
    now = utcnow()
    if (
        invitation is None
        or invitation.recipient_email_key != key
        or invitation.restore_epoch != settings().epoch
        or invitation.expires_at <= now
        or invitation.revoked_at is not None
        or invitation.consumed_at is not None
    ):
        raise AuthError("invitation_required")
    name = claims.get("name")
    name = name.strip()[:160] if isinstance(name, str) else "Cardfighter"
    name = (
        "".join(character for character in name if ord(character) >= 32)
        or "Cardfighter"
    )
    account = AuthAccount(
        id=new_id(),
        display_name=name,
        contact_email=claims["email"],
        contact_email_key=key,
        admission_epoch=settings().epoch,
    )
    db.session.add(account)
    db.session.flush()
    consumed = db.session.execute(
        update(AuthInvitation)
        .where(
            AuthInvitation.id == invitation.id,
            AuthInvitation.consumed_at.is_(None),
            AuthInvitation.revoked_at.is_(None),
            AuthInvitation.expires_at > now,
            AuthInvitation.restore_epoch == settings().epoch,
        )
        .values(consumed_at=now, account_id=account.id)
    ).rowcount
    if consumed != 1:
        raise AuthError("invitation_required")
    db.session.add(
        ExternalIdentity(
            account_id=account.id,
            issuer=settings().issuer,
            subject=subject,
            method=method,
        )
    )
    return account


def init_auth(app):
    """Register validated identity routes and deny unowned hosted APIs by default."""
    config = AuthSettings.from_app(app)
    app.extensions["cardfight_auth"] = {
        "settings": config,
        "protocol": app.config.get("AUTH_PROTOCOL_CLIENT")
        or (OidcClient(config) if config.configured else None),
    }
    blueprint = Blueprint("auth", __name__)

    @app.errorhandler(AuthError)
    def auth_error(error):
        db.session.rollback()
        response = jsonify(
            error="Authentication or access could not be completed.", code=error.code
        )
        response.status_code = error.status
        if error.status == 429:
            response.headers["Retry-After"] = "60"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.before_request
    def protect_request():
        # A request may reuse an explicit app context in tests/embedded callers;
        # identity memoization must still never cross browser/request boundaries.
        for key in ("auth_session", "auth_account", "auth_invalid", "account_context"):
            g.pop(key, None)
        if request.path in {"/health", "/api/health"}:
            return None
        try:
            host = urlsplit("//" + request.host).hostname
        except ValueError:
            raise AuthError("origin_denied", 403)
        if config.mode in {"local", "oidc-dev"}:
            if not loopback(request.remote_addr) or not loopback(host):
                raise AuthError("local_only", 403)
        elif request.host.lower() != urlsplit(config.origin).netloc.lower():
            raise AuthError("origin_denied", 403)
        if config.mode == "local":
            # A page can send a simple POST to loopback even when CORS would
            # block it from reading the response. Keep originless local tools.
            if request.path.startswith("/api/") and request.method not in {
                "GET",
                "HEAD",
                "OPTIONS",
            }:
                origin = request.headers.get("Origin")
                if (
                    origin is not None
                    and origin != request.host_url.rstrip("/")
                    and origin not in app.config["CORS_ORIGINS"]
                ):
                    raise AuthError("origin_denied", 403)
            return None
        if request.path.startswith("/api/") and not request.path.startswith(
            "/api/auth/"
        ):
            session = _load_session()
            if session is None or not session.account_id:
                code = getattr(g, "auth_invalid", "auth_required")
                raise AuthError(code, 401)
            if config.admission_hold:
                raise AuthError("admission_hold")
            # No role, environment toggle, header or client owner ID bypasses #55.
            if not OWNERSHIP_READY:
                raise AuthError("ownership_pending")
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                _csrf(session)

    @app.after_request
    def private_caching(response):
        if config.mode != "local" and request.path.startswith(
            ("/api", "/auth", "/join")
        ):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        if request.path.startswith(("/auth", "/join")):
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @blueprint.get("/api/auth/session")
    def session_status():
        if config.mode == "local" or not config.configured:
            return jsonify(_session_payload())
        try:
            session, raw = _ensure_browser()
            response = jsonify(_session_payload(session))
            return _cookie(response, raw, session) if raw else response
        except SQLAlchemyError:
            db.session.rollback()
            raise AuthError("auth_storage_unavailable", 503)

    @blueprint.get("/join")
    def invitation_landing():
        if config.mode == "local" or not config.configured:
            return _clean_error("provider_unavailable")
        try:
            _rate_limit("invitation", 30)
            session, raw = _ensure_browser()
            token = request.args.get("invitation", "")
            if not 20 <= len(token) <= 128:
                return _clean_error("invitation_required")
            session.invitation_hash = _digest(token)
            db.session.commit()
            response = redirect("/sign-in", code=302)
            return _cookie(response, raw, session) if raw else response
        except SQLAlchemyError:
            db.session.rollback()
            return _clean_error("provider_unavailable")

    @blueprint.post("/auth/start")
    def start():
        try:
            if config.mode == "local" or not config.configured:
                raise AuthError("provider_unavailable", 503)
            _rate_limit("login", 20)
            session = _load_session()
            if session is None:
                raise AuthError("auth_required", 401)
            _csrf(session)
            method = request.form.get("method")
            if method not in {"google", "email"}:
                raise AuthError("invalid_auth", 400)
            state, nonce, verifier = (
                secrets.token_urlsafe(32),
                secrets.token_urlsafe(32),
                secrets.token_urlsafe(48),
            )
            payload = {
                "nonce": nonce,
                "code_verifier": verifier,
                "method": method,
                "return_to": safe_return_path(request.form.get("return_to", "/")),
                "invitation_hash": session.invitation_hash,
            }
            encrypted = (
                Fernet(config.transaction_key.encode())
                .encrypt(json.dumps(payload).encode())
                .decode()
            )
            db.session.add(
                AuthTransaction(
                    state_hash=_digest(state),
                    session_hash=session.token_hash,
                    encrypted_payload=encrypted,
                    expires_at=utcnow() + timedelta(seconds=config.transaction_seconds),
                )
            )
            db.session.commit()
            url = app.extensions["cardfight_auth"]["protocol"].authorization_url(
                method=method,
                state=state,
                nonce=nonce,
                code_verifier=verifier,
                redirect_uri=config.callback_uri,
            )
            return redirect(url, code=302)
        except AuthError as exc:
            db.session.rollback()
            _audit_failure("login_start_denied", exc.code)
            if exc.code in {"origin_denied", "csrf_failed"}:
                return auth_error(exc)
            return _clean_error(exc.code)
        except (ProviderUnavailable, SQLAlchemyError):
            db.session.rollback()
            _audit_failure("login_start_failed", "provider_unavailable")
            return _clean_error("provider_unavailable")
        except (InvalidIdentity, InvalidToken, ValueError):
            db.session.rollback()
            _audit_failure("login_start_failed", "invalid_auth")
            return _clean_error("invalid_auth")

    @blueprint.get("/auth/callback")
    def callback():
        try:
            if not config.configured or config.mode == "local":
                raise AuthError("invalid_auth", 400)
            _rate_limit("callback", 60)
            session = _load_session()
            state, code = request.args.get("state", ""), request.args.get("code", "")
            if (
                session is None
                or not state
                or len(state) > 128
                or not code
                or len(code) > 4096
                or request.args.get("error")
            ):
                raise AuthError("invalid_auth", 400)
            transaction = db.session.get(AuthTransaction, _digest(state))
            now = utcnow()
            if (
                transaction is None
                or transaction.session_hash != session.token_hash
                or transaction.consumed_at is not None
                or transaction.expires_at <= now
            ):
                raise AuthError("invalid_auth", 400)
            payload = json.loads(
                Fernet(config.transaction_key.encode()).decrypt(
                    transaction.encrypted_payload.encode()
                )
            )
            consumed = db.session.execute(
                update(AuthTransaction)
                .where(
                    AuthTransaction.state_hash == transaction.state_hash,
                    AuthTransaction.session_hash == session.token_hash,
                    AuthTransaction.consumed_at.is_(None),
                    AuthTransaction.expires_at > now,
                )
                .values(consumed_at=now)
            ).rowcount
            if consumed != 1:
                raise AuthError("invalid_auth", 400)
            db.session.commit()
            claims = app.extensions["cardfight_auth"]["protocol"].exchange_code(
                code=code,
                nonce=payload["nonce"],
                code_verifier=payload["code_verifier"],
                redirect_uri=config.callback_uri,
            )
            # Network exchange may outlive a logout, revocation or expiry. This
            # compare-and-set both revalidates browser binding and takes the
            # SQLite writer lock before account/invitation/session mutations.
            completed_at = utcnow()
            bound = db.session.get(
                AppSession, transaction.session_hash, populate_existing=True
            )
            if bound is None:
                raise AuthError("invalid_auth", 400)
            revoked = db.session.execute(
                update(AppSession)
                .where(
                    AppSession.token_hash == transaction.session_hash,
                    AppSession.revoked_at.is_(None),
                    AppSession.restore_epoch == config.epoch,
                    AppSession.idle_expires_at > completed_at,
                    AppSession.absolute_expires_at > completed_at,
                )
                .values(revoked_at=completed_at)
            ).rowcount
            if revoked != 1:
                raise AuthError("invalid_auth", 400)
            if bound.account_id:
                previous_account = db.session.get(
                    AuthAccount, bound.account_id, populate_existing=True
                )
                if (
                    previous_account is None
                    or previous_account.status != "admitted"
                    or previous_account.admission_epoch != config.epoch
                    or previous_account.auth_version != bound.account_auth_version
                ):
                    raise AuthError("account_unavailable")
            account = _resolve_account(
                claims, payload["method"], payload.get("invitation_hash")
            )
            authenticated, raw = _new_session(
                account, method=payload["method"], claims=claims
            )
            _audit("login", "accepted", account.id)
            db.session.commit()
            return _cookie(redirect(payload["return_to"], code=302), raw, authenticated)
        except AuthError as exc:
            db.session.rollback()
            _audit_failure("login_denied", exc.code)
            return _clean_error(exc.code)
        except IntegrityError:
            db.session.rollback()
            _audit_failure("login_denied", "method_conflict")
            return _clean_error("method_conflict")
        except (ProviderUnavailable, SQLAlchemyError):
            db.session.rollback()
            _audit_failure("login_failed", "provider_unavailable")
            return _clean_error("provider_unavailable")
        except (InvalidIdentity, InvalidToken, ValueError, KeyError, TypeError):
            db.session.rollback()
            _audit_failure("login_failed", "invalid_auth")
            return _clean_error("invalid_auth")

    @blueprint.post("/api/auth/logout")
    def logout():
        if config.mode == "local":
            return jsonify(_session_payload())
        try:
            session = _load_session()
            if session is not None:
                _csrf(session)
                session.revoked_at = utcnow()
                _audit("logout", "accepted", session.account_id)
                db.session.commit()
            elif request.headers.get("Origin") != config.origin:
                raise AuthError("origin_denied")
            g.auth_account, g.auth_session = None, None
            response = jsonify(_session_payload())
            response.delete_cookie(
                config.cookie_name,
                path="/",
                secure=config.secure,
                httponly=True,
                samesite="Lax",
            )
            return response
        except SQLAlchemyError:
            db.session.rollback()
            raise AuthError("auth_storage_unavailable", 503)

    app.register_blueprint(blueprint)
    return app
