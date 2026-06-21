"""
Admin-related services.

Mostly used for maintenance actions like recomputing deck records from match history.
"""

from backend.database import db
from backend.models import Deck, Match


def recount_deck_records() -> dict:
    # Reset stored counters.
    for deck in Deck.query.all():
        deck.wins = 0
        deck.losses = 0

    # Recompute from decided matches only.
    for match in Match.query.all():
        if match.winner_id is None:
            continue

        if match.winner_id == match.deck1_id:
            winner = Deck.query.get(match.deck1_id)
            loser = Deck.query.get(match.deck2_id)
        elif match.winner_id == match.deck2_id:
            winner = Deck.query.get(match.deck2_id)
            loser = Deck.query.get(match.deck1_id)
        else:
            # Defensive skip for invalid historical data.
            continue

        if winner:
            winner.wins += 1

        if loser:
            loser.losses += 1

    db.session.commit()

    total_wins = sum(deck.wins for deck in Deck.query.all())
    total_losses = sum(deck.losses for deck in Deck.query.all())

    return {
        "total_wins": total_wins,
        "total_losses": total_losses,
    }