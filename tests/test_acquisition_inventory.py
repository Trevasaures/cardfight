"""Purchase targets do not consume copies retained in the working deck."""

import pytest

from backend.database import db
from backend.models import AcquisitionPlanItem, Card, Deck, DeckCard, DeckVersion


def _working_deck_plan(client, quantity=1):
    deck = Deck(name="Working deck", type="Standard")
    card = Card(name="Current unit", grade=1, card_type="Normal Unit")
    db.session.add_all([deck, card])
    db.session.flush()
    version = DeckVersion(deck_id=deck.id, version_name="Current", is_active=True)
    db.session.add(version)
    db.session.flush()
    entry = DeckCard(
        deck_version_id=version.id, card_id=card.id, quantity=quantity, zone="main"
    )
    db.session.add(entry)
    db.session.commit()
    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Next version",
            "plan_type": "existing_deck",
            "list_source": "deck_version",
            "deck_version_id": version.id,
        },
    )
    assert response.status_code == 201
    return response.get_json(), entry.id


def _summary_matches_list(client, plan_id):
    detail = client.get(f"/api/acquisition-plans/{plan_id}").get_json()
    listed = next(
        plan
        for plan in client.get("/api/acquisition-plans").get_json()
        if plan["id"] == plan_id
    )
    assert listed["summary"] == detail["summary"]
    assert listed["items"] == []
    return detail


@pytest.mark.parametrize("source,target", [(1, 0), (4, 0), (4, 2)])
def test_target_reduction_keeps_actual_owned_inventory_and_working_deck(
    client, source, target
):
    plan, entry_id = _working_deck_plan(client, source)
    item_id = plan["items"][0]["id"]
    changed = client.patch(
        f"/api/acquisition-plans/items/{item_id}", json={"target_quantity": target}
    )
    assert changed.status_code == 200
    item = changed.get_json()
    assert item["owned_quantity"] == source
    assert item["available_quantity"] == target
    assert item["target_quantity"] == target
    assert item["removed_quantity"] == source - target
    assert item["missing_quantity"] == item["overage_quantity"] == 0
    assert db.session.get(AcquisitionPlanItem, item_id).owned_quantity == source
    assert db.session.get(DeckCard, entry_id).quantity == source

    summary = _summary_matches_list(client, plan["id"])["summary"]
    assert summary["owned_quantity"] == source
    assert summary["available_quantity"] == summary["required_quantity"] == target
    assert summary["accounted_quantity"] == target
    assert summary["is_physically_complete"] is (target > 0)
    assert summary["progress"] == (1.0 if target else 0.0)


def test_outgoing_owned_copies_do_not_complete_replacement_before_delivery(client):
    plan, entry_id = _working_deck_plan(client)
    old_item = plan["items"][0]
    client.patch(
        f"/api/acquisition-plans/items/{old_item['id']}", json={"target_quantity": 0}
    )
    replacement = Card(name="Replacement unit", grade=1, card_type="Normal Unit")
    db.session.add(replacement)
    db.session.commit()
    added = client.post(
        f"/api/acquisition-plans/{plan['id']}/items",
        json={"card_id": replacement.id, "required_quantity": 1},
    )
    assert added.status_code == 201
    new_item_id = added.get_json()["id"]

    summary = _summary_matches_list(client, plan["id"])["summary"]
    assert summary["owned_quantity"] == 1
    assert summary["available_quantity"] == 0
    assert summary["accounted_quantity"] == 0
    assert summary["required_quantity"] == summary["missing_quantity"] == 1
    assert summary["progress"] == 0.0
    assert summary["is_accounted_for"] is False
    assert summary["is_physically_complete"] is False
    assert (
        client.post(f"/api/acquisition-plans/{plan['id']}/archive").status_code == 400
    )

    incoming = client.post(
        f"/api/acquisition-plans/{plan['id']}/items/batch",
        json={"action": "mark_incoming", "item_ids": [old_item["id"], new_item_id]},
    )
    assert incoming.status_code == 200
    incoming_rows = {item["id"]: item for item in incoming.get_json()["items"]}
    assert incoming_rows[old_item["id"]]["ordered_quantity"] == 0
    assert incoming_rows[new_item_id]["ordered_quantity"] == 1
    incoming_summary = incoming.get_json()["summary"]
    assert incoming_summary["owned_quantity"] == 1
    assert incoming_summary["available_quantity"] == 0
    assert incoming_summary["accounted_quantity"] == 1
    assert incoming_summary["is_accounted_for"] is True
    assert incoming_summary["is_physically_complete"] is False
    assert (
        client.post(f"/api/acquisition-plans/{plan['id']}/archive").status_code == 400
    )

    received = client.post(
        f"/api/acquisition-plans/items/{new_item_id}/receive", json={"quantity": 1}
    )
    assert received.status_code == 200
    completed = _summary_matches_list(client, plan["id"])
    assert completed["summary"]["owned_quantity"] == 2
    assert completed["summary"]["available_quantity"] == 1
    assert completed["summary"]["accounted_quantity"] == 1
    assert completed["summary"]["is_physically_complete"] is True
    assert db.session.get(DeckCard, entry_id).quantity == 1
    assert db.session.get(AcquisitionPlanItem, old_item["id"]).owned_quantity == 1

    archived = client.post(f"/api/acquisition-plans/{plan['id']}/archive")
    assert archived.status_code == 200
    restored = client.post(f"/api/acquisition-plans/{plan['id']}/restore")
    assert restored.status_code == 200
    assert restored.get_json()["summary"] == completed["summary"]
    assert restored.get_json()["items"] == completed["items"]
    assert db.session.get(DeckCard, entry_id).quantity == 1


def test_surplus_inventory_cannot_cover_a_different_cards_shortage(client):
    plan = client.post(
        "/api/acquisition-plans", json={"name": "Two-card build"}
    ).get_json()
    for name, owned in (("Surplus unit", 8), ("Missing unit", 0)):
        card = Card(name=name, grade=1, card_type="Normal Unit")
        db.session.add(card)
        db.session.commit()
        response = client.post(
            f"/api/acquisition-plans/{plan['id']}/items",
            json={"card_id": card.id, "required_quantity": 4, "owned_quantity": owned},
        )
        assert response.status_code == 201
    summary = _summary_matches_list(client, plan["id"])["summary"]
    assert summary["owned_quantity"] == summary["required_quantity"] == 8
    assert summary["available_quantity"] == summary["missing_quantity"] == 4
    assert summary["accounted_quantity"] == 4
    assert summary["overage_quantity"] == 4
    assert summary["progress"] == 0.5
    assert summary["is_physically_complete"] is False
    assert (
        client.post(f"/api/acquisition-plans/{plan['id']}/archive").status_code == 400
    )


@pytest.mark.parametrize(
    "tracked,source,removed,owned,incoming",
    [(1, 1, 1, 1, 3), (2, 0, 0, 2, 3), (4, 0, 0, 1, 7)],
    ids=["outgoing-row", "fully-owned-row", "excess-delivery"],
)
def test_extra_incoming_copies_cannot_cover_another_cards_target(
    client, tracked, source, removed, owned, incoming
):
    plan = client.post(
        "/api/acquisition-plans", json={"name": "Incoming coverage"}
    ).get_json()
    covered = Card(name="Extra delivery", grade=1, card_type="Normal Unit")
    missing = Card(name="Still missing", grade=1, card_type="Normal Unit")
    db.session.add_all([covered, missing])
    db.session.commit()
    added = client.post(
        f"/api/acquisition-plans/{plan['id']}/items",
        json={
            "card_id": covered.id,
            "required_quantity": tracked,
            "source_quantity": source,
            "removed_quantity": removed,
            "owned_quantity": owned,
            "ordered_quantity": incoming,
        },
    )
    assert added.status_code == 201
    client.post(
        f"/api/acquisition-plans/{plan['id']}/items",
        json={"card_id": missing.id, "required_quantity": 2, "unit_price_cents": 125},
    )
    target = tracked - removed
    row = added.get_json()
    assert row["owned_quantity"] == owned
    assert row["ordered_quantity"] == incoming
    assert row["accounted_quantity"] == target
    summary = _summary_matches_list(client, plan["id"])["summary"]
    assert summary["owned_quantity"] == owned
    assert summary["ordered_quantity"] == incoming
    assert summary["available_quantity"] == min(owned, target)
    assert summary["accounted_quantity"] == target
    assert summary["missing_quantity"] == 2
    assert summary["remaining_cost_cents"] == 250
    assert summary["progress"] == target / (target + 2)
    assert summary["is_accounted_for"] is False
    assert summary["is_physically_complete"] is False
    assert (
        client.post(f"/api/acquisition-plans/{plan['id']}/archive").status_code == 400
    )
