"""Frozen PostgreSQL schema at the initial Alembic revision.

Keep this metadata independent of the application models. Later revisions
must leave this installation schema intact.
"""

import sqlalchemy as sa

SCHEMA = sa.MetaData(schema="public")

auth_account = sa.Table(
    "auth_account",
    SCHEMA,
    sa.Column("id", sa.String(36), primary_key=True),
    sa.Column("display_name", sa.String(160), nullable=False),
    sa.Column("contact_email", sa.String(320)),
    sa.Column("contact_email_key", sa.String(320)),
    sa.Column("status", sa.String(24), nullable=False),
    sa.Column("role", sa.String(24), nullable=False),
    sa.Column("auth_version", sa.Integer(), nullable=False),
    sa.Column("admission_epoch", sa.String(128), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.CheckConstraint("role IN ('member','admin')", name="ck_auth_account_role"),
    sa.CheckConstraint(
        "status IN ('admitted','suspended','pending')",
        name="ck_auth_account_status",
    ),
    sa.CheckConstraint("auth_version > 0", name="ck_auth_account_version"),
)
sa.Index(
    "ix_auth_account_contact_email_key", auth_account.c.contact_email_key, unique=True
)

auth_audit_event = sa.Table(
    "auth_audit_event",
    SCHEMA,
    sa.Column("id", sa.String(36), primary_key=True),
    sa.Column("account_id", sa.String(36)),
    sa.Column("category", sa.String(64), nullable=False),
    sa.Column("outcome", sa.String(32), nullable=False),
    sa.Column("correlation_id", sa.String(36), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
)
sa.Index("ix_auth_audit_event_account_id", auth_audit_event.c.account_id)

auth_throttle = sa.Table(
    "auth_throttle",
    SCHEMA,
    sa.Column("key_hash", sa.String(64), primary_key=True),
    sa.Column("attempts", sa.Integer(), nullable=False),
    sa.Column("expires_at", sa.DateTime(), nullable=False),
)
sa.Index("ix_auth_throttle_expires_at", auth_throttle.c.expires_at)

card = sa.Table(
    "card",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("grade", sa.Integer()),
    sa.Column("nation", sa.String(80)),
    sa.Column("card_type", sa.String(80), nullable=False),
    sa.Column("clan", sa.String(80)),
    sa.Column("race", sa.String(80)),
    sa.Column("power", sa.Integer()),
    sa.Column("shield", sa.Integer()),
    sa.Column("critical", sa.Integer()),
    sa.Column("trigger_type", sa.String(80)),
    sa.Column("skill_text", sa.Text(), nullable=False),
    sa.Column("flavor_text", sa.Text(), nullable=False),
    sa.Column("source", sa.String(80), nullable=False),
    sa.Column("external_id", sa.String(160)),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
)
sa.Index("ix_card_external_id", card.c.external_id)
sa.Index("ix_card_grade", card.c.grade)
sa.Index("ix_card_name", card.c.name)
sa.Index("ix_card_nation", card.c.nation)
sa.Index("ix_card_type", card.c.card_type)

card_image = sa.Table(
    "card_image",
    SCHEMA,
    sa.Column("id", sa.String(64), primary_key=True),
    sa.Column("full_data", sa.LargeBinary(), nullable=False),
    sa.Column("thumbnail_data", sa.LargeBinary(), nullable=False),
    sa.Column("mimetype", sa.String(32), nullable=False),
    sa.Column("width", sa.Integer(), nullable=False),
    sa.Column("height", sa.Integer(), nullable=False),
    sa.Column("byte_size", sa.Integer(), nullable=False),
    sa.Column("thumbnail_byte_size", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("last_used_at", sa.DateTime(), nullable=False),
)

card_set = sa.Table(
    "card_set",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("code", sa.String(80), nullable=False),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.UniqueConstraint("code"),
)
sa.Index("ix_card_set_code", card_set.c.code)

auth_external_identity = sa.Table(
    "auth_external_identity",
    SCHEMA,
    sa.Column("id", sa.String(36), primary_key=True),
    sa.Column("account_id", sa.String(36), nullable=False),
    sa.Column("issuer", sa.String(512), nullable=False),
    sa.Column("subject", sa.String(255), nullable=False),
    sa.Column("method", sa.String(24), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(
        ["account_id"],
        ["public.auth_account.id"],
        ondelete="CASCADE",
    ),
    sa.UniqueConstraint("issuer", "subject", name="uq_auth_external_subject"),
)
sa.Index("ix_auth_external_identity_account_id", auth_external_identity.c.account_id)

auth_invitation = sa.Table(
    "auth_invitation",
    SCHEMA,
    sa.Column("id", sa.String(36), primary_key=True),
    sa.Column("token_hash", sa.String(64), nullable=False),
    sa.Column("recipient_email", sa.String(320), nullable=False),
    sa.Column("recipient_email_key", sa.String(320), nullable=False),
    sa.Column("inviter_id", sa.String(36)),
    sa.Column("restore_epoch", sa.String(128), nullable=False),
    sa.Column("expires_at", sa.DateTime(), nullable=False),
    sa.Column("consumed_at", sa.DateTime()),
    sa.Column("revoked_at", sa.DateTime()),
    sa.Column("account_id", sa.String(36)),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(["account_id"], ["public.auth_account.id"]),
    sa.ForeignKeyConstraint(["inviter_id"], ["public.auth_account.id"]),
    sa.UniqueConstraint("token_hash"),
)
sa.Index(
    "ix_auth_invitation_recipient_email_key", auth_invitation.c.recipient_email_key
)

auth_session = sa.Table(
    "auth_session",
    SCHEMA,
    sa.Column("token_hash", sa.String(64), primary_key=True),
    sa.Column("public_id", sa.String(36), nullable=False),
    sa.Column("account_id", sa.String(36)),
    sa.Column("method", sa.String(24)),
    sa.Column("csrf_secret", sa.String(64), nullable=False),
    sa.Column("restore_epoch", sa.String(128), nullable=False),
    sa.Column("account_auth_version", sa.Integer()),
    sa.Column("invitation_hash", sa.String(64)),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("last_seen_at", sa.DateTime(), nullable=False),
    sa.Column("idle_expires_at", sa.DateTime(), nullable=False),
    sa.Column("absolute_expires_at", sa.DateTime(), nullable=False),
    sa.Column("authenticated_at", sa.DateTime()),
    sa.Column("provider_auth_time", sa.DateTime()),
    sa.Column("mfa_verified", sa.Boolean(), nullable=False),
    sa.Column("revoked_at", sa.DateTime()),
    sa.ForeignKeyConstraint(
        ["account_id"],
        ["public.auth_account.id"],
        ondelete="CASCADE",
    ),
    sa.UniqueConstraint("public_id"),
)
sa.Index("ix_auth_session_account_id", auth_session.c.account_id)

card_printing = sa.Table(
    "card_printing",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("card_id", sa.Integer(), nullable=False),
    sa.Column("set_code", sa.String(80)),
    sa.Column("set_name", sa.String(160)),
    sa.Column("card_number", sa.String(80)),
    sa.Column("rarity", sa.String(80)),
    sa.Column("image_url", sa.String(500)),
    sa.Column("image_id", sa.String(64)),
    sa.Column("product_url", sa.String(500)),
    sa.Column("source", sa.String(80), nullable=False),
    sa.Column("external_id", sa.String(160)),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(["card_id"], ["public.card.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["image_id"], ["public.card_image.id"]),
)
sa.Index("ix_card_printing_card", card_printing.c.card_id)
sa.Index("ix_card_printing_external_id", card_printing.c.external_id)
sa.Index("ix_card_printing_image", card_printing.c.image_id)
sa.Index("ix_card_printing_rarity", card_printing.c.rarity)
sa.Index("ix_card_printing_set_code", card_printing.c.set_code)

deck = sa.Table(
    "deck",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("name", sa.String(100), nullable=False),
    sa.Column("owner_account_id", sa.String(36)),
    sa.Column("type", sa.String(20), nullable=False),
    sa.Column("nation", sa.String(50)),
    sa.Column("nation_icon", sa.String(100)),
    sa.Column("wins", sa.Integer(), nullable=False),
    sa.Column("losses", sa.Integer(), nullable=False),
    sa.Column("active", sa.Boolean(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.CheckConstraint("type IN ('Standard','Stride')", name="ck_deck_type"),
    sa.ForeignKeyConstraint(
        ["owner_account_id"],
        ["public.auth_account.id"],
        name="fk_deck_owner",
        ondelete="RESTRICT",
    ),
    sa.UniqueConstraint("owner_account_id", "name", name="uq_deck_owner_name"),
)
sa.Index("ix_deck_name", deck.c.name)
sa.Index("ix_deck_owner", deck.c.owner_account_id)
sa.Index(
    "uq_deck_local_name",
    deck.c.name,
    unique=True,
    postgresql_where=deck.c.owner_account_id.is_(None),
)

auth_transaction = sa.Table(
    "auth_transaction",
    SCHEMA,
    sa.Column("state_hash", sa.String(64), primary_key=True),
    sa.Column("session_hash", sa.String(64), nullable=False),
    sa.Column("encrypted_payload", sa.Text(), nullable=False),
    sa.Column("expires_at", sa.DateTime(), nullable=False),
    sa.Column("consumed_at", sa.DateTime()),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(
        ["session_hash"],
        ["public.auth_session.token_hash"],
        ondelete="CASCADE",
    ),
)
sa.Index("ix_auth_transaction_session_hash", auth_transaction.c.session_hash)

deck_version = sa.Table(
    "deck_version",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("deck_id", sa.Integer(), nullable=False),
    sa.Column("version_name", sa.String(120), nullable=False),
    sa.Column("notes", sa.Text(), nullable=False),
    sa.Column("is_active", sa.Boolean(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(["deck_id"], ["public.deck.id"], ondelete="CASCADE"),
)
sa.Index("ix_deck_version_active", deck_version.c.is_active)
sa.Index("ix_deck_version_deck", deck_version.c.deck_id)

acquisition_plan = sa.Table(
    "acquisition_plan",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("owner_account_id", sa.String(36)),
    sa.Column("name", sa.String(160), nullable=False),
    sa.Column("plan_type", sa.String(40), nullable=False),
    sa.Column("list_source", sa.String(40), nullable=False),
    sa.Column("status", sa.String(40), nullable=False),
    sa.Column("archived_at", sa.DateTime()),
    sa.Column("build_mode", sa.String(40), nullable=False),
    sa.Column("deck_id", sa.Integer()),
    sa.Column("deck_version_id", sa.Integer()),
    sa.Column("source_deck_version_id", sa.Integer()),
    sa.Column("deck_type", sa.String(20)),
    sa.Column("nation", sa.String(80)),
    sa.Column("notes", sa.Text(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.CheckConstraint(
        "build_mode IN ('physical','proxy','mixed')",
        name="ck_acquisition_plan_build_mode",
    ),
    sa.CheckConstraint(
        "list_source IN ('empty','deck_version')",
        name="ck_acquisition_plan_source",
    ),
    sa.CheckConstraint(
        "status IN ('planning','buying','waiting','complete','paused')",
        name="ck_acquisition_plan_status",
    ),
    sa.CheckConstraint(
        "plan_type IN ('new_build','existing_deck')",
        name="ck_acquisition_plan_type",
    ),
    sa.ForeignKeyConstraint(["deck_id"], ["public.deck.id"], ondelete="SET NULL"),
    sa.ForeignKeyConstraint(
        ["deck_version_id"],
        ["public.deck_version.id"],
        ondelete="SET NULL",
    ),
    sa.ForeignKeyConstraint(
        ["source_deck_version_id"],
        ["public.deck_version.id"],
        ondelete="SET NULL",
    ),
    sa.ForeignKeyConstraint(
        ["owner_account_id"],
        ["public.auth_account.id"],
        name="fk_acquisition_plan_owner",
        ondelete="RESTRICT",
    ),
)
sa.Index("ix_acquisition_plan_deck", acquisition_plan.c.deck_id)
sa.Index("ix_acquisition_plan_owner", acquisition_plan.c.owner_account_id)
sa.Index(
    "ix_acquisition_plan_source_version", acquisition_plan.c.source_deck_version_id
)
sa.Index("ix_acquisition_plan_status", acquisition_plan.c.status)
sa.Index("ix_acquisition_plan_version", acquisition_plan.c.deck_version_id)

deck_card = sa.Table(
    "deck_card",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("deck_version_id", sa.Integer(), nullable=False),
    sa.Column("card_id", sa.Integer(), nullable=False),
    sa.Column("printing_id", sa.Integer()),
    sa.Column("quantity", sa.Integer(), nullable=False),
    sa.Column("zone", sa.String(40), nullable=False),
    sa.Column("sort_order", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.CheckConstraint("quantity > 0", name="ck_deck_card_quantity_positive"),
    sa.CheckConstraint(
        "zone IN ('main','ride','g','token','other','crest')",
        name="ck_deck_card_zone",
    ),
    sa.ForeignKeyConstraint(["card_id"], ["public.card.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(
        ["deck_version_id"],
        ["public.deck_version.id"],
        ondelete="CASCADE",
    ),
    sa.ForeignKeyConstraint(
        ["printing_id"],
        ["public.card_printing.id"],
        ondelete="SET NULL",
    ),
)
sa.Index("ix_deck_card_card", deck_card.c.card_id)
sa.Index("ix_deck_card_printing", deck_card.c.printing_id)
sa.Index("ix_deck_card_version", deck_card.c.deck_version_id)
sa.Index("ix_deck_card_zone", deck_card.c.zone)

match = sa.Table(
    "match",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("owner_account_id", sa.String(36)),
    sa.Column("deck1_id", sa.Integer(), nullable=False),
    sa.Column("deck2_id", sa.Integer(), nullable=False),
    sa.Column("deck1_version_id", sa.Integer()),
    sa.Column("deck2_version_id", sa.Integer()),
    sa.Column("winner_id", sa.Integer()),
    sa.Column("first_player_id", sa.Integer()),
    sa.Column("format", sa.String(20)),
    sa.Column("date_played", sa.DateTime(), nullable=False),
    sa.Column("notes", sa.Text(), nullable=False),
    sa.CheckConstraint("deck1_id <> deck2_id", name="ck_match_two_distinct_decks"),
    sa.ForeignKeyConstraint(["deck1_id"], ["public.deck.id"]),
    sa.ForeignKeyConstraint(["deck1_version_id"], ["public.deck_version.id"]),
    sa.ForeignKeyConstraint(["deck2_id"], ["public.deck.id"]),
    sa.ForeignKeyConstraint(["deck2_version_id"], ["public.deck_version.id"]),
    sa.ForeignKeyConstraint(["first_player_id"], ["public.deck.id"]),
    sa.ForeignKeyConstraint(["winner_id"], ["public.deck.id"]),
    sa.ForeignKeyConstraint(
        ["owner_account_id"],
        ["public.auth_account.id"],
        name="fk_match_owner",
        ondelete="RESTRICT",
    ),
)
sa.Index("ix_match_d1", match.c.deck1_id)
sa.Index("ix_match_d1_version", match.c.deck1_version_id)
sa.Index("ix_match_d2", match.c.deck2_id)
sa.Index("ix_match_d2_version", match.c.deck2_version_id)
sa.Index("ix_match_date", match.c.date_played)
sa.Index("ix_match_owner", match.c.owner_account_id)
sa.Index("ix_match_winner", match.c.winner_id)

acquisition_plan_item = sa.Table(
    "acquisition_plan_item",
    SCHEMA,
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("plan_id", sa.Integer(), nullable=False),
    sa.Column("card_id", sa.Integer(), nullable=False),
    sa.Column("printing_id", sa.Integer()),
    sa.Column("required_quantity", sa.Integer(), nullable=False),
    sa.Column("source_quantity", sa.Integer(), nullable=False),
    sa.Column("removed_quantity", sa.Integer(), nullable=False),
    sa.Column("confirmed_removed_quantity", sa.Integer(), nullable=False),
    sa.Column("removal_confirmed_at", sa.DateTime()),
    sa.Column("owned_quantity", sa.Integer(), nullable=False),
    sa.Column("ordered_quantity", sa.Integer(), nullable=False),
    sa.Column("unit_price_cents", sa.Integer(), nullable=False),
    sa.Column("notes", sa.Text(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.CheckConstraint(
        "confirmed_removed_quantity >= 0",
        name="ck_acquisition_item_confirmed_removed_nonnegative",
    ),
    sa.CheckConstraint(
        "ordered_quantity >= 0",
        name="ck_acquisition_item_ordered_nonnegative",
    ),
    sa.CheckConstraint(
        "owned_quantity >= 0",
        name="ck_acquisition_item_owned_nonnegative",
    ),
    sa.CheckConstraint(
        "unit_price_cents >= 0",
        name="ck_acquisition_item_price_nonnegative",
    ),
    sa.CheckConstraint(
        "removed_quantity >= 0",
        name="ck_acquisition_item_removed_nonnegative",
    ),
    sa.CheckConstraint(
        "required_quantity >= 0",
        name="ck_acquisition_item_required_nonnegative",
    ),
    sa.CheckConstraint(
        "source_quantity >= 0",
        name="ck_acquisition_item_source_nonnegative",
    ),
    sa.ForeignKeyConstraint(["card_id"], ["public.card.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(
        ["plan_id"],
        ["public.acquisition_plan.id"],
        ondelete="CASCADE",
    ),
    sa.ForeignKeyConstraint(
        ["printing_id"],
        ["public.card_printing.id"],
        ondelete="SET NULL",
    ),
)
sa.Index("ix_acquisition_item_card", acquisition_plan_item.c.card_id)
sa.Index("ix_acquisition_item_plan", acquisition_plan_item.c.plan_id)
sa.Index("ix_acquisition_item_printing", acquisition_plan_item.c.printing_id)
