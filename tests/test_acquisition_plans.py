from backend.database import db
from backend.models import Card, Deck, DeckCard, DeckVersion


def _create_card(name="Test Card", grade=1):
    card = Card(
        name=name,
        grade=grade,
        nation="Keter Sanctuary",
        card_type="Normal Unit",
        skill_text="",
        flavor_text="",
    )
    db.session.add(card)
    db.session.flush()
    return card


def _create_deck_version():
    deck = Deck(name="Test Deck", type="Standard")
    db.session.add(deck)
    db.session.flush()

    version = DeckVersion(
        deck_id=deck.id,
        version_name="Version 1",
        is_active=True,
    )
    db.session.add(version)
    db.session.flush()
    return deck, version


def test_new_build_plan_can_exist_without_a_deck(client):
    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Brand-new build",
            "plan_type": "new_build",
            "list_source": "empty",
            "deck_type": "Standard",
            "nation": "Stoicheia",
        },
    )

    assert response.status_code == 201
    plan = response.get_json()
    assert plan["name"] == "Brand-new build"
    assert plan["deck_id"] is None
    assert plan["deck_version_id"] is None
    assert plan["source_deck_version_id"] is None
    assert plan["items"] == []
    assert plan["summary"]["required_quantity"] == 0


def test_new_build_can_copy_a_version_without_linking_to_that_deck(
    app_context,
    client,
):
    deck, version = _create_deck_version()
    card = _create_card()
    db.session.add_all(
        [
            DeckCard(
                deck_version_id=version.id,
                card_id=card.id,
                quantity=3,
                zone="main",
            ),
            DeckCard(
                deck_version_id=version.id,
                card_id=card.id,
                quantity=1,
                zone="ride",
            ),
        ]
    )
    db.session.commit()

    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Second physical copy",
            "plan_type": "new_build",
            "list_source": "deck_version",
            "source_deck_version_id": version.id,
        },
    )

    assert response.status_code == 201
    plan = response.get_json()
    assert plan["deck_id"] is None
    assert plan["deck_version_id"] is None
    assert plan["source_deck_version_id"] == version.id
    assert plan["deck_type"] == deck.type
    assert len(plan["items"]) == 1
    assert plan["items"][0]["required_quantity"] == 4
    assert plan["items"][0]["source_quantity"] == 0
    assert plan["items"][0]["owned_quantity"] == 0


def test_existing_deck_plan_links_target_and_uses_it_as_default_source(
    app_context,
    client,
):
    deck, version = _create_deck_version()
    card = _create_card()
    db.session.add(
        DeckCard(
            deck_version_id=version.id,
            card_id=card.id,
            quantity=4,
            zone="main",
        )
    )
    db.session.commit()

    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Finish Test Deck",
            "plan_type": "existing_deck",
            "list_source": "deck_version",
            "deck_version_id": version.id,
        },
    )

    assert response.status_code == 201
    plan = response.get_json()
    assert plan["deck_id"] == deck.id
    assert plan["deck_version_id"] == version.id
    assert plan["source_deck_version_id"] == version.id
    assert plan["items"][0]["required_quantity"] == 4
    assert plan["items"][0]["source_quantity"] == 4
    assert plan["items"][0]["target_quantity"] == 4
    assert plan["items"][0]["owned_quantity"] == 4
    assert plan["items"][0]["missing_quantity"] == 0
    assert plan["summary"]["is_physically_complete"] is True


def test_existing_deck_plan_tracks_outgoing_and_incoming_changes(
    app_context,
    client,
):
    deck, version = _create_deck_version()
    current_card = _create_card("Current Unit", grade=3)
    replacement_card = _create_card("Replacement Unit", grade=3)
    db.session.add(
        DeckCard(
            deck_version_id=version.id,
            card_id=current_card.id,
            quantity=4,
            zone="main",
        )
    )
    db.session.commit()

    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Upgrade Test Deck",
            "plan_type": "existing_deck",
            "list_source": "deck_version",
            "deck_version_id": version.id,
        },
    )
    plan = response.get_json()
    current_item = plan["items"][0]

    outgoing_response = client.patch(
        f"/api/acquisition-plans/items/{current_item['id']}",
        json={"target_quantity": 0},
    )
    outgoing = outgoing_response.get_json()
    assert outgoing_response.status_code == 200
    assert outgoing["source_quantity"] == 4
    assert outgoing["target_quantity"] == 0
    assert outgoing["removed_quantity"] == 4
    assert outgoing["missing_quantity"] == 0

    replacement_response = client.post(
        f"/api/acquisition-plans/{plan['id']}/items",
        json={
            "card_id": replacement_card.id,
            "required_quantity": 4,
            "ordered_quantity": 4,
            "unit_price_cents": 200,
        },
    )
    replacement = replacement_response.get_json()
    assert replacement_response.status_code == 201
    assert replacement["source_quantity"] == 0
    assert replacement["target_quantity"] == 4
    assert replacement["ordered_quantity"] == 4
    assert replacement["status"] == "ordered"
    assert replacement["purchase_quantity"] == 4
    assert replacement["estimated_cost_cents"] == 800
    assert replacement["remaining_cost_cents"] == 0

    refreshed = client.get(f"/api/acquisition-plans/{plan['id']}").get_json()
    assert refreshed["summary"]["required_quantity"] == 4
    assert refreshed["summary"]["removed_quantity"] == 4
    assert refreshed["summary"]["missing_quantity"] == 0
    assert refreshed["summary"]["estimated_cost_cents"] == 800


def test_reducing_an_existing_card_does_not_create_a_false_shortage(
    app_context,
    client,
):
    _, version = _create_deck_version()
    card = _create_card("Reduced Unit", grade=2)
    db.session.add(
        DeckCard(
            deck_version_id=version.id,
            card_id=card.id,
            quantity=3,
            zone="main",
        )
    )
    db.session.commit()

    plan = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Reduced upgrade",
            "plan_type": "existing_deck",
            "list_source": "deck_version",
            "deck_version_id": version.id,
        },
    ).get_json()
    item = plan["items"][0]

    response = client.patch(
        f"/api/acquisition-plans/items/{item['id']}",
        json={
            "target_quantity": 1,
            "owned_quantity": 2,
        },
    )
    reduced = response.get_json()

    assert response.status_code == 200
    assert reduced["source_quantity"] == 3
    assert reduced["target_quantity"] == 1
    assert reduced["removed_quantity"] == 2
    assert reduced["available_quantity"] == 1
    assert reduced["missing_quantity"] == 0
    assert reduced["status"] == "owned"


def test_existing_deck_plan_can_track_only_new_purchases(
    app_context,
    client,
):
    deck, version = _create_deck_version()
    db.session.commit()

    response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Upgrade-only list",
            "plan_type": "existing_deck",
            "list_source": "empty",
            "deck_version_id": version.id,
        },
    )

    assert response.status_code == 201
    plan = response.get_json()
    assert plan["deck_id"] == deck.id
    assert plan["deck_version_id"] == version.id
    assert plan["source_deck_version_id"] is None
    assert plan["items"] == []


def test_item_shortages_prices_and_receiving_are_computed_safely(
    app_context,
    client,
):
    card = _create_card()
    db.session.commit()

    plan_response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Purchase test",
            "plan_type": "new_build",
            "list_source": "empty",
        },
    )
    plan_id = plan_response.get_json()["id"]

    item_response = client.post(
        f"/api/acquisition-plans/{plan_id}/items",
        json={
            "card_id": card.id,
            "required_quantity": 4,
            "owned_quantity": 1,
            "ordered_quantity": 2,
            "unit_price_cents": 250,
        },
    )

    assert item_response.status_code == 201
    item = item_response.get_json()
    assert item["missing_quantity"] == 1
    assert item["purchase_quantity"] == 3
    assert item["estimated_cost_cents"] == 750
    assert item["remaining_cost_cents"] == 250
    assert item["status"] == "partial"

    received_response = client.post(
        f"/api/acquisition-plans/items/{item['id']}/receive",
        json={"quantity": 2},
    )
    received = received_response.get_json()
    assert received_response.status_code == 200
    assert received["owned_quantity"] == 3
    assert received["ordered_quantity"] == 0
    assert received["missing_quantity"] == 1
    assert received["estimated_cost_cents"] == 250

    overage_response = client.patch(
        f"/api/acquisition-plans/items/{item['id']}",
        json={"owned_quantity": 5},
    )
    overage = overage_response.get_json()
    assert overage_response.status_code == 200
    assert overage["missing_quantity"] == 0
    assert overage["overage_quantity"] == 1
    assert overage["estimated_cost_cents"] == 0
    assert overage["remaining_cost_cents"] == 0

    invalid_response = client.patch(
        f"/api/acquisition-plans/items/{item['id']}",
        json={"ordered_quantity": -1},
    )
    assert invalid_response.status_code == 400
    assert "cannot be negative" in invalid_response.get_json()["error"]
