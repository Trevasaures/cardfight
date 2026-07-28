from flask import Blueprint, jsonify, request

from backend.services.acquisition import (
    add_acquisition_item,
    create_acquisition_plan,
    delete_acquisition_plan,
    get_acquisition_plan_or_raise,
    list_acquisition_plans,
    receive_acquisition_item,
    remove_acquisition_item,
    update_acquisition_item,
    update_acquisition_plan,
)
from backend.services.serializers import (
    serialize_acquisition_item,
    serialize_acquisition_plan,
)


bp_acquisition = Blueprint(
    "acquisition",
    __name__,
    url_prefix="/api/acquisition-plans",
)


def _json_error(message, status_code):
    return jsonify({"error": message}), status_code


@bp_acquisition.get("")
def list_acquisition_plans_route():
    plans = list_acquisition_plans()
    return jsonify(
        [
            serialize_acquisition_plan(plan, include_items=False)
            for plan in plans
        ]
    )


@bp_acquisition.post("")
def create_acquisition_plan_route():
    try:
        plan = create_acquisition_plan(request.get_json(silent=True) or {})
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_acquisition_plan(plan)), 201


@bp_acquisition.get("/<int:plan_id>")
def get_acquisition_plan_route(plan_id):
    try:
        plan = get_acquisition_plan_or_raise(plan_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.patch("/<int:plan_id>")
def update_acquisition_plan_route(plan_id):
    try:
        plan = update_acquisition_plan(
            plan_id,
            request.get_json(silent=True) or {},
        )
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.delete("/<int:plan_id>")
def delete_acquisition_plan_route(plan_id):
    try:
        delete_acquisition_plan(plan_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify({"deleted": True, "id": plan_id})


@bp_acquisition.post("/<int:plan_id>/items")
def add_acquisition_item_route(plan_id):
    try:
        item = add_acquisition_item(
            plan_id,
            request.get_json(silent=True) or {},
        )
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_acquisition_item(item)), 201


@bp_acquisition.patch("/items/<int:item_id>")
def update_acquisition_item_route(item_id):
    try:
        item = update_acquisition_item(
            item_id,
            request.get_json(silent=True) or {},
        )
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_acquisition_item(item))


@bp_acquisition.post("/items/<int:item_id>/receive")
def receive_acquisition_item_route(item_id):
    try:
        item = receive_acquisition_item(
            item_id,
            request.get_json(silent=True) or {},
        )
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_acquisition_item(item))


@bp_acquisition.delete("/items/<int:item_id>")
def remove_acquisition_item_route(item_id):
    try:
        remove_acquisition_item(item_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify({"deleted": True, "id": item_id})
