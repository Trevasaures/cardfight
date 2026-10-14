from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from backend.database import db
from backend.errors import ConflictError, ValidationError, json_object
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
        raise ValidationError(f"nation must be one of: {valid}")

    return nation, NATION_OPTIONS[nation]


def _text_field(data, field_name):
    value = data.get(field_name)
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be text.")
    return value.strip()


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
    deck = db.get_or_404(Deck, deck_id)
    return jsonify(serialize_deck(deck))


@bp_decks.post("")
def create_deck():
    data = json_object(force=True)

    name = _text_field(data, "name")
    deck_type = _text_field(data, "type")
    active = bool(data.get("active", True))

    nation, nation_icon = _normalize_nation(data.get("nation"))

    if not name:
        raise ValidationError("name is required.")

    if deck_type not in VALID_DECK_TYPES:
        raise ValidationError("type must be Standard or Stride.")

    existing = Deck.query.filter(Deck.name == name).first()
    if existing:
        raise ConflictError("Deck with that name already exists.")

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
    data = json_object(force=True)
    deck = db.get_or_404(Deck, deck_id)

    if "name" in data:
        name = _text_field(data, "name")

        if not name:
            raise ValidationError("name cannot be empty.")

        duplicate = Deck.query.filter(
            Deck.id != deck_id,
            Deck.name == name,
        ).first()

        if duplicate:
            raise ConflictError("Deck with that name already exists.")

        deck.name = name

    if "type" in data:
        deck_type = _text_field(data, "type")

        if deck_type not in VALID_DECK_TYPES:
            raise ValidationError("type must be Standard or Stride.")

        deck.type = deck_type

    if "nation" in data:
        nation, nation_icon = _normalize_nation(data.get("nation"))

        deck.nation = nation
        deck.nation_icon = nation_icon

    if "active" in data:
        deck.active = bool(data["active"])

    db.session.commit()

    return jsonify(serialize_deck(deck))


@bp_decks.delete("/<int:deck_id>")
def delete_deck(deck_id: int):
    deck = db.get_or_404(Deck, deck_id)

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
        raise ConflictError(
            f"Cannot delete '{deck.name}': {ref_count} matches reference this deck. "
            "Set it inactive instead."
        )

    db.session.delete(deck)
    db.session.commit()

    return ("", 204)
