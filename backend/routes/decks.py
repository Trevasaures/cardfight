from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from backend.database import db
from backend.errors import ConflictError, ValidationError, json_object
from backend.models import Deck, Match
from backend.services.deck_builder import (
    get_deck_or_raise,
    guard_foreign_acquisition_references,
)
from backend.services.nations import NATION_ICONS
from backend.services.serializers import serialize_deck
from backend.workspace import owned_query, owner_id


bp_decks = Blueprint("decks", __name__, url_prefix="/api/decks")

VALID_DECK_TYPES = {"Standard", "Stride"}


def _normalize_nation(value):
    if value is None or value == "":
        return None, None

    nation = str(value).strip()

    if not nation:
        return None, None

    if nation not in NATION_ICONS:
        valid = ", ".join(NATION_ICONS)
        raise ValidationError(f"nation must be one of: {valid}")

    return nation, NATION_ICONS[nation]


def _text_field(data, field_name):
    value = data.get(field_name)
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be text.")
    return value.strip()


def _deck_name_exists(name, excluding_id=None):
    query = owned_query(Deck).filter_by(name=name)
    if excluding_id is not None:
        query = query.filter(Deck.id != excluding_id)
    return query.first() is not None


def _commit_deck(deck):
    name, deck_id = deck.name, deck.id
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        if _deck_name_exists(name, excluding_id=deck_id):
            raise ConflictError("Deck with that name already exists.") from exc
        raise


@bp_decks.get("")
def list_decks():
    include_inactive = request.args.get("include_inactive", "false").lower() in {
        "1",
        "true",
        "yes",
    }

    query = owned_query(Deck)

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
                    "icon_path": f"/nations/{icon}",
                }
                for nation, icon in NATION_ICONS.items()
            ],
        }
    )


@bp_decks.get("/<int:deck_id>")
def get_deck(deck_id: int):
    deck = get_deck_or_raise(deck_id)
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

    if _deck_name_exists(name):
        raise ConflictError("Deck with that name already exists.")

    deck = Deck(
        owner_account_id=owner_id(),
        name=name,
        type=deck_type,
        nation=nation,
        nation_icon=nation_icon,
        active=active,
    )

    db.session.add(deck)
    _commit_deck(deck)

    return jsonify(serialize_deck(deck)), 201


@bp_decks.patch("/<int:deck_id>")
def update_deck(deck_id: int):
    data = json_object(force=True)
    deck = get_deck_or_raise(deck_id)

    if "name" in data:
        name = _text_field(data, "name")

        if not name:
            raise ValidationError("name cannot be empty.")

        if _deck_name_exists(name, excluding_id=deck_id):
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

    _commit_deck(deck)

    return jsonify(serialize_deck(deck))


@bp_decks.delete("/<int:deck_id>")
def delete_deck(deck_id: int):
    deck = get_deck_or_raise(deck_id)

    ref_count = (
        owned_query(Match).with_entities(Match.id)
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

    guard_foreign_acquisition_references(deck_id=deck.id)
    db.session.delete(deck)
    try:
        db.session.commit()
    except IntegrityError as exc:
        raise ConflictError(
            "Cannot delete this deck while saved records reference it."
        ) from exc

    return ("", 204)
