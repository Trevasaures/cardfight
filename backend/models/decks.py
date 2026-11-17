"""Decks, versions, and card selections."""

from backend.database import db
from backend.models._timestamps import now_central


class Deck(db.Model):
    __tablename__ = "deck"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    owner_account_id = db.Column(
        db.String(36),
        db.ForeignKey("auth_account.id", name="fk_deck_owner", ondelete="RESTRICT"),
    )
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
        db.Index("ix_deck_owner", "owner_account_id"),
        db.UniqueConstraint("owner_account_id", "name", name="uq_deck_owner_name"),
        db.Index(
            "uq_deck_local_name",
            "name",
            unique=True,
            sqlite_where=owner_account_id.is_(None),
            postgresql_where=owner_account_id.is_(None),
        ),
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
            "zone IN ('main','ride','g','token','other','crest')",
            name="ck_deck_card_zone",
        ),
        db.Index("ix_deck_card_version", "deck_version_id"),
        db.Index("ix_deck_card_card", "card_id"),
        db.Index("ix_deck_card_printing", "printing_id"),
        db.Index("ix_deck_card_zone", "zone"),
    )

    def __repr__(self):
        return f"<DeckCard version={self.deck_version_id} card={self.card_id} qty={self.quantity}>"
