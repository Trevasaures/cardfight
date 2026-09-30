from datetime import timedelta
from io import BytesIO
import socket

from PIL import Image
import pytest
from sqlalchemy import event

from backend.database import db
from backend.models import CardImage, CardPrinting, now_central
from backend.services import remote_images
from backend.services.card_images import prepare_image
from backend.services.image_processing import MAX_IMAGE_BYTES, decode_image


IMAGE_HOST = "images.ygoprodeck.com"
IMAGE_URL = f"https://{IMAGE_HOST}/card.jpeg"


def image_bytes(color="navy", image_format="PNG", size=(500, 700)):
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=image_format)
    return output.getvalue()


def upload(client, data=None, filename="card.png", mimetype="image/png"):
    return client.post(
        "/api/card-images",
        data={
            "image": (
                BytesIO(data if data is not None else image_bytes()),
                filename,
                mimetype,
            ),
        },
    )


def create_card(client, image_id=None, name="Artwork card"):
    response = client.post(
        "/api/cards",
        json={
            "name": name,
            "card_type": "Normal Unit",
            "grade": 2,
            "set_code": "ART",
            "set_name": "Artwork test",
            "card_number": "001",
            "rarity": "R",
            "image_id": image_id,
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.mark.parametrize(
    "image_format,mimetype",
    [("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")],
)
def test_upload_prepares_real_images_and_saves_shared_printing_reference(
    client, image_format, mimetype
):
    response = upload(
        client,
        image_bytes(image_format=image_format),
        "card." + image_format.lower(),
        mimetype,
    )
    assert response.status_code == 201
    asset = response.get_json()
    assert (asset["width"], asset["height"]) == (500, 700)
    assert (
        CardPrinting.query.count() == 0
    ), "A preview does not attach itself to a printing"

    card = create_card(client, asset["id"])
    printing = card["primary_printing"]
    assert printing["image_id"] == asset["id"]
    assert printing["image_url"] == asset["image_url"]
    full = client.get(printing["image_url"])
    thumbnail = client.get(printing["thumbnail_url"])
    assert full.status_code == thumbnail.status_code == 200
    assert Image.open(BytesIO(full.data)).size == (500, 700)
    assert Image.open(BytesIO(thumbnail.data)).size == (240, 336)
    assert thumbnail.mimetype == "image/webp"
    assert "immutable" in thumbnail.headers["Cache-Control"]
    assert (
        client.get(
            printing["thumbnail_url"],
            headers={"If-None-Match": thumbnail.headers["ETag"]},
        ).status_code
        == 304
    )
    assert (
        client.get(
            printing["thumbnail_url"],
            headers={"If-None-Match": "W/" + thumbnail.headers["ETag"]},
        ).status_code
        == 304
    )

    duplicate = upload(
        client, image_bytes(image_format=image_format), "other-name.png"
    ).get_json()
    assert duplicate["id"] == asset["id"]
    create_card(client, asset["id"], name="Shared artwork")
    assert CardImage.query.count() == 1


def test_replacement_removal_and_failed_saves_preserve_card_details(client):
    old = upload(client).get_json()
    card = create_card(client, old["id"])
    new = upload(client, image_bytes("gold")).get_json()
    response = client.patch(
        f"/api/cards/{card['id']}",
        json={
            "skill_text": "New ability",
            "printing": {"image_id": new["id"], "image_url": None},
        },
    )
    assert response.status_code == 200
    saved = response.get_json()
    assert saved["skill_text"] == "New ability"
    assert saved["primary_printing"]["image_id"] == new["id"]
    assert saved["primary_printing"]["image_url"] != old["image_url"]

    invalid = client.patch(
        f"/api/cards/{card['id']}",
        json={
            "skill_text": "Must not save",
            "printing": {"image_id": "missing"},
        },
    )
    assert invalid.status_code == 400
    unchanged = client.get(f"/api/cards/{card['id']}").get_json()
    assert unchanged["skill_text"] == "New ability"
    assert unchanged["primary_printing"]["image_id"] == new["id"]
    assert upload(client, b"not a picture").status_code == 400
    assert (
        client.get(f"/api/cards/{card['id']}").get_json()["primary_printing"][
            "image_id"
        ]
        == new["id"]
    )

    removed = client.patch(
        f"/api/cards/{card['id']}",
        json={"printing": {"image_id": None, "image_url": None}},
    )
    assert removed.get_json()["primary_printing"]["image_url"] is None
    assert (
        client.get(new["image_url"]).status_code == 200
    ), "Open previews have a grace period"


def test_normal_catalog_queries_and_cache_validation_do_not_read_blobs(client):
    asset = upload(client).get_json()
    create_card(client, asset["id"])
    db.session.remove()
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement.lower())

    event.listen(db.engine, "before_cursor_execute", capture)
    try:
        catalog = client.get("/api/cards/library").get_json()
        client.get(
            asset["image_url"], headers={"If-None-Match": f'"{asset["id"]}-full"'}
        )
    finally:
        event.remove(db.engine, "before_cursor_execute", capture)
    assert catalog["items"][0]["primary_printing"]["image_id"] == asset["id"]
    assert not any("full_data" in sql or "thumbnail_data" in sql for sql in statements)
    assert len(str(catalog)) < 5000


def test_abandoned_previews_expire_but_linked_images_and_recent_replacements_remain(
    client,
):
    abandoned = upload(client, image_bytes("red")).get_json()
    linked = upload(client, image_bytes("blue")).get_json()
    card = create_card(client, linked["id"])
    old_time = now_central() - timedelta(days=3)
    CardImage.query.update({CardImage.last_used_at: old_time})
    db.session.commit()
    upload(client, image_bytes("green"))
    assert db.session.get(CardImage, abandoned["id"]) is None
    assert db.session.get(CardImage, linked["id"]) is not None
    client.patch(f"/api/cards/{card['id']}", json={"printing": {"image_id": None}})
    upload(client, image_bytes("yellow"))
    assert db.session.get(CardImage, linked["id"]) is not None


@pytest.mark.parametrize(
    "data",
    [b"", b"<html>not an image</html>", b"x" * (MAX_IMAGE_BYTES + 1)],
    ids=["empty", "html", "oversized"],
)
def test_invalid_and_oversized_uploads_leave_no_asset(client, data):
    assert upload(client, data).status_code in {400, 413}
    assert CardImage.query.count() == 0


def test_dimensions_animation_orientation_and_resize(client):
    with pytest.raises(ValueError, match="dimensions"):
        decode_image(image_bytes(size=(5000, 4100)))
    animated = BytesIO()
    Image.new("RGB", (20, 20), "red").save(
        animated,
        format="WEBP",
        save_all=True,
        append_images=[Image.new("RGB", (20, 20), "blue")],
        duration=100,
    )
    assert (
        upload(client, animated.getvalue(), "animated.webp", "image/webp").status_code
        == 400
    )
    source = Image.new("RGB", (700, 500), "red")
    exif = source.getexif()
    exif[274] = 6
    output = BytesIO()
    source.save(output, "JPEG", exif=exif)
    rotated = prepare_image(output.getvalue())
    assert (rotated.width, rotated.height) == (500, 700)
    resized = prepare_image(image_bytes(size=(1500, 2100)))
    assert (resized.width, resized.height) == (1200, 1680)


def test_unknown_artwork_and_variants_return_404(client):
    assert client.get("/api/card-images/missing/full").status_code == 404
    asset = upload(client).get_json()
    assert client.get(f'/api/card-images/{asset["id"]}/other').status_code == 404


class RemoteResponse:
    def __init__(self, status=200, headers=None, data=None):
        self.status = status
        self.headers = headers or {}
        self.data = data if data is not None else image_bytes(image_format="JPEG")
        self.closed = False

    def stream(self, *_args, **_kwargs):
        yield self.data

    def close(self):
        self.closed = True


def mock_remote(monkeypatch, responses, requests=None):
    calls = []
    monkeypatch.setattr(
        remote_images.socket,
        "getaddrinfo",
        lambda *_a, **_k: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", 443)),
        ],
    )

    class Pool:
        def __init__(self, address, **kwargs):
            calls.append((address, kwargs))

        def request(self, method, target, **kwargs):
            if requests is not None:
                requests.append((method, target, kwargs))
            return responses.pop(0)

        def close(self):
            pass

    monkeypatch.setattr(remote_images.urllib3, "HTTPSConnectionPool", Pool)
    monkeypatch.setattr(remote_images.urllib3, "HTTPConnectionPool", Pool)
    return calls


def test_url_import_downloads_and_converts_once_with_redirect_validation(
    client, monkeypatch
):
    calls = mock_remote(
        monkeypatch,
        [
            RemoteResponse(302, {"Location": "/final.jpeg"}),
            RemoteResponse(),
        ],
    )
    response = client.post("/api/card-images", json={"url": IMAGE_URL})
    assert response.status_code == 201
    assert len(calls) == 2
    assert calls[1][0] == "93.184.215.14"
    assert calls[1][1]["assert_hostname"] == IMAGE_HOST
    assert client.get(response.get_json()["image_url"]).status_code == 200
    assert (
        len(calls) == 2
    ), "Rendering reads SQLite and never downloads the source again"


@pytest.mark.parametrize(
    "url",
    [
        None,
        "file:///etc/passwd",
        f"https://user:pass@{IMAGE_HOST}/x",
        f"https://{IMAGE_HOST}:5000/x",
    ],
)
def test_invalid_url_inputs_are_rejected(client, url):
    assert client.post("/api/card-images", json={"url": url}).status_code == 400


@pytest.mark.parametrize(
    "address", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1"]
)
def test_url_import_rejects_private_destinations(monkeypatch, address):
    calls = mock_remote(monkeypatch, [])
    monkeypatch.setattr(
        remote_images.socket,
        "getaddrinfo",
        lambda *_a, **_k: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443)),
        ],
    )
    with pytest.raises(ValueError, match="public image URL"):
        remote_images.download_image(IMAGE_URL)
    assert calls == [], "Reject the resolved address before opening a connection"


def test_url_redirects_limits_and_http_failures_do_not_store_images(
    client, monkeypatch
):
    for responses in [
        [RemoteResponse(302, {"Location": "file:///etc/passwd"})],
        [RemoteResponse(404)],
        [RemoteResponse(headers={"Content-Length": str(MAX_IMAGE_BYTES + 1)})],
        [RemoteResponse(data=b"x" * (MAX_IMAGE_BYTES + 1))],
        [RemoteResponse(data=b"<html>Error</html>")],
        [RemoteResponse(302, {"Location": "/loop"}) for _ in range(4)],
    ]:
        expected_requests = len(responses)
        calls = mock_remote(monkeypatch, responses)
        assert (
            client.post("/api/card-images", json={"url": IMAGE_URL}).status_code == 400
        )
        assert len(calls) == expected_requests, "Exercise the response checks"
    assert CardImage.query.count() == 0


@pytest.mark.parametrize(
    "url,target",
    [
        (IMAGE_URL, "/card.jpeg"),
        (f"http://{IMAGE_HOST}/card.jpeg", "/card.jpeg"),
        (f"https://{IMAGE_HOST}", "/"),
        (f"https://{IMAGE_HOST}/café.jpeg", "/caf%C3%A9.jpeg"),
        (
            f"https://{IMAGE_HOST}/card%20name.jpeg?w=500&label=G%203#preview",
            "/card%20name.jpeg?w=500&label=G%203",
        ),
        (
            f"https://{IMAGE_HOST}/card.jpeg?source=https://example.com/art",
            "/card.jpeg?source=https://example.com/art",
        ),
    ],
)
def test_request_uses_only_origin_form_and_the_validated_connection(
    monkeypatch, url, target
):
    requests = []
    response = RemoteResponse()
    calls = mock_remote(monkeypatch, [response], requests)
    assert remote_images.download_image(url) == response.data
    assert response.closed
    assert calls[0][0] == "93.184.215.14"
    port = 80 if url.startswith("http:") else 443
    assert calls[0][1]["port"] == port
    if port == 443:
        assert calls[0][1]["server_hostname"] == IMAGE_HOST
        assert calls[0][1]["assert_hostname"] == IMAGE_HOST
    method, sent_target, options = requests[0]
    assert (method, sent_target) == ("GET", target)
    assert options["headers"]["Host"] == IMAGE_HOST
    assert options["assert_same_host"] is True
    assert options["redirect"] is False
    assert options["retries"] is False


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/card.jpeg",
        f"https://{IMAGE_HOST}.example.com/card.jpeg",
        f"https://{IMAGE_HOST}@example.com/card.jpeg",
        f"https://{IMAGE_HOST}:0/card.jpeg",
        f"ftp://{IMAGE_HOST}/card.jpeg",
        f"//{IMAGE_HOST}/card.jpeg",
        f" {IMAGE_URL}",
        f"https://{IMAGE_HOST}/card\r\nHeader:injected",
        f"https://{IMAGE_HOST}/card\t.jpeg",
        f"https://{IMAGE_HOST}/card\x00.jpeg",
        f"https://{IMAGE_HOST}\\@example.com/card.jpeg",
    ],
)
def test_unapproved_or_ambiguous_urls_fail_before_dns(client, monkeypatch, url):
    def unexpected_dns(*_args, **_kwargs):
        pytest.fail("Invalid input must not reach DNS")

    monkeypatch.setattr(remote_images.socket, "getaddrinfo", unexpected_dns)
    response = client.post("/api/card-images", json={"url": url})
    assert response.status_code == 400
    assert response.get_json() == {"error": "Invalid image input."}
    assert CardImage.query.count() == 0


@pytest.mark.parametrize("path", ["//example.com/x", "///example.com/x"])
def test_authority_like_paths_never_reach_the_http_client(monkeypatch, path):
    calls = mock_remote(monkeypatch, [])
    with pytest.raises(ValueError, match="direct image URL"):
        remote_images.download_image(f"https://{IMAGE_HOST}{path}")
    assert calls == []


@pytest.mark.parametrize(
    "location",
    [
        "https://example.com/card.jpeg",
        "//127.0.0.1/card.jpeg",
        "http://169.254.169.254/latest/meta-data/",
        f"https://{IMAGE_HOST}:5000/card.jpeg",
        f"https://{IMAGE_HOST}//example.com/card.jpeg",
        "/card\r\n.jpeg",
        "\\\\example.com/card.jpeg",
    ],
)
def test_redirects_cannot_bypass_destination_or_target_checks(
    client, monkeypatch, location
):
    response = RemoteResponse(302, {"Location": location})
    calls = mock_remote(monkeypatch, [response])
    result = client.post("/api/card-images", json={"url": IMAGE_URL})
    assert result.status_code == 400
    assert len(calls) == 1, "No connection to the redirect destination"
    assert response.closed
    assert CardImage.query.count() == 0


def test_dns_is_pinned_per_hop_and_rechecked_after_a_redirect(monkeypatch):
    calls = mock_remote(monkeypatch, [RemoteResponse(302, {"Location": "/next"})])
    resolutions = []

    def resolve(host, port, **_kwargs):
        resolutions.append((host, port))
        address = "93.184.215.14" if len(resolutions) == 1 else "127.0.0.1"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    monkeypatch.setattr(remote_images.socket, "getaddrinfo", resolve)
    with pytest.raises(ValueError, match="public image URL"):
        remote_images.download_image(IMAGE_URL)
    assert resolutions == [(IMAGE_HOST, 443), (IMAGE_HOST, 443)]
    assert len(calls) == 1
    assert calls[0][0] == "93.184.215.14"


def test_mixed_public_and_private_dns_answers_are_rejected(monkeypatch):
    calls = mock_remote(monkeypatch, [])
    monkeypatch.setattr(
        remote_images.socket,
        "getaddrinfo",
        lambda *_a, **_k: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))
            for address in ["93.184.215.14", "10.0.0.1"]
        ],
    )
    with pytest.raises(ValueError, match="public image URL"):
        remote_images.download_image(IMAGE_URL)
    assert calls == []
