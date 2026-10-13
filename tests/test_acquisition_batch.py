import pytest

from backend.database import db
from backend.models import AcquisitionPlanItem, Card


def _plan(client, name="Purchase list"):
    return client.post(
        "/api/acquisition-plans",
        json={"name": name, "plan_type": "new_build", "list_source": "empty"},
    ).get_json()


def _item(client, plan_id, name, target=4, owned=0, incoming=0):
    card = Card(name=name, grade=1, card_type="Normal Unit")
    db.session.add(card)
    db.session.commit()
    return client.post(
        f"/api/acquisition-plans/{plan_id}/items",
        json={
            "card_id": card.id,
            "required_quantity": target,
            "owned_quantity": owned,
            "ordered_quantity": incoming,
        },
    ).get_json()


def _batch(client, plan_id, action, ids):
    return client.post(
        f"/api/acquisition-plans/{plan_id}/items/batch",
        json={"action": action, "item_ids": ids},
    )


def test_batch_marks_only_missing_copies_and_receives_selected_lines(app_context, client):
    plan = _plan(client)
    first = _item(client, plan["id"], "First", owned=1, incoming=1)
    second = _item(client, plan["id"], "Second", target=3)
    ready = _item(client, plan["id"], "Ready", owned=4)
    ids = [first["id"], second["id"], ready["id"]]

    response = _batch(client, plan["id"], "mark_incoming", ids)
    assert response.status_code == 200
    rows = {row["id"]: row for row in response.get_json()["items"]}
    assert rows[first["id"]]["ordered_quantity"] == 3
    assert rows[second["id"]]["ordered_quantity"] == 3
    assert rows[ready["id"]]["ordered_quantity"] == 0

    received = _batch(client, plan["id"], "receive", [first["id"]])
    assert received.status_code == 200
    rows = {row["id"]: row for row in received.get_json()["items"]}
    assert rows[first["id"]]["owned_quantity"] == 4
    assert rows[first["id"]]["ordered_quantity"] == 0
    assert rows[second["id"]]["ordered_quantity"] == 3


@pytest.mark.parametrize("action", ["mark_incoming", "receive"])
def test_batch_rejects_other_plan_without_changing_any_line(app_context, client, action):
    plan, other = _plan(client), _plan(client, "Other")
    first = _item(client, plan["id"], "First", incoming=1)
    foreign = _item(client, other["id"], "Foreign", incoming=1)
    response = _batch(client, plan["id"], action, [first["id"], foreign["id"]])
    assert response.status_code == 400
    db.session.expire_all()
    saved = db.session.get(AcquisitionPlanItem, first["id"])
    assert saved.ordered_quantity == 1
    assert saved.owned_quantity == 0


@pytest.mark.parametrize("ids", [[], [None], [True], [1.5], [-1], [1, 1], [999]])
def test_batch_rejects_invalid_selection(app_context, client, ids):
    plan = _plan(client)
    assert _batch(client, plan["id"], "mark_incoming", ids).status_code == 400


def test_batch_cannot_modify_archived_plan(app_context, client):
    plan = _plan(client)
    item = _item(client, plan["id"], "Complete", owned=4)
    assert client.post(f"/api/acquisition-plans/{plan['id']}/archive").status_code == 200
    response = _batch(client, plan["id"], "mark_incoming", [item["id"]])
    assert response.status_code == 400
    assert "Restore" in response.get_json()["error"]


def test_partial_receive_preserves_remaining_delivery(app_context, client):
    plan = _plan(client)
    item = _item(client, plan["id"], "Partial", incoming=4)
    response = client.post(
        f"/api/acquisition-plans/items/{item['id']}/receive", json={"quantity": 2}
    )
    assert response.status_code == 200
    assert response.get_json()["owned_quantity"] == 2
    assert response.get_json()["ordered_quantity"] == 2
    assert client.post(
        f"/api/acquisition-plans/items/{item['id']}/receive", json={"quantity": 3}
    ).status_code == 400


@pytest.mark.parametrize("action", ["receive", "mark_incoming"])
def test_batch_rejects_no_op_and_missing_plan(app_context, client, action):
    plan = _plan(client)
    ready = _item(client, plan["id"], "Ready", owned=4)
    assert _batch(client, plan["id"], action, [ready["id"]]).status_code == 400
    assert _batch(client, 999, action, [ready["id"]]).status_code == 404
