from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from backend.database import db
from backend.models import Deck, Match
from backend.services.serializers import serialize_deck


bp_decks = Blueprint("decks", __name__, url_prefix="/api/decks")

VALID_DECK_TYPES = {"Standard", "Stride"}

NATION_OPTIONS = {
    None: None,
    "": None,
    "Dragon Empire": "dragon_empire.png",
    "Dark States": "dark_states.png",
    "Brandt Gate": "brandt_gate.png",
    "Keter Sanctuary": "keter_sanctuary.png",
    "Stoicheia": "stoicheia.png",
}


def _normalize_nation(value):
    if value is None or value == "":
        return None, None

    nation = str(value).strip()

    if nation not in NATION_OPTIONS:
        valid = ", ".join([item for item in NATION_OPTIONS.keys() if item])
        raise ValueError(f"nation must be one of: {valid}")

    return nation, NATION_OPTIONS[nation]


@bp_decks.get("")
def list_decks():
    include_inactive = request.args.get("include_inactive", "false").lower() in {
        "1",
        "true",
        "yes",
    }

    query = Deck.query

    if not include_inactive:
        query = query.filter_by(active=True)

    decks = query.order_by(Deck.name).all()

    return jsonify([serialize_deck(deck) for deck in decks])


@bp_decks.get("/options")
def deck_options():
    return jsonify(
        {
            "types": sorted(VALID_DECK_TYPES),
            "nations": [
                {
                    "name": nation,
                    "icon": icon,
                    "icon_path": f"/nations/{icon}" if icon else None,
                }
                for nation, icon in NATION_OPTIONS.items()
                if nation
            ],
        }
    )


@bp_decks.get("/<int:deck_id>")
def get_deck(deck_id: int):
    deck = Deck.query.get_or_404(deck_id)
    return jsonify(serialize_deck(deck))


@bp_decks.post("")
def create_deck():
    data = request.get_json(force=True, silent=True) or {}

    name = (data.get("name") or "").strip()
    deck_type = (data.get("type") or "").strip()
    active = bool(data.get("active", True))

    try:
        nation, nation_icon = _normalize_nation(data.get("nation"))
    except ValueError as e:
        return jsonify(error=str(e)), 400

    if not name:
        return jsonify(error="name is required."), 400

    if deck_type not in VALID_DECK_TYPES:
        return jsonify(error="type must be Standard or Stride."), 400

    existing = Deck.query.filter(Deck.name == name).first()
    if existing:
        return jsonify(error="Deck with that name already exists."), 409

    deck = Deck(
        name=name,
        type=deck_type,
        nation=nation,
        nation_icon=nation_icon,
        active=active,
    )

    db.session.add(deck)
    db.session.commit()

    return jsonify(serialize_deck(deck)), 201


@bp_decks.patch("/<int:deck_id>")
def update_deck(deck_id: int):
    data = request.get_json(force=True, silent=True) or {}
    deck = Deck.query.get_or_404(deck_id)

    if "name" in data:
        name = (data.get("name") or "").strip()

        if not name:
            return jsonify(error="name cannot be empty."), 400

        duplicate = Deck.query.filter(
            Deck.id != deck_id,
            Deck.name == name,
        ).first()

        if duplicate:
            return jsonify(error="Deck with that name already exists."), 409

        deck.name = name

    if "type" in data:
        deck_type = (data.get("type") or "").strip()

        if deck_type not in VALID_DECK_TYPES:
            return jsonify(error="type must be Standard or Stride."), 400

        deck.type = deck_type

    if "nation" in data:
        try:
            nation, nation_icon = _normalize_nation(data.get("nation"))
        except ValueError as e:
            return jsonify(error=str(e)), 400

        deck.nation = nation
        deck.nation_icon = nation_icon

    if "active" in data:
        deck.active = bool(data["active"])

    db.session.commit()

    return jsonify(serialize_deck(deck))


@bp_decks.delete("/<int:deck_id>")
def delete_deck(deck_id: int):
    deck = Deck.query.get_or_404(deck_id)

    ref_count = (
        db.session.query(Match.id)
        .filter(
            or_(
                Match.deck1_id == deck_id,
                Match.deck2_id == deck_id,
            )
        )
        .count()
    )

    if ref_count > 0:
        return jsonify(
            error=(
                f"Cannot delete '{deck.name}': {ref_count} matches reference this deck. "
                "Set it inactive instead."
            )
        ), 409

    db.session.delete(deck)
    db.session.commit()

    return ("", 204)