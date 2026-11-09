"""Validated deployment boundaries for local use and OIDC sign-in."""

from dataclasses import dataclass, field
import ipaddress
from urllib.parse import urlsplit

from cryptography.fernet import Fernet


def loopback(host):
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        return False


@dataclass(frozen=True)
class AuthSettings:
    mode: str
    origin: str
    issuer: str
    client_id: str
    client_secret: str = field(repr=False)
    transaction_key: str = field(repr=False)
    epoch: str = field(repr=False)
    admission_hold: bool
    idle_seconds: int
    absolute_seconds: int
    transaction_seconds: int
    google_connection: str
    email_connection: str
    configured: bool

    @property
    def cookie_name(self):
        return (
            "__Host-cardfight_session"
            if self.mode == "oidc"
            else "cardfight_dev_session"
        )

    @property
    def secure(self):
        return self.mode == "oidc" or self.origin.startswith("https://")

    @property
    def callback_uri(self):
        return self.origin + "/auth/callback"

    @classmethod
    def from_app(cls, app):
        config = app.config
        mode = config.get("AUTH_MODE", "local")
        if mode not in {"local", "oidc-dev", "oidc"}:
            raise ValueError("AUTH_MODE must be explicitly local, oidc-dev or oidc.")
        origin = str(config.get("AUTH_PUBLIC_ORIGIN", "http://127.0.0.1:5173")).rstrip(
            "/"
        )
        parsed = urlsplit(origin)
        try:
            parsed.port
        except ValueError as exc:
            raise ValueError("AUTH_PUBLIC_ORIGIN must be a canonical origin.") from exc
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path
            or any(character.isspace() for character in origin)
        ):
            raise ValueError("AUTH_PUBLIC_ORIGIN must be a canonical HTTP(S) origin.")
        if mode in {"local", "oidc-dev"} and not loopback(parsed.hostname):
            raise ValueError(
                "Local and oidc-dev modes require a loopback public origin."
            )
        if mode == "oidc" and parsed.scheme != "https":
            raise ValueError("Production oidc mode requires HTTPS.")
        values = [
            str(config.get(name, ""))
            for name in (
                "AUTH_ISSUER",
                "AUTH_CLIENT_ID",
                "AUTH_CLIENT_SECRET",
                "AUTH_TRANSACTION_KEY",
                "AUTH_RESTORE_EPOCH",
            )
        ]
        issuer, client_id, client_secret, key, epoch = values
        configured = all(values)
        if mode == "oidc" and not configured:
            raise ValueError(
                "Production oidc mode requires complete server-side identity configuration."
            )
        if any(values) and mode != "local" and not configured:
            raise ValueError(
                "Incomplete OIDC configuration; supply all identity settings."
            )
        if configured:
            provider = urlsplit(issuer)
            if (
                provider.scheme != "https"
                or not provider.hostname
                or provider.username
                or provider.password
                or provider.query
                or provider.fragment
            ):
                raise ValueError(
                    "AUTH_ISSUER must be the trusted HTTPS issuer identifier."
                )
            try:
                Fernet(key.encode("ascii"))
            except (ValueError, UnicodeError) as exc:
                raise ValueError(
                    "AUTH_TRANSACTION_KEY must be a Fernet encryption key."
                ) from exc
            if len(epoch) < 16 or len(epoch) > 128:
                raise ValueError("AUTH_RESTORE_EPOCH must have 16 to 128 characters.")
        hold = config.get("AUTH_ADMISSION_HOLD", True)
        if not isinstance(hold, bool):
            raise ValueError("AUTH_ADMISSION_HOLD must be a boolean.")
        times = []
        for name, default in (
            ("AUTH_IDLE_SECONDS", 1800),
            ("AUTH_ABSOLUTE_SECONDS", 43200),
            ("AUTH_TRANSACTION_SECONDS", 600),
        ):
            value = config.get(name, default)
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{name} must be a positive integer.")
            times.append(value)
        if times[0] > times[1]:
            raise ValueError("Idle expiry cannot exceed absolute expiry.")
        return cls(
            mode,
            origin,
            issuer,
            client_id,
            client_secret,
            key,
            epoch,
            hold,
            *times,
            str(config.get("AUTH_GOOGLE_CONNECTION", "google-oauth2")),
            str(config.get("AUTH_EMAIL_CONNECTION", "email")),
            configured,
        )
