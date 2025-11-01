from flask import Blueprint, jsonify
from backend.services.stats import versus_for, matrix as svc_matrix

bp_stats = Blueprint("stats", __name__, url_prefix="/api/stats")


@bp_stats.get("/versus/<int:deck_id>")
def versus_route(deck_id: int):
    return jsonify(versus_for(deck_id))


@bp_stats.get("/matrix")
def matrix_route():
    return jsonify(svc_matrix())