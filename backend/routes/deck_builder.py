from flask import Blueprint, jsonify

from backend.errors import json_object

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


@bp_deck_builder.get("/decks/<int:deck_id>/versions")
def list_deck_versions_route(deck_id):
    versions = list_deck_versions(deck_id)

    return jsonify(
        [serialize_deck_version(version, include_cards=False) for version in versions]
    )


@bp_deck_builder.post("/decks/<int:deck_id>/versions")
def create_deck_version_route(deck_id):
    version = create_deck_version(deck_id, json_object())

    return jsonify(serialize_deck_version(version)), 201


@bp_deck_builder.get("/deck-versions/<int:version_id>")
def get_deck_version_route(version_id):
    version = get_deck_version_or_raise(version_id)

    return jsonify(serialize_deck_version(version))


@bp_deck_builder.patch("/deck-versions/<int:version_id>")
def update_deck_version_route(version_id):
    version = update_deck_version(version_id, json_object())

    return jsonify(serialize_deck_version(version))


@bp_deck_builder.delete("/deck-versions/<int:version_id>")
def delete_deck_version_route(version_id):
    delete_deck_version(version_id)

    return jsonify({"deleted": True, "id": version_id})


@bp_deck_builder.post("/deck-versions/<int:version_id>/cards")
def add_card_to_deck_version_route(version_id):
    entry = add_card_to_deck_version(version_id, json_object())

    return jsonify(serialize_deck_card(entry)), 201


@bp_deck_builder.patch("/deck-cards/<int:deck_card_id>")
def update_deck_card_route(deck_card_id):
    entry = update_deck_card(deck_card_id, json_object())

    return jsonify(serialize_deck_card(entry))


@bp_deck_builder.delete("/deck-cards/<int:deck_card_id>")
def remove_deck_card_route(deck_card_id):
    remove_deck_card(deck_card_id)

    return jsonify({"deleted": True, "id": deck_card_id})
