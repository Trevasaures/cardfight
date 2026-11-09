"""Maintained Authlib code exchange and cryptographic OpenID Connect validation."""

import math
import threading
import time
from urllib.parse import urlsplit

from authlib.integrations.requests_client import OAuth2Session
from authlib.oidc.core import CodeIDToken
from joserfc import jwt
from joserfc.errors import InvalidKeyIdError
from joserfc.jwk import KeySet
from joserfc.jws import JWSRegistry
import requests


class InvalidIdentity(ValueError):
    pass


class ProviderUnavailable(Exception):
    pass


class OidcClient:
    """Only configured issuer endpoints/keys are trusted; nothing is browser-held."""

    def __init__(self, settings):
        self.settings = settings
        self._metadata = None
        self._jwks = None
        self._cached_at = 0.0
        self._lock = threading.Lock()

    def _get_json(self, url):
        expected = urlsplit(self.settings.issuer)
        actual = urlsplit(url)
        if (
            actual.scheme != "https"
            or actual.netloc != expected.netloc
            or actual.username
            or actual.password
            or actual.fragment
        ):
            raise InvalidIdentity(
                "Identity endpoint is outside the configured issuer origin."
            )
        try:
            response = requests.get(url, timeout=(3, 8), allow_redirects=False)
            if response.status_code >= 500:
                raise ProviderUnavailable(
                    "Sign-in provider is temporarily unavailable."
                )
            if response.status_code != 200 or len(response.content) > 512 * 1024:
                raise InvalidIdentity("Invalid provider metadata response.")
            result = response.json()
            if not isinstance(result, dict):
                raise InvalidIdentity("Invalid provider metadata response.")
            return result
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise ProviderUnavailable(
                "Sign-in provider is temporarily unavailable."
            ) from exc
        except (requests.RequestException, ValueError) as exc:
            raise InvalidIdentity("Invalid provider metadata response.") from exc

    def metadata(self, *, force=False):
        with self._lock:
            if (
                force
                or self._metadata is None
                or time.monotonic() - self._cached_at > 300
            ):
                metadata = self._get_json(
                    self.settings.issuer.rstrip("/")
                    + "/.well-known/openid-configuration"
                )
                if metadata.get("issuer") != self.settings.issuer:
                    raise InvalidIdentity(
                        "Identity issuer metadata does not match configuration."
                    )
                for name in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
                    value = metadata.get(name)
                    if not isinstance(value, str):
                        raise InvalidIdentity("Provider metadata is incomplete.")
                    endpoint, configured = urlsplit(value), urlsplit(
                        self.settings.issuer
                    )
                    if (
                        endpoint.scheme != "https"
                        or endpoint.netloc != configured.netloc
                        or endpoint.fragment
                    ):
                        raise InvalidIdentity(
                            "Provider endpoint is outside the trusted issuer origin."
                        )
                self._metadata = metadata
                self._jwks = None
                self._cached_at = time.monotonic()
            return dict(self._metadata)

    def keys(self, *, force=False):
        metadata = self.metadata()
        with self._lock:
            if force or self._jwks is None:
                self._jwks = self._get_json(metadata["jwks_uri"])
            return KeySet.import_key_set(self._jwks)

    def authorization_url(self, *, method, state, nonce, code_verifier, redirect_uri):
        metadata = self.metadata()
        connection = (
            self.settings.google_connection
            if method == "google"
            else self.settings.email_connection
        )
        with OAuth2Session(
            self.settings.client_id,
            self.settings.client_secret,
            scope="openid profile email",
            redirect_uri=redirect_uri,
            code_challenge_method="S256",
        ) as client:
            url, returned_state = client.create_authorization_url(
                metadata["authorization_endpoint"],
                state=state,
                code_verifier=code_verifier,
                nonce=nonce,
                connection=connection,
                max_age=300,
                prompt="select_account",
            )
        if returned_state != state:
            raise InvalidIdentity("Protocol state mismatch.")
        return url

    def validate_id_token(self, token, *, nonce):
        if not isinstance(token, dict) or not isinstance(token.get("id_token"), str):
            raise InvalidIdentity("Provider did not return an ID token.")
        try:
            registry = JWSRegistry(algorithms=["RS256"], strict_check_header=False)
            try:
                decoded = jwt.decode(
                    token["id_token"], key=self.keys(), registry=registry
                )
            except InvalidKeyIdError:
                decoded = jwt.decode(
                    token["id_token"], key=self.keys(force=True), registry=registry
                )
            options = {
                "iss": {"essential": True, "value": self.settings.issuer},
                "aud": {"essential": True, "value": self.settings.client_id},
                **{
                    name: {"essential": True} for name in ("sub", "exp", "iat", "nonce")
                },
            }
            params = {
                "nonce": nonce,
                "client_id": self.settings.client_id,
                "max_age": 300,
            }
            if token.get("access_token"):
                params["access_token"] = token["access_token"]
            claims = CodeIDToken(decoded.claims, decoded.header, options, params)
            claims.validate(leeway=60)
            for name in ("exp", "iat", "nbf"):
                value = claims.get(name)
                if name == "nbf" and value is None:
                    continue
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(value)
                ):
                    raise InvalidIdentity(
                        "Identity time claims must be finite timestamps."
                    )
            if claims["exp"] <= claims["iat"]:
                raise InvalidIdentity("Identity validity interval is invalid.")
            # Authlib validates the claim's type but does not enforce max_age.
            # A broker SSO response cannot silently satisfy recent-auth policy.
            auth_time = claims.get("auth_time")
            now = time.time()
            if (
                isinstance(auth_time, bool)
                or not isinstance(auth_time, (int, float))
                or not math.isfinite(auth_time)
                or auth_time > now + 60
                or auth_time < now - 360
            ):
                raise InvalidIdentity(
                    "Authentication is not recent enough for this login."
                )
            return dict(claims)
        except ProviderUnavailable:
            raise
        except Exception as exc:
            raise InvalidIdentity("Provider identity validation failed.") from exc

    def exchange_code(self, *, code, nonce, code_verifier, redirect_uri):
        metadata = self.metadata()
        try:
            with OAuth2Session(
                self.settings.client_id,
                self.settings.client_secret,
                redirect_uri=redirect_uri,
                code_challenge_method="S256",
            ) as client:
                token = client.fetch_token(
                    metadata["token_endpoint"],
                    code=code,
                    code_verifier=code_verifier,
                    redirect_uri=redirect_uri,
                    timeout=(3, 8),
                    allow_redirects=False,
                )
            return self.validate_id_token(token, nonce=nonce)
        except ProviderUnavailable:
            raise
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise ProviderUnavailable(
                "Sign-in provider is temporarily unavailable."
            ) from exc
        except InvalidIdentity:
            raise
        except Exception as exc:
            raise InvalidIdentity(
                "The provider could not validate this sign-in attempt."
            ) from exc
