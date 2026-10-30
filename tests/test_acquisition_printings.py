"""Rarity changes allocate purchase targets without relabeling physical copies."""

import pytest

from backend.database import db
from backend.models import Card, CardPrinting, Deck, DeckCard, DeckVersion


@pytest.fixture()
def printings():
    card = Card(name="One gameplay card", grade=1, card_type="Normal Unit")
    other = Card(name="Different card", grade=1, card_type="Normal Unit")
    db.session.add_all([card, other])
    db.session.flush()
    rows = [
        CardPrinting(card_id=card.id, set_code="TEST", card_number="001", rarity="R"),
        CardPrinting(
            card_id=card.id, set_code="TEST", card_number="001-DFR", rarity="DFR"
        ),
        CardPrinting(
            card_id=card.id, set_code="TEST", card_number="001-SP", rarity="SP"
        ),
        CardPrinting(card_id=other.id, set_code="TEST", card_number="002", rarity="R"),
    ]
    db.session.add_all(rows)
    db.session.commit()
    return card.id, [row.id for row in rows]


def _plan(client):
    response = client.post("/api/acquisition-plans", json={"name": "Mixed rarities"})
    assert response.status_code == 201
    return response.get_json()["id"]


def _add(client, plan_id, card_id, printing_id, quantity, **extra):
    response = client.post(
        f"/api/acquisition-plans/{plan_id}/items",
        json={
            "card_id": card_id,
            "printing_id": printing_id,
            "required_quantity": quantity,
            **extra,
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def _snapshot(client, plan_id):
    db.session.remove()
    response = client.get(f"/api/acquisition-plans/{plan_id}")
    assert response.status_code == 200
    plan = response.get_json()
    listed = next(
        row
        for row in client.get("/api/acquisition-plans").get_json()
        if row["id"] == plan_id
    )
    assert listed["summary"] == plan["summary"]
    return plan


def _split(client, item_id, printing_id, quantity, **extra):
    return client.post(
        f"/api/acquisition-plans/items/{item_id}/split",
        json={
            "printing_id": printing_id,
            "quantity": quantity,
            "inventory_policy": "keep_original",
            **extra,
        },
    )


def test_mixed_rarity_quotes_inventory_and_receipts_are_independent(client, printings):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    common = _add(
        client, plan_id, card_id, base, 3, unit_price_cents=200, notes="Main deck"
    )
    rare = _add(
        client, plan_id, card_id, premium, 1, unit_price_cents=3000, notes="Ride deck"
    )
    plan = _snapshot(client, plan_id)
    assert plan["summary"]["estimated_cost_cents"] == 3600
    assert plan["summary"]["remaining_cost_cents"] == 3600
    assert [item["printing"]["rarity"] for item in plan["items"]] == ["R", "DFR"]

    changed = client.patch(
        f"/api/acquisition-plans/items/{common['id']}",
        json={"owned_quantity": 1, "ordered_quantity": 1},
    )
    assert changed.status_code == 200
    plan = _snapshot(client, plan_id)
    assert plan["summary"]["estimated_cost_cents"] == 3400
    assert plan["summary"]["remaining_cost_cents"] == 3200
    assert plan["items"][1] == rare
    received = client.post(
        f"/api/acquisition-plans/items/{common['id']}/receive", json={"quantity": 1}
    )
    assert received.status_code == 200
    assert received.get_json()["owned_quantity"] == 2
    plan = _snapshot(client, plan_id)
    assert plan["summary"]["estimated_cost_cents"] == 3200
    assert plan["items"][1] == rare

    # Surplus base copies cannot satisfy the outstanding premium printing.
    client.patch(
        f"/api/acquisition-plans/items/{common['id']}", json={"owned_quantity": 4}
    )
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 400
    client.patch(
        f"/api/acquisition-plans/items/{rare['id']}", json={"ordered_quantity": 1}
    )
    client.post(
        f"/api/acquisition-plans/items/{rare['id']}/receive", json={"quantity": 1}
    )
    completed = _snapshot(client, plan_id)
    assert completed["summary"]["is_physically_complete"]
    archived = client.post(f"/api/acquisition-plans/{plan_id}/archive")
    assert archived.status_code == 200
    assert archived.get_json()["items"] == completed["items"]
    restored = client.post(f"/api/acquisition-plans/{plan_id}/restore")
    assert restored.status_code == 200
    assert restored.get_json()["items"] == completed["items"]


def test_split_new_printing_preserves_total_and_keeps_inventory_on_original(
    client, printings
):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    original = _add(
        client,
        plan_id,
        card_id,
        base,
        4,
        owned_quantity=2,
        ordered_quantity=1,
        unit_price_cents=200,
        notes="Original copies",
    )
    response = _split(
        client,
        original["id"],
        premium,
        1,
        unit_price_cents=3000,
        notes="Premium ride copy",
    )
    assert response.status_code == 200
    plan = _snapshot(client, plan_id)
    assert response.get_json() == plan
    common, rare = plan["items"]
    assert (common["target_quantity"], rare["target_quantity"]) == (3, 1)
    for field in (
        "owned_quantity",
        "ordered_quantity",
        "source_quantity",
        "notes",
        "unit_price_cents",
    ):
        assert common[field] == original[field]
    assert (
        rare["owned_quantity"]
        == rare["ordered_quantity"]
        == rare["source_quantity"]
        == 0
    )
    assert rare["unit_price_cents"] == 3000
    assert rare["notes"] == "Premium ride copy"
    assert plan["summary"]["required_quantity"] == 4
    assert plan["summary"]["estimated_cost_cents"] == 3200
    assert plan["summary"]["remaining_cost_cents"] == 3000


def test_split_into_existing_printing_preserves_destination_details(client, printings):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    common = _add(client, plan_id, card_id, base, 3, unit_price_cents=200)
    rare = _add(
        client,
        plan_id,
        card_id,
        premium,
        1,
        owned_quantity=1,
        ordered_quantity=1,
        unit_price_cents=3000,
        notes="Existing quote",
    )
    response = _split(client, common["id"], premium, 2, notes="Must not replace notes")
    assert response.status_code == 200
    plan = _snapshot(client, plan_id)
    assert len(plan["items"]) == 2
    assert plan["summary"]["required_quantity"] == 4
    changed = next(item for item in plan["items"] if item["id"] == rare["id"])
    assert changed["target_quantity"] == 3
    for field in ("owned_quantity", "ordered_quantity", "notes", "unit_price_cents"):
        assert changed[field] == rare[field]


def test_repeated_add_increases_quantity_without_losing_quote_or_notes(
    client, printings
):
    card_id, (base, _, _, _) = printings
    plan_id = _plan(client)
    original = _add(
        client, plan_id, card_id, base, 1, unit_price_cents=200, notes="Keep quote"
    )
    repeated = _add(client, plan_id, card_id, base, 1, notes="Ignored duplicate note")
    assert repeated["id"] == original["id"]
    assert repeated["target_quantity"] == 2
    assert repeated["unit_price_cents"] == 200
    assert repeated["notes"] == "Keep quote"
    snapshot = _snapshot(client, plan_id)
    conflict = client.post(
        f"/api/acquisition-plans/{plan_id}/items",
        json={"card_id": card_id, "printing_id": base, "unit_price_cents": 300},
    )
    assert conflict.status_code == 400
    assert _snapshot(client, plan_id) == snapshot


@pytest.mark.parametrize(
    "extra",
    [
        {"quantity": 0},
        {"quantity": -1},
        {"quantity": 1.5},
        {"quantity": True},
        {"quantity": 5},
        {"inventory_policy": None},
        {"inventory_policy": "move_owned"},
        {"unit_price_cents": -1},
        {"unit_price_cents": 12.5},
        {"printing_id": None},
        {"printing_id": 99999},
    ],
)
def test_invalid_split_is_atomic(client, printings, extra):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    original = _add(
        client, plan_id, card_id, base, 4, owned_quantity=1, unit_price_cents=200
    )
    before = _snapshot(client, plan_id)
    payload = {
        "printing_id": premium,
        "quantity": 1,
        "inventory_policy": "keep_original",
        **extra,
    }
    response = client.post(
        f"/api/acquisition-plans/items/{original['id']}/split", json=payload
    )
    assert response.status_code in (400, 404)
    assert _snapshot(client, plan_id) == before


def test_split_rejects_same_or_unrelated_printing_and_conflicting_quote(
    client, printings
):
    card_id, (base, premium, _, other) = printings
    plan_id = _plan(client)
    original = _add(client, plan_id, card_id, base, 4, unit_price_cents=200)
    _add(client, plan_id, card_id, premium, 1, unit_price_cents=3000)
    before = _snapshot(client, plan_id)
    for destination, extra in (
        (base, {}),
        (other, {}),
        (premium, {"unit_price_cents": 200}),
    ):
        assert (
            _split(client, original["id"], destination, 1, **extra).status_code == 400
        )
        assert _snapshot(client, plan_id) == before


def test_patch_printing_collision_does_not_lose_any_line_data(client, printings):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    original = _add(
        client, plan_id, card_id, base, 3, unit_price_cents=200, notes="Base"
    )
    _add(client, plan_id, card_id, premium, 1, unit_price_cents=3000, notes="Premium")
    before = _snapshot(client, plan_id)
    response = client.patch(
        f"/api/acquisition-plans/items/{original['id']}",
        json={"printing_id": premium, "target_quantity": 9, "notes": "Lost"},
    )
    assert response.status_code == 400
    assert _snapshot(client, plan_id) == before


@pytest.mark.parametrize(
    "protected", ["owned_quantity", "ordered_quantity", "source_quantity"]
)
def test_printing_change_cannot_relabel_inventory_even_when_cleared_in_payload(
    client, printings, protected
):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    original = _add(client, plan_id, card_id, base, 4, **{protected: 1})
    before = _snapshot(client, plan_id)
    response = client.patch(
        f"/api/acquisition-plans/items/{original['id']}",
        json={"printing_id": premium, protected: 0},
    )
    assert response.status_code == 400
    assert _snapshot(client, plan_id) == before


def test_unowned_printing_change_requires_a_new_quote(client, printings):
    card_id, (base, premium, alternate, _) = printings
    plan_id = _plan(client)
    original = _add(client, plan_id, card_id, base, 4, unit_price_cents=200)
    url = f"/api/acquisition-plans/items/{original['id']}"
    changed = client.patch(url, json={"printing_id": premium})
    assert changed.status_code == 200
    assert changed.get_json()["printing_id"] == premium
    assert changed.get_json()["printing"]["id"] == premium
    assert changed.get_json()["unit_price_cents"] == 0
    quoted = client.patch(
        url, json={"printing_id": alternate, "unit_price_cents": 1500}
    )
    assert quoted.status_code == 200
    assert quoted.get_json()["unit_price_cents"] == 1500
    cleared = client.patch(url, json={"target_quantity": 0})
    assert cleared.status_code == 200
    assert cleared.get_json()["target_quantity"] == 0
    assert cleared.get_json()["unit_price_cents"] == 1500


@pytest.mark.parametrize("plan_type", ["new_build", "existing_deck"])
def test_copy_deck_preserves_printings_and_split_retains_source_history(
    client, printings, plan_type
):
    card_id, (base, premium, alternate, _) = printings
    deck = Deck(name="Mixed deck", type="Standard")
    db.session.add(deck)
    db.session.flush()
    version = DeckVersion(deck_id=deck.id, version_name="Original")
    db.session.add(version)
    db.session.flush()
    entries = [
        DeckCard(
            deck_version_id=version.id,
            card_id=card_id,
            printing_id=base,
            quantity=3,
            zone="main",
        ),
        DeckCard(
            deck_version_id=version.id,
            card_id=card_id,
            printing_id=premium,
            quantity=1,
            zone="ride",
        ),
    ]
    db.session.add_all(entries)
    db.session.commit()
    entry_ids = [entry.id for entry in entries]
    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Rarity upgrade",
            "plan_type": plan_type,
            "list_source": "deck_version",
            "source_deck_version_id": version.id,
            **({"deck_version_id": version.id} if plan_type == "existing_deck" else {}),
        },
    )
    assert response.status_code == 201
    plan = response.get_json()
    assert [
        (item["printing_id"], item["target_quantity"]) for item in plan["items"]
    ] == [(base, 3), (premium, 1)]
    common, rare = plan["items"]
    amount = 3 if plan_type == "existing_deck" else 1
    split = _split(client, common["id"], alternate, amount, unit_price_cents=1500)
    assert split.status_code == 200
    changed = _snapshot(client, plan["id"])
    original = next(item for item in changed["items"] if item["id"] == common["id"])
    if plan_type == "existing_deck":
        assert original["target_quantity"] == 0
        assert (
            original["source_quantity"]
            == original["owned_quantity"]
            == original["removed_quantity"]
            == 3
        )
    else:
        assert original["target_quantity"] == 2
        assert original["owned_quantity"] == original["source_quantity"] == 0
    assert next(item for item in changed["items"] if item["id"] == rare["id"]) == rare
    assert changed["summary"]["required_quantity"] == 4
    assert [
        (
            db.session.get(DeckCard, entry_id).printing_id,
            db.session.get(DeckCard, entry_id).quantity,
        )
        for entry_id in entry_ids
    ] == [(base, 3), (premium, 1)]


def test_archived_plan_cannot_be_split(client, printings):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    original = _add(client, plan_id, card_id, base, 4, owned_quantity=4)
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 200
    before = _snapshot(client, plan_id)
    assert _split(client, original["id"], premium, 1).status_code == 400
    assert _snapshot(client, plan_id) == before


def test_readding_outgoing_printing_restores_targets_without_losing_history(
    client, printings
):
    card_id, (base, _, _, _) = printings
    plan_id = _plan(client)
    original = _add(
        client,
        plan_id,
        card_id,
        base,
        4,
        source_quantity=4,
        removed_quantity=4,
        owned_quantity=4,
        unit_price_cents=200,
    )
    restored = _add(client, plan_id, card_id, base, 1)
    assert restored["id"] == original["id"]
    assert restored["required_quantity"] == restored["source_quantity"] == 4
    assert restored["removed_quantity"] == 3
    assert restored["target_quantity"] == 1
    assert restored["owned_quantity"] == 4
    assert restored["unit_price_cents"] == 200


def test_add_printing_returns_committed_full_plan_without_followup_request(
    client, printings
):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    _add(client, plan_id, card_id, base, 3, unit_price_cents=200)
    response = client.post(
        f"/api/acquisition-plans/{plan_id}/printings",
        json={
            "card_id": card_id,
            "printing_id": premium,
            "required_quantity": 1,
            "unit_price_cents": 3000,
        },
    )
    assert response.status_code == 201
    plan = response.get_json()
    assert plan["summary"]["estimated_cost_cents"] == 3600
    assert len(plan["items"]) == 2
    assert plan == _snapshot(client, plan_id)


def test_full_split_retains_unlinked_inventory_notes_and_receipt_history(
    client, printings
):
    card_id, (base, premium, _, _) = printings
    plan_id = _plan(client)
    original = _add(
        client,
        plan_id,
        card_id,
        base,
        4,
        owned_quantity=2,
        ordered_quantity=1,
        unit_price_cents=200,
        notes="Keep these base copies",
    )
    response = _split(client, original["id"], premium, 4, unit_price_cents=3000)
    assert response.status_code == 200
    common, rare = response.get_json()["items"]
    assert common["required_quantity"] == common["target_quantity"] == 0
    assert common["source_quantity"] == common["removed_quantity"] == 0
    for field in ("owned_quantity", "ordered_quantity", "unit_price_cents", "notes"):
        assert common[field] == original[field]
    assert rare["target_quantity"] == 4
    assert rare["owned_quantity"] == rare["ordered_quantity"] == 0
    assert response.get_json()["summary"]["estimated_cost_cents"] == 12000
    assert response.get_json() == _snapshot(client, plan_id)

    received = client.post(
        f"/api/acquisition-plans/items/{common['id']}/receive", json={"quantity": 1}
    )
    assert received.status_code == 200
    assert received.get_json()["owned_quantity"] == 3
    assert received.get_json()["target_quantity"] == 0
    client.patch(
        f"/api/acquisition-plans/items/{rare['id']}", json={"owned_quantity": 4}
    )
    completed = _snapshot(client, plan_id)
    assert completed["summary"]["is_physically_complete"]
    assert client.post(f"/api/acquisition-plans/{plan_id}/archive").status_code == 200
    restored = client.post(f"/api/acquisition-plans/{plan_id}/restore")
    assert restored.status_code == 200
    assert restored.get_json()["items"] == completed["items"]

    returned = _split(client, rare["id"], base, 1)
    assert returned.status_code == 200
    common = next(
        item for item in returned.get_json()["items"] if item["id"] == original["id"]
    )
    assert common["target_quantity"] == 1
    assert common["owned_quantity"] == 3
    assert common["unit_price_cents"] == 200
    assert common["notes"] == original["notes"]
