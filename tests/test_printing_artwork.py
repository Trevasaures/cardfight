"""Printing artwork stays independent while card rules and saved choices are shared."""

from datetime import timedelta
from io import BytesIO

from PIL import Image

from backend.database import db
from backend.models import CardImage, now_central


def _upload_artwork(client, color):
    output = BytesIO()
    Image.new("RGB", (100, 140), color).save(output, format="PNG")
    response = client.post(
        "/api/card-images",
        data={"image": (BytesIO(output.getvalue()), "artwork.png", "image/png")},
    )
    assert response.status_code == 201
    return response.get_json()


def _card_with_printings(client, first_artwork, second_artwork):
    response = client.post(
        "/api/cards",
        json={
            "name": "Shared rules unit",
            "card_type": "Normal Unit",
            "grade": 3,
            "nation": "Keter Sanctuary",
            "power": 13000,
            "skill_text": "[AUTO](VC): Draw a card.",
            "set_code": "ART",
            "set_name": "Artwork variants",
            "card_number": "001",
            "rarity": "RRR",
            "image_id": first_artwork["id"],
        },
    )
    assert response.status_code == 201
    card = response.get_json()
    alternate = client.post(
        f"/api/cards/{card['id']}/printings",
        json={
            "set_code": "ART",
            "set_name": "Artwork variants",
            "card_number": "001-SP",
            "rarity": "SP",
            "image_id": second_artwork["id"],
        },
    )
    assert alternate.status_code == 201
    return card, card["primary_printing"], alternate.get_json()


def _saved_printings(client, card_id):
    # End the identity-map lifetime so assertions exercise persisted references.
    db.session.remove()
    response = client.get(f"/api/cards/{card_id}")
    assert response.status_code == 200
    card = response.get_json()
    return card, {printing["id"]: printing for printing in card["printings"]}


def test_alternate_artwork_can_be_replaced_and_removed_without_changing_primary(client):
    original = _upload_artwork(client, "navy")
    alternate_art = _upload_artwork(client, "gold")
    card, primary, alternate = _card_with_printings(client, original, alternate_art)
    primary_image = client.get(primary["image_url"]).data
    alternate_image = client.get(alternate["image_url"]).data
    assert primary_image != alternate_image

    replacement = _upload_artwork(client, "green")
    response = client.patch(
        f"/api/cards/printings/{alternate['id']}",
        json={"image_id": replacement["id"], "image_url": None},
    )
    assert response.status_code == 200
    assert response.get_json()["image_url"] == replacement["image_url"]

    saved, printings = _saved_printings(client, card["id"])
    assert saved["primary_printing"]["id"] == primary["id"]
    assert printings[primary["id"]]["image_id"] == original["id"]
    assert printings[alternate["id"]]["image_id"] == replacement["id"]
    assert client.get(printings[primary["id"]]["image_url"]).data == primary_image
    assert client.get(printings[alternate["id"]]["image_url"]).data != alternate_image
    for field in ("name", "card_type", "grade", "nation", "power", "skill_text"):
        assert saved[field] == card[field]

    removed = client.patch(
        f"/api/cards/printings/{alternate['id']}",
        json={"image_id": None, "image_url": None},
    )
    assert removed.status_code == 200
    _, printings = _saved_printings(client, card["id"])
    assert printings[alternate["id"]]["image_id"] is None
    assert printings[alternate["id"]]["image_url"] is None
    assert printings[alternate["id"]]["thumbnail_url"] is None
    assert printings[alternate["id"]]["rarity"] == "SP"
    assert printings[primary["id"]]["image_id"] == original["id"]
    assert client.get(primary["thumbnail_url"]).status_code == 200


def test_removing_a_shared_image_reference_preserves_the_other_printing(client):
    shared = _upload_artwork(client, "purple")
    duplicate = _upload_artwork(client, "purple")
    assert shared["id"] == duplicate["id"]
    card, primary, alternate = _card_with_printings(client, shared, duplicate)
    assert CardImage.query.count() == 1
    full_before = client.get(shared["image_url"]).data

    removed = client.patch(
        f"/api/cards/printings/{alternate['id']}",
        json={"image_id": None, "image_url": None},
    )
    assert removed.status_code == 200

    # Trigger normal preview cleanup after the grace period. A remaining link
    # must keep the asset alive even though another printing removed its image.
    CardImage.query.update({CardImage.last_used_at: now_central() - timedelta(days=3)})
    db.session.commit()
    _upload_artwork(client, "orange")

    _, printings = _saved_printings(client, card["id"])
    assert printings[primary["id"]]["image_id"] == shared["id"]
    assert printings[alternate["id"]]["image_id"] is None
    assert client.get(shared["image_url"]).data == full_before
    assert client.get(shared["thumbnail_url"]).status_code == 200


def test_saved_deck_and_purchase_choices_keep_their_printing_artwork(client):
    first_artwork = _upload_artwork(client, "blue")
    second_artwork = _upload_artwork(client, "red")
    card, primary, alternate = _card_with_printings(
        client, first_artwork, second_artwork
    )
    deck_response = client.post(
        "/api/decks", json={"name": "Artwork deck", "type": "Standard"}
    )
    assert deck_response.status_code == 201
    deck = deck_response.get_json()
    version_response = client.post(
        f"/api/decks/{deck['id']}/versions", json={"version_name": "Original art"}
    )
    assert version_response.status_code == 201
    version = version_response.get_json()
    entry = client.post(
        f"/api/deck-versions/{version['id']}/cards",
        json={
            "card_id": card["id"],
            "printing_id": primary["id"],
            "quantity": 4,
            "zone": "main",
        },
    )
    assert entry.status_code == 201
    plan_response = client.post(
        "/api/acquisition-plans",
        json={
            "name": "Alternate artwork purchase",
            "plan_type": "new_build",
            "list_source": "empty",
        },
    )
    assert plan_response.status_code == 201
    plan = plan_response.get_json()
    item = client.post(
        f"/api/acquisition-plans/{plan['id']}/items",
        json={
            "card_id": card["id"],
            "printing_id": alternate["id"],
            "required_quantity": 4,
        },
    )
    assert item.status_code == 201

    replacement = _upload_artwork(client, "lime")
    assert client.patch(
        f"/api/cards/printings/{alternate['id']}",
        json={"image_id": replacement["id"], "image_url": None},
    ).status_code == 200
    db.session.remove()

    saved_version = client.get(f"/api/deck-versions/{version['id']}").get_json()
    saved_plan = client.get(f"/api/acquisition-plans/{plan['id']}").get_json()
    saved_entry = saved_version["cards"][0]
    saved_item = saved_plan["items"][0]
    assert saved_entry["printing_id"] == primary["id"]
    assert saved_entry["printing"]["image_url"] == first_artwork["image_url"]
    assert saved_entry["quantity"] == 4
    assert saved_item["printing_id"] == alternate["id"]
    assert saved_item["printing"]["image_url"] == replacement["image_url"]
    assert saved_item["required_quantity"] == 4
    assert saved_entry["card"]["id"] == saved_item["card"]["id"] == card["id"]


def test_expired_artwork_cannot_partially_change_an_alternate_printing(client):
    card, primary, alternate = _card_with_printings(
        client, _upload_artwork(client, "blue"), _upload_artwork(client, "red")
    )
    response = client.patch(
        f"/api/cards/printings/{alternate['id']}",
        json={"rarity": "SEC", "image_id": "expired-image", "image_url": None},
    )
    assert response.status_code == 400
    assert "Import the image again" in response.get_json()["error"]
    _, printings = _saved_printings(client, card["id"])
    assert printings[primary["id"]] == primary
    assert printings[alternate["id"]] == alternate
