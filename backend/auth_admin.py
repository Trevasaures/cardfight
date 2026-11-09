"""Trusted-console identity operations. No provider, email, or legacy-owner writes.

Bootstrap requires an operator to verify the exact provider issuer/subject out of
band first. These commands are not web endpoints and do not infer identity from
email, registration order, or the existing personal dataset.
"""

import argparse
from datetime import timedelta
import json
import secrets
import sys
from urllib.parse import urlencode

from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError

from backend.auth import AuthError, _audit, _digest, email_key, settings
from backend.auth_models import (
    AppSession,
    AuthAccount,
    AuthInvitation,
    ExternalIdentity,
    new_id,
    utcnow,
)
from backend.database import db


def _configured():
    config = settings()
    if config.mode == "local" or not config.configured:
        raise ValueError(
            "Operator identity actions require configured oidc-dev or oidc mode."
        )
    return config


def _account(account_id):
    account = db.session.get(AuthAccount, account_id)
    if account is None:
        raise ValueError("Select an existing account UUID.")
    return account


def bootstrap_admin(*, issuer, subject, method, email, name="Cardfight administrator"):
    config = _configured()
    if (
        issuer != config.issuer
        or not isinstance(subject, str)
        or not 1 <= len(subject) <= 255
        or not subject.isascii()
    ):
        raise ValueError(
            "Verify the exact configured issuer and provider subject before bootstrap."
        )
    if method not in {"google", "email"}:
        raise ValueError(
            "Select google or email as the verified original sign-in method."
        )
    key = email_key(email)
    if AuthAccount.query.filter_by(role="admin").first() is not None:
        raise ValueError(
            "An administrator already exists; use explicit account review/role commands."
        )
    if (
        ExternalIdentity.query.filter_by(issuer=issuer, subject=subject).first()
        or AuthAccount.query.filter_by(contact_email_key=key).first()
    ):
        raise ValueError(
            "This identity/contact already exists; bootstrap does not link or promote it."
        )
    account = AuthAccount(
        id=new_id(),
        display_name=(name.strip()[:160] or "Cardfight administrator"),
        contact_email=email,
        contact_email_key=key,
        role="admin",
        admission_epoch=config.epoch,
    )
    db.session.add(account)
    db.session.flush()
    db.session.add(
        ExternalIdentity(
            account_id=account.id, issuer=issuer, subject=subject, method=method
        )
    )
    _audit("operator_bootstrap", "accepted", account.id)
    db.session.commit()
    return {
        "account_id": account.id,
        "role": account.role,
        "status": account.status,
        "workspace_ready": False,
        "legacy_data_claimed": False,
    }


def create_invitation(*, email, days=7):
    config = _configured()
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 30:
        raise ValueError("Invitation validity must be between 1 and 30 days.")
    key = email_key(email)
    if AuthAccount.query.filter_by(contact_email_key=key).first() is not None:
        raise ValueError(
            "This contact needs existing-account recovery, not another workspace invitation."
        )
    raw = secrets.token_urlsafe(32)
    invitation = AuthInvitation(
        token_hash=_digest(raw),
        recipient_email=email,
        recipient_email_key=key,
        restore_epoch=config.epoch,
        expires_at=utcnow() + timedelta(days=days),
    )
    db.session.add(invitation)
    _audit("operator_invitation", "created")
    db.session.commit()
    return {
        "invitation_id": invitation.id,
        "expires_at": invitation.expires_at.isoformat() + "Z",
        "invitation": raw,
        "url": config.origin + "/join?" + urlencode({"invitation": raw}),
    }


def change_access(operation, *, account_id, role=None):
    config = _configured()
    account = _account(account_id)
    if operation == "suspend":
        account.status = "suspended"
    elif operation == "reapprove":
        account.status = "admitted"
        account.admission_epoch = config.epoch
    elif operation == "set-role":
        if role not in {"member", "admin"}:
            raise ValueError("Select an explicit member or admin role.")
        account.role = role
    elif operation != "revoke-sessions":
        raise ValueError("Unknown access operation.")
    account.auth_version += 1
    db.session.execute(
        update(AppSession)
        .where(AppSession.account_id == account.id, AppSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    _audit("operator_" + operation.replace("-", "_"), "accepted", account.id)
    db.session.commit()
    return {
        "account_id": account.id,
        "role": account.role,
        "status": account.status,
        "auth_version": account.auth_version,
        "admission_hold": config.admission_hold,
        "legacy_data_claimed": False,
    }


def revoke_invitation(invitation_id):
    _configured()
    invitation = db.session.get(AuthInvitation, invitation_id)
    if invitation is None:
        raise ValueError("Select an existing invitation UUID, not its secret token.")
    if invitation.consumed_at is not None:
        raise ValueError(
            "Invitation already accepted; review the account's admission instead."
        )
    if invitation.revoked_at is None:
        invitation.revoked_at = utcnow()
        _audit("operator_invitation", "revoked")
        db.session.commit()
    return {"invitation_id": invitation.id, "revoked": True}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser(
        "bootstrap",
        help="Bind an operator-verified provider identity as initial administrator",
    )
    for name in ("issuer", "subject", "email"):
        bootstrap.add_argument("--" + name, required=True)
    bootstrap.add_argument("--method", choices=("google", "email"), required=True)
    bootstrap.add_argument("--name", default="Cardfight administrator")
    invitation = commands.add_parser(
        "invite",
        help="Print one private invitation for manual delivery; no email is sent",
    )
    invitation.add_argument("--email", required=True)
    invitation.add_argument("--days", type=int, default=7)
    revoke = commands.add_parser(
        "revoke-invitation",
        help="Revoke an unused invitation by UUID, without disclosing its token",
    )
    revoke.add_argument("--invitation", required=True)
    for operation in ("suspend", "revoke-sessions", "reapprove", "set-role"):
        subcommand = commands.add_parser(operation)
        subcommand.add_argument("--account", required=True)
        if operation == "set-role":
            subcommand.add_argument(
                "--role", choices=("member", "admin"), required=True
            )
    arguments = parser.parse_args(argv)
    try:
        # The normal application checks the versioned schema; this command never
        # calls create_all, performs migration, or changes provider configuration.
        from backend.app import app

        with app.app_context():
            if arguments.command == "bootstrap":
                result = bootstrap_admin(
                    issuer=arguments.issuer,
                    subject=arguments.subject,
                    method=arguments.method,
                    email=arguments.email,
                    name=arguments.name,
                )
            elif arguments.command == "invite":
                result = create_invitation(email=arguments.email, days=arguments.days)
            elif arguments.command == "revoke-invitation":
                result = revoke_invitation(arguments.invitation)
            else:
                result = change_access(
                    arguments.command,
                    account_id=arguments.account,
                    role=getattr(arguments, "role", None),
                )
        print(json.dumps({"operation": arguments.command, **result}, indent=2))
        return 0
    except (AuthError, ValueError) as exc:
        print(
            f"Identity operator action refused: {getattr(exc, 'code', str(exc))}",
            file=sys.stderr,
        )
        return 1
    except SQLAlchemyError:
        print(
            "Identity operator action failed; no action was committed.", file=sys.stderr
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
