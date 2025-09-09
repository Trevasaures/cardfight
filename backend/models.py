"""
Database models for Deck and Match using SQLAlchemy.
"""
from datetime import datetime, timezone
from backend.database import db

# --- Deck ---
class Deck(db.Model):
    __tablename__ = "deck"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    type = db.Column(db.String(20), nullable=False)  # "Standard" | "Stride"
    wins = db.Column(db.Integer, default=0, nullable=False)
    losses = db.Column(db.Integer, default=0, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    matches_as_1 = db.relationship("Match", foreign_keys="Match.deck1_id", backref="deck1", lazy="dynamic")
    matches_as_2 = db.relationship("Match", foreign_keys="Match.deck2_id", backref="deck2", lazy="dynamic")

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
            "wins": self.wins,
            "losses": self.losses,
            "games": games,
            "win_pct": round(win_pct, 3),
            "active": self.active,
        }

    def __repr__(self):
        return f"<Deck {self.name} ({self.type})>"


# --- Match ---
class Match(db.Model):
    __tablename__ = "match"

    id = db.Column(db.Integer, primary_key=True)

    # participants
    deck1_id = db.Column(db.Integer, db.ForeignKey("deck.id"), nullable=False)
    deck2_id = db.Column(db.Integer, db.ForeignKey("deck.id"), nullable=False)

    # outcome
    winner_id = db.Column(db.Integer, db.ForeignKey("deck.id"))  # nullable => undecided/log-only
    first_player_id = db.Column(db.Integer, db.ForeignKey("deck.id"))  # who went first
    format = db.Column(db.String(20), nullable=True)  # "Standard" | "Stride" | "Any" (pool used)

    date_played = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)

    __table_args__ = (
        db.CheckConstraint("deck1_id <> deck2_id", name="ck_match_two_distinct_decks"),
        db.Index("ix_match_date", "date_played"),
        db.Index("ix_match_d1", "deck1_id"),
        db.Index("ix_match_d2", "deck2_id"),
        db.Index("ix_match_winner", "winner_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "deck1_id": self.deck1_id,
            "deck2_id": self.deck2_id,
            "winner_id": self.winner_id,
            "first_player_id": self.first_player_id,
            "format": self.format,
            "date_played": self.date_played.isoformat(),
            "notes": self.notes,
        }

    def __repr__(self):
        return f"<Match {self.deck1_id} vs {self.deck2_id} winner={self.winner_id}>"