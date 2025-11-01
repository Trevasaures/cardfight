from flask import Blueprint, jsonify, request
from backend.database import db
from backend.models import Deck, Match
from sqlalchemy import or_

bp_decks = Blueprint("decks", __name__, url_prefix="/api/decks")


@bp_decks.get("")
def list_decks():
    include_inactive = request.args.get("include_inactive", "false").lower() in ("1", "true", "yes")
    q = Deck.query
    if not include_inactive:
        q = q.filter_by(active=True)
    decks = q.order_by(Deck.name).all()
    return jsonify([d.to_dict() for d in decks])


@bp_decks.post("")
def create_deck():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    dtype = (data.get("type") or "").strip()
    if not name or dtype not in ("Standard", "Stride"):
        return jsonify(error="Provide 'name' and 'type' as 'Standard' or 'Stride'."), 400
    if Deck.query.filter_by(name=name).first():
        return jsonify(error="Deck with that name already exists"), 409
    deck = Deck(name=name, type=dtype, active=bool(data.get("active", True)))
    db.session.add(deck)
    db.session.commit()
    return jsonify(deck.to_dict()), 201


@bp_decks.patch("/<int:deck_id>")
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


@bp_decks.delete("/<int:deck_id>")
def delete_deck(deck_id: int):
    deck = Deck.query.get_or_404(deck_id)
    ref_count = db.session.query(Match.id).filter(
        or_(Match.deck1_id == deck_id, Match.deck2_id == deck_id)
    ).count()
    if ref_count > 0:
        return jsonify(error=f"Cannot delete '{deck.name}': {ref_count} matches reference this deck. Set it inactive instead."), 409
    db.session.delete(deck)
    db.session.commit()
    return ("", 204)