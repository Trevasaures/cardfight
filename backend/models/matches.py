"""Recorded matches and their participants."""

from backend.database import db
from backend.models._timestamps import now_central


class Match(db.Model):
    __tablename__ = "match"

    id = db.Column(db.Integer, primary_key=True)
    owner_account_id = db.Column(
        db.String(36),
        db.ForeignKey("auth_account.id", name="fk_match_owner", ondelete="RESTRICT"),
    )

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
        db.Index("ix_match_owner", "owner_account_id"),
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
