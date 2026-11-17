"""Additive identity metadata; importing this module never creates schema or users."""

from datetime import datetime, timezone
from uuid import uuid4

from backend.database import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_id():
    return str(uuid4())


class AuthAccount(db.Model):
    __tablename__ = "auth_account"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    display_name = db.Column(db.String(160), nullable=False, default="Cardfighter")
    contact_email = db.Column(db.String(320), nullable=True)
    contact_email_key = db.Column(
        db.String(320), nullable=True, index=True, unique=True
    )
    status = db.Column(db.String(24), nullable=False, default="admitted")
    role = db.Column(db.String(24), nullable=False, default="member")
    auth_version = db.Column(db.Integer, nullable=False, default=1)
    admission_epoch = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    __table_args__ = (
        db.CheckConstraint(
            "status IN ('admitted','suspended','pending')",
            name="ck_auth_account_status",
        ),
        db.CheckConstraint("role IN ('member','admin')", name="ck_auth_account_role"),
        db.CheckConstraint("auth_version > 0", name="ck_auth_account_version"),
    )


class ExternalIdentity(db.Model):
    __tablename__ = "auth_external_identity"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    account_id = db.Column(
        db.String(36),
        db.ForeignKey("auth_account.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    issuer = db.Column(db.String(512), nullable=False)
    subject = db.Column(db.String(255), nullable=False)
    method = db.Column(db.String(24), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    __table_args__ = (
        db.UniqueConstraint("issuer", "subject", name="uq_auth_external_subject"),
    )


class AuthInvitation(db.Model):
    __tablename__ = "auth_invitation"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    token_hash = db.Column(db.String(64), nullable=False, unique=True)
    recipient_email = db.Column(db.String(320), nullable=False)
    recipient_email_key = db.Column(db.String(320), nullable=False, index=True)
    inviter_id = db.Column(
        db.String(36), db.ForeignKey("auth_account.id"), nullable=True
    )
    restore_epoch = db.Column(db.String(128), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    consumed_at = db.Column(db.DateTime, nullable=True)
    revoked_at = db.Column(db.DateTime, nullable=True)
    account_id = db.Column(
        db.String(36), db.ForeignKey("auth_account.id"), nullable=True
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class AppSession(db.Model):
    __tablename__ = "auth_session"
    token_hash = db.Column(db.String(64), primary_key=True)
    public_id = db.Column(db.String(36), nullable=False, unique=True, default=new_id)
    # Anonymous pre-authentication sessions carry only CSRF/invitation context.
    account_id = db.Column(
        db.String(36),
        db.ForeignKey("auth_account.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    method = db.Column(db.String(24), nullable=True)
    csrf_secret = db.Column(db.String(64), nullable=False)
    restore_epoch = db.Column(db.String(128), nullable=False)
    account_auth_version = db.Column(db.Integer, nullable=True)
    invitation_hash = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    last_seen_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    idle_expires_at = db.Column(db.DateTime, nullable=False)
    absolute_expires_at = db.Column(db.DateTime, nullable=False)
    authenticated_at = db.Column(db.DateTime, nullable=True)
    provider_auth_time = db.Column(db.DateTime, nullable=True)
    mfa_verified = db.Column(db.Boolean, nullable=False, default=False)
    revoked_at = db.Column(db.DateTime, nullable=True)


class AuthTransaction(db.Model):
    __tablename__ = "auth_transaction"
    state_hash = db.Column(db.String(64), primary_key=True)
    session_hash = db.Column(
        db.String(64),
        db.ForeignKey("auth_session.token_hash", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    encrypted_payload = db.Column(db.Text, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    consumed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class AuthAuditEvent(db.Model):
    __tablename__ = "auth_audit_event"
    id = db.Column(db.String(36), primary_key=True, default=new_id)
    account_id = db.Column(db.String(36), nullable=True, index=True)
    category = db.Column(db.String(64), nullable=False)
    outcome = db.Column(db.String(32), nullable=False)
    correlation_id = db.Column(db.String(36), nullable=False, default=new_id)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class AuthThrottle(db.Model):
    __tablename__ = "auth_throttle"
    key_hash = db.Column(db.String(64), primary_key=True)
    attempts = db.Column(db.Integer, nullable=False, default=1)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
