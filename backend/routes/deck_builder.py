from flask import Blueprint, jsonify, request

from backend.services.deck_builder import (
    add_card_to_deck_version,
    create_deck_version,
    delete_deck_version,
    get_deck_version_or_raise,
    list_deck_versions,
    remove_deck_card,
    update_deck_card,
    update_deck_version,
)
from backend.services.serializers import serialize_deck_card, serialize_deck_version


bp_deck_builder = Blueprint("deck_builder", __name__, url_prefix="/api")


def _json_error(message, status_code):
    return jsonify({"error": message}), status_code


@bp_deck_builder.get("/decks/<int:deck_id>/versions")
def list_deck_versions_route(deck_id):
    try:
        versions = list_deck_versions(deck_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify([serialize_deck_version(version, include_cards=False) for version in versions])


@bp_deck_builder.post("/decks/<int:deck_id>/versions")
def create_deck_version_route(deck_id):
    try:
        version = create_deck_version(deck_id, request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_deck_version(version)), 201


@bp_deck_builder.get("/deck-versions/<int:version_id>")
def get_deck_version_route(version_id):
    try:
        version = get_deck_version_or_raise(version_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify(serialize_deck_version(version))


@bp_deck_builder.patch("/deck-versions/<int:version_id>")
def update_deck_version_route(version_id):
    try:
        version = update_deck_version(version_id, request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_deck_version(version))


@bp_deck_builder.delete("/deck-versions/<int:version_id>")
def delete_deck_version_route(version_id):
    try:
        delete_deck_version(version_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify({"deleted": True, "id": version_id})


@bp_deck_builder.post("/deck-versions/<int:version_id>/cards")
def add_card_to_deck_version_route(version_id):
    try:
        entry = add_card_to_deck_version(version_id, request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_deck_card(entry)), 201


@bp_deck_builder.patch("/deck-cards/<int:deck_card_id>")
def update_deck_card_route(deck_card_id):
    try:
        entry = update_deck_card(deck_card_id, request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_deck_card(entry))


@bp_deck_builder.delete("/deck-cards/<int:deck_card_id>")
def remove_deck_card_route(deck_card_id):
    try:
        remove_deck_card(deck_card_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify({"deleted": True, "id": deck_card_id})