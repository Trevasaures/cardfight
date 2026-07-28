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

    overage_response = client.patch(
        f"/api/acquisition-plans/items/{item['id']}",
        json={"owned_quantity": 5},
    )
    overage = overage_response.get_json()
    assert overage_response.status_code == 200
    assert overage["missing_quantity"] == 0
    assert overage["overage_quantity"] == 1
    assert overage["remaining_cost_cents"] == 0

    invalid_response = client.patch(
        f"/api/acquisition-plans/items/{item['id']}",
        json={"ordered_quantity": -1},
    )
    assert invalid_response.status_code == 400
    assert "cannot be negative" in invalid_response.get_json()["error"]
