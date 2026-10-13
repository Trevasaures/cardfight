from io import BytesIO
from random import Random

from PIL import Image
import pytest

from backend.database import db
from backend.models import Card, CardImage, CardPrinting
from backend.services.card_images import prepare_image


def _bytes(image):
    output = BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def _quadrants(size=(700, 500)):
    image = Image.new("RGB", size)
    half_width, half_height = size[0] // 2, size[1] // 2
    image.paste("red", (0, 0, half_width, half_height))
    image.paste("green", (half_width, 0, size[0], half_height))
    image.paste("blue", (0, half_height, half_width, size[1]))
    image.paste("yellow", (half_width, half_height, size[0], size[1]))
    return image


def _upload(client, image, card_type=None):
    data = {"image": (BytesIO(_bytes(image)), "crest.png", "image/png")}
    if card_type is not None:
        data["card_type"] = card_type
    response = client.post("/api/card-images", data=data)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def _full(client, asset):
    response = client.get(asset["image_url"])
    assert response.status_code == 200
    with Image.open(BytesIO(response.data)) as image:
        return image.convert("RGBA")


@pytest.mark.parametrize("card_type", ["Crest", "Ride Deck Crest"])
def test_portrait_crest_rotates_counterclockwise_with_exact_ratio_and_correct_pixels(
    client, card_type
):
    upright = _quadrants()
    portrait = upright.transpose(Image.Transpose.ROTATE_270)
    asset = _upload(client, portrait, card_type)
    assert (asset["width"], asset["height"]) == (700, 500)
    assert _full(client, asset).tobytes() == upright.convert("RGBA").tobytes()
    thumb_response = client.get(asset["thumbnail_url"])
    assert Image.open(BytesIO(thumb_response.data)).size == (336, 240)


@pytest.mark.parametrize("size", [(700, 500), (900, 500), (300, 300), (80, 40)])
def test_landscape_stays_upright_and_all_source_pixels_survive_contain_padding(
    client, size
):
    source = _quadrants(size)
    asset = _upload(client, source, "Crest")
    full = _full(client, asset)
    assert full.width * 5 == full.height * 7
    assert full.width >= source.width and full.height >= source.height
    offset = ((full.width - source.width) // 2, (full.height - source.height) // 2)
    restored = full.crop(
        (offset[0], offset[1], offset[0] + source.width, offset[1] + source.height)
    )
    assert restored.tobytes() == source.convert("RGBA").tobytes()
    if full.height > source.height:
        assert full.getpixel((0, 0))[3] == 0
    if full.width > source.width:
        assert full.getpixel((0, 0))[3] == 0


def test_crest_resize_limits_and_exif_orientation_precede_ccw_rotation(client):
    asset = _upload(client, _quadrants((2500, 3500)), "Crest")
    assert (asset["width"], asset["height"]) == (1680, 1200)
    assert _full(client, asset).getpixel((100, 100))[:3] == (0, 128, 0)
    # The stored pixels are sideways, but EXIF already makes them landscape.
    # Applying EXIF first avoids an unnecessary second rotation.
    source = _quadrants().transpose(Image.Transpose.ROTATE_270)
    exif = source.getexif()
    exif[274] = 8
    output = BytesIO()
    source.save(output, "JPEG", quality=100, subsampling=0, exif=exif)
    image = prepare_image(output.getvalue(), "Ride Deck Crest")
    assert (image.width, image.height) == (700, 500)
    assert _full(client, {"image_url": f"/api/card-images/{image.id}/full"}).getpixel(
        (100, 100)
    )[:3] == (254, 0, 0)


def test_unit_artwork_keeps_portrait_and_smaller_original_optimization(client):
    portrait = _quadrants().transpose(Image.Transpose.ROTATE_270)
    normal = _upload(client, portrait, "Normal Unit")
    default = _upload(client, portrait)
    crest = _upload(client, portrait, "Crest")
    ride_crest = _upload(client, portrait, "Ride Deck Crest")
    assert normal["id"] == default["id"]
    assert (normal["width"], normal["height"]) == (500, 700)
    assert len({normal["id"], crest["id"], ride_crest["id"]}) == 3
    output = BytesIO()
    # A low-quality textured JPEG is smaller than the high-quality WebP recipe.
    source = Image.frombytes("RGB", (150, 210), Random(7).randbytes(150 * 210 * 3))
    source.save(output, "JPEG", quality=30)
    original = output.getvalue()
    saved = prepare_image(original, "Trigger Unit")
    assert saved.full_data == original
    assert saved.mimetype == "image/jpeg"


def test_crest_import_and_existing_asset_normalization_are_idempotent_unattached_drafts(
    client,
):
    portrait = _quadrants().transpose(Image.Transpose.ROTATE_270)
    normal = _upload(client, portrait)
    first = client.post(
        "/api/card-images", json={"image_id": normal["id"], "card_type": "Crest"}
    ).get_json()
    assert first["id"] != normal["id"]
    normalized_again = client.post(
        "/api/card-images", json={"image_id": first["id"], "card_type": " crest "}
    ).get_json()
    assert normalized_again["id"] == first["id"]
    same_source = client.post(
        "/api/card-images", json={"image_id": normal["id"], "card_type": "Crest"}
    ).get_json()
    assert same_source["id"] == first["id"]
    # The normal asset may have been compressed lossily. Its derived pixels can
    # differ from a new import of the original scan; each path remains stable.
    reuploaded = _upload(client, portrait, "Crest")
    assert _upload(client, portrait, "Crest")["id"] == reuploaded["id"]
    assert CardImage.query.count() == len({normal["id"], first["id"], reuploaded["id"]})
    assert CardPrinting.query.count() == 0
    assert _full(client, normal).size == (500, 700)
    assert (
        client.post(
            "/api/card-images", json={"image_id": "missing", "card_type": "Crest"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/card-images", json={"image_id": None, "card_type": "Crest"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/card-images",
            json={
                "image_id": first["id"],
                "url": "https://example.com/image.jpg",
                "card_type": "Crest",
            },
        ).status_code
        == 400
    )


def _legacy_card(name, image_id, card_type="Crest"):
    card = Card(
        name=name, card_type=card_type, grade=2 if card_type == "Normal Unit" else None
    )
    db.session.add(card)
    db.session.flush()
    printing = CardPrinting(
        card_id=card.id, image_id=image_id, set_code="CREST", card_number=str(card.id)
    )
    db.session.add(printing)
    db.session.commit()
    return card, printing


@pytest.mark.parametrize("card_type", ["Crest", "Ride Deck Crest"])
def test_crest_card_save_relinks_legacy_artwork_and_preserves_shared_original(
    client, card_type
):
    portrait = _quadrants().transpose(Image.Transpose.ROTATE_270)
    original = _upload(client, portrait)
    original_bytes = db.session.get(CardImage, original["id"]).full_data
    normal, normal_printing = _legacy_card("Shared unit", original["id"], "Normal Unit")
    crest, crest_printing = _legacy_card("Legacy crest", original["id"], card_type)
    response = client.patch(f"/api/cards/{crest.id}", json={"skill_text": "Saved text"})
    assert response.status_code == 200
    saved_id = response.get_json()["primary_printing"]["image_id"]
    assert saved_id != original["id"]
    assert db.session.get(CardPrinting, normal_printing.id).image_id == original["id"]
    assert db.session.get(CardImage, original["id"]).full_data == original_bytes
    for _ in range(2):
        saved = client.patch(
            f"/api/cards/{crest.id}", json={"skill_text": "Saved text again"}
        )
        assert saved.get_json()["primary_printing"]["image_id"] == saved_id
    assert CardImage.query.count() == 2
    assert db.session.get(CardPrinting, crest_printing.id).image_id == saved_id
    assert (
        client.get(f"/api/cards/{normal.id}").get_json()["primary_printing"]["image_id"]
        == original["id"]
    )


def test_creating_crest_and_changing_unit_type_normalize_the_linked_image(client):
    asset = _upload(client, _quadrants().transpose(Image.Transpose.ROTATE_270))
    created = client.post(
        "/api/cards",
        json={
            "name": "Created crest",
            "card_type": "Crest",
            "image_id": asset["id"],
            "set_code": "CREST",
            "card_number": "CREATE",
        },
    )
    assert created.status_code == 201
    crest_id = created.get_json()["primary_printing"]["image_id"]
    assert crest_id != asset["id"]
    unit, _ = _legacy_card("Converting unit", asset["id"], "Normal Unit")
    changed = client.patch(f"/api/cards/{unit.id}", json={"card_type": "Crest"})
    assert changed.status_code == 200
    assert changed.get_json()["primary_printing"]["image_id"] == crest_id
    assert changed.get_json()["grade"] is None


def test_rejected_duplicate_card_and_printing_do_not_create_derived_assets(client):
    asset = _upload(client, _quadrants().transpose(Image.Transpose.ROTATE_270))
    crest, printing = _legacy_card("Duplicate crest", asset["id"])
    rejected_card = client.post(
        "/api/cards",
        json={
            "name": crest.name,
            "card_type": "Crest",
            "image_id": asset["id"],
            "set_code": "CREST",
            "card_number": "NEW",
        },
    )
    assert rejected_card.status_code == 409
    rejected_printing = client.post(
        f"/api/cards/{crest.id}/printings",
        json={
            "set_code": printing.set_code,
            "card_number": printing.card_number,
            "image_id": asset["id"],
        },
    )
    assert rejected_printing.status_code == 409
    assert CardImage.query.count() == 1
    assert CardPrinting.query.count() == 1
    assert db.session.get(CardPrinting, printing.id).image_id == asset["id"]


def test_printing_add_and_edit_normalize_crest_links_and_leave_url_fallback_unchanged(
    client,
):
    asset = _upload(client, _quadrants().transpose(Image.Transpose.ROTATE_270))
    crest, printing = _legacy_card("Printing crest", None)
    added = client.post(
        f"/api/cards/{crest.id}/printings",
        json={"image_id": asset["id"], "card_number": "SECOND"},
    )
    assert added.status_code == 201
    derived = added.get_json()["image_id"]
    assert derived != asset["id"]
    updated = client.patch(
        f"/api/cards/printings/{printing.id}", json={"image_id": asset["id"]}
    )
    assert updated.status_code == 200
    assert updated.get_json()["image_id"] == derived
    fallback = "https://tcgplayer-cdn.tcgplayer.com/product/708712_in_1000x1000.jpg"
    client.patch(
        f"/api/cards/printings/{printing.id}",
        json={"image_id": None, "image_url": fallback},
    )
    result = client.patch(
        f"/api/cards/{crest.id}", json={"skill_text": "Updated"}
    ).get_json()
    assert result["primary_printing"]["image_id"] is None
    assert result["primary_printing"]["image_url"] == fallback


def test_failed_crest_save_rolls_back_metadata_printings_and_derived_asset(client):
    original = _upload(client, _quadrants().transpose(Image.Transpose.ROTATE_270))
    crest, primary = _legacy_card("Atomic crest", original["id"])
    broken = CardImage(
        id="broken",
        full_data=b"invalid image",
        thumbnail_data=b"invalid",
        mimetype="image/webp",
        width=500,
        height=700,
        byte_size=13,
        thumbnail_byte_size=7,
    )
    db.session.add(broken)
    db.session.flush()
    secondary = CardPrinting(card_id=crest.id, image_id=broken.id, card_number="BROKEN")
    db.session.add(secondary)
    db.session.commit()
    failed = client.patch(
        f"/api/cards/{crest.id}", json={"skill_text": "Must not save"}
    )
    assert failed.status_code == 400
    assert db.session.get(Card, crest.id).skill_text == ""
    assert db.session.get(CardPrinting, primary.id).image_id == original["id"]
    assert db.session.get(CardPrinting, secondary.id).image_id == broken.id
    assert CardImage.query.count() == 2


def test_crest_url_import_uses_the_existing_validated_downloader(client, monkeypatch):
    from backend.routes import card_images

    calls = []
    portrait = _quadrants().transpose(Image.Transpose.ROTATE_270)

    def downloaded(url):
        calls.append(url)
        return _bytes(portrait)

    monkeypatch.setattr(card_images, "download_image", downloaded)
    url = "https://tcgplayer-cdn.tcgplayer.com/product/708712_in_1000x1000.jpg"
    response = client.post(
        "/api/card-images", json={"url": url, "card_type": "Ride Deck Crest"}
    )
    assert response.status_code == 201
    assert calls == [url]
    assert (response.get_json()["width"], response.get_json()["height"]) == (700, 500)


@pytest.mark.parametrize("card_type", ["Crest", "Ride Deck Crest"])
def test_crest_url_import_keeps_destination_checks(client, monkeypatch, card_type):
    from backend.services import remote_images

    def unexpected_lookup(*_args, **_kwargs):
        pytest.fail("Unapproved URLs must be rejected before DNS lookup")

    monkeypatch.setattr(remote_images.socket, "getaddrinfo", unexpected_lookup)
    for url in (
        "https://localhost/image.jpg",
        "file:///private/image.png",
        "https://tcgplayer-cdn.tcgplayer.com@127.0.0.1/image.jpg",
    ):
        response = client.post(
            "/api/card-images", json={"url": url, "card_type": card_type}
        )
        assert response.status_code == 400
    assert CardImage.query.count() == 0


def test_crest_cache_validation_uses_immutable_variant_urls(client):
    asset = _upload(client, _quadrants(), "Crest")
    for variant in ("image_url", "thumbnail_url"):
        original = client.get(asset[variant])
        assert "immutable" in original.headers["Cache-Control"]
        unchanged = client.get(
            asset[variant], headers={"If-None-Match": original.headers["ETag"]}
        )
        assert unchanged.status_code == 304
        assert unchanged.data == b""
