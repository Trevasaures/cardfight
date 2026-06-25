from flask import Blueprint, jsonify, request

from backend.services.cards import (
    add_card_printing,
    create_card,
    get_card_or_raise,
    search_cards,
    update_card,
)
from backend.services.serializers import serialize_card, serialize_card_printing


bp_cards = Blueprint("cards", __name__, url_prefix="/api/cards")


def _json_error(message, status_code):
    return jsonify({"error": message}), status_code


@bp_cards.get("")
@bp_cards.get("/")
@bp_cards.get("/search")
def search_cards_route():
    cards = search_cards(
        q=request.args.get("q"),
        nation=request.args.get("nation"),
        grade=request.args.get("grade"),
        card_type=request.args.get("card_type"),
        limit=request.args.get("limit", 50),
    )

    return jsonify([serialize_card(card, include_printings=True) for card in cards])


@bp_cards.post("")
@bp_cards.post("/")
def create_card_route():
    try:
        card = create_card(request.get_json(silent=True) or {})
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card(card)), 201


@bp_cards.get("/<int:card_id>")
def get_card_route(card_id):
    try:
        card = get_card_or_raise(card_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify(serialize_card(card))


@bp_cards.patch("/<int:card_id>")
def update_card_route(card_id):
    try:
        card = update_card(card_id, request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card(card))


@bp_cards.post("/<int:card_id>/printings")
def add_card_printing_route(card_id):
    try:
        printing = add_card_printing(card_id, request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card_printing(printing)), 201