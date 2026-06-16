"""
Shared API serializers.

These helpers keep route/service responses consistent so the frontend does not
need to duplicate a bunch of formatting and relationship logic.
"""

from __future__ import annotations

from backend.models import Deck, Match


def serialize_deck(deck: Deck | None) -> dict | None:
    if deck is None:
        return None

    wins = int(deck.wins or 0)
    losses = int(deck.losses or 0)
    decided_games = wins + losses
    win_pct = (wins / decided_games) if decided_games else 0.0

    return {
        "id": deck.id,
        "name": deck.name,
        "type": deck.type,
        "wins": wins,
        "losses": losses,
        "games": decided_games,
        "decided_games": decided_games,
        "win_pct": round(win_pct, 3),
        "active": bool(deck.active),
        "created_at": deck.created_at.isoformat() if deck.created_at else None,
    }


def serialize_match(match: Match) -> dict:
    deck1 = match.deck1
    deck2 = match.deck2

    winner = None
    if match.winner_id == match.deck1_id:
        winner = deck1
    elif match.winner_id == match.deck2_id:
        winner = deck2

    first_player = None
    if match.first_player_id == match.deck1_id:
        first_player = deck1
    elif match.first_player_id == match.deck2_id:
        first_player = deck2

    if match.winner_id is None:
        result_status = "undecided"
    elif match.winner_id in (match.deck1_id, match.deck2_id):
        result_status = "decided"
    else:
        result_status = "invalid"

    return {
        "id": match.id,
        "deck1_id": match.deck1_id,
        "deck2_id": match.deck2_id,
        "winner_id": match.winner_id,
        "first_player_id": match.first_player_id,
        "format": match.format,
        "date_played": match.date_played.strftime("%m/%d/%Y %I:%M %p") if match.date_played else None,
        "date_played_iso": match.date_played.isoformat() if match.date_played else None,
        "notes": match.notes or "",

        "deck1": serialize_deck(deck1),
        "deck2": serialize_deck(deck2),
        "winner": serialize_deck(winner),
        "first_player": serialize_deck(first_player),

        # Compatibility fields for current Streamlit pages.
        "deck1_name": deck1.name if deck1 else f"#{match.deck1_id}",
        "deck2_name": deck2.name if deck2 else f"#{match.deck2_id}",
        "winner_name": winner.name if winner else None,
        "first_player_name": first_player.name if first_player else None,

        # Frontend-friendly status.
        "result_status": result_status,
        "is_decided": match.winner_id is not None,
        "is_undecided": match.winner_id is None,
    }