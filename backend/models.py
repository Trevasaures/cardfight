"""
Database models for decks, matches, cards, and deck builder data.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from backend.database import db


def now_central():
    return datetime.now(ZoneInfo("America/Chicago"))


# --- Deck ---
class Deck(db.Model):
    __tablename__ = "deck"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    type = db.Column(db.String(20), nullable=False)

    nation = db.Column(db.String(50), nullable=True)
    nation_icon = db.Column(db.String(100), nullable=True)

    wins = db.Column(db.Integer, default=0, nullable=False)
    losses = db.Column(db.Integer, default=0, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)

    matches_as_1 = db.relationship(
        "Match",
        foreign_keys="Match.deck1_id",
        backref="deck1",
        lazy="dynamic",
    )
    matches_as_2 = db.relationship(
        "Match",
        foreign_keys="Match.deck2_id",
        backref="deck2",
        lazy="dynamic",
    )

    versions = db.relationship(
        "DeckVersion",
        back_populates="deck",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    __table_args__ = (
        db.CheckConstraint("type IN ('Standard','Stride')", name="ck_deck_type"),
        db.Index("ix_deck_name", "name"),
    )

    def to_dict(self):
        games = self.wins + self.losses
        win_pct = (self.wins / games) if games else 0.0

        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "nation": self.nation,
            "nation_icon": self.nation_icon,
            "wins": self.wins,
            "losses": self.losses,
            "games": games,
            "decided_games": games,
            "win_pct": round(win_pct, 3),
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Deck {self.name} ({self.type})>"


# --- Match ---
class Match(db.Model):
    __tablename__ = "match"

    id = db.Column(db.Integer, primary_key=True)

    deck1_id = db.Column(db.Integer, db.ForeignKey("deck.id"), nullable=False)
    deck2_id = db.Column(db.Integer, db.ForeignKey("deck.id"), nullable=False)

    # Optional future link to exact deck versions used in a match.
    deck1_version_id = db.Column(
        db.Integer,
        db.ForeignKey("deck_version.id"),
        nullable=True,
    )
    deck2_version_id = db.Column(
        db.Integer,
        db.ForeignKey("deck_version.id"),
        nullable=True,
    )

    winner_id = db.Column(db.Integer, db.ForeignKey("deck.id"))
    first_player_id = db.Column(db.Integer, db.ForeignKey("deck.id"))
    format = db.Column(db.String(20), nullable=True)

    date_played = db.Column(db.DateTime, default=now_central, nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)

    deck1_version = db.relationship(
        "DeckVersion",
        foreign_keys=[deck1_version_id],
        lazy="joined",
    )
    deck2_version = db.relationship(
        "DeckVersion",
        foreign_keys=[deck2_version_id],
        lazy="joined",
    )

    __table_args__ = (
        db.CheckConstraint("deck1_id <> deck2_id", name="ck_match_two_distinct_decks"),
        db.Index("ix_match_date", "date_played"),
        db.Index("ix_match_d1", "deck1_id"),
        db.Index("ix_match_d2", "deck2_id"),
        db.Index("ix_match_winner", "winner_id"),
        db.Index("ix_match_d1_version", "deck1_version_id"),
        db.Index("ix_match_d2_version", "deck2_version_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "deck1_id": self.deck1_id,
            "deck2_id": self.deck2_id,
            "deck1_version_id": self.deck1_version_id,
            "deck2_version_id": self.deck2_version_id,
            "winner_id": self.winner_id,
            "first_player_id": self.first_player_id,
            "format": self.format,
            "date_played": self.date_played.strftime("%m/%d/%Y %I:%M %p"),
            "date_played_iso": self.date_played.isoformat(),
            "notes": self.notes,
        }

    def __repr__(self):
        return f"<Match {self.deck1_id} vs {self.deck2_id} winner={self.winner_id}>"


# --- Card Catalog ---
class Card(db.Model):
    __tablename__ = "card"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(160), nullable=False)
    grade = db.Column(db.Integer, nullable=True)
    nation = db.Column(db.String(80), nullable=True)
    card_type = db.Column(db.String(80), nullable=False)

    clan = db.Column(db.String(80), nullable=True)
    race = db.Column(db.String(80), nullable=True)
    power = db.Column(db.Integer, nullable=True)
    shield = db.Column(db.Integer, nullable=True)
    critical = db.Column(db.Integer, nullable=True)
    trigger_type = db.Column(db.String(80), nullable=True)

    skill_text = db.Column(db.Text, default="", nullable=False)
    flavor_text = db.Column(db.Text, default="", nullable=False)

    source = db.Column(db.String(80), default="manual", nullable=False)
    external_id = db.Column(db.String(160), nullable=True)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    printings = db.relationship(
        "CardPrinting",
        back_populates="card",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    deck_entries = db.relationship(
        "DeckCard",
        back_populates="card",
        lazy="dynamic",
    )

    __table_args__ = (
        db.Index("ix_card_name", "name"),
        db.Index("ix_card_nation", "nation"),
        db.Index("ix_card_grade", "grade"),
        db.Index("ix_card_type", "card_type"),
        db.Index("ix_card_external_id", "external_id"),
    )

    def __repr__(self):
        return f"<Card {self.name} grade={self.grade}>"


class CardPrinting(db.Model):
    __tablename__ = "card_printing"

    id = db.Column(db.Integer, primary_key=True)

    card_id = db.Column(
        db.Integer,
        db.ForeignKey("card.id", ondelete="CASCADE"),
        nullable=False,
    )

    set_code = db.Column(db.String(80), nullable=True)
    set_name = db.Column(db.String(160), nullable=True)
    card_number = db.Column(db.String(80), nullable=True)
    rarity = db.Column(db.String(80), nullable=True)

    image_url = db.Column(db.String(500), nullable=True)
    product_url = db.Column(db.String(500), nullable=True)

    source = db.Column(db.String(80), default="manual", nullable=False)
    external_id = db.Column(db.String(160), nullable=True)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    card = db.relationship("Card", back_populates="printings")

    deck_entries = db.relationship(
        "DeckCard",
        back_populates="printing",
        lazy="dynamic",
    )

    __table_args__ = (
        db.Index("ix_card_printing_card", "card_id"),
        db.Index("ix_card_printing_set_code", "set_code"),
        db.Index("ix_card_printing_rarity", "rarity"),
        db.Index("ix_card_printing_external_id", "external_id"),
    )

    def __repr__(self):
        return f"<CardPrinting card_id={self.card_id} set={self.set_code} rarity={self.rarity}>"


# --- Deck Builder ---
class DeckVersion(db.Model):
    __tablename__ = "deck_version"

    id = db.Column(db.Integer, primary_key=True)

    deck_id = db.Column(
        db.Integer,
        db.ForeignKey("deck.id", ondelete="CASCADE"),
        nullable=False,
    )

    version_name = db.Column(db.String(120), default="Version 1", nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)

    is_active = db.Column(db.Boolean, default=True, nullable=False)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    deck = db.relationship("Deck", back_populates="versions")

    cards = db.relationship(
        "DeckCard",
        back_populates="deck_version",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    __table_args__ = (
        db.Index("ix_deck_version_deck", "deck_id"),
        db.Index("ix_deck_version_active", "is_active"),
    )

    def __repr__(self):
        return f"<DeckVersion deck_id={self.deck_id} name={self.version_name}>"


class DeckCard(db.Model):
    __tablename__ = "deck_card"

    id = db.Column(db.Integer, primary_key=True)

    deck_version_id = db.Column(
        db.Integer,
        db.ForeignKey("deck_version.id", ondelete="CASCADE"),
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

    quantity = db.Column(db.Integer, nullable=False, default=1)
    zone = db.Column(db.String(40), default="main", nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    deck_version = db.relationship("DeckVersion", back_populates="cards")
    card = db.relationship("Card", back_populates="deck_entries")
    printing = db.relationship("CardPrinting", back_populates="deck_entries")

    __table_args__ = (
        db.CheckConstraint("quantity > 0", name="ck_deck_card_quantity_positive"),
        db.CheckConstraint(
            "zone IN ('main','ride','g','token','other')",
            name="ck_deck_card_zone",
        ),
        db.Index("ix_deck_card_version", "deck_version_id"),
        db.Index("ix_deck_card_card", "card_id"),
        db.Index("ix_deck_card_printing", "printing_id"),
        db.Index("ix_deck_card_zone", "zone"),
    )

    def __repr__(self):
        return f"<DeckCard version={self.deck_version_id} card={self.card_id} qty={self.quantity}>"


# --- Acquisition Planning ---
class AcquisitionPlan(db.Model):
    __tablename__ = "acquisition_plan"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(160), nullable=False)
    plan_type = db.Column(db.String(40), default="new_build", nullable=False)
    list_source = db.Column(db.String(40), default="empty", nullable=False)
    status = db.Column(db.String(40), default="planning", nullable=False)
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
            "required_quantity > 0",
            name="ck_acquisition_item_required_positive",
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
