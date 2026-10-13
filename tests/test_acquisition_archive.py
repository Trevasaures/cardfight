import pytest
from sqlalchemy import inspect, text

from backend.database import db
from backend.models import AcquisitionPlan, AcquisitionPlanItem, Card
from backend.schema import ensure_schema_upgrades


def make_plan(owned=4, ordered=0, required=4):
    card = Card(name="Test unit", grade=1, card_type="Normal Unit")
    plan = AcquisitionPlan(name="Test purchase", notes="Keep this history")
    db.session.add_all([card, plan])
    db.session.flush()
    item = AcquisitionPlanItem(
        plan_id=plan.id,
        card_id=card.id,
        required_quantity=required,
        owned_quantity=owned,
        ordered_quantity=ordered,
        unit_price_cents=250,
    )
    db.session.add(item)
    db.session.commit()
    return plan.id, item.id, card.id


def test_completed_plan_archive_retains_history_and_restores(client, app_context):
    plan_id, item_id, _ = make_plan()
    url = f"/api/acquisition-plans/{plan_id}"
    before = client.get(url).get_json()
    response = client.post(f"{url}/archive")
    assert response.status_code == 200
    archived = response.get_json()
    assert archived["archived_at"]
    assert archived["status"] == "complete"
    assert archived["items"] == before["items"]
    assert archived["summary"] == before["summary"]
    assert archived["notes"] == before["notes"]
    assert client.get("/api/acquisition-plans").get_json()[0]["archived_at"]
    assert (
        client.post(f"{url}/archive").get_json()["archived_at"]
        == archived["archived_at"]
    )

    restored = client.post(f"{url}/restore")
    assert restored.status_code == 200
    assert restored.get_json()["archived_at"] is None
    assert restored.get_json()["items"] == before["items"]
    assert (
        client.patch(
            f"/api/acquisition-plans/items/{item_id}", json={"notes": "Editable again"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize("owned,ordered", [(0, 0), (2, 2), (4, 1)])
def test_archive_requires_received_copies_without_pending_delivery(
    client, app_context, owned, ordered
):
    plan_id, _, _ = make_plan(owned=owned, ordered=ordered)
    response = client.post(f"/api/acquisition-plans/{plan_id}/archive")
    assert response.status_code == 400
    assert (
        client.get(f"/api/acquisition-plans/{plan_id}").get_json()["archived_at"]
        is None
    )


def test_empty_or_zero_target_plan_cannot_be_archived(client, app_context):
    plan = AcquisitionPlan(name="Empty plan", status="complete")
    db.session.add(plan)
    db.session.commit()
    assert client.post(f"/api/acquisition-plans/{plan.id}/archive").status_code == 400
    plan_id, item_id, _ = make_plan()
    item = db.session.get(AcquisitionPlanItem, item_id)
    item.source_quantity = 4
    item.removed_quantity = 4
    db.session.commit()
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 400


def test_overage_cannot_cover_a_different_cards_shortage(client, app_context):
    plan_id, _, _ = make_plan(owned=8)
    card = Card(name="Missing unit", grade=2, card_type="Normal Unit")
    db.session.add(card)
    db.session.flush()
    db.session.add(
        AcquisitionPlanItem(plan_id=plan_id, card_id=card.id, required_quantity=4)
    )
    db.session.commit()
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 400


def test_archived_plan_is_read_only_and_excluded_from_dashboard(client, app_context):
    plan_id, item_id, card_id = make_plan()
    url = f"/api/acquisition-plans/{plan_id}"
    assert client.post(f"{url}/archive").status_code == 200
    assert client.patch(url, json={"name": "Changed"}).status_code == 400
    assert client.post(f"{url}/items", json={"card_id": card_id}).status_code == 400
    assert (
        client.patch(
            f"/api/acquisition-plans/items/{item_id}", json={"owned_quantity": 0}
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/api/acquisition-plans/items/{item_id}/receive", json={"quantity": 1}
        ).status_code
        == 400
    )
    assert client.delete(f"/api/acquisition-plans/items/{item_id}").status_code == 400
    dashboard = client.get("/api/dashboard").get_json()["command_center"]
    assert dashboard["resume"]["purchase_plan"] is None
    assert not any(row["kind"] == "purchase" for row in dashboard["activity"])
    assert client.get(url).get_json()["name"] == "Test purchase"


def test_archive_schema_upgrade_preserves_existing_plans(client, app_context):
    plan_id, _, _ = make_plan()
    db.session.remove()
    # Recreate the pre-upgrade column layout in the isolated in-memory database.
    db.session.execute(text("ALTER TABLE acquisition_plan DROP COLUMN archived_at"))
    db.session.commit()
    ensure_schema_upgrades()
    ensure_schema_upgrades()
    columns = {
        column["name"] for column in inspect(db.engine).get_columns("acquisition_plan")
    }
    assert "archived_at" in columns
    plan = client.get(f"/api/acquisition-plans/{plan_id}").get_json()
    assert plan["archived_at"] is None
    assert plan["items"][0]["owned_quantity"] == 4


@pytest.mark.parametrize("action", ["archive", "restore"])
def test_archive_missing_plan_returns_not_found(client, action):
    assert client.post(f"/api/acquisition-plans/999/{action}").status_code == 404
