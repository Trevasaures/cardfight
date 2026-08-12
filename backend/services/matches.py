"""
Service helpers for creating, listing, updating, and deleting matches.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_
from sqlalchemy.orm import aliased

from backend.database import db
from backend.models import Deck, DeckVersion, Match
from backend.services.serializers import serialize_match


CT = ZoneInfo("America/Chicago")
VALID_MATCH_FORMATS = {None, "Standard", "Stride", "Any"}


def create_match(payload: dict) -> dict:
    deck1_id = _required_int(payload.get("deck1_id"), "deck1_id")
    deck2_id = _required_int(payload.get("deck2_id"), "deck2_id")

    _validate_participants(deck1_id, deck2_id)

    winner_id = _optional_int(payload.get("winner_id"), "winner_id")
    first_player_id = _optional_int(payload.get("first_player_id"), "first_player_id")
    match_format = _normalize_format(payload.get("format"))
    date_played = _parse_date(payload.get("date_played"))
    notes = (payload.get("notes") or "").strip()

    _validate_optional_participant(winner_id, deck1_id, deck2_id, "winner_id")
    _validate_optional_participant(first_player_id, deck1_id, deck2_id, "first_player_id")

    deck1_version_id = _match_version_id(payload, "deck1_version_id", deck1_id)
    deck2_version_id = _match_version_id(payload, "deck2_version_id", deck2_id)

    match = Match(
        deck1_id=deck1_id,
        deck2_id=deck2_id,
        deck1_version_id=deck1_version_id,
        deck2_version_id=deck2_version_id,
        winner_id=winner_id,
        first_player_id=first_player_id,
        format=match_format,
        notes=notes,
    )

    if date_played is not None:
        match.date_played = date_played

    db.session.add(match)

    if winner_id is not None:
        _apply_winner_counter(deck1_id, deck2_id, winner_id)

    db.session.commit()

    return get_match(match.id)


def _match_version_id(payload: dict, field_name: str, deck_id: int) -> int | None:
    if field_name in payload:
        version_id = _optional_int(payload.get(field_name), field_name)
        if version_id is None:
            return None

        version = db.session.get(DeckVersion, version_id)
        if not version:
            raise ValueError(f"{field_name} does not reference an existing deck version.")
        if version.deck_id != deck_id:
            raise ValueError(f"{field_name} must belong to its selected deck.")
        return version.id

    active_version = (
        DeckVersion.query.filter_by(deck_id=deck_id, is_active=True)
        .order_by(DeckVersion.updated_at.desc(), DeckVersion.id.desc())
        .first()
    )
    return active_version.id if active_version else None


def list_matches(
    deck_id: int | None = None,
    fmt: str | None = None,
    result: str | None = None,
    since: str | None = None,
    until: str | None = None,
    q: str | None = None,
    limit: int | None = None,
    page: int | None = None,
    page_size: int | None = None,
):
    query = Match.query
    normalized_result = str(result or "").strip().lower()

    if fmt in ("Standard", "Stride", "Any"):
        query = query.filter(Match.format == fmt)

    if deck_id:
        query = query.filter(
            or_(
                Match.deck1_id == deck_id,
                Match.deck2_id == deck_id,
            )
        )

        if normalized_result in ("w", "l", "-"):
            if normalized_result == "-":
                query = query.filter(Match.winner_id.is_(None))
            elif normalized_result == "w":
                query = query.filter(Match.winner_id == deck_id)
            else:
                query = query.filter(
                    and_(
                        Match.winner_id.isnot(None),
                        Match.winner_id != deck_id,
                    )
                )

    if normalized_result == "decided":
        query = query.filter(
            or_(
                Match.winner_id == Match.deck1_id,
                Match.winner_id == Match.deck2_id,
            )
        )
    elif normalized_result == "undecided":
        query = query.filter(Match.winner_id.is_(None))

    if since:
        query = query.filter(Match.date_played >= _parse_date_required(since, "since"))

    if until:
        until_dt = _parse_date_required(until, "until")

        # Treat date-only until as inclusive by adding one day.
        if "T" not in until and " " not in until:
            until_dt = until_dt + timedelta(days=1)

        query = query.filter(Match.date_played < until_dt)

    search_term = str(q or "").strip()
    if search_term:
        deck1 = aliased(Deck)
        deck2 = aliased(Deck)
        pattern = f"%{search_term}%"
        query = (
            query.join(deck1, Match.deck1_id == deck1.id)
            .join(deck2, Match.deck2_id == deck2.id)
            .filter(
                or_(
                    Match.notes.ilike(pattern),
                    deck1.name.ilike(pattern),
                    deck2.name.ilike(pattern),
                )
            )
        )

    query = query.order_by(Match.date_played.desc())

    if page is not None or page_size is not None:
        page = max(1, int(page or 1))
        page_size = max(1, min(int(page_size or 12), 100))

        total_items = query.count()
        total_pages = (total_items + page_size - 1) // page_size if total_items else 1

        if page > total_pages:
            page = total_pages

        rows = (
            query
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return {
            "items": [serialize_match(match) for match in rows],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total_items,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        }

    if limit:
        query = query.limit(limit)

    return [serialize_match(match) for match in query.all()]


def get_match(match_id: int) -> dict:
    match = db.get_or_404(Match, match_id)
    return serialize_match(match)


def update_match(match_id: int, payload: dict) -> dict:
    match = db.get_or_404(Match, match_id)

    new_deck1_id = _optional_int(payload.get("deck1_id"), "deck1_id") if "deck1_id" in payload else match.deck1_id
    new_deck2_id = _optional_int(payload.get("deck2_id"), "deck2_id") if "deck2_id" in payload else match.deck2_id

    if new_deck1_id is None or new_deck2_id is None:
        raise ValueError("deck1_id and deck2_id cannot be null.")

    _validate_participants(new_deck1_id, new_deck2_id)

    new_winner_id = (
        _optional_int(payload.get("winner_id"), "winner_id")
        if "winner_id" in payload
        else match.winner_id
    )

    new_first_player_id = (
        _optional_int(payload.get("first_player_id"), "first_player_id")
        if "first_player_id" in payload
        else match.first_player_id
    )

    new_format = (
        _normalize_format(payload.get("format"))
        if "format" in payload
        else match.format
    )

    _validate_optional_participant(new_winner_id, new_deck1_id, new_deck2_id, "winner_id")
    _validate_optional_participant(new_first_player_id, new_deck1_id, new_deck2_id, "first_player_id")

    # Revert the old winner from the old participants, then apply the new winner
    # against the new participants. This handles edits to participants and winner.
    _revert_winner_counter(match.deck1_id, match.deck2_id, match.winner_id)

    match.deck1_id = new_deck1_id
    match.deck2_id = new_deck2_id
    match.winner_id = new_winner_id
    match.first_player_id = new_first_player_id
    match.format = new_format

    if "notes" in payload:
        match.notes = (payload.get("notes") or "").strip()

    if "date_played" in payload:
        parsed_date = _parse_date(payload.get("date_played"))
        if parsed_date is not None:
            match.date_played = parsed_date

    _apply_winner_counter(match.deck1_id, match.deck2_id, match.winner_id)

    db.session.commit()

    return get_match(match.id)


def delete_match(match_id: int):
    match = db.get_or_404(Match, match_id)

    _revert_winner_counter(match.deck1_id, match.deck2_id, match.winner_id)

    db.session.delete(match)
    db.session.commit()


def _required_int(value, field_name: str) -> int:
    if value is None or value == "":
        raise ValueError(f"{field_name} is required.")

    try:
        return int(value)
    except Exception as exc:
        raise ValueError(f"{field_name} must be an integer.") from exc


def _optional_int(value, field_name: str) -> int | None:
    if value is None or value == "":
        return None

    try:
        return int(value)
    except Exception as exc:
        raise ValueError(f"{field_name} must be an integer or null.") from exc


def _normalize_format(value) -> str | None:
    if value is None or value == "":
        return None

    normalized = str(value).strip()

    if normalized not in VALID_MATCH_FORMATS:
        raise ValueError("format must be Standard, Stride, Any, or null.")

    return normalized


def _parse_date(value) -> datetime | None:
    if value is None or value == "":
        return None

    return _parse_date_required(value, "date_played")


def _parse_date_required(value, field_name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value))
    except Exception as exc:
        raise ValueError(f"{field_name} must be ISO-like, e.g. 2026-06-09 or 2026-06-09T19:30:00.") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=CT)

    return parsed


def _validate_participants(deck1_id: int, deck2_id: int):
    if deck1_id == deck2_id:
        raise ValueError("deck1_id and deck2_id must be different.")

    deck1_exists = db.session.get(Deck, deck1_id) is not None
    deck2_exists = db.session.get(Deck, deck2_id) is not None

    if not deck1_exists or not deck2_exists:
        raise LookupError("One or both deck IDs do not exist.")


def _validate_optional_participant(value: int | None, deck1_id: int, deck2_id: int, field_name: str):
    if value is None:
        return

    if value not in (deck1_id, deck2_id):
        raise ValueError(f"{field_name} must be either deck1_id or deck2_id.")


def _apply_winner_counter(deck1_id: int, deck2_id: int, winner_id: int | None):
    if winner_id is None:
        return

    deck1 = db.session.get(Deck, deck1_id)
    deck2 = db.session.get(Deck, deck2_id)

    if not deck1 or not deck2:
        return

    if winner_id == deck1_id:
        deck1.wins += 1
        deck2.losses += 1
    elif winner_id == deck2_id:
        deck2.wins += 1
        deck1.losses += 1


def _revert_winner_counter(deck1_id: int, deck2_id: int, winner_id: int | None):
    if winner_id is None:
        return

    deck1 = db.session.get(Deck, deck1_id)
    deck2 = db.session.get(Deck, deck2_id)

    if not deck1 or not deck2:
        return

    if winner_id == deck1_id:
        deck1.wins = max(0, deck1.wins - 1)
        deck2.losses = max(0, deck2.losses - 1)
    elif winner_id == deck2_id:
        deck2.wins = max(0, deck2.wins - 1)
        deck1.losses = max(0, deck1.losses - 1)
