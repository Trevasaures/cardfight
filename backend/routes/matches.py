from flask import Blueprint, jsonify, request
from backend.services.matches import (
    list_matches as svc_list_matches,
    get_match as svc_get_match,
    update_match as svc_update_match,
    delete_match as svc_delete_match,
)
from backend.database import db
from backend.models import Deck, Match

bp_matches = Blueprint("matches", __name__, url_prefix="/api/matches")


@bp_matches.get("")
def list_matches_route():
    deck_id = request.args.get("deck_id", type=int)
    fmt = request.args.get("format")          # 'Standard' | 'Stride' | 'Any'
    result = request.args.get("result")       # 'W' | 'L' | '-'
    since = request.args.get("since")         # 'YYYY-MM-DD'
    until = request.args.get("until")         # 'YYYY-MM-DD'
    q      = request.args.get("q")            # search notes
    rows = svc_list_matches(deck_id=deck_id, fmt=fmt, result=result, since=since, until=until, q=q)
    return jsonify(rows)


@bp_matches.get("/<int:match_id>")
def get_match_route(match_id: int):
    return jsonify(svc_get_match(match_id))


@bp_matches.patch("/<int:match_id>")
def update_match_route(match_id: int):
    data = request.get_json(force=True, silent=True) or {}
    try:
        row = svc_update_match(match_id, data)
        return jsonify(row)
    except (ValueError, LookupError) as e:
        return jsonify(error=str(e)), 400


@bp_matches.delete("/<int:match_id>")
def delete_match_route(match_id: int):
    svc_delete_match(match_id)
    return ("", 204)


@bp_matches.post("")
def create_match_route():
    data = request.get_json(force=True, silent=True) or {}
    # Inline create mirrors your current logic, relying on counters at write-time.
    try:
        d1 = int(data["deck1_id"])
        d2 = int(data["deck2_id"])
    except Exception:
        return jsonify(error="deck1_id and deck2_id are required integers."), 400

    if d1 == d2:
        return jsonify(error="deck1_id and deck2_id must be different."), 400

    deck1 = Deck.query.get(d1)
    deck2 = Deck.query.get(d2)
    if not deck1 or not deck2:
        return jsonify(error="One or both deck IDs do not exist."), 404

    winner = data.get("winner_id")
    notes = (data.get("notes") or "").strip()
    first_player_id = data.get("first_player_id")
    fmt = data.get("format")

    m = Match(
        deck1_id=d1,
        deck2_id=d2,
        notes=notes,
        first_player_id=first_player_id,
        format=fmt,
    )

    if winner is not None:
        try:
            winner = int(winner)
        except Exception:
            return jsonify(error="winner_id must be an integer or omitted."), 400
        if winner not in (d1, d2):
            return jsonify(error="winner_id must be either deck1_id or deck2_id."), 400
        m.winner_id = winner
        if winner == d1:
            deck1.wins += 1
            deck2.losses += 1
        else:
            deck2.wins += 1
            deck1.losses += 1

    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201