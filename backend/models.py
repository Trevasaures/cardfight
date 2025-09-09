"""
Database models for Deck and Match using SQLAlchemy.
"""
from datetime import datetime
from backend.database import db

# --- Models ---
class Deck(db.Model):
    __tablename__ = "deck"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    type = db.Column(db.String(20), nullable=False)
    wins = db.Column(db.Integer, default=0, nullable=False)
    losses = db.Column(db.Integer, default=0, nullable=False)

    matches_as_1 = db.relationship("Match", foreign_keys="Match.deck1_id", backref="deck1", lazy="dynamic")
    matches_as_2 = db.relationship("Match", foreign_keys="Match.deck2_id", backref="deck2", lazy="dynamic")

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
        }

    def __repr__(self):
        return f"<Deck {self.name} ({self.type})>"


# --- Match ---
class Match(db.Model):
    __tablename__ = "match"

    id = db.Column(db.Integer, primary_key=True)
    deck1_id = db.Column(db.Integer, db.ForeignKey("deck.id"), nullable=False)
    deck2_id = db.Column(db.Integer, db.ForeignKey("deck.id"), nullable=False)
    winner_id = db.Column(db.Integer, db.ForeignKey("deck.id"))
    date_played = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    notes = db.Column(db.Text, default="", nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "deck1_id": self.deck1_id,
            "deck2_id": self.deck2_id,
            "winner_id": self.winner_id,
            "date_played": self.date_played.isoformat(),
            "notes": self.notes,
        }

    def __repr__(self):
        return f"<Match {self.deck1_id} vs {self.deck2_id} winner={self.winner_id}>"