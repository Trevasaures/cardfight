"""
Seeds the database with decks from deck.py (Enum DeckType).
Run:  python backend/seed.py
"""
from backend.app import create_app
from backend.database import db
from backend.models import Deck
from deck import decks as source_decks  # current list
# DeckType enum lives in deck.py; we just need .value strings

app = create_app()

with app.app_context():
    added = 0
    for d in source_decks:
        if not Deck.query.filter_by(name=d.name).first():
            db.session.add(Deck(name=d.name, type=d.deck_type.value))
            added += 1
    db.session.commit()
    print(f"Seed complete. Added {added} new deck(s).")