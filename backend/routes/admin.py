from flask import Blueprint, jsonify
from backend.services.admin import recount_deck_records

bp_admin = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp_admin.route("/recount", methods=["POST", "GET"])
def admin_recount():
    summary = recount_deck_records()
    return jsonify({"status": "ok", **summary}), 200