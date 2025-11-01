"""
Service helpers for listing, updating, and deleting matches.
"""
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import or_, and_
from backend.database import db
from backend.models import Match, Deck

CT = ZoneInfo("America/Chicago")

def _validate_participants(d1: int, d2: int):
    if d1 == d2:
        raise ValueError("deck1_id and deck2_id must be different.")
    if not Deck.query.get(d1) or not Deck.query.get(d2):
        raise LookupError("One or both deck IDs do not exist.")

def list_matches(
    deck_id: int | None = None,
    fmt: str | None = None,        # 'Standard' | 'Stride' | 'Any'
    result: str | None = None,     # 'W' | 'L' | '-' (undecided), relative to deck_id if provided
    since: str | None = None,      # "YYYY-MM-DD"
    until: str | None = None,      # "YYYY-MM-DD"
    q: str | None = None           # substring search in notes
):
    qset = Match.query

    if fmt in ("Standard", "Stride", "Any"):
        qset = qset.filter(Match.format == fmt)

    if deck_id:
        qset = qset.filter(or_(Match.deck1_id == deck_id, Match.deck2_id == deck_id))
        if result in ("W", "L", "-"):
            if result == "-":
                qset = qset.filter(Match.winner_id.is_(None))
            elif result == "W":
                qset = qset.filter(Match.winner_id == deck_id)
            else:  # 'L'
                qset = qset.filter(and_(Match.winner_id.isnot(None), Match.winner_id != deck_id))

    if since:
        dt = datetime.fromisoformat(since).replace(tzinfo=CT)
        qset = qset.filter(Match.date_played >= dt)
    if until:
        dt = datetime.fromisoformat(until).replace(tzinfo=CT)
        qset = qset.filter(Match.date_played < dt)

    if q:
        qset = qset.filter(Match.notes.ilike(f"%{q}%"))

    qset = qset.order_by(Match.date_played.desc())

    rows = []
    for m in qset.all():
        d1 = Deck.query.get(m.deck1_id)
        d2 = Deck.query.get(m.deck2_id)
        rows.append({
            **m.to_dict(),
            "deck1_name": d1.name if d1 else f"#{m.deck1_id}",
            "deck2_name": d2.name if d2 else f"#{m.deck2_id}",
        })
    return rows

def get_match(match_id: int) -> dict:
    m = Match.query.get_or_404(match_id)
    d1 = Deck.query.get(m.deck1_id)
    d2 = Deck.query.get(m.deck2_id)
    return {
        **m.to_dict(),
        "deck1_name": d1.name if d1 else f"#{m.deck1_id}",
        "deck2_name": d2.name if d2 else f"#{m.deck2_id}",
    }

def update_match(match_id: int, payload: dict) -> dict:
    m = Match.query.get_or_404(match_id)

    # optional edits
    d1 = payload.get("deck1_id", m.deck1_id)
    d2 = payload.get("deck2_id", m.deck2_id)
    if d1 != m.deck1_id or d2 != m.deck2_id:
        _validate_participants(int(d1), int(d2))
        m.deck1_id, m.deck2_id = int(d1), int(d2)

    if "first_player_id" in payload:
        fp = payload["first_player_id"]
        if fp is not None and fp not in (m.deck1_id, m.deck2_id):
            raise ValueError("first_player_id must be one of the participants.")
        m.first_player_id = fp

    if "winner_id" in payload:
        w = payload["winner_id"]
        if w is not None and w not in (m.deck1_id, m.deck2_id):
            raise ValueError("winner_id must be one of the participants or null.")
        # adjust deck counters if winner changed
        _adjust_counters_on_edit(m, w)
        m.winner_id = w

    if "format" in payload:
        f = payload["format"]
        if f not in (None, "Standard", "Stride", "Any"):
            raise ValueError("format must be Standard | Stride | Any or omitted.")
        m.format = f

    if "notes" in payload:
        m.notes = (payload["notes"] or "").strip()

    if "date_played" in payload and payload["date_played"]:
        # Accept "YYYY-MM-DD HH:MM" or ISO; assume CT
        try:
            dt = datetime.fromisoformat(payload["date_played"])
        except Exception:
            raise ValueError("date_played must be ISO-like, e.g. 2025-10-31 19:30")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=CT)
        m.date_played = dt

    db.session.commit()
    return get_match(match_id)

def _adjust_counters_on_edit(m: Match, new_winner_id: int | None):
    """When winner changes, fix wins/losses on Decks."""
    old_winner = m.winner_id
    if old_winner == new_winner_id:
        return
    # revert old
    if old_winner is not None:
        if old_winner == m.deck1_id:
            Deck.query.get(m.deck1_id).wins -= 1
            Deck.query.get(m.deck2_id).losses -= 1
        else:
            Deck.query.get(m.deck2_id).wins -= 1
            Deck.query.get(m.deck1_id).losses -= 1
    # apply new
    if new_winner_id is not None:
        if new_winner_id == m.deck1_id:
            Deck.query.get(m.deck1_id).wins += 1
            Deck.query.get(m.deck2_id).losses += 1
        else:
            Deck.query.get(m.deck2_id).wins += 1
            Deck.query.get(m.deck1_id).losses += 1

def delete_match(match_id: int):
    m = Match.query.get_or_404(match_id)
    # revert counters if this match had a winner
    if m.winner_id is not None:
        if m.winner_id == m.deck1_id:
            Deck.query.get(m.deck1_id).wins -= 1
            Deck.query.get(m.deck2_id).losses -= 1
        else:
            Deck.query.get(m.deck2_id).wins -= 1
            Deck.query.get(m.deck1_id).losses -= 1
    db.session.delete(m)
    db.session.commit()