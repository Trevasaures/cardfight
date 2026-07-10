import pytest

from backend.services.cards import create_card, update_card


def test_card_options_include_known_sets_and_dual_nations(client):
    response = client.get("/api/cards/options")

    assert response.status_code == 200
    payload = response.get_json()

    assert payload["grades"] == [0, 1, 2, 3, 4]
    assert "Lyrical Monasterio" in payload["nations"]
    assert "Brandt Gate / Keter Sanctuary" in payload["nations"]
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
