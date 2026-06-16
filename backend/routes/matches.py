from flask import Blueprint, jsonify, request

from backend.services.matches import (
    create_match as svc_create_match,
    list_matches as svc_list_matches,
    get_match as svc_get_match,
    update_match as svc_update_match,
    delete_match as svc_delete_match,
)


bp_matches = Blueprint("matches", __name__, url_prefix="/api/matches")


@bp_matches.get("")
def list_matches_route():
    deck_id = request.args.get("deck_id", type=int)
    fmt = request.args.get("format")
    result = request.args.get("result")
    since = request.args.get("since")
    until = request.args.get("until")
    q = request.args.get("q")
    limit = request.args.get("limit", type=int)
    page = request.args.get("page", type=int)
    page_size = request.args.get("page_size", type=int)

    try:
        rows = svc_list_matches(
            deck_id=deck_id,
            fmt=fmt,
            result=result,
            since=since,
            until=until,
            q=q,
            limit=limit,
            page=page,
            page_size=page_size,
        )
        return jsonify(rows)
    except ValueError as e:
        return jsonify(error=str(e)), 400


@bp_matches.get("/<int:match_id>")
def get_match_route(match_id: int):
    return jsonify(svc_get_match(match_id))


@bp_matches.post("")
def create_match_route():
    data = request.get_json(force=True, silent=True) or {}

    try:
        row = svc_create_match(data)
        return jsonify(row), 201
    except LookupError as e:
        return jsonify(error=str(e)), 404
    except ValueError as e:
        return jsonify(error=str(e)), 400


@bp_matches.patch("/<int:match_id>")
def update_match_route(match_id: int):
    data = request.get_json(force=True, silent=True) or {}

    try:
        row = svc_update_match(match_id, data)
        return jsonify(row)
    except LookupError as e:
        return jsonify(error=str(e)), 404
    except ValueError as e:
        return jsonify(error=str(e)), 400


@bp_matches.delete("/<int:match_id>")
def delete_match_route(match_id: int):
    svc_delete_match(match_id)
    return ("", 204)