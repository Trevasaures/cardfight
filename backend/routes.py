"""
API routes for the application.
Includes endpoints for:

- Generating random matchups
- Generating fixed matchups
"""
import random
from flask import Blueprint, jsonify, request
from backend.database import db
from backend.models import Deck, Match
from backend.services.matchups import pool_for_mode, random_matchup as svc_random, fixed_matchup as svc_fixed
from backend.services.stats import versus_for, matrix as svc_matrix

bp = Blueprint("api", __name__, url_prefix="/api")


# --- Decks ---
@bp.get("/decks")
def list_decks():
    decks = Deck.query.order_by(Deck.name).all()
    return jsonify([d.to_dict() for d in decks])


# --- Create a match result (and update W/L) ---
@bp.post("/matches")
def create_match():
    data = request.get_json(force=True, silent=True) or {}
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
        # Update W/L counters
        if winner == d1:
            deck1.wins += 1
            deck2.losses += 1
        else:
            deck2.wins += 1
            deck1.losses += 1

    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201


# --- Random matchup ---
@bp.get("/random")
def random_route():
    mode = request.args.get("mode", "any")
    try:
        d1, d2, first = svc_random(mode)
        return jsonify({
            "mode": mode,
            "deck1": d1.to_dict(),
            "deck2": d2.to_dict(),
            "first_player_id": first.id
        })
    except ValueError as e:
        return jsonify(error=str(e)), 400


# --- Fixed matchup ---
@bp.post("/fixed")
def fixed_route():
    data = request.get_json(force=True, silent=True) or {}
    try:
        d1_id = int(data.get("deck1_id"))
        d2_id = int(data.get("deck2_id"))
    except (TypeError, ValueError):
        return jsonify(error="deck1_id and deck2_id are required integers."), 400
    try:
        d1, d2, first = svc_fixed(d1_id, d2_id)
        return jsonify({
            "deck1": d1.to_dict(),
            "deck2": d2.to_dict(),
            "first_player_id": first.id
        })
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except LookupError as e:
        return jsonify(error=str(e)), 404


# --- Versus / H2H for a deck ---
@bp.get("/stats/versus/<int:deck_id>")
def versus_route(deck_id: int):
    return jsonify(versus_for(deck_id))


# --- Win-rate matrix ---
@bp.get("/stats/matrix")
def matrix_route():
    return jsonify(svc_matrix())
