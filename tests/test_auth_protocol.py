"""Exercise actual Authlib/JOSE validation with locally generated signing keys."""

from base64 import urlsafe_b64encode
from hashlib import sha256
import json
from time import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from joserfc import jwt
from joserfc.jwk import OctKey, RSAKey
import pytest
import requests

from backend.auth import protocol as protocol_module
from backend.auth.protocol import InvalidIdentity, OidcClient, ProviderUnavailable
from backend.auth.settings import AuthSettings

ISSUER = "https://identity.example/"
CALLBACK = "https://cardfight.example/auth/callback"
NONCE = "server-stored-nonce"


@pytest.fixture(scope="module")
def signing_keys():
    return (
        RSAKey.generate_key(2048, parameters={"kid": "expected-key"}),
        RSAKey.generate_key(2048, parameters={"kid": "wrong-key"}),
    )


class ProviderResponse:
    def __init__(self, value, status=200):
        self.status_code = status
        self.content = json.dumps(value).encode()
        self.value = value

    def json(self):
        return self.value


@pytest.fixture()
def real_provider(monkeypatch, signing_keys):
    settings = AuthSettings.from_app(
        SimpleNamespace(
            config={
                "AUTH_MODE": "oidc",
                "AUTH_PUBLIC_ORIGIN": "https://cardfight.example",
                "AUTH_ISSUER": ISSUER,
                "AUTH_CLIENT_ID": "test-client",
                "AUTH_CLIENT_SECRET": "test-client-secret",
                "AUTH_TRANSACTION_KEY": urlsafe_b64encode(b"\x19" * 32).decode(),
                "AUTH_RESTORE_EPOCH": "disposable-protocol-generation",
                "AUTH_ADMISSION_HOLD": False,
            }
        )
    )
    discovery = {
        "issuer": ISSUER,
        "authorization_endpoint": ISSUER + "authorize",
        "token_endpoint": ISSUER + "oauth/token",
        "jwks_uri": ISSUER + "keys",
    }
    calls = []
    jwks = {"keys": [signing_keys[0].as_dict()]}

    def get(url, **kwargs):
        calls.append(url)
        assert kwargs == {"timeout": (3, 8), "allow_redirects": False}
        if url == ISSUER + ".well-known/openid-configuration":
            return ProviderResponse(discovery)
        if url == ISSUER + "keys":
            return ProviderResponse(jwks)
        pytest.fail("The adapter attempted an unconfigured HTTP endpoint")

    monkeypatch.setattr(protocol_module.requests, "get", get)
    return OidcClient(settings), discovery, jwks, calls


def signed_identity(
    key, changes=None, *, missing=(), algorithm="RS256", kid="expected-key"
):
    now = int(time())
    claims = {
        "iss": ISSUER,
        "aud": "test-client",
        "sub": "google-oauth2|player",
        "email": "player@example.com",
        "email_verified": True,
        "iat": now,
        "exp": now + 300,
        "auth_time": now,
        "nonce": NONCE,
    }
    claims.update(changes or {})
    for name in missing:
        claims.pop(name, None)
    return jwt.encode(
        {"alg": algorithm, "kid": kid}, claims, key, algorithms=[algorithm]
    )


def test_real_signature_and_oidc_claims_validate_without_returning_provider_tokens(
    real_provider, signing_keys
):
    client, _discovery, _jwks, calls = real_provider
    token = signed_identity(signing_keys[0])
    result = client.validate_id_token(
        {"id_token": token, "access_token": "never-return-this-bearer"}, nonce=NONCE
    )
    assert result["iss"] == ISSUER
    assert result["sub"] == "google-oauth2|player"
    assert not {"id_token", "access_token", "refresh_token"} & result.keys()
    assert calls == [ISSUER + ".well-known/openid-configuration", ISSUER + "keys"]


@pytest.mark.parametrize(
    "changes",
    [
        {"iss": "https://another-issuer.example/"},
        {"aud": "another-client"},
        {"aud": ["test-client", "another-client"], "azp": "another-client"},
        {"nonce": "wrong-nonce"},
        {"nonce": "wrong-nonce", "nonce_supported": False},
        {"exp": int(time()) - 180},
        {"iat": int(time()) + 3600},
        {"auth_time": int(time()) - 3600},
        {"auth_time": int(time()) + 3600},
        {"auth_time": float("nan")},
        {"auth_time": float("inf")},
        {"auth_time": True},
    ],
)
def test_signed_but_invalid_identity_claims_are_rejected(
    real_provider, signing_keys, changes
):
    client, _discovery, _jwks, _calls = real_provider
    with pytest.raises(InvalidIdentity):
        client.validate_id_token(
            {"id_token": signed_identity(signing_keys[0], changes)}, nonce=NONCE
        )


@pytest.mark.parametrize(
    "claim", ["iss", "aud", "sub", "iat", "exp", "nonce", "auth_time"]
)
def test_missing_required_identity_claims_are_rejected(
    real_provider, signing_keys, claim
):
    client, _discovery, _jwks, _calls = real_provider
    with pytest.raises(InvalidIdentity):
        client.validate_id_token(
            {"id_token": signed_identity(signing_keys[0], missing=[claim])}, nonce=NONCE
        )


def test_wrong_signing_key_is_rejected_even_with_matching_key_id(
    real_provider, signing_keys
):
    client, _discovery, _jwks, _calls = real_provider
    with pytest.raises(InvalidIdentity):
        client.validate_id_token(
            {"id_token": signed_identity(signing_keys[1])}, nonce=NONCE
        )


def test_symmetric_algorithm_cannot_substitute_for_pinned_rs256(real_provider):
    client, _discovery, _jwks, _calls = real_provider
    key = OctKey.generate_key(256)
    with pytest.raises(InvalidIdentity):
        client.validate_id_token(
            {"id_token": signed_identity(key, algorithm="HS256")}, nonce=NONCE
        )


def test_unrecognized_key_id_refreshes_keys_only_once(real_provider, signing_keys):
    client, _discovery, _jwks, calls = real_provider
    with pytest.raises(InvalidIdentity):
        client.validate_id_token(
            {"id_token": signed_identity(signing_keys[1], kid="unknown-kid")},
            nonce=NONCE,
        )
    assert calls.count(ISSUER + "keys") == 2


@pytest.mark.parametrize(
    "change",
    [
        {"issuer": ISSUER.rstrip("/")},
        {"authorization_endpoint": "https://untrusted.example/authorize"},
        {"token_endpoint": "http://identity.example/token"},
        {"jwks_uri": "https://identity.example.evil/keys"},
    ],
)
def test_discovery_cannot_change_the_trusted_issuer_or_endpoint_origin(
    real_provider, change
):
    client, discovery, _jwks, calls = real_provider
    discovery.update(change)
    with pytest.raises(InvalidIdentity):
        client.metadata()
    assert calls == [ISSUER + ".well-known/openid-configuration"]


def test_authorization_request_uses_nonce_state_pkce_and_selected_connection(
    real_provider,
):
    client, _discovery, _jwks, _calls = real_provider
    verifier = "server-held-proof-key-" + "x" * 50
    target = client.authorization_url(
        method="google",
        state="unique-state",
        nonce=NONCE,
        code_verifier=verifier,
        redirect_uri=CALLBACK,
    )
    parsed = urlsplit(target)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https" and parsed.netloc == "identity.example"
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid profile email"]
    assert query["state"] == ["unique-state"]
    assert query["nonce"] == [NONCE]
    assert query["redirect_uri"] == [CALLBACK]
    assert query["connection"] == ["google-oauth2"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["code_challenge"] == [
        urlsafe_b64encode(sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    ]
    assert "code_verifier" not in query
    assert "client_secret" not in query
    assert "offline_access" not in query["scope"][0]


def test_exchange_forwards_original_verifier_and_validates_real_id_token(
    real_provider, signing_keys, monkeypatch
):
    client, _discovery, _jwks, _calls = real_provider
    exchanges = []

    def fetch(_session, endpoint, **kwargs):
        exchanges.append((endpoint, kwargs))
        return {"id_token": signed_identity(signing_keys[0])}

    monkeypatch.setattr(protocol_module.OAuth2Session, "fetch_token", fetch)
    claims = client.exchange_code(
        code="one-use-authorization-code",
        nonce=NONCE,
        code_verifier="server-held-verifier",
        redirect_uri=CALLBACK,
    )
    assert claims["sub"] == "google-oauth2|player"
    assert len(exchanges) == 1
    endpoint, values = exchanges[0]
    assert endpoint == ISSUER + "oauth/token"
    assert values["code"] == "one-use-authorization-code"
    assert values["code_verifier"] == "server-held-verifier"
    assert values["redirect_uri"] == CALLBACK
    assert values["timeout"] == (3, 8)
    assert values["allow_redirects"] is False


def test_provider_network_outage_is_a_bounded_dependency_error(
    real_provider, monkeypatch
):
    client, _discovery, _jwks, _calls = real_provider

    def unavailable(*args, **kwargs):
        raise requests.Timeout("private request diagnostic")

    monkeypatch.setattr(protocol_module.requests, "get", unavailable)
    with pytest.raises(ProviderUnavailable, match="temporarily unavailable"):
        client.metadata()


@pytest.mark.parametrize("expiry_offset", [0, -1])
def test_identity_expiry_must_follow_issuance(
    real_provider, signing_keys, expiry_offset
):
    client, _discovery, _jwks, _calls = real_provider
    issued = int(time())
    token = signed_identity(
        signing_keys[0], {"iat": issued, "exp": issued + expiry_offset}
    )
    with pytest.raises(InvalidIdentity):
        client.validate_id_token({"id_token": token}, nonce=NONCE)


@pytest.mark.parametrize(
    "claim,value",
    [("exp", float("nan")), ("iat", float("inf")), ("nbf", True)],
)
def test_identity_numeric_dates_reject_nonfinite_and_boolean_values(
    real_provider, signing_keys, claim, value
):
    client, _discovery, _jwks, _calls = real_provider
    with pytest.raises(InvalidIdentity):
        client.validate_id_token(
            {"id_token": signed_identity(signing_keys[0], {claim: value})}, nonce=NONCE
        )
