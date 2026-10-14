"""
Admin-related services.

Mostly used for maintenance actions like recomputing deck records from match history.
"""

from backend.database import db
from backend.models import Deck, Match


def recount_deck_records() -> dict:
    # Keep one identity map for the whole recount instead of looking up two
    # decks per historical match and querying them again for the final totals.
    decks = {deck.id: deck for deck in Deck.query.all()}
    for deck in decks.values():
        deck.wins = 0
        deck.losses = 0

    # Recompute from decided matches only.
    for match in Match.query.all():
        if match.winner_id is None:
            continue

        if match.winner_id == match.deck1_id:
            winner = decks.get(match.deck1_id)
            loser = decks.get(match.deck2_id)
        elif match.winner_id == match.deck2_id:
            winner = decks.get(match.deck2_id)
            loser = decks.get(match.deck1_id)
        else:
            # Defensive skip for invalid historical data.
            continue

        if winner:
            winner.wins += 1

        if loser:
            loser.losses += 1

    # expire_on_commit would otherwise re-fetch each object to read counters.
    total_wins = sum(deck.wins for deck in decks.values())
    total_losses = sum(deck.losses for deck in decks.values())
    db.session.commit()

    return {
        "total_wins": total_wins,
        "total_losses": total_losses,
    }
