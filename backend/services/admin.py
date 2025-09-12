"""
Admin-related services.
Mainly for recounting deck records from matches.
"""
from backend.database import db
from backend.models import Deck, Match

def recount_deck_records() -> dict:
    # zero everything
    for d in Deck.query.all():
        d.wins = 0
        d.losses = 0

    # recompute from matches
    for m in Match.query.all():
        if m.winner_id is None:
            continue
        if m.winner_id == m.deck1_id:
            winner = Deck.query.get(m.deck1_id)
            loser  = Deck.query.get(m.deck2_id)
        elif m.winner_id == m.deck2_id:
            winner = Deck.query.get(m.deck2_id)
            loser  = Deck.query.get(m.deck1_id)
        else:
            # defensive: winner not one of participants; skip
            continue

        if winner:
            winner.wins += 1
        if loser:
            loser.losses += 1

    db.session.commit()

    # return a tiny summary
    total_wins = sum(d.wins for d in Deck.query.all())
    total_losses = sum(d.losses for d in Deck.query.all())
    return {"total_wins": total_wins, "total_losses": total_losses}