"""Acquisition plans and their items."""

from backend.database import db
from backend.models._timestamps import now_central


class AcquisitionPlan(db.Model):
    __tablename__ = "acquisition_plan"

    id = db.Column(db.Integer, primary_key=True)
    owner_account_id = db.Column(
        db.String(36),
        db.ForeignKey(
            "auth_account.id", name="fk_acquisition_plan_owner", ondelete="RESTRICT"
        ),
    )

    name = db.Column(db.String(160), nullable=False)
    plan_type = db.Column(db.String(40), default="new_build", nullable=False)
    list_source = db.Column(db.String(40), default="empty", nullable=False)
    status = db.Column(db.String(40), default="planning", nullable=False)
    archived_at = db.Column(db.DateTime, nullable=True)
    build_mode = db.Column(db.String(40), default="physical", nullable=False)

    deck_id = db.Column(
        db.Integer,
        db.ForeignKey("deck.id", ondelete="SET NULL"),
        nullable=True,
    )
    deck_version_id = db.Column(
        db.Integer,
        db.ForeignKey("deck_version.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_deck_version_id = db.Column(
        db.Integer,
        db.ForeignKey("deck_version.id", ondelete="SET NULL"),
        nullable=True,
    )

    deck_type = db.Column(db.String(20), nullable=True)
    nation = db.Column(db.String(80), nullable=True)
    notes = db.Column(db.Text, default="", nullable=False)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    deck = db.relationship("Deck", foreign_keys=[deck_id], lazy="joined")
    deck_version = db.relationship(
        "DeckVersion",
        foreign_keys=[deck_version_id],
        lazy="joined",
    )
    source_deck_version = db.relationship(
        "DeckVersion",
        foreign_keys=[source_deck_version_id],
        lazy="joined",
    )
    items = db.relationship(
        "AcquisitionPlanItem",
        back_populates="plan",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    __table_args__ = (
        db.CheckConstraint(
            "plan_type IN ('new_build','existing_deck')",
            name="ck_acquisition_plan_type",
        ),
        db.CheckConstraint(
            "list_source IN ('empty','deck_version')",
            name="ck_acquisition_plan_source",
        ),
        db.CheckConstraint(
            "status IN ('planning','buying','waiting','complete','paused')",
            name="ck_acquisition_plan_status",
        ),
        db.CheckConstraint(
            "build_mode IN ('physical','proxy','mixed')",
            name="ck_acquisition_plan_build_mode",
        ),
        db.Index("ix_acquisition_plan_status", "status"),
        db.Index("ix_acquisition_plan_owner", "owner_account_id"),
        db.Index("ix_acquisition_plan_deck", "deck_id"),
        db.Index("ix_acquisition_plan_version", "deck_version_id"),
        db.Index("ix_acquisition_plan_source_version", "source_deck_version_id"),
    )

    def __repr__(self):
        return f"<AcquisitionPlan {self.name} type={self.plan_type}>"


class AcquisitionPlanItem(db.Model):
    __tablename__ = "acquisition_plan_item"

    id = db.Column(db.Integer, primary_key=True)

    plan_id = db.Column(
        db.Integer,
        db.ForeignKey("acquisition_plan.id", ondelete="CASCADE"),
        nullable=False,
    )
    card_id = db.Column(
        db.Integer,
        db.ForeignKey("card.id", ondelete="CASCADE"),
        nullable=False,
    )
    printing_id = db.Column(
        db.Integer,
        db.ForeignKey("card_printing.id", ondelete="SET NULL"),
        nullable=True,
    )

    required_quantity = db.Column(db.Integer, default=1, nullable=False)
    source_quantity = db.Column(db.Integer, default=0, nullable=False)
    removed_quantity = db.Column(db.Integer, default=0, nullable=False)
    confirmed_removed_quantity = db.Column(db.Integer, default=0, nullable=False)
    removal_confirmed_at = db.Column(db.DateTime, nullable=True)
    owned_quantity = db.Column(db.Integer, default=0, nullable=False)
    ordered_quantity = db.Column(db.Integer, default=0, nullable=False)
    unit_price_cents = db.Column(db.Integer, default=0, nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    plan = db.relationship("AcquisitionPlan", back_populates="items")
    card = db.relationship("Card", lazy="joined")
    printing = db.relationship("CardPrinting", lazy="joined")

    __table_args__ = (
        db.CheckConstraint(
            "required_quantity >= 0",
            name="ck_acquisition_item_required_nonnegative",
        ),
        db.CheckConstraint(
            "source_quantity >= 0",
            name="ck_acquisition_item_source_nonnegative",
        ),
        db.CheckConstraint(
            "removed_quantity >= 0",
            name="ck_acquisition_item_removed_nonnegative",
        ),
        db.CheckConstraint(
            "confirmed_removed_quantity >= 0",
            name="ck_acquisition_item_confirmed_removed_nonnegative",
        ),
        db.CheckConstraint(
            "owned_quantity >= 0",
            name="ck_acquisition_item_owned_nonnegative",
        ),
        db.CheckConstraint(
            "ordered_quantity >= 0",
            name="ck_acquisition_item_ordered_nonnegative",
        ),
        db.CheckConstraint(
            "unit_price_cents >= 0",
            name="ck_acquisition_item_price_nonnegative",
        ),
        db.Index("ix_acquisition_item_plan", "plan_id"),
        db.Index("ix_acquisition_item_card", "card_id"),
        db.Index("ix_acquisition_item_printing", "printing_id"),
    )

    def __repr__(self):
        return (
            f"<AcquisitionPlanItem plan={self.plan_id} card={self.card_id} "
            f"required={self.required_quantity}>"
        )
