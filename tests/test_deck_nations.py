"""Deck nation choices stay aligned with the catalog and shipped artwork."""

from pathlib import Path

import pytest

from backend.database import db
from backend.models import Deck


EXPECTED_NATIONS = {
    "Dragon Empire": "dragon_empire.png",
    "Dark States": "dark_states.png",
    "Brandt Gate": "brandt_gate.png",
    "Keter Sanctuary": "keter_sanctuary.png",
    "Stoicheia": "stoicheia.png",
    "Lyrical Monasterio": "lyrical_monasterio.png",
}


def test_deck_options_include_all_six_nations_with_shipped_artwork(client):
    response = client.get("/api/decks/options")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["types"] == ["Standard", "Stride"]
    assert payload["nations"] == [
        {"name": name, "icon": icon, "icon_path": f"/nations/{icon}"}
        for name, icon in EXPECTED_NATIONS.items()
    ]

    card_nations = client.get("/api/cards/options").get_json()["nations"]
    artwork_directory = (
        Path(__file__).resolve().parents[1] / "frontend-web" / "public" / "nations"
    )
    for nation, icon in EXPECTED_NATIONS.items():
        assert nation in card_nations
        assert (artwork_directory / icon).is_file()


@pytest.mark.parametrize("deck_type", ["Standard", "Stride"])
@pytest.mark.parametrize("nation, icon", EXPECTED_NATIONS.items())
def test_create_and_edit_decks_preserve_each_nation_and_artwork(
    client, nation, icon, deck_type
):
    created = client.post(
        "/api/decks",
        json={"name": "Nation test", "type": deck_type, "nation": f" {nation} "},
    )

    assert created.status_code == 201
    payload = created.get_json()
    deck_id = payload["id"]
    assert payload["nation"] == nation
    assert payload["nation_icon"] == icon
    assert db.session.get(Deck, deck_id).nation == nation

    # Change to another nation first so the PATCH must replace both saved fields.
    other_nation = "Dark States" if nation == "Dragon Empire" else "Dragon Empire"
    assert client.patch(
        f"/api/decks/{deck_id}", json={"nation": other_nation}
    ).status_code == 200

    edited = client.patch(f"/api/decks/{deck_id}", json={"nation": nation})
    assert edited.status_code == 200
    assert edited.get_json()["nation"] == nation
    assert edited.get_json()["nation_icon"] == icon

    saved = client.get(f"/api/decks/{deck_id}").get_json()
    assert saved["nation"] == nation
    assert saved["nation_icon"] == icon
    assert client.get("/api/decks").get_json() == [saved]


@pytest.mark.parametrize("empty_nation", [None, "", "   "])
def test_no_nation_is_supported_on_create_and_edit(client, empty_nation):
    created = client.post(
        "/api/decks",
        json={"name": "No nation", "type": "Standard", "nation": empty_nation},
    )

    assert created.status_code == 201
    payload = created.get_json()
    assert payload["nation"] is None
    assert payload["nation_icon"] is None

    deck_id = payload["id"]
    assert client.patch(
        f"/api/decks/{deck_id}", json={"nation": "Dragon Empire"}
    ).status_code == 200
    cleared = client.patch(
        f"/api/decks/{deck_id}", json={"nation": empty_nation}
    )
    assert cleared.status_code == 200
    assert cleared.get_json()["nation"] is None
    assert cleared.get_json()["nation_icon"] is None


def test_omitting_nation_defaults_on_create_and_preserves_it_on_edit(client):
    created = client.post(
        "/api/decks", json={"name": "Optional nation", "type": "Standard"}
    )
    assert created.status_code == 201
    payload = created.get_json()
    assert payload["nation"] is None
    assert payload["nation_icon"] is None

    deck_id = payload["id"]
    assert client.patch(
        f"/api/decks/{deck_id}", json={"nation": "Lyrical Monasterio"}
    ).status_code == 200
    renamed = client.patch(f"/api/decks/{deck_id}", json={"name": "Renamed"})

    assert renamed.status_code == 200
    assert renamed.get_json()["nation"] == "Lyrical Monasterio"
    assert renamed.get_json()["nation_icon"] == "lyrical_monasterio.png"


@pytest.mark.parametrize("invalid_nation", ["Unknown nation", "Nationless", 7, {}])
def test_invalid_nation_is_rejected_on_create_and_edit(client, invalid_nation):
    invalid_create = client.post(
        "/api/decks",
        json={"name": "Invalid", "type": "Standard", "nation": invalid_nation},
    )
    assert invalid_create.status_code == 400
    message = invalid_create.get_json()["error"]
    assert "nation must be one of:" in message
    assert all(nation in message for nation in EXPECTED_NATIONS)
    assert Deck.query.count() == 0

    created = client.post(
        "/api/decks",
        json={"name": "Original", "type": "Standard", "nation": "Dragon Empire"},
    ).get_json()
    invalid_edit = client.patch(
        f"/api/decks/{created['id']}",
        json={"name": "Should not persist", "nation": invalid_nation},
    )

    assert invalid_edit.status_code == 400
    assert invalid_edit.get_json()["error"] == message
    assert client.get(f"/api/decks/{created['id']}").get_json() == created
