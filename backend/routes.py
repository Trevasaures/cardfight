"""
API routes for the application.
Includes endpoints for:

- Generating random matchups
- Generating fixed matchups
"""
from flask import Blueprint, jsonify, request
from backend.database import db
from backend.models import Deck, Match
from backend.services.matchups import random_matchup as svc_random, fixed_matchup as svc_fixed
from backend.services.stats import versus_for, matrix as svc_matrix

bp = Blueprint("api", __name__, url_prefix="/api")


# --- Decks ---
@bp.get("/decks")
def list_decks():
    include_inactive = request.args.get("include_inactive", "false").lower() in ("1","true","yes")
    q = Deck.query
    if not include_inactive:
        q = q.filter_by(active=True)
    decks = q.order_by(Deck.name).all()
    return jsonify([d.to_dict() for d in decks])


# --- Create a match result ---
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
    

# --- Create a deck ---
@bp.post("/decks")
def create_deck():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    dtype = (data.get("type") or "").strip()

    if not name or dtype not in ("Standard", "Stride"):
        return jsonify(error="Provide 'name' and 'type' as 'Standard' or 'Stride'."), 400
    if Deck.query.filter_by(name=name).first():
        return jsonify(error="Deck with that name already exists."), 409

    deck = Deck(name=name, type=dtype, active=bool(data.get("active", True)))
    db.session.add(deck)
    db.session.commit()
    return jsonify(deck.to_dict()), 201


# --- Update a deck ---
@bp.patch("/decks/<int:deck_id>")
def update_deck(deck_id: int):
    data = request.get_json(force=True, silent=True) or {}
    deck = Deck.query.get_or_404(deck_id)

    if "active" in data:
        deck.active = bool(data["active"])
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify(error="name cannot be empty"), 400
        if Deck.query.filter(Deck.id != deck_id, Deck.name == name).first():
            return jsonify(error="deck name already exists"), 409
        deck.name = name

    db.session.commit()
    return jsonify(deck.to_dict())


# --- Delete a deck (safe) ---
@bp.delete("/decks/<int:deck_id>")
def delete_deck_route(deck_id: int):
    deck = Deck.query.get_or_404(deck_id)

    from sqlalchemy import or_
    ref_count = db.session.query(Match.id).filter(
        or_(Match.deck1_id == deck_id, Match.deck2_id == deck_id)
    ).count()

    if ref_count > 0:
        return jsonify(error=f"Cannot delete '{deck.name}': {ref_count} matches reference this deck. "
                             f"Set it inactive instead."), 409

    db.session.delete(deck)
    db.session.commit()
    return ("", 204)


# --- Versus / H2H for a deck ---
@bp.get("/stats/versus/<int:deck_id>")
def versus_route(deck_id: int):
    return jsonify(versus_for(deck_id))


# --- Win-rate matrix ---
@bp.get("/stats/matrix")
def matrix_route():
    return jsonify(svc_matrix())
