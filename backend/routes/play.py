from flask import Blueprint, jsonify, request
from backend.services.matchups import random_matchup as svc_random, fixed_matchup as svc_fixed

bp_play = Blueprint("play", __name__, url_prefix="/api")


@bp_play.get("/random")
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


@bp_play.post("/fixed")
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