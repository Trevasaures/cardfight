"""Regression checks for the public API's error and transaction boundary."""

import importlib
import logging

import httpx
import pytest
from openai import APIError, AuthenticationError, RateLimitError
from sqlalchemy.exc import OperationalError

from backend.database import db
from backend.models import Deck


@pytest.mark.parametrize(
    ("module", "function", "path", "method"),
    [
        ("cards", "create_card", "/api/cards", "post"),
        ("cards", "list_cards_page", "/api/cards/library", "get"),
        ("cards", "save_custom_set", "/api/cards/sets", "post"),
        ("deck_builder", "create_deck_version", "/api/decks/1/versions", "post"),
        ("acquisition", "create_acquisition_plan", "/api/acquisition-plans", "post"),
        ("matches", "svc_create_match", "/api/matches", "post"),
        ("cards", "analyze_card_image", "/api/cards/analyze-image", "post"),
        ("card_images", "read_image_upload", "/api/card-images", "post"),
    ],
)
@pytest.mark.parametrize("error_type", [ValueError, LookupError, RuntimeError])
def test_internal_exceptions_are_logged_but_never_returned(
    client, monkeypatch, caplog, module, function, path, method, error_type
):
    route = importlib.import_module(f"backend.routes.{module}")
    diagnostic = "private diagnostic with database or provider details"

    def failing_service(*args, **kwargs):
        raise error_type(diagnostic)

    monkeypatch.setattr(route, function, failing_service)
    with caplog.at_level(logging.ERROR):
        response = getattr(client, method)(path)

    assert response.status_code == 500
    assert response.get_json() == {"error": "internal server error"}
    assert diagnostic in caplog.text


def test_database_failure_discards_flushed_request_changes(client, monkeypatch):
    deck = Deck(name="Saved deck", type="Standard")
    db.session.add(deck)
    db.session.commit()
    deck_id = deck.id

    def failing_commit():
        # Force the change into the transaction before the simulated failure.
        db.session.flush()
        raise OperationalError("private SQL statement", {}, Exception("private detail"))

    monkeypatch.setattr(db.session, "commit", failing_commit)
    response = client.patch(f"/api/decks/{deck_id}", json={"name": "Unsaved deck"})

    assert response.status_code == 500
    assert response.get_json() == {"error": "internal server error"}
    assert db.session.get(Deck, deck_id).name == "Saved deck"
    assert client.get(f"/api/decks/{deck_id}").status_code == 200


def test_validation_after_a_partial_edit_rolls_back(client):
    deck = Deck(name="Saved deck", type="Standard")
    db.session.add(deck)
    db.session.commit()
    deck_id = deck.id

    response = client.patch(
        f"/api/decks/{deck_id}", json={"name": "Unsaved deck", "type": "invalid"}
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "type must be Standard or Stride."}
    assert db.session.get(Deck, deck_id).name == "Saved deck"


def test_invalid_match_edit_preserves_winner_and_deck_counters(client):
    first = client.post(
        "/api/decks", json={"name": "Deck A", "type": "Standard"}
    ).get_json()
    second = client.post(
        "/api/decks", json={"name": "Deck B", "type": "Standard"}
    ).get_json()
    match = client.post(
        "/api/matches",
        json={
            "deck1_id": first["id"],
            "deck2_id": second["id"],
            "winner_id": first["id"],
        },
    ).get_json()

    # A rejected correction must preserve both the recorded result and counters.
    response = client.patch(
        f'/api/matches/{match["id"]}',
        json={"winner_id": second["id"], "date_played": "invalid date"},
    )

    assert response.status_code == 400
    saved = client.get(f'/api/matches/{match["id"]}').get_json()
    assert saved["winner_id"] == first["id"]
    assert db.session.get(Deck, first["id"]).wins == 1
    assert db.session.get(Deck, first["id"]).losses == 0
    assert db.session.get(Deck, second["id"]).wins == 0
    assert db.session.get(Deck, second["id"]).losses == 1


@pytest.mark.parametrize(
    "provider_error, status",
    [(APIError, 502), (AuthenticationError, 401), (RateLimitError, 429)],
)
def test_analyzer_provider_failures_keep_status_without_provider_details(
    client, monkeypatch, provider_error, status
):
    route = importlib.import_module("backend.routes.cards")
    request = httpx.Request("POST", "https://example.com/provider")
    diagnostic = "private provider diagnostic"
    error = (
        APIError(diagnostic, request=request, body=None)
        if provider_error is APIError
        else provider_error(
            diagnostic, response=httpx.Response(status, request=request), body=None
        )
    )

    def unavailable(*args, **kwargs):
        raise error

    monkeypatch.setattr(route, "analyze_card_image", unavailable)
    response = client.post("/api/cards/analyze-image")
    assert response.status_code == status
    assert diagnostic not in response.get_json()["error"]


@pytest.mark.parametrize(
    ("method", "path", "payload", "status", "message"),
    [
        (
            "post",
            "/api/cards",
            {"name": "A", "card_type": "Normal Unit", "grade": 8},
            400,
            "grade must be between 0 and 4",
        ),
        ("get", "/api/cards/999", None, 404, "Card not found"),
        ("get", "/api/deck-versions/999", None, 404, "Deck version not found"),
        ("get", "/api/acquisition-plans/999", None, 404, "Acquisition plan not found"),
        (
            "post",
            "/api/matches",
            {"deck1_id": 999, "deck2_id": 1000},
            404,
            "One or both deck IDs do not exist.",
        ),
        (
            "get",
            "/api/cards/library?sort=invalid",
            None,
            400,
            "Invalid card library filters or sort order.",
        ),
        ("post", "/api/cards/sets", {"code": "DZ-NEW"}, 400, "Invalid card set data."),
    ],
)
def test_expected_validation_and_not_found_contracts_remain_actionable(
    client, method, path, payload, status, message
):
    response = getattr(client, method)(path, json=payload)
    assert response.status_code == status
    assert response.get_json() == {"error": message}


@pytest.mark.parametrize(
    "path",
    [
        "/api/cards",
        "/api/decks",
        "/api/matches",
        "/api/acquisition-plans",
        "/api/decks/1/versions",
    ],
)
def test_json_arrays_are_rejected_as_input_instead_of_internal_errors(client, path):
    response = client.post(path, json=[{"name": "Not an object"}])
    assert response.status_code == 400
    assert response.get_json() == {"error": "Request body must be a JSON object"}


def test_duplicate_card_response_retains_existing_card_and_printings(client):
    payload = {
        "name": "Duplicate test unit",
        "card_type": "Normal Unit",
        "grade": 1,
        "printing": {"set_code": "DZ-TEST", "card_number": "001", "rarity": "R"},
    }
    created = client.post("/api/cards", json=payload)
    assert created.status_code == 201

    response = client.post("/api/cards", json=payload)
    assert response.status_code == 409
    error = response.get_json()
    assert error["duplicate_card"]["id"] == created.get_json()["id"]
    assert error["duplicate_card"]["printings"][0]["card_number"] == "001"
    assert "already exists" in error["error"]


def test_http_errors_keep_their_status_and_required_headers(client):
    missing = client.get("/api/no-such-route")
    assert missing.status_code == 404
    assert missing.get_json() == {"error": "not found"}

    wrong_method = client.put("/api/cards")
    assert wrong_method.status_code == 405
    assert wrong_method.get_json() == {"error": "method not allowed"}
    assert "POST" in wrong_method.headers["Allow"]
