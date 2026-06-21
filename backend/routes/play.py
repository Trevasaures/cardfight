from flask import Blueprint, jsonify, request

from backend.models import Deck
from backend.services.serializers import serialize_deck


bp_play = Blueprint("play", __name__, url_prefix="/api/play")


@bp_play.get("/random")
def random_matchup():
    """
    Return two random active decks.

    Optional query params:
    - format=Standard
    - format=Stride
    - format=Any
    """
    fmt = request.args.get("format", "Any")

    query = Deck.query.filter_by(active=True)

    if fmt in ("Standard", "Stride"):
        query = query.filter(Deck.type == fmt)
    elif fmt not in ("Any", "", None):
        return jsonify(error="format must be Standard, Stride, or Any."), 400

    decks = query.all()

    if len(decks) < 2:
        return jsonify(error="At least two active decks are required for a random matchup."), 400

    import random

    deck1, deck2 = random.sample(decks, 2)
    first_player = random.choice([deck1, deck2])

    return jsonify(
        {
            "deck1": serialize_deck(deck1),
            "deck2": serialize_deck(deck2),
            "first_player": serialize_deck(first_player),
            "format": fmt,
        }
    )