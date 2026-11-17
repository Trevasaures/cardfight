"""Shared cards, printings, artwork, and set names."""

from backend.database import db
from backend.models._timestamps import now_central


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


class CardImage(db.Model):
    """Immutable artwork shared by printings. Bytes are loaded only by image routes."""

    __tablename__ = "card_image"

    id = db.Column(db.String(64), primary_key=True)
    full_data = db.deferred(db.Column(db.LargeBinary, nullable=False))
    thumbnail_data = db.deferred(db.Column(db.LargeBinary, nullable=False))
    mimetype = db.Column(db.String(32), nullable=False)
    width = db.Column(db.Integer, nullable=False)
    height = db.Column(db.Integer, nullable=False)
    byte_size = db.Column(db.Integer, nullable=False)
    thumbnail_byte_size = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    last_used_at = db.Column(db.DateTime, default=now_central, nullable=False)


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
    image_id = db.Column(db.String(64), db.ForeignKey("card_image.id"), nullable=True)
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
        db.Index("ix_card_printing_image", "image_id"),
        db.Index("ix_card_printing_set_code", "set_code"),
        db.Index("ix_card_printing_rarity", "rarity"),
        db.Index("ix_card_printing_external_id", "external_id"),
    )

    def __repr__(self):
        return f"<CardPrinting card_id={self.card_id} set={self.set_code} rarity={self.rarity}>"


class CardSet(db.Model):
    """Reusable user-defined card set metadata."""

    __tablename__ = "card_set"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(80), unique=True, nullable=False)
    name = db.Column(db.String(160), nullable=False)

    created_at = db.Column(db.DateTime, default=now_central, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=now_central,
        onupdate=now_central,
        nullable=False,
    )

    __table_args__ = (
        db.Index("ix_card_set_code", "code"),
    )

    def __repr__(self):
        return f"<CardSet {self.code} {self.name}>"
