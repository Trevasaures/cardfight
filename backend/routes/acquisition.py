from flask import Blueprint, jsonify

from backend.errors import json_object

from backend.services.acquisition import (
    add_acquisition_item,
    archive_acquisition_plan,
    batch_acquisition_items,
    create_acquisition_plan,
    delete_acquisition_plan,
    get_acquisition_plan_or_raise,
    list_acquisition_plans,
    receive_acquisition_item,
    remove_acquisition_item,
    restore_acquisition_plan,
    split_acquisition_item,
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


@bp_acquisition.get("")
def list_acquisition_plans_route():
    plans = list_acquisition_plans()
    return jsonify(
        [serialize_acquisition_plan(plan, include_items=False) for plan in plans]
    )


@bp_acquisition.post("")
def create_acquisition_plan_route():
    plan = create_acquisition_plan(json_object())

    return jsonify(serialize_acquisition_plan(plan)), 201


@bp_acquisition.get("/<int:plan_id>")
def get_acquisition_plan_route(plan_id):
    plan = get_acquisition_plan_or_raise(plan_id)

    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.patch("/<int:plan_id>")
def update_acquisition_plan_route(plan_id):
    plan = update_acquisition_plan(
        plan_id,
        json_object(),
    )

    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.delete("/<int:plan_id>")
def delete_acquisition_plan_route(plan_id):
    delete_acquisition_plan(plan_id)

    return jsonify({"deleted": True, "id": plan_id})


@bp_acquisition.post("/<int:plan_id>/archive")
def archive_acquisition_plan_route(plan_id):
    plan = archive_acquisition_plan(plan_id)
    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.post("/<int:plan_id>/restore")
def restore_acquisition_plan_route(plan_id):
    plan = restore_acquisition_plan(plan_id)
    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.post("/<int:plan_id>/items")
def add_acquisition_item_route(plan_id):
    item = add_acquisition_item(
        plan_id,
        json_object(),
    )

    return jsonify(serialize_acquisition_item(item)), 201


@bp_acquisition.patch("/items/<int:item_id>")
def update_acquisition_item_route(item_id):
    item = update_acquisition_item(
        item_id,
        json_object(),
    )

    return jsonify(serialize_acquisition_item(item))


@bp_acquisition.post("/<int:plan_id>/printings")
def add_acquisition_printing_route(plan_id):
    item = add_acquisition_item(plan_id, json_object())
    return jsonify(serialize_acquisition_plan(item.plan)), 201


@bp_acquisition.post("/<int:plan_id>/items/batch")
def batch_acquisition_items_route(plan_id):
    plan = batch_acquisition_items(plan_id, json_object())
    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.post("/items/<int:item_id>/split")
def split_acquisition_item_route(item_id):
    plan = split_acquisition_item(item_id, json_object())
    return jsonify(serialize_acquisition_plan(plan))


@bp_acquisition.post("/items/<int:item_id>/receive")
def receive_acquisition_item_route(item_id):
    item = receive_acquisition_item(
        item_id,
        json_object(),
    )

    return jsonify(serialize_acquisition_item(item))


@bp_acquisition.delete("/items/<int:item_id>")
def remove_acquisition_item_route(item_id):
    remove_acquisition_item(item_id)

    return jsonify({"deleted": True, "id": item_id})
