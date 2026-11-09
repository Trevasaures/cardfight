"""Identity boundaries use disposable databases and a validated-provider seam."""

from base64 import urlsafe_b64encode
from copy import deepcopy
from datetime import timedelta
from hashlib import sha256
from http.cookies import SimpleCookie
import importlib
import json
import runpy
from time import time
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import UUID

import pytest
from sqlalchemy import event, update
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.app import create_app
from backend.auth_models import (
    AppSession,
    AuthAccount,
    AuthAuditEvent,
    AuthInvitation,
    AuthTransaction,
    ExternalIdentity,
    utcnow,
)
from backend.database import db
from backend.models import Deck

ORIGIN = "http://localhost"
ISSUER = "https://identity.example/"
TRANSACTION_KEY = urlsafe_b64encode(b"\x17" * 32).decode()


class ValidatedProvider:
    """Replace only the provider adapter, never application admission or sessions."""

    def __init__(self):
        self.authorizations = []
        self.exchanges = []
        self.failure = None
        self.on_exchange = None
        self.claims = {
            "iss": ISSUER,
            "sub": "google-oauth2|player-one",
            "email": "player@example.com",
            "email_verified": True,
            "name": "Player One",
            "auth_time": int(time()),
            "amr": ["pwd"],
        }

    def authorization_url(self, **values):
        self.authorizations.append(values)
        return "https://identity.example/authorize?" + urlencode(
            {"state": values["state"]}
        )

    def exchange_code(self, **values):
        self.exchanges.append(values)
        if self.failure:
            raise self.failure
        if self.on_exchange:
            self.on_exchange()
        claims = deepcopy(self.claims)
        claims["nonce"] = values["nonce"]
        return claims


def auth_configuration(**overrides):
    return {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "AUTH_MODE": "oidc-dev",
        "AUTH_PUBLIC_ORIGIN": ORIGIN,
        "AUTH_ISSUER": ISSUER,
        "AUTH_CLIENT_ID": "test-client",
        "AUTH_CLIENT_SECRET": "test-client-secret",
        "AUTH_TRANSACTION_KEY": TRANSACTION_KEY,
        "AUTH_RESTORE_EPOCH": "disposable-test-generation",
        "AUTH_ADMISSION_HOLD": False,
        **overrides,
    }


@pytest.fixture()
def auth_setup(request):
    protocol = ValidatedProvider()
    overrides = getattr(request, "param", {})
    application = create_app(
        auth_configuration(AUTH_PROTOCOL_CLIENT=protocol, **overrides)
    )

    with application.app_context():
        db.create_all()
        yield application, application.test_client(), protocol
        db.session.remove()
        db.drop_all()
        db.engine.dispose()


def session_state(client):
    response = client.get(
        "/api/auth/session", base_url=client.application.config["AUTH_PUBLIC_ORIGIN"]
    )
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    return response.get_json()


def start_login(client, *, method="google", return_to="/", csrf_token=None):
    if csrf_token is None:
        csrf_token = session_state(client)["csrf_token"]
    return client.post(
        "/auth/start",
        base_url=client.application.config["AUTH_PUBLIC_ORIGIN"],
        headers={"Origin": client.application.config["AUTH_PUBLIC_ORIGIN"]},
        data={"csrf_token": csrf_token, "method": method, "return_to": return_to},
    )


def finish_login(client, state, *, code="validated-code"):
    return client.get(
        "/auth/callback",
        base_url=client.application.config["AUTH_PUBLIC_ORIGIN"],
        query_string={"state": state, "code": code},
    )


def make_account(protocol, **overrides):
    account = AuthAccount(
        display_name="Existing player",
        contact_email=protocol.claims["email"],
        contact_email_key=protocol.claims["email"].casefold(),
        admission_epoch="disposable-test-generation",
        **overrides,
    )
    db.session.add(account)
    db.session.flush()
    db.session.add(
        ExternalIdentity(
            account_id=account.id,
            issuer=protocol.claims["iss"],
            subject=protocol.claims["sub"],
            method="google",
        )
    )
    db.session.commit()
    return account


def make_invitation(email="player@example.com", **overrides):
    token = "test-invitation-with-at-least-thirty-two-random-looking-bytes"
    values = {
        "token_hash": sha256(token.encode()).hexdigest(),
        "recipient_email": email,
        "recipient_email_key": email.casefold(),
        "restore_epoch": "disposable-test-generation",
        "expires_at": utcnow() + timedelta(hours=1),
        **overrides,
    }
    invitation = AuthInvitation(**values)
    db.session.add(invitation)
    db.session.commit()
    return token, invitation


def sign_in_existing(auth_setup, **account_values):
    _application, client, protocol = auth_setup
    account = make_account(protocol, **account_values)
    response = start_login(client)
    assert response.status_code == 302
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    callback = finish_login(client, state)
    assert callback.status_code in {302, 303}
    current = session_state(client)
    assert current["authenticated"] is True
    assert current["account"]["id"] == account.id
    return account, current, callback


def cookie_from(response):
    cookies = SimpleCookie()
    for value in response.headers.getlist("Set-Cookie"):
        cookies.load(value)
    assert cookies
    return next(iter(cookies.values()))


@pytest.mark.parametrize("mode", ["", "off", "disabled", "unexpected"])
def test_access_mode_misspellings_do_not_fall_back_to_local(mode):
    with pytest.raises(ValueError):
        create_app(auth_configuration(AUTH_MODE=mode))


@pytest.mark.parametrize(
    "missing",
    [
        "AUTH_ISSUER",
        "AUTH_CLIENT_ID",
        "AUTH_CLIENT_SECRET",
        "AUTH_TRANSACTION_KEY",
        "AUTH_RESTORE_EPOCH",
    ],
)
def test_hosted_configuration_missing_required_values_fails_closed(missing):
    with pytest.raises(ValueError):
        create_app(
            auth_configuration(
                AUTH_MODE="oidc",
                AUTH_PUBLIC_ORIGIN="https://cardfight.example",
                **{missing: ""},
            )
        )


@pytest.mark.parametrize(
    "origin",
    [
        "http://cardfight.example",
        "https://user:password@cardfight.example",
        "https://cardfight.example/path",
        "https://cardfight.example?redirect=https://elsewhere.example",
    ],
)
def test_hosted_configuration_requires_canonical_https_origin(origin):
    with pytest.raises(ValueError):
        create_app(auth_configuration(AUTH_MODE="oidc", AUTH_PUBLIC_ORIGIN=origin))


@pytest.fixture()
def isolated_hosted_settings(monkeypatch, tmp_path):
    for module_name in ("backend.app", "backend.config"):
        monkeypatch.setattr(
            importlib.import_module(module_name), "PROJECT_ROOT", tmp_path
        )


@pytest.fixture()
def configured_hosted_app(isolated_hosted_settings, monkeypatch):
    application = create_app(
        auth_configuration(
            AUTH_MODE="oidc",
            AUTH_PUBLIC_ORIGIN="https://cardfight.example",
            AUTH_PROTOCOL_CLIENT=ValidatedProvider(),
        )
    )
    monkeypatch.setattr(importlib.import_module("backend.app"), "app", application)
    yield application
    with application.app_context():
        db.engine.dispose()


@pytest.mark.parametrize("mode", [None, "local", "oidc-dev"])
def test_hosted_entrypoint_requires_explicit_oidc_mode(
    configured_hosted_app, monkeypatch, mode
):
    # A configured cached app must not make missing or local environment modes
    # acceptable for the public WSGI entry point.
    if mode is None:
        monkeypatch.delenv("CARDFIGHT_AUTH_MODE", raising=False)
    else:
        monkeypatch.setenv("CARDFIGHT_AUTH_MODE", mode)
    with pytest.raises(
        ValueError, match="Hosted startup requires CARDFIGHT_AUTH_MODE=oidc"
    ):
        runpy.run_module("backend.hosted")


def test_hosted_entrypoint_rejects_an_already_imported_local_app(
    isolated_hosted_settings, monkeypatch
):
    monkeypatch.setenv("CARDFIGHT_AUTH_MODE", "oidc")
    with pytest.raises(
        ValueError, match="Hosted startup requires CARDFIGHT_AUTH_MODE=oidc"
    ):
        runpy.run_module("backend.hosted")


def test_hosted_entrypoint_enforces_public_host(configured_hosted_app, monkeypatch):
    monkeypatch.setenv("CARDFIGHT_AUTH_MODE", "oidc")
    application = runpy.run_module("backend.hosted")["app"]
    client = application.test_client()
    public_origin = configured_hosted_app.config["AUTH_PUBLIC_ORIGIN"]

    correct_host = client.get("/api/decks", base_url=public_origin)
    assert correct_host.status_code == 401
    assert correct_host.get_json()["code"] == "auth_required"

    for host in ("localhost", "untrusted.example"):
        wrong_host = client.get(
            "/api/decks",
            base_url=f"https://{host}",
            headers={"X-Forwarded-Host": "cardfight.example"},
        )
        assert wrong_host.status_code == 403
        assert wrong_host.get_json()["code"] == "origin_denied"


@pytest.mark.parametrize(
    "origin", ["http://0.0.0.0", "http://192.0.2.10", "https://cardfight.example"]
)
def test_development_identity_mode_requires_loopback_origin(origin):
    with pytest.raises(ValueError):
        create_app(auth_configuration(AUTH_PUBLIC_ORIGIN=origin))


@pytest.mark.parametrize("auth_setup", [{"AUTH_MODE": "local"}], indirect=True)
@pytest.mark.parametrize(
    "remote,headers",
    [
        ("198.51.100.12", {"Host": "localhost"}),
        ("127.0.0.1", {"Host": "attacker.example"}),
        ("198.51.100.12", {"Host": "localhost", "X-Forwarded-For": "127.0.0.1"}),
    ],
)
def test_local_mode_rejects_remote_clients_and_untrusted_hosts(
    auth_setup, remote, headers
):
    _application, client, _protocol = auth_setup
    response = client.get(
        "/api/decks",
        base_url=ORIGIN,
        headers=headers,
        environ_overrides={"REMOTE_ADDR": remote},
    )
    assert response.status_code == 403
    assert response.is_json
    assert "Location" not in response.headers


@pytest.mark.parametrize("auth_setup", [{"AUTH_MODE": "local"}], indirect=True)
@pytest.mark.parametrize(
    "method,origin",
    [
        ("POST", "https://untrusted.example"),
        ("PATCH", "https://untrusted.example"),
        ("DELETE", "https://untrusted.example"),
        ("POST", "null"),
    ],
)
def test_local_writes_reject_untrusted_origins_without_changing_data(
    auth_setup, method, origin
):
    _application, client, _protocol = auth_setup
    deck = Deck(name="Saved local deck", type="Standard")
    db.session.add(deck)
    db.session.commit()
    path = "/api/decks" if method == "POST" else f"/api/decks/{deck.id}"

    response = client.open(
        path,
        method=method,
        base_url="http://127.0.0.1:5000",
        headers={"Origin": origin},
        # Browsers can send a simple text/plain POST before CORS is consulted.
        content_type="text/plain",
        data=json.dumps({"name": "Untrusted change", "type": "Stride"}),
    )

    assert response.status_code == 403
    assert response.get_json()["code"] == "origin_denied"
    saved = Deck.query.one()
    assert (saved.id, saved.name, saved.type) == (
        deck.id,
        "Saved local deck",
        "Standard",
    )


@pytest.mark.parametrize(
    "auth_setup",
    [{"AUTH_MODE": "local", "CORS_ORIGINS": ["http://localhost:4173"]}],
    indirect=True,
)
@pytest.mark.parametrize(
    "base_url,origin",
    [
        ("http://127.0.0.1:5000", None),
        ("http://127.0.0.1:5173", "http://127.0.0.1:5173"),
        ("http://127.0.0.1:5000", "http://localhost:4173"),
    ],
    ids=["originless-cli", "vite-preserved-host", "configured-loopback-origin"],
)
def test_local_writes_allow_trusted_clients(auth_setup, base_url, origin):
    _application, client, _protocol = auth_setup
    headers = {} if origin is None else {"Origin": origin}
    response = client.post(
        "/api/decks",
        base_url=base_url,
        headers=headers,
        json={"name": "Trusted local deck", "type": "Standard"},
    )
    assert response.status_code == 201
    assert Deck.query.one().name == "Trusted local deck"


def test_anonymous_bootstrap_exposes_no_workspace_records_or_bearer_tokens(auth_setup):
    _application, client, protocol = auth_setup
    db.session.add(Deck(name="Private legacy deck", type="Standard"))
    db.session.commit()

    state = session_state(client)
    assert state["authenticated"] is False
    assert state["configured"] is True
    assert state["account"] is None
    assert state["access"]["workspace"] is False
    assert state["csrf_token"]
    assert set(state["methods"]) == {"google", "email"}
    assert "Private legacy deck" not in str(state)
    assert (
        not {"access_token", "id_token", "refresh_token", "session_token"}
        & state.keys()
    )
    assert not protocol.exchanges


@pytest.mark.parametrize(
    "path",
    [
        "/api/decks",
        "/api/dashboard",
        "/api/matches",
        "/api/stats/table",
        "/api/cards/library",
        "/api/acquisition-plans",
        "/api/card-images/private-art/full",
    ],
)
def test_hosted_anonymous_api_requests_are_json_denials(auth_setup, path):
    _application, client, _protocol = auth_setup
    response = client.get(path, base_url=ORIGIN)
    assert response.status_code == 401
    assert response.is_json
    assert response.get_json()["error"]
    assert response.headers["Cache-Control"] == "no-store"
    assert "Location" not in response.headers


@pytest.mark.parametrize(
    "origin", [None, "https://unrelated.example", ORIGIN + ".evil"]
)
def test_login_initiation_requires_exact_trusted_origin(auth_setup, origin):
    _application, client, protocol = auth_setup
    csrf = session_state(client)["csrf_token"]
    headers = {} if origin is None else {"Origin": origin}
    response = client.post(
        "/auth/start",
        base_url=ORIGIN,
        headers=headers,
        data={"method": "google", "csrf_token": csrf},
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "origin_denied"
    assert not protocol.authorizations
    assert AuthTransaction.query.count() == 0


@pytest.mark.parametrize(
    "csrf", [None, "", "unrelated-browser-token", "non-ascii-\u00e9"]
)
def test_login_initiation_requires_browser_bound_csrf(auth_setup, csrf):
    _application, client, protocol = auth_setup
    session_state(client)
    response = client.post(
        "/auth/start",
        base_url=ORIGIN,
        headers={"Origin": ORIGIN},
        data={"method": "google", "csrf_token": csrf or ""},
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "csrf_failed"
    assert not protocol.authorizations
    assert AuthTransaction.query.count() == 0


def test_login_transactions_are_distinct_between_tabs(auth_setup):
    _application, client, protocol = auth_setup
    first = start_login(client)
    second = start_login(client, method="email")
    assert first.status_code == second.status_code == 302
    first_state = parse_qs(urlsplit(first.location).query)["state"][0]
    second_state = parse_qs(urlsplit(second.location).query)["state"][0]
    assert first_state != second_state
    assert protocol.authorizations[0]["nonce"] != protocol.authorizations[1]["nonce"]
    assert (
        protocol.authorizations[0]["code_verifier"]
        != protocol.authorizations[1]["code_verifier"]
    )


def test_callback_cannot_exchange_an_unknown_state(auth_setup):
    _application, client, protocol = auth_setup
    session_state(client)
    response = finish_login(client, "not-a-server-transaction")
    assert response.status_code in {400, 302, 303}
    assert not protocol.exchanges
    assert session_state(client)["authenticated"] is False


def test_callback_from_another_browser_cannot_exchange_code(auth_setup):
    application, client, protocol = auth_setup
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    other_browser = application.test_client()
    result = finish_login(other_browser, state)
    assert result.status_code in {400, 302, 303}
    assert not protocol.exchanges
    assert session_state(other_browser)["authenticated"] is False


def test_exact_identity_reuses_stable_account_after_contact_email_change(auth_setup):
    _application, client, protocol = auth_setup
    account = make_account(protocol)
    account_id = account.id
    protocol.claims["email"] = "updated-contact@example.com"
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    current = session_state(client)
    assert current["authenticated"] is True
    assert current["account"]["id"] == account_id
    assert AuthAccount.query.count() == 1
    assert ExternalIdentity.query.count() == 1
    assert str(UUID(account_id)) == account_id


def test_external_identity_pair_is_unique_at_database_boundary(auth_setup):
    _application, _client, protocol = auth_setup
    first = make_account(protocol)
    second = AuthAccount(
        display_name="Second account", admission_epoch=first.admission_epoch
    )
    db.session.add(second)
    db.session.flush()
    db.session.add(
        ExternalIdentity(
            account_id=second.id,
            issuer=protocol.claims["iss"],
            subject=protocol.claims["sub"],
            method="email",
        )
    )
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()
    assert ExternalIdentity.query.one().account_id == first.id


@pytest.mark.parametrize("email", ["player@example.com", "PLAYER@EXAMPLE.COM"])
def test_same_email_different_subject_does_not_link_or_consume_invitation(
    auth_setup, email
):
    _application, client, protocol = auth_setup
    original = make_account(protocol)
    original_id = original.id
    protocol.claims["sub"] = "email|different-provider-identity"
    protocol.claims["email"] = email
    token, invitation = make_invitation()
    join = client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    assert join.status_code in {302, 303}
    assert token not in join.location
    response = start_login(client, method="email")
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    assert session_state(client)["authenticated"] is False
    assert AuthAccount.query.count() == 1
    assert ExternalIdentity.query.one().account_id == original_id
    db.session.refresh(invitation)
    assert invitation.consumed_at is None
    assert invitation.account_id is None


def test_join_get_only_captures_context_then_explicit_callback_accepts_once(auth_setup):
    application, client, protocol = auth_setup
    token, invitation = make_invitation()
    response = client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    assert response.status_code in {302, 303}
    assert token not in response.location
    assert invitation.consumed_at is None
    assert AuthAccount.query.count() == 0

    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    current = session_state(client)
    assert current["authenticated"] is True
    assert current["account"]["role"] == "member"
    assert current["access"]["workspace"] is False
    assert current["access"]["reason"] == "ownership_pending"
    db.session.refresh(invitation)
    assert invitation.consumed_at is not None
    assert invitation.account_id == current["account"]["id"]
    assert AuthAccount.query.count() == 1
    assert ExternalIdentity.query.count() == 1

    other = application.test_client()
    protocol.claims["sub"] = "google-oauth2|second-player"
    other.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    response = start_login(other)
    next_state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(other, next_state)
    assert session_state(other)["authenticated"] is False
    assert AuthAccount.query.count() == 1
    assert ExternalIdentity.query.count() == 1


@pytest.mark.parametrize(
    "invalidity", ["expired", "revoked", "epoch", "recipient", "unverified"]
)
def test_invalid_invitation_never_creates_membership(auth_setup, invalidity):
    _application, client, protocol = auth_setup
    changes = {}
    if invalidity == "expired":
        changes["expires_at"] = utcnow() - timedelta(seconds=1)
    elif invalidity == "revoked":
        changes["revoked_at"] = utcnow()
    elif invalidity == "epoch":
        changes["restore_epoch"] = "previous-generation"
    elif invalidity == "recipient":
        protocol.claims["email"] = "someone-else@example.com"
    else:
        protocol.claims["email_verified"] = False
    token, invitation = make_invitation(**changes)
    client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    assert session_state(client)["authenticated"] is False
    assert AuthAccount.query.count() == 0
    assert ExternalIdentity.query.count() == 0
    db.session.refresh(invitation)
    assert invitation.consumed_at is None


def test_callback_replay_does_not_exchange_or_rotate_again(auth_setup):
    _application, client, protocol = auth_setup
    make_account(protocol)
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    before = session_state(client)
    assert before["authenticated"]
    assert len(protocol.exchanges) == 1
    finish_login(client, state)
    after = session_state(client)
    assert len(protocol.exchanges) == 1
    assert after["generation"] == before["generation"]


def test_expired_login_transaction_is_rejected_before_exchange(auth_setup):
    _application, client, protocol = auth_setup
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    transaction = AuthTransaction.query.one()
    transaction.expires_at = utcnow() - timedelta(seconds=1)
    db.session.commit()
    finish_login(client, state)
    assert not protocol.exchanges
    assert session_state(client)["authenticated"] is False


@pytest.mark.parametrize("expiry", ["idle_expires_at", "absolute_expires_at"])
def test_session_expiry_removes_authentication(auth_setup, expiry):
    _application, client, _protocol = auth_setup
    sign_in_existing(auth_setup)
    stored = AppSession.query.filter(AppSession.account_id.is_not(None)).one()
    setattr(stored, expiry, utcnow() - timedelta(seconds=1))
    db.session.commit()
    assert session_state(client)["authenticated"] is False
    response = client.get("/api/decks", base_url=ORIGIN)
    assert response.status_code == 401


@pytest.mark.parametrize(
    "change",
    ["suspension", "authorization_version", "admission_epoch", "restore_epoch"],
)
def test_server_side_access_changes_invalidate_existing_session(auth_setup, change):
    _application, client, _protocol = auth_setup
    account, _state, _callback = sign_in_existing(auth_setup)
    if change == "suspension":
        account.status = "suspended"
    elif change == "authorization_version":
        account.auth_version += 1
    elif change == "admission_epoch":
        account.admission_epoch = "old-admission-generation"
    else:
        stored = AppSession.query.filter(AppSession.account_id.is_not(None)).one()
        stored.restore_epoch = "previous-checkpoint-generation"
    db.session.commit()
    assert session_state(client)["authenticated"] is False


def test_current_role_is_read_from_account_not_cached_browser_claim(auth_setup):
    _application, client, _protocol = auth_setup
    account, current, _callback = sign_in_existing(auth_setup)
    assert current["account"]["role"] == "member"
    account.role = "admin"
    db.session.commit()
    assert session_state(client)["account"]["role"] == "admin"


def test_logout_revokes_session_and_copied_cookie_cannot_restore_it(auth_setup):
    application, client, _protocol = auth_setup
    _account, current, callback = sign_in_existing(auth_setup)
    original_cookie = cookie_from(callback)
    copied = application.test_client()
    copied.set_cookie(original_cookie.key, original_cookie.value, domain="localhost")
    assert session_state(copied)["authenticated"] is True

    response = client.post(
        "/api/auth/logout",
        base_url=ORIGIN,
        headers={"Origin": ORIGIN, "X-CSRF-Token": current["csrf_token"]},
    )
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert session_state(client)["authenticated"] is False
    assert session_state(copied)["authenticated"] is False


def test_logout_rejects_csrf_mismatch_without_revoking_valid_session(auth_setup):
    _application, client, _protocol = auth_setup
    _account, _current, _callback = sign_in_existing(auth_setup)
    response = client.post(
        "/api/auth/logout",
        base_url=ORIGIN,
        headers={"Origin": ORIGIN, "X-CSRF-Token": "wrong-token"},
    )
    assert response.status_code == 403
    assert session_state(client)["authenticated"] is True


@pytest.mark.parametrize("role", ["member", "admin"])
@pytest.mark.parametrize(
    "path",
    ["/api/decks", "/api/dashboard", "/api/stats/table", "/api/card-images/x/full"],
)
@pytest.mark.parametrize("auth_setup", [{"AUTH_OWNERSHIP_READY": True}], indirect=True)
def test_ownership_holding_gate_denies_global_data_even_to_admins(
    auth_setup, role, path
):
    application, client, _protocol = auth_setup
    _account, current, _callback = sign_in_existing(auth_setup, role=role)
    application.config["OWNERSHIP_READY"] = True
    assert current["access"] == {"workspace": False, "reason": "ownership_pending"}
    response = client.get(path, base_url=ORIGIN)
    assert response.status_code == 403
    assert response.is_json
    assert response.headers["Cache-Control"] == "no-store"


def test_valid_application_session_does_not_contact_provider_for_bootstrap(auth_setup):
    _application, client, protocol = auth_setup
    sign_in_existing(auth_setup)
    exchanges = len(protocol.exchanges)
    protocol.failure = RuntimeError("private upstream outage diagnostic")
    assert session_state(client)["authenticated"] is True
    assert len(protocol.exchanges) == exchanges


def test_uninvited_identity_cannot_create_an_account_or_become_first_admin(auth_setup):
    _application, client, _protocol = auth_setup
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    result = finish_login(client, state)
    assert result.status_code == 302
    assert "invitation_required" in result.location
    assert session_state(client)["authenticated"] is False
    assert AuthAccount.query.count() == 0
    assert ExternalIdentity.query.count() == 0


def test_session_storage_outage_does_not_masquerade_as_anonymous_success(
    auth_setup, monkeypatch
):
    _application, client, _protocol = auth_setup
    session_state(client)

    def unavailable(*args, **kwargs):
        raise OperationalError("private storage detail", {}, Exception("unavailable"))

    monkeypatch.setattr(db.session, "get", unavailable)
    response = client.get("/api/auth/session", base_url=ORIGIN)
    assert response.status_code == 503
    assert response.is_json
    assert "private storage detail" not in response.get_data(as_text=True)
    assert response.headers["Cache-Control"] == "no-store"


def test_failed_session_creation_rolls_back_invitation_and_new_identity(auth_setup):
    _application, client, _protocol = auth_setup
    token, invitation = make_invitation()
    client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    invitation_id = invitation.id

    def fail_new_session(_connection, _cursor, statement, parameters, _context, _many):
        if statement.lstrip().upper().startswith("INSERT INTO AUTH_SESSION"):
            raise OperationalError(
                "test session insertion failure", {}, Exception("failed")
            )

    event.listen(db.engine, "before_cursor_execute", fail_new_session)
    try:
        finish_login(client, state)
    finally:
        event.remove(db.engine, "before_cursor_execute", fail_new_session)
    assert session_state(client)["authenticated"] is False
    assert AuthAccount.query.count() == 0
    assert ExternalIdentity.query.count() == 0
    saved = db.session.get(AuthInvitation, invitation_id)
    assert saved.consumed_at is None
    assert saved.account_id is None


@pytest.mark.parametrize(
    "unsafe",
    [
        "https://elsewhere.example/steal",
        "//elsewhere.example/steal",
        "/\\elsewhere.example/steal",
        "/%2f%2felsewhere.example/steal",
        "/%5celsewhere.example/steal",
        "/auth/callback?code=sensitive",
        "/join?invitation=sensitive",
    ],
)
def test_login_return_paths_cannot_escape_or_repeat_authentication(auth_setup, unsafe):
    _application, client, protocol = auth_setup
    make_account(protocol)
    response = start_login(client, return_to=unsafe)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    result = finish_login(client, state)
    assert result.status_code in {302, 303}
    returned = urlsplit(result.location)
    assert not returned.scheme and not returned.netloc
    assert returned.path == "/"
    assert not returned.query


@pytest.mark.parametrize("auth_setup", [{"AUTH_ADMISSION_HOLD": True}], indirect=True)
def test_admission_hold_blocks_fresh_login_for_previously_admitted_account(auth_setup):
    _application, client, protocol = auth_setup
    make_account(protocol)
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    result = finish_login(client, state)
    assert result.status_code == 302
    assert "admission_hold" in result.location
    assert session_state(client)["authenticated"] is False


def test_preauth_cookie_is_replaced_and_only_hash_is_stored_after_login(auth_setup):
    _application, client, protocol = auth_setup
    make_account(protocol)
    initial = client.get("/api/auth/session", base_url=ORIGIN)
    preauth_cookie = cookie_from(initial)
    response = start_login(client, csrf_token=initial.get_json()["csrf_token"])
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    callback = finish_login(client, state)
    authenticated_cookie = cookie_from(callback)
    assert authenticated_cookie.key == "cardfight_dev_session"
    assert authenticated_cookie.value != preauth_cookie.value
    assert authenticated_cookie["httponly"]
    assert authenticated_cookie["samesite"].lower() == "lax"
    assert authenticated_cookie["path"] == "/"
    assert not authenticated_cookie["domain"]
    previous = db.session.get(
        AppSession, sha256(preauth_cookie.value.encode()).hexdigest()
    )
    assert previous is None or previous.revoked_at is not None
    stored = AppSession.query.filter(AppSession.account_id.is_not(None)).one()
    assert stored.token_hash == sha256(authenticated_cookie.value.encode()).hexdigest()
    assert stored.token_hash != authenticated_cookie.value


@pytest.mark.parametrize(
    "auth_setup",
    [{"AUTH_MODE": "oidc", "AUTH_PUBLIC_ORIGIN": "https://cardfight.example"}],
    indirect=True,
)
def test_production_session_cookie_has_host_only_secure_attributes(auth_setup):
    _application, _client, _protocol = auth_setup
    _account, _current, callback = sign_in_existing(auth_setup)
    cookie = cookie_from(callback)
    assert cookie.key == "__Host-cardfight_session"
    assert cookie["secure"]
    assert cookie["httponly"]
    assert cookie["samesite"].lower() == "lax"
    assert cookie["path"] == "/"
    assert not cookie["domain"]
    assert not cookie["expires"]


@pytest.mark.parametrize(
    "origin", [None, "https://unrelated.example", ORIGIN + ".evil"]
)
def test_logout_requires_exact_origin_even_with_valid_csrf(auth_setup, origin):
    _application, client, _protocol = auth_setup
    _account, current, _callback = sign_in_existing(auth_setup)
    headers = {"X-CSRF-Token": current["csrf_token"]}
    if origin is not None:
        headers["Origin"] = origin
    response = client.post("/api/auth/logout", base_url=ORIGIN, headers=headers)
    assert response.status_code == 403
    assert session_state(client)["authenticated"] is True


def test_background_session_polling_does_not_extend_idle_expiry(auth_setup):
    _application, client, _protocol = auth_setup
    sign_in_existing(auth_setup)
    stored = AppSession.query.filter(AppSession.account_id.is_not(None)).one()
    expires_at = utcnow() + timedelta(seconds=120)
    stored.idle_expires_at = expires_at
    db.session.commit()
    assert session_state(client)["authenticated"] is True
    assert session_state(client)["authenticated"] is True
    db.session.refresh(stored)
    assert stored.idle_expires_at == expires_at


def test_login_transaction_secrets_are_not_stored_in_plaintext(auth_setup):
    _application, client, protocol = auth_setup
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    transaction = AuthTransaction.query.one()
    assert transaction.state_hash == sha256(state.encode()).hexdigest()
    assert state not in transaction.encrypted_payload
    for name in ("nonce", "code_verifier"):
        assert protocol.authorizations[0][name] not in transaction.encrypted_payload


def test_logout_during_code_exchange_cannot_resurrect_session_or_accept_invitation(
    auth_setup,
):
    _application, client, protocol = auth_setup
    token, invitation = make_invitation()
    client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    session_hash = AuthTransaction.query.one().session_hash
    invitation_id = invitation.id

    def revoke_while_provider_is_working():
        db.session.execute(
            update(AppSession)
            .where(AppSession.token_hash == session_hash)
            .values(revoked_at=utcnow())
        )
        db.session.commit()

    protocol.on_exchange = revoke_while_provider_is_working
    callback = finish_login(client, state)
    assert callback.status_code == 302
    assert urlsplit(callback.location).path == "/sign-in"
    assert session_state(client)["authenticated"] is False
    assert AuthAccount.query.count() == 0
    assert ExternalIdentity.query.count() == 0
    saved = db.session.get(AuthInvitation, invitation_id)
    assert saved.consumed_at is None
    assert saved.account_id is None


def test_auth_storage_outage_on_protected_api_returns_bounded_503(
    auth_setup, monkeypatch
):
    _application, client, _protocol = auth_setup
    sign_in_existing(auth_setup)

    def unavailable(*args, **kwargs):
        raise OperationalError("private SQL detail", {}, Exception("unavailable"))

    monkeypatch.setattr(db.session, "get", unavailable)
    response = client.get("/api/decks", base_url=ORIGIN)
    assert response.status_code == 503
    assert response.is_json
    assert response.headers["Cache-Control"] == "no-store"
    assert "private SQL detail" not in response.get_data(as_text=True)


def test_operator_bootstrap_binds_only_explicit_identity_without_claiming_legacy_data(
    auth_setup,
):
    from backend.auth_admin import bootstrap_admin

    _application, _client, _protocol = auth_setup
    saved_deck = Deck(name="Unclaimed legacy deck", type="Standard", wins=9, losses=4)
    db.session.add(saved_deck)
    db.session.commit()
    deck_id = saved_deck.id
    result = bootstrap_admin(
        issuer=ISSUER,
        subject="google-oauth2|operator-confirmed",
        method="google",
        email="operator@example.com",
    )
    account = db.session.get(AuthAccount, result["account_id"])
    identity = ExternalIdentity.query.one()
    assert account.role == "admin"
    assert account.status == "admitted"
    assert str(UUID(account.id)) == account.id
    assert identity.issuer == ISSUER
    assert identity.subject == "google-oauth2|operator-confirmed"
    assert identity.account_id == account.id
    assert result["workspace_ready"] is False
    assert result["legacy_data_claimed"] is False
    legacy = db.session.get(Deck, deck_id)
    assert (legacy.name, legacy.wins, legacy.losses) == ("Unclaimed legacy deck", 9, 4)
    assert AuthAuditEvent.query.filter_by(category="operator_bootstrap").count() == 1


@pytest.mark.parametrize("issuer", ["https://another.example/", ISSUER.rstrip("/")])
def test_operator_bootstrap_refuses_different_or_normalized_issuer(auth_setup, issuer):
    from backend.auth_admin import bootstrap_admin

    with pytest.raises(ValueError):
        bootstrap_admin(
            issuer=issuer,
            subject="operator-subject",
            method="google",
            email="operator@example.com",
        )
    assert AuthAccount.query.count() == 0
    assert ExternalIdentity.query.count() == 0


def test_bootstrap_cannot_promote_or_link_an_existing_member_by_email(auth_setup):
    from backend.auth_admin import bootstrap_admin

    _application, _client, protocol = auth_setup
    account = make_account(protocol)
    with pytest.raises(ValueError):
        bootstrap_admin(
            issuer=ISSUER,
            subject="different-provider-subject",
            method="email",
            email=protocol.claims["email"],
        )
    db.session.refresh(account)
    assert account.role == "member"
    assert AuthAccount.query.count() == 1
    assert ExternalIdentity.query.count() == 1


def test_bootstrap_cannot_create_a_second_initial_administrator(auth_setup):
    from backend.auth_admin import bootstrap_admin

    bootstrap_admin(
        issuer=ISSUER,
        subject="operator-one",
        method="google",
        email="first@example.com",
    )
    with pytest.raises(ValueError):
        bootstrap_admin(
            issuer=ISSUER,
            subject="operator-two",
            method="google",
            email="second@example.com",
        )
    assert AuthAccount.query.filter_by(role="admin").count() == 1


def test_operator_invitation_stores_only_bearer_hash_and_bounded_expiry(auth_setup):
    from backend.auth_admin import create_invitation

    before = utcnow()
    result = create_invitation(email="new-player@example.com", days=7)
    invitation = db.session.get(AuthInvitation, result["invitation_id"])
    assert invitation.token_hash == sha256(result["invitation"].encode()).hexdigest()
    assert invitation.token_hash != result["invitation"]
    assert (
        before + timedelta(days=7)
        <= invitation.expires_at
        <= utcnow() + timedelta(days=7)
    )
    assert invitation.recipient_email_key == "new-player@example.com"
    assert invitation.consumed_at is None
    assert invitation.account_id is None
    for audit in AuthAuditEvent.query.all():
        assert result["invitation"] not in repr(vars(audit))
    assert AuthAccount.query.count() == 0


@pytest.mark.parametrize("days", [0, -1, 31, True, 1.5])
def test_operator_cannot_issue_unbounded_or_ambiguous_invitation_lifetime(
    auth_setup, days
):
    from backend.auth_admin import create_invitation

    with pytest.raises(ValueError):
        create_invitation(email="new-player@example.com", days=days)
    assert AuthInvitation.query.count() == 0


@pytest.mark.parametrize("email", ["player@example.com", "PLAYER@EXAMPLE.COM"])
def test_operator_invitation_cannot_make_another_workspace_for_existing_contact(
    auth_setup, email
):
    from backend.auth_admin import create_invitation

    _application, _client, protocol = auth_setup
    make_account(protocol)
    with pytest.raises(ValueError):
        create_invitation(email=email)
    assert AuthInvitation.query.count() == 0


@pytest.mark.parametrize(
    "operation", ["suspend", "reapprove", "set-role", "revoke-sessions"]
)
def test_operator_access_change_preserves_identity_and_revokes_existing_sessions(
    auth_setup, operation
):
    from backend.auth_admin import change_access

    _application, client, _protocol = auth_setup
    account, _current, _callback = sign_in_existing(auth_setup)
    account_id = account.id
    version = account.auth_version
    if operation == "reapprove":
        account.admission_epoch = "previous-checkpoint-generation"
        account.status = "suspended"
        db.session.commit()
    kwargs = {"role": "admin"} if operation == "set-role" else {}
    result = change_access(operation, account_id=account_id, **kwargs)
    db.session.refresh(account)
    assert account.id == account_id
    assert account.auth_version == version + 1
    assert account.admission_epoch == "disposable-test-generation"
    assert result["legacy_data_claimed"] is False
    assert session_state(client)["authenticated"] is False
    assert ExternalIdentity.query.one().account_id == account_id
    sessions = AppSession.query.filter_by(account_id=account_id).all()
    assert sessions and all(row.revoked_at is not None for row in sessions)
    assert account.status == ("suspended" if operation == "suspend" else "admitted")
    assert account.role == ("admin" if operation == "set-role" else "member")


@pytest.mark.parametrize("auth_setup", [{"AUTH_MODE": "local"}], indirect=True)
def test_operator_identity_operations_require_explicit_oidc_configuration(auth_setup):
    from backend.auth_admin import create_invitation

    with pytest.raises(ValueError):
        create_invitation(email="new-player@example.com")
    assert AuthInvitation.query.count() == 0


def test_operator_cli_uses_selected_disposable_app_and_emits_manual_invitation(
    auth_setup, monkeypatch, capsys
):
    from backend.auth_admin import main

    application, _client, _protocol = auth_setup
    monkeypatch.setattr(importlib.import_module("backend.app"), "app", application)
    assert main(["invite", "--email", "new-player@example.com"]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["operation"] == "invite"
    assert output["url"].startswith(ORIGIN + "/join?invitation=")
    assert db.session.get(AuthInvitation, output["invitation_id"]).consumed_at is None
    assert AuthAccount.query.count() == 0


def test_beta_contact_reservation_keeps_dots_and_plus_aliases_distinct():
    from backend.auth import email_key

    assert email_key("Player@EXAMPLE.COM") == email_key("player@example.com")
    assert email_key("player+tag@example.com") != email_key("player@example.com")
    assert email_key("p.layer@example.com") != email_key("player@example.com")


@pytest.mark.parametrize("csrf", [True, 42, [], {}, "non-ascii-\u00e9"])
def test_malformed_json_csrf_is_denied_without_server_error(auth_setup, csrf):
    _application, client, _protocol = auth_setup
    sign_in_existing(auth_setup)
    response = client.post(
        "/api/auth/logout",
        base_url=ORIGIN,
        headers={"Origin": ORIGIN},
        json={"csrf_token": csrf},
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "csrf_failed"
    assert session_state(client)["authenticated"] is True


@pytest.mark.parametrize("browser_context", [True, False])
def test_repeated_login_rejections_have_bounded_audit_writes(
    auth_setup, monkeypatch, browser_context
):
    from backend import auth as auth_module

    _application, client, protocol = auth_setup
    fixed_time = int(time())
    monkeypatch.setattr(auth_module.time, "time", lambda: fixed_time)
    if browser_context:
        session_state(client)
    before = AuthAuditEvent.query.count()

    for _ in range(30):
        response = client.post(
            "/auth/start",
            base_url=ORIGIN,
            headers={"Origin": ORIGIN},
            data={"method": "google", "csrf_token": "wrong-browser-secret"},
        )
        assert response.status_code in {302, 403, 429}
        assert response.headers["Cache-Control"] == "no-store"
        if response.status_code == 302:
            target = urlsplit(response.location)
            assert target.path == "/sign-in"
            assert parse_qs(target.query)["auth_error"][0] in {
                "auth_required",
                "rate_limited",
            }
        else:
            assert response.get_json()["code"] in {"csrf_failed", "rate_limited"}

    assert 1 <= AuthAuditEvent.query.count() - before <= 21
    assert not protocol.authorizations
    assert not protocol.exchanges
    assert AuthTransaction.query.count() == 0


def test_malformed_callbacks_have_bounded_audit_writes(auth_setup, monkeypatch):
    from backend import auth as auth_module

    _application, client, protocol = auth_setup
    fixed_time = int(time())
    monkeypatch.setattr(auth_module.time, "time", lambda: fixed_time)
    session_state(client)
    before = AuthAuditEvent.query.count()

    for _ in range(100):
        response = client.get("/auth/callback", base_url=ORIGIN)
        assert response.status_code == 302
        assert response.headers["Cache-Control"] == "no-store"
        target = urlsplit(response.location)
        assert target.path == "/sign-in"
        assert parse_qs(target.query)["auth_error"][0] in {
            "invalid_auth",
            "rate_limited",
        }

    assert 1 <= AuthAuditEvent.query.count() - before <= 61
    assert not protocol.authorizations
    assert not protocol.exchanges
    assert AuthAccount.query.count() == 0


def test_operator_invitation_revocation_is_idempotent_and_prevents_acceptance(
    auth_setup,
):
    from backend.auth_admin import revoke_invitation

    _application, client, _protocol = auth_setup
    token, invitation = make_invitation()
    result = revoke_invitation(invitation.id)
    revoked_at = invitation.revoked_at
    assert result == {"invitation_id": invitation.id, "revoked": True}
    assert revoked_at is not None
    audit_count = AuthAuditEvent.query.count()
    assert revoke_invitation(invitation.id) == result
    assert invitation.revoked_at == revoked_at
    assert AuthAuditEvent.query.count() == audit_count

    client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    assert session_state(client)["authenticated"] is False
    assert AuthAccount.query.count() == 0
    assert ExternalIdentity.query.count() == 0
    db.session.refresh(invitation)
    assert invitation.consumed_at is None
    assert invitation.account_id is None


def test_consumed_invitation_revocation_refuses_without_changing_account(auth_setup):
    from backend.auth_admin import revoke_invitation

    _application, client, _protocol = auth_setup
    token, invitation = make_invitation()
    client.get("/join", base_url=ORIGIN, query_string={"invitation": token})
    response = start_login(client)
    state = parse_qs(urlsplit(response.location).query)["state"][0]
    finish_login(client, state)
    current = session_state(client)
    assert current["authenticated"] is True
    account = db.session.get(AuthAccount, current["account"]["id"])
    before = (account.id, account.status, account.role, account.auth_version)
    consumed_at = invitation.consumed_at
    audit_count = AuthAuditEvent.query.count()

    with pytest.raises(ValueError, match="already accepted"):
        revoke_invitation(invitation.id)

    db.session.refresh(account)
    db.session.refresh(invitation)
    assert (account.id, account.status, account.role, account.auth_version) == before
    assert invitation.revoked_at is None
    assert invitation.consumed_at == consumed_at
    assert invitation.account_id == account.id
    assert AuthAuditEvent.query.count() == audit_count
    assert session_state(client)["generation"] == current["generation"]
    assert AuthAccount.query.count() == 1
