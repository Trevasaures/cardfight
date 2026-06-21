from flask import Blueprint, jsonify

from backend.services.dashboard import get_dashboard_summary


bp_dashboard = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@bp_dashboard.get("")
def dashboard_route():
    return jsonify(get_dashboard_summary())