import pytest

from backend.database import db
from backend.models import Card, CardPrinting, CardSet
from backend.services.cards import (
    DuplicateCardNameError,
    add_card_printing,
    create_card,
    update_card,
)


def test_card_options_include_known_sets_and_dual_nations(client):
    response = client.get("/api/cards/options")

    assert response.status_code == 200
    payload = response.get_json()

    assert payload["grades"] == [0, 1, 2, 3, 4]
    assert "G Unit" in payload["card_types"]
    assert "Lyrical Monasterio" in payload["nations"]
    assert "Brandt Gate / Keter Sanctuary" in payload["nations"]
    assert "Nationless" in payload["nations"]
    assert not any("Nationless /" in nation for nation in payload["nations"])
    assert {"code": "DZ-BT01", "name": "Fated Clash"} in payload["sets"]


def test_known_set_code_uses_authoritative_set_name(app_context):
    card = create_card(
        {
            "name": "Test Unit",
            "grade": 1,
            "nation": "Brandt Gate",
            "card_type": "Normal Unit",
            "set_code": "dz-bt01",
            "set_name": "Incorrect name",
            "card_number": "001",
            "rarity": "RR",
        }
    )

    assert card.printings.first().set_code == "DZ-BT01"
    assert card.printings.first().set_name == "Fated Clash"


def test_custom_set_can_be_saved_and_reused_as_authoritative_metadata(
    app_context,
    client,
):
    response = client.post(
        "/api/cards/sets",
        json={
            "code": "dz-ss15",
            "name": "The Legendary Vanguards",
        },
    )

    assert response.status_code == 201
    assert response.get_json() == {
        "code": "DZ-SS15",
        "name": "The Legendary Vanguards",
    }

    options = client.get("/api/cards/options").get_json()
    assert {
        "code": "DZ-SS15",
        "name": "The Legendary Vanguards",
    } in options["sets"]

    card = create_card(
        {
            "name": "Reusable Set Test",
            "grade": 2,
            "nation": "Keter Sanctuary",
            "card_type": "Normal Unit",
            "set_code": "dz-ss15",
            "set_name": "A name that should not win",
            "card_number": "001EN",
            "rarity": "RR",
        }
    )

    assert card.printings.first().set_code == "DZ-SS15"
    assert card.printings.first().set_name == "The Legendary Vanguards"


def test_existing_custom_printing_is_discovered_as_a_set_option(
    app_context,
    client,
):
    card = Card(
        name="Historical Custom Printing",
        grade=1,
        nation="Brandt Gate",
        card_type="Normal Unit",
    )
    db.session.add(card)
    db.session.flush()
    db.session.add(
        CardPrinting(
            card_id=card.id,
            set_code="DZ-LEGACY",
            set_name="Previously Entered Product",
            card_number="001EN",
            rarity="R",
        )
    )
    db.session.commit()

    options = client.get("/api/cards/options").get_json()

    assert {
        "code": "DZ-LEGACY",
        "name": "Previously Entered Product",
    } in options["sets"]

    managed_sets = client.get("/api/cards/sets").get_json()
    assert {
        "code": "DZ-LEGACY",
        "name": "Previously Entered Product",
        "usage_count": 1,
    } in managed_sets

    update_response = client.patch(
        "/api/cards/sets/DZ-LEGACY",
        json={
            "code": "DZ-LEGACY",
            "name": "Corrected Historical Product",
        },
    )

    assert update_response.status_code == 200
    assert update_response.get_json()["usage_count"] == 1
    assert CardSet.query.filter_by(code="DZ-LEGACY").one().name == (
        "Corrected Historical Product"
    )
    assert CardPrinting.query.one().set_name == "Corrected Historical Product"


def test_creating_a_card_automatically_remembers_its_custom_set(app_context):
    create_card(
        {
            "name": "Automatic Set Memory",
            "grade": 1,
            "nation": "Stoicheia",
            "card_type": "Normal Unit",
            "set_code": "dz-future01",
            "set_name": "Future Product",
            "card_number": "001EN",
            "rarity": "C",
        }
    )

    saved_set = CardSet.query.filter_by(code="DZ-FUTURE01").one()
    assert saved_set.name == "Future Product"


def test_built_in_set_name_cannot_be_overwritten(client):
    response = client.post(
        "/api/cards/sets",
        json={"code": "DZ-BT01", "name": "Incorrect name"},
    )

    assert response.status_code == 409
    assert "already exists as 'Fated Clash'" in response.get_json()["error"]


def test_duplicate_custom_set_code_requires_the_explicit_update_route(client):
    first_response = client.post(
        "/api/cards/sets",
        json={"code": "DZ-CUSTOM", "name": "Original Product"},
    )
    duplicate_response = client.post(
        "/api/cards/sets",
        json={"code": "dz-custom", "name": "Different Product"},
    )

    assert first_response.status_code == 201
    assert duplicate_response.status_code == 409
    assert "Use Manage reusable card sets" in duplicate_response.get_json()["error"]


def test_updating_a_custom_set_cascades_to_linked_printings_and_blocks_collisions(
    app_context,
    client,
):
    client.post(
        "/api/cards/sets",
        json={"code": "DZ-OLD", "name": "Old Product"},
    )
    client.post(
        "/api/cards/sets",
        json={"code": "DZ-TAKEN", "name": "Taken Product"},
    )
    card = create_card(
        {
            "name": "Set Cascade Test",
            "grade": 2,
            "nation": "Dragon Empire",
            "card_type": "Normal Unit",
            "set_code": "DZ-OLD",
            "set_name": "Old Product",
            "card_number": "001EN",
            "rarity": "RR",
        }
    )

    response = client.patch(
        "/api/cards/sets/DZ-OLD",
        json={"code": "dz-new", "name": "New Product"},
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "code": "DZ-NEW",
        "name": "New Product",
        "usage_count": 1,
    }
    printing = card.printings.one()
    assert printing.set_code == "DZ-NEW"
    assert printing.set_name == "New Product"
    assert CardSet.query.filter_by(code="DZ-OLD").first() is None
    assert CardSet.query.filter_by(code="DZ-NEW").one().name == "New Product"

    collision = client.patch(
        "/api/cards/sets/DZ-NEW",
        json={"code": "DZ-TAKEN", "name": "Collision"},
    )
    assert collision.status_code == 409
    assert "already exists" in collision.get_json()["error"]
    assert card.printings.one().set_code == "DZ-NEW"


def test_only_unused_custom_sets_can_be_deleted(app_context, client):
    client.post(
        "/api/cards/sets",
        json={"code": "DZ-UNUSED", "name": "Unused Product"},
    )
    client.post(
        "/api/cards/sets",
        json={"code": "DZ-USED", "name": "Used Product"},
    )
    create_card(
        {
            "name": "Deletion Guard Test",
            "grade": 0,
            "nation": "Nationless",
            "card_type": "Trigger Unit",
            "set_code": "DZ-USED",
            "set_name": "Used Product",
            "card_number": "001EN",
            "rarity": "C",
        }
    )

    unused_response = client.delete("/api/cards/sets/DZ-UNUSED")
    used_response = client.delete("/api/cards/sets/DZ-USED")

    assert unused_response.status_code == 204
    assert CardSet.query.filter_by(code="DZ-UNUSED").first() is None
    assert used_response.status_code == 409
    assert used_response.get_json()["usage_count"] == 1
    assert "Update the set instead of deleting" in used_response.get_json()["error"]
    assert CardSet.query.filter_by(code="DZ-USED").one()


def test_nationless_card_input_is_stored_as_null(app_context):
    card = create_card(
        {
            "name": "Nationless Promo",
            "grade": 0,
            "nation": "Nationless",
            "card_type": "Trigger Unit",
        }
    )

    assert card.nation is None


def test_card_can_be_updated_to_nationless(app_context):
    card = create_card(
        {
            "name": "Regalis Piece",
            "grade": 3,
            "nation": "Keter Sanctuary",
            "card_type": "Normal Order",
        }
    )

    updated = update_card(card.id, {"nation": "Nationless"})

    assert updated.nation is None


def test_card_library_can_filter_for_nationless_cards(client):
    create_card(
        {
            "name": "Nationless Trigger",
            "grade": 0,
            "nation": None,
            "card_type": "Trigger Unit",
        }
    )
    create_card(
        {
            "name": "Nationed Trigger",
            "grade": 0,
            "nation": "Dragon Empire",
            "card_type": "Trigger Unit",
        }
    )

    response = client.get("/api/cards/library?nation=Nationless")

    assert response.status_code == 200
    payload = response.get_json()
    assert [card["name"] for card in payload["items"]] == ["Nationless Trigger"]


def test_card_library_searches_card_printing_metadata(client):
    create_card(
        {
            "name": "Printing Metadata Target",
            "grade": 2,
            "nation": "Keter Sanctuary",
            "card_type": "Normal Unit",
            "set_code": "DZ-SS15",
            "set_name": "The Legendary Vanguards",
            "card_number": "DZ-SS15/099EN",
            "rarity": "SEARCH-RARITY",
        }
    )
    create_card(
        {
            "name": "Unrelated Catalog Card",
            "grade": 1,
            "nation": "Dragon Empire",
            "card_type": "Normal Unit",
            "set_code": "DZ-BT01",
            "card_number": "DZ-BT01/001EN",
            "rarity": "C",
        }
    )

    for search_term in (
        "DZ-SS15",
        "Legendary Vanguards",
        "099EN",
        "SEARCH-RARITY",
    ):
        response = client.get(
            "/api/cards/library",
            query_string={"q": search_term},
        )

        assert response.status_code == 200
        assert [card["name"] for card in response.get_json()["items"]] == [
            "Printing Metadata Target"
        ]


def test_card_catalog_set_filter_matches_any_printing_without_duplicates(client):
    target = create_card(
        {
            "name": "Multi-print Set Target",
            "grade": 3,
            "nation": "Brandt Gate",
            "card_type": "Normal Unit",
            "set_code": "DZ-SS15",
            "set_name": "The Legendary Vanguards",
            "card_number": "DZ-SS15/010EN",
            "rarity": "RRR",
        }
    )
    add_card_printing(
        target.id,
        {
            "set_code": "DZ-SS15",
            "set_name": "The Legendary Vanguards",
            "card_number": "DZ-SS15/SR10EN",
            "rarity": "SR",
        },
    )
    create_card(
        {
            "name": "Different Set Card",
            "grade": 3,
            "nation": "Brandt Gate",
            "card_type": "Normal Unit",
            "set_code": "DZ-BT14",
            "card_number": "DZ-BT14/010EN",
            "rarity": "RRR",
        }
    )

    library_response = client.get(
        "/api/cards/library",
        query_string={"set_code": "dz-ss15"},
    )
    search_response = client.get(
        "/api/cards/search",
        query_string={"set_code": "DZ-SS15"},
    )

    assert library_response.status_code == 200
    assert [card["name"] for card in library_response.get_json()["items"]] == [
        "Multi-print Set Target"
    ]
    assert [card["name"] for card in search_response.get_json()] == [
        "Multi-print Set Target"
    ]


@pytest.mark.parametrize("grade", [-1, 5])
def test_card_grade_must_be_between_zero_and_four(app_context, grade):
    with pytest.raises(ValueError, match="between 0 and 4"):
        create_card(
            {
                "name": "Invalid Grade",
                "grade": grade,
                "card_type": "Normal Unit",
            }
        )


def test_card_update_rejects_grade_above_four(app_context):
    card = create_card(
        {
            "name": "Valid Grade",
            "grade": 4,
            "card_type": "Normal Unit",
        }
    )

    with pytest.raises(ValueError, match="between 0 and 4"):
        update_card(card.id, {"grade": 5})


def test_existing_card_name_requires_a_new_printing_instead(app_context):
    card = create_card(
        {
            "name": "Printing Test Dragon",
            "grade": 3,
            "nation": "Dark States",
            "card_type": "Normal Unit",
            "set_code": "DZ-BT01",
            "set_name": "Fated Clash",
            "card_number": "001",
            "rarity": "RRR",
        }
    )

    with pytest.raises(
        DuplicateCardNameError,
        match="Add another printing",
    ):
        create_card(
            {
                "name": "printing test dragon",
                "grade": 3,
                "nation": "Dark States",
                "card_type": "Normal Unit",
                "set_code": "DZ-BT01",
                "set_name": "Fated Clash",
                "card_number": "001-SR",
                "rarity": "SR",
            }
        )

    added = add_card_printing(
        card.id,
        {
            "set_code": "DZ-BT01",
            "set_name": "Fated Clash",
            "card_number": "001-SR",
            "rarity": "SR",
        },
    )

    assert added.card_id == card.id
    assert card.printings.count() == 2
