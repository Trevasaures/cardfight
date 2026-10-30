"""Deck cuts are tracked independently of purchase targets and physical stock."""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from backend.database import db
from backend.models import (
    AcquisitionPlanItem,
    Card,
    CardPrinting,
    Deck,
    DeckCard,
    DeckVersion,
)
from backend.schema import ensure_schema_upgrades


def _upgrade_plan(client):
    deck = Deck(name="Working deck", type="Standard")
    card = Card(name="Outgoing unit", grade=2, card_type="Normal Unit")
    db.session.add_all([deck, card])
    db.session.flush()
    printing = CardPrinting(
        card_id=card.id, set_code="TEST", card_number="001", rarity="DFR"
    )
    version = DeckVersion(deck_id=deck.id, version_name="Original", is_active=True)
    db.session.add_all([printing, version])
    db.session.flush()
    entry = DeckCard(
        deck_version_id=version.id,
        card_id=card.id,
        printing_id=printing.id,
        quantity=4,
        zone="main",
    )
    db.session.add(entry)
    db.session.commit()
    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Next build",
            "plan_type": "existing_deck",
            "list_source": "deck_version",
            "deck_version_id": version.id,
        },
    )
    assert response.status_code == 201
    plan = response.get_json()
    return plan["id"], plan["items"][0]["id"], entry.id


def _edit(client, item_id, **payload):
    response = client.patch(f"/api/acquisition-plans/items/{item_id}", json=payload)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _removal(client, item_id, action, expected=200):
    response = client.post(
        f"/api/acquisition-plans/items/{item_id}/removal", json={"action": action}
    )
    assert response.status_code == expected, response.get_json()
    return response.get_json()


def _snapshot(client, plan_id):
    db.session.remove()
    plan = client.get(f"/api/acquisition-plans/{plan_id}").get_json()
    listed = next(
        row
        for row in client.get("/api/acquisition-plans").get_json()
        if row["id"] == plan_id
    )
    assert listed["summary"] == plan["summary"]
    return plan


def test_full_cut_confirmation_and_undo_do_not_change_stock_or_saved_deck(client):
    plan_id, item_id, entry_id = _upgrade_plan(client)
    cut = _edit(
        client,
        item_id,
        target_quantity=0,
        ordered_quantity=1,
        unit_price_cents=325,
        notes="Keep this printing and note",
    )
    assert (
        cut["source_quantity"] == cut["removed_quantity"] == cut["owned_quantity"] == 4
    )
    assert cut["target_quantity"] == cut["confirmed_removed_quantity"] == 0
    assert cut["pending_removed_quantity"] == 4
    confirmed = _removal(client, item_id, "confirm")
    row = confirmed["items"][0]
    assert row["confirmed_removed_quantity"] == 4
    assert row["pending_removed_quantity"] == 0
    assert row["removal_confirmed_at"]
    assert row["ordered_quantity"] == 1
    assert row["owned_quantity"] == 4
    assert row["printing"] == cut["printing"]
    assert row["notes"] == cut["notes"]
    assert row["unit_price_cents"] == 325
    assert db.session.get(DeckCard, entry_id).quantity == 4
    assert _snapshot(client, plan_id)["items"][0] == row
    # Repeated requests keep the confirmation date and copies stable.
    assert _removal(client, item_id, "confirm")["items"][0] == row
    undone = _removal(client, item_id, "undo_confirmation")["items"][0]
    assert undone["target_quantity"] == 0
    assert undone["pending_removed_quantity"] == 4
    assert undone["confirmed_removed_quantity"] == 0
    assert undone["removal_confirmed_at"] is None
    assert undone["owned_quantity"] == 4
    assert undone["ordered_quantity"] == 1


def test_partial_cut_keeps_next_build_progress_and_restores_target_explicitly(client):
    plan_id, item_id, entry_id = _upgrade_plan(client)
    partial = _edit(client, item_id, target_quantity=2, notes="Two copies stay")
    confirmed = _removal(client, item_id, "confirm")
    summary = confirmed["summary"]
    assert summary["line_count"] == summary["active_line_count"] == 1
    assert summary["outgoing_line_count"] == 0
    assert summary["required_quantity"] == summary["available_quantity"] == 2
    assert summary["removed_quantity"] == summary["confirmed_removed_quantity"] == 2
    assert summary["pending_removed_quantity"] == 0
    assert summary["missing_quantity"] == 0
    assert summary["estimated_cost_cents"] == 0
    assert summary["progress"] == 1
    restored = _removal(client, item_id, "restore_target")["items"][0]
    assert restored["target_quantity"] == restored["owned_quantity"] == 4
    assert restored["removed_quantity"] == restored["confirmed_removed_quantity"] == 0
    assert restored["removal_confirmed_at"] is None
    assert restored["printing"] == partial["printing"]
    assert restored["notes"] == partial["notes"]
    assert db.session.get(DeckCard, entry_id).quantity == 4
    assert _snapshot(client, plan_id)["summary"]["pending_removed_quantity"] == 0


def test_growing_cut_keeps_confirmed_copies_and_shrinking_cut_clamps_confirmation(
    client,
):
    _, item_id, _ = _upgrade_plan(client)
    _edit(client, item_id, target_quantity=2)
    _removal(client, item_id, "confirm")
    larger = _edit(client, item_id, target_quantity=1)
    assert larger["confirmed_removed_quantity"] == 2
    assert larger["pending_removed_quantity"] == 1
    smaller = _edit(client, item_id, target_quantity=3)
    assert smaller["confirmed_removed_quantity"] == 1
    assert smaller["pending_removed_quantity"] == 0
    kept = _edit(client, item_id, target_quantity=4)
    assert kept["confirmed_removed_quantity"] == 0
    assert kept["removal_confirmed_at"] is None


def test_readd_and_split_reconcile_confirmation_without_relabeling_history(client):
    plan_id, item_id, _ = _upgrade_plan(client)
    _edit(client, item_id, target_quantity=0)
    _removal(client, item_id, "confirm")
    item = db.session.get(AcquisitionPlanItem, item_id)
    added = client.post(
        f"/api/acquisition-plans/{plan_id}/printings",
        json={
            "card_id": item.card_id,
            "printing_id": item.printing_id,
            "required_quantity": 1,
        },
    )
    assert added.status_code == 201
    row = added.get_json()["items"][0]
    assert row["target_quantity"] == 1
    assert row["removed_quantity"] == row["confirmed_removed_quantity"] == 3
    alternate = CardPrinting(
        card_id=item.card_id, set_code="TEST", card_number="001-R", rarity="R"
    )
    db.session.add(alternate)
    db.session.commit()
    split = client.post(
        f"/api/acquisition-plans/items/{item_id}/split",
        json={
            "printing_id": alternate.id,
            "quantity": 1,
            "inventory_policy": "keep_original",
        },
    )
    assert split.status_code == 200
    original = next(row for row in split.get_json()["items"] if row["id"] == item_id)
    assert original["removed_quantity"] == 4
    assert original["confirmed_removed_quantity"] == 3
    assert original["pending_removed_quantity"] == 1
    assert original["owned_quantity"] == 4


def test_incoming_on_cut_remains_actionable_and_blocks_archive_until_received(client):
    plan_id, item_id, _ = _upgrade_plan(client)
    _edit(client, item_id, target_quantity=0, ordered_quantity=1, unit_price_cents=250)
    _removal(client, item_id, "confirm")
    retained = Card(name="Remaining target", grade=1, card_type="Normal Unit")
    db.session.add(retained)
    db.session.commit()
    added = client.post(
        f"/api/acquisition-plans/{plan_id}/items",
        json={
            "card_id": retained.id,
            "required_quantity": 2,
            "owned_quantity": 2,
        },
    )
    assert added.status_code == 201
    plan = _snapshot(client, plan_id)
    summary = plan["summary"]
    assert summary["active_line_count"] == summary["outgoing_line_count"] == 1
    assert summary["line_count"] == 2
    assert summary["required_quantity"] == summary["available_quantity"] == 2
    assert summary["progress"] == 1
    assert summary["ordered_quantity"] == 1
    assert summary["ordered_value_cents"] == 250
    assert summary["estimated_cost_cents"] == summary["remaining_cost_cents"] == 0
    assert summary["is_physically_complete"] is False
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 400
    received = client.post(
        f"/api/acquisition-plans/items/{item_id}/receive", json={"quantity": 1}
    )
    assert received.status_code == 200
    assert received.get_json()["owned_quantity"] == 5
    assert received.get_json()["target_quantity"] == 0
    assert received.get_json()["confirmed_removed_quantity"] == 4
    before_archive = _snapshot(client, plan_id)
    archived = client.post(f"/api/acquisition-plans/{plan_id}/archive")
    assert archived.status_code == 200
    assert archived.get_json()["items"] == before_archive["items"]
    assert (
        client.post(f"/api/acquisition-plans/{plan_id}/restore").get_json()["items"]
        == before_archive["items"]
    )


@pytest.mark.parametrize("action", ["confirm", "undo_confirmation", "restore_target"])
def test_archived_removal_actions_do_not_change_history(client, action):
    plan_id, item_id, _ = _upgrade_plan(client)
    _edit(client, item_id, target_quantity=2)
    confirmed = _removal(client, item_id, "confirm")["items"]
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 200
    _removal(client, item_id, action, expected=400)
    assert _snapshot(client, plan_id)["items"] == confirmed


@pytest.mark.parametrize("action", ["confirm", "restore_target", "unsupported", None])
def test_invalid_removal_actions_leave_new_build_line_unchanged(client, action):
    card = Card(name="New target", grade=1, card_type="Normal Unit")
    db.session.add(card)
    db.session.commit()
    plan = client.post("/api/acquisition-plans", json={"name": "New build"}).get_json()
    item = client.post(
        f"/api/acquisition-plans/{plan['id']}/items", json={"card_id": card.id}
    ).get_json()
    _removal(client, item["id"], action, expected=400)
    assert _snapshot(client, plan["id"])["items"] == [item]


def test_delete_source_line_is_rejected_but_erroneous_new_line_can_be_deleted(client):
    plan_id, item_id, entry_id = _upgrade_plan(client)
    _edit(client, item_id, target_quantity=0, notes="Retain cut history")
    _removal(client, item_id, "confirm")
    before = _snapshot(client, plan_id)["items"]
    deleted = client.delete(f"/api/acquisition-plans/items/{item_id}")
    assert deleted.status_code == 400
    assert "history" in deleted.get_json()["error"]
    assert _snapshot(client, plan_id)["items"] == before
    assert db.session.get(DeckCard, entry_id).quantity == 4
    extra = Card(name="Mistaken card", grade=1, card_type="Normal Unit")
    db.session.add(extra)
    db.session.commit()
    new_item = client.post(
        f"/api/acquisition-plans/{plan_id}/items", json={"card_id": extra.id}
    ).get_json()
    assert (
        client.delete(f"/api/acquisition-plans/items/{new_item['id']}").status_code
        == 200
    )
    assert _snapshot(client, plan_id)["items"] == before


def test_invalid_quantity_update_rolls_back_removal_confirmation(client):
    plan_id, item_id, _ = _upgrade_plan(client)
    _edit(client, item_id, target_quantity=1)
    _removal(client, item_id, "confirm")
    before = _snapshot(client, plan_id)["items"]
    result = client.patch(
        f"/api/acquisition-plans/items/{item_id}",
        json={"target_quantity": 0, "removed_quantity": 9, "ordered_quantity": -1},
    )
    assert result.status_code == 400
    assert _snapshot(client, plan_id)["items"] == before


def test_legacy_removal_upgrade_is_additive_and_idempotent(client):
    _, item_id, _ = _upgrade_plan(client)
    _edit(
        client,
        item_id,
        target_quantity=0,
        notes="Retained legacy cut",
        ordered_quantity=1,
    )
    before = dict(
        db.session.execute(text("SELECT * FROM acquisition_plan_item")).mappings().one()
    )
    ddl = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE name='acquisition_plan_item'")
    ).scalar()
    columns = [
        name
        for name in before
        if name not in {"confirmed_removed_quantity", "removal_confirmed_at"}
    ]
    # Emulate the pre-feature table while retaining its original constraints.
    legacy_ddl = "\n".join(
        line
        for line in ddl.splitlines()
        if not any(
            name in line
            for name in (
                "confirmed_removed_quantity",
                "removal_confirmed_at",
                "ck_acquisition_item_confirmed_removed_nonnegative",
            )
        )
    )
    indexes = (
        db.session.execute(
            text(
                "SELECT sql FROM sqlite_master WHERE tbl_name='acquisition_plan_item' AND type='index' AND sql IS NOT NULL"
            )
        )
        .scalars()
        .all()
    )
    db.session.commit()
    db.session.remove()
    with db.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE acquisition_plan_item")
        connection.exec_driver_sql(legacy_ddl)
        connection.execute(
            text(
                "INSERT INTO acquisition_plan_item ("
                + ", ".join(columns)
                + ") VALUES ("
                + ", ".join(":" + name for name in columns)
                + ")"
            ),
            {name: before[name] for name in columns},
        )
        for index in indexes:
            connection.exec_driver_sql(index)
    ensure_schema_upgrades()
    ensure_schema_upgrades()
    after = dict(
        db.session.execute(text("SELECT * FROM acquisition_plan_item")).mappings().one()
    )
    assert {name: after[name] for name in columns} == {
        name: before[name] for name in columns
    }
    assert after["confirmed_removed_quantity"] == 0
    assert after["removal_confirmed_at"] is None
    assert db.session.get(AcquisitionPlanItem, item_id).notes == before["notes"]
    assert len(inspect(db.engine).get_indexes("acquisition_plan_item")) == len(indexes)
    assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
    with pytest.raises(IntegrityError):
        db.session.execute(
            text("UPDATE acquisition_plan_item SET confirmed_removed_quantity=-1")
        )
    db.session.rollback()
