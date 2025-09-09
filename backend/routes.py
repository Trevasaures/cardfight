"""
API routes for the application.
Includes endpoints for:

- Random matchups
- Deck management (list, create, delete)
- Match management (list, create)
- Statistics"""
import random
from flask import Blueprint, jsonify, request
from backend.database import db
from backend.models import Deck, Match

bp = Blueprint("api", __name__, url_prefix="/api")


# helper to filter decks by mode
def _pool_for_mode(mode: str):
    mode = (mode or "any").lower()
    if mode == "standard":
        return Deck.query.filter_by(type="Standard").all()
    elif mode == "stride":
        return Deck.query.filter_by(type="Stride").all()
    else:
        return Deck.query.all()


# --- Random matchup ---
@bp.get("/random")
def random_matchup():
    mode = request.args.get("mode", "any")
    pool = _pool_for_mode(mode)

    if len(pool) < 2:
        return jsonify(error=f"Not enough decks for mode='{mode}'."), 400

    d1, d2 = random.sample(pool, 2)
    first = random.choice([d1, d2])

    return jsonify({
        "mode": mode,
        "deck1": d1.to_dict(),
        "deck2": d2.to_dict(),
        "first_player_id": first.id
    })


# --- Decks ---
@bp.get("/decks")
def list_decks():
    decks = Deck.query.order_by(Deck.name).all()
    return jsonify([d.to_dict() for d in decks])

@bp.post("/decks")
def create_deck():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    dtype = (data.get("type") or "").strip()  # "Standard" | "Stride"

    if not name or dtype not in ("Standard", "Stride"):
        return jsonify(error="Provide 'name' and 'type' as 'Standard' or 'Stride'."), 400

    if Deck.query.filter_by(name=name).first():
        return jsonify(error="Deck with that name already exists."), 409

    deck = Deck(name=name, type=dtype)
    db.session.add(deck)
    db.session.commit()
    return jsonify(deck.to_dict()), 201

@bp.delete("/decks/<int:deck_id>")
def delete_deck(deck_id: int):
    deck = Deck.query.get_or_404(deck_id)
    db.session.delete(deck)
    db.session.commit()
    return ("", 204)


# --- Matches ---
@bp.get("/matches")
def list_matches():
    matches = Match.query.order_by(Match.date_played.desc()).limit(200).all()
    return jsonify([m.to_dict() for m in matches])

@bp.post("/matches")
def create_match():
    data = request.get_json(force=True, silent=True) or {}
    try:
        d1 = int(data.get("deck1_id"))
        d2 = int(data.get("deck2_id"))
    except (TypeError, ValueError):
        return jsonify(error="deck1_id and deck2_id are required integers."), 400

    if d1 == d2:
        return jsonify(error="deck1_id and deck2_id must be different."), 400

    deck1 = Deck.query.get(d1)
    deck2 = Deck.query.get(d2)
    if not deck1 or not deck2:
        return jsonify(error="One or both deck IDs do not exist."), 404

    winner = data.get("winner_id")
    notes = (data.get("notes") or "").strip()

    m = Match(deck1_id=d1, deck2_id=d2, notes=notes)

    if winner is not None:
        try:
            winner = int(winner)
        except (TypeError, ValueError):
            return jsonify(error="winner_id must be an integer or omitted."), 400

        if winner not in (d1, d2):
            return jsonify(error="winner_id must be either deck1_id or deck2_id."), 400

        m.winner_id = winner
        win_deck = deck1 if winner == d1 else deck2
        lose_deck = deck2 if winner == d1 else deck1
        win_deck.wins += 1
        lose_deck.losses += 1

    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201


# --- Stats ---
@bp.get("/stats")
def stats():
    decks = Deck.query.order_by(Deck.name).all()
    return jsonify([d.to_dict() for d in decks])
