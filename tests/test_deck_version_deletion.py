"""Deck version deletion must preserve the exact builds saved in match history."""

import pytest

from backend.database import db
from backend.models import Card, CardPrinting, Deck, DeckCard, DeckVersion, Match


@pytest.fixture()
def version_history(client):
    first = Deck(name="Youthberk", type="Standard")
    second = Deck(name="Drajeweled", type="Standard")
    card = Card(name="Historical Vanguard", grade=3, card_type="Normal Unit")
    historical = DeckVersion(
        deck=first, version_name="Original build", notes="Keep this build", is_active=False
    )
    current = DeckVersion(deck=first, version_name="Current build", is_active=True)
    opponent = DeckVersion(deck=second, version_name="Opponent build", is_active=True)
    printing = CardPrinting(card=card, set_code="DZ-TEST", card_number="001", rarity="SR")
    db.session.add_all([first, second, card, historical, current, opponent, printing])
    db.session.flush()

    entries = [
        DeckCard(
            deck_version=historical,
            card=card,
            printing=printing,
            quantity=quantity,
            zone=zone,
            sort_order=position,
        )
        for zone, quantity, position in [("main", 4, 7), ("ride", 1, 2)]
    ]
    db.session.add_all(entries)
    db.session.commit()

    # A different version of the same deck is already used in a saved match.
    response = client.post(
        "/api/matches",
        json={
            "deck1_id": first.id,
            "deck2_id": second.id,
            "deck1_version_id": current.id,
            "deck2_version_id": opponent.id,
            "winner_id": second.id,
            "date_played": "2026-10-10T19:30:00",
            "notes": "Unrelated current-build match",
        },
    )
    assert response.status_code == 201

    return {
        "first": first.id,
        "second": second.id,
        "historical": historical.id,
        "current": current.id,
        "opponent": opponent.id,
        "card": card.id,
        "printing": printing.id,
        "entries": [entry.id for entry in entries],
    }


def record_historical_match(client, data, participant, *, winner_id):
    deck_ids = [data["first"], data["second"]]
    version_ids = [data["historical"], data["opponent"]]
    if participant == 2:
        deck_ids.reverse()
        version_ids.reverse()

    response = client.post(
        "/api/matches",
        json={
            "deck1_id": deck_ids[0],
            "deck2_id": deck_ids[1],
            "deck1_version_id": version_ids[0],
            "deck2_version_id": version_ids[1],
            "winner_id": winner_id,
            "first_player_id": data["first"],
            "format": "Standard",
            "date_played": "2026-10-11T20:15:00",
            "notes": f"Historical build in participant {participant}",
        },
    )
    assert response.status_code == 201
    return response.get_json()


@pytest.mark.parametrize("participant", [1, 2])
def test_referenced_inactive_version_returns_conflict_and_preserves_all_history(
    client, version_history, participant
):
    data = version_history
    linked_matches = [
        record_historical_match(client, data, participant, winner_id=winner_id)
        for winner_id in [data["first"], None]
    ]
    version_url = f'/api/deck-versions/{data["historical"]}'
    version_before = client.get(version_url).get_json()
    matches_before = client.get("/api/matches").get_json()
    decks_before = client.get("/api/decks").get_json()

    response = client.delete(version_url)

    assert response.status_code == 409
    assert response.get_json() == {
        "error": (
            "This deck version is referenced by match history. "
            "Retain this historical version to preserve saved matches."
        )
    }
    db.session.expire_all()
    assert client.get(version_url).get_json() == version_before
    assert client.get("/api/matches").get_json() == matches_before
    assert client.get("/api/decks").get_json() == decks_before
    assert DeckCard.query.filter_by(deck_version_id=data["historical"]).count() == 2
    assert Match.query.count() == 3
    for match in linked_matches:
        assert client.get(f'/api/matches/{match["id"]}').get_json() == match


def test_unreferenced_inactive_version_and_entries_can_be_deleted(client, version_history):
    data = version_history
    matches_before = client.get("/api/matches").get_json()
    decks_before = client.get("/api/decks").get_json()
    version_url = f'/api/deck-versions/{data["historical"]}'

    response = client.delete(version_url)

    assert response.status_code == 200
    assert response.get_json() == {"deleted": True, "id": data["historical"]}
    db.session.expire_all()
    assert db.session.get(DeckVersion, data["historical"]) is None
    assert all(db.session.get(DeckCard, entry_id) is None for entry_id in data["entries"])
    assert db.session.get(Card, data["card"]) is not None
    assert db.session.get(CardPrinting, data["printing"]) is not None
    assert client.get(version_url).status_code == 404
    assert client.get("/api/matches").get_json() == matches_before
    assert client.get("/api/decks").get_json() == decks_before
    assert client.get(f'/api/deck-versions/{data["current"]}').status_code == 200


@pytest.mark.parametrize("has_match_history", [False, True])
def test_active_version_keeps_existing_restriction(client, version_history, has_match_history):
    data = version_history
    if has_match_history:
        record_historical_match(client, data, 1, winner_id=data["first"])
    version_url = f'/api/deck-versions/{data["historical"]}'
    assert client.patch(version_url, json={"is_active": True}).status_code == 200
    version_before = client.get(version_url).get_json()
    matches_before = client.get("/api/matches").get_json()

    response = client.delete(version_url)

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "Active deck versions cannot be deleted. Activate another version first."
    }
    assert client.get(version_url).get_json() == version_before
    assert client.get("/api/matches").get_json() == matches_before


def test_missing_version_deletion_returns_not_found(client):
    response = client.delete("/api/deck-versions/99999")

    assert response.status_code == 404
    assert response.get_json() == {"error": "Deck version not found"}
