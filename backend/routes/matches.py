from flask import Blueprint, jsonify, request

from backend.database import db
from backend.models import Deck, Match
from backend.services.matches import (
    list_matches as svc_list_matches,
    get_match as svc_get_match,
    update_match as svc_update_match,
    delete_match as svc_delete_match,
)


bp_matches = Blueprint("matches", __name__, url_prefix="/api/matches")

VALID_MATCH_FORMATS = {None, "Standard", "Stride", "Any"}


def _optional_int(value, field_name: str) -> int | None:
    """
    Convert an optional JSON field to int.

    Accepts:
    - None
    - ""
    - valid integer-looking values

    Returns:
    - int
    - None

    Raises:
    - ValueError
    """
    if value is None or value == "":
        return None

    try:
        return int(value)
    except Exception as exc:
        raise ValueError(f"{field_name} must be an integer or omitted.") from exc


def _normalize_format(value) -> str | None:
    """
    Normalize match format.

    Accepts:
    - None
    - ""
    - "Standard"
    - "Stride"
    - "Any"
    """
    if value is None or value == "":
        return None

    value = str(value).strip()

    if value not in VALID_MATCH_FORMATS:
        raise ValueError("format must be Standard, Stride, Any, or omitted.")

    return value


@bp_matches.get("")
def list_matches_route():
    deck_id = request.args.get("deck_id", type=int)
    fmt = request.args.get("format")          # Standard | Stride | Any
    result = request.args.get("result")       # W | L | -
    since = request.args.get("since")         # YYYY-MM-DD
    until = request.args.get("until")         # YYYY-MM-DD
    q = request.args.get("q")                 # search notes

    rows = svc_list_matches(
        deck_id=deck_id,
        fmt=fmt,
        result=result,
        since=since,
        until=until,
        q=q,
    )

    return jsonify(rows)


@bp_matches.get("/<int:match_id>")
def get_match_route(match_id: int):
    return jsonify(svc_get_match(match_id))


@bp_matches.post("")
def create_match_route():
    data = request.get_json(force=True, silent=True) or {}

    try:
        deck1_id = int(data["deck1_id"])
        deck2_id = int(data["deck2_id"])
    except Exception:
        return jsonify(error="deck1_id and deck2_id are required integers."), 400

    if deck1_id == deck2_id:
        return jsonify(error="deck1_id and deck2_id must be different."), 400

    deck1 = Deck.query.get(deck1_id)
    deck2 = Deck.query.get(deck2_id)

    if not deck1 or not deck2:
        return jsonify(error="One or both deck IDs do not exist."), 404

    try:
        winner_id = _optional_int(data.get("winner_id"), "winner_id")
        first_player_id = _optional_int(data.get("first_player_id"), "first_player_id")
        match_format = _normalize_format(data.get("format"))
    except ValueError as e:
        return jsonify(error=str(e)), 400

    if winner_id is not None and winner_id not in (deck1_id, deck2_id):
        return jsonify(error="winner_id must be either deck1_id or deck2_id."), 400

    if first_player_id is not None and first_player_id not in (deck1_id, deck2_id):
        return jsonify(error="first_player_id must be either deck1_id or deck2_id."), 400

    notes = (data.get("notes") or "").strip()

    match = Match(
        deck1_id=deck1_id,
        deck2_id=deck2_id,
        winner_id=winner_id,
        first_player_id=first_player_id,
        format=match_format,
        notes=notes,
    )

    # Keep existing counter behavior for now.
    # Later, we can make Match history the only source of truth.
    if winner_id is not None:
        if winner_id == deck1_id:
            deck1.wins += 1
            deck2.losses += 1
        else:
            deck2.wins += 1
            deck1.losses += 1

    db.session.add(match)
    db.session.commit()

    return jsonify(match.to_dict()), 201


@bp_matches.patch("/<int:match_id>")
def update_match_route(match_id: int):
    data = request.get_json(force=True, silent=True) or {}

    try:
        row = svc_update_match(match_id, data)
        return jsonify(row)
    except LookupError as e:
        return jsonify(error=str(e)), 404
    except ValueError as e:
        return jsonify(error=str(e)), 400


@bp_matches.delete("/<int:match_id>")
def delete_match_route(match_id: int):
    svc_delete_match(match_id)
    return ("", 204)