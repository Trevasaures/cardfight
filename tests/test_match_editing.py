"""Match corrections preserve historical builds and the decks' stored records."""

import pytest

from backend.database import db
from backend.models import Deck, DeckVersion


@pytest.fixture()
def recorded_match(client):
    first = Deck(name="Youthberk", type="Standard")
    second = Deck(name="Drajeweled", type="Standard")
    replacement = Deck(name="Luard", type="Stride", active=False)
    unversioned = Deck(name="Test deck", type="Standard")
    db.session.add_all([first, second, replacement, unversioned])
    db.session.flush()

    historical = DeckVersion(deck=first, version_name="Original", is_active=False)
    current = DeckVersion(deck=first, version_name="Revised", is_active=True)
    second_build = DeckVersion(deck=second, version_name="Current", is_active=True)
    replacement_build = DeckVersion(
        deck=replacement, version_name="Stride build", is_active=True
    )
    db.session.add_all([historical, current, second_build, replacement_build])
    db.session.commit()

    created = client.post(
        "/api/matches",
        json={
            "deck1_id": first.id,
            "deck2_id": second.id,
            "deck1_version_id": historical.id,
            "deck2_version_id": second_build.id,
            "winner_id": first.id,
            "first_player_id": first.id,
            "format": "Standard",
            "date_played": "2026-10-14T19:30:45",
            "notes": "Original notes",
        },
    )
    assert created.status_code == 201
    return {
        "match": created.get_json(),
        "first": first.id,
        "second": second.id,
        "replacement": replacement.id,
        "unversioned": unversioned.id,
        "historical": historical.id,
        "current": current.id,
        "second_build": second_build.id,
        "replacement_build": replacement_build.id,
    }


def deck_records(*deck_ids):
    db.session.expire_all()
    return [
        (db.session.get(Deck, deck_id).wins, db.session.get(Deck, deck_id).losses)
        for deck_id in deck_ids
    ]


def test_edit_can_correct_every_match_field_and_delete_uses_the_corrected_result(
    client, recorded_match
):
    data = recorded_match
    match_id = data["match"]["id"]
    response = client.patch(
        f"/api/matches/{match_id}",
        json={
            "deck2_id": data["replacement"],
            "deck1_version_id": data["current"],
            "deck2_version_id": data["replacement_build"],
            "winner_id": data["replacement"],
            "first_player_id": data["replacement"],
            "format": "Any",
            "date_played": "2026-10-15T21:15:12",
            "notes": "  Corrected matchup.\nNew observations.  ",
        },
    )

    assert response.status_code == 200
    updated = response.get_json()
    assert updated["deck2_name"] == "Luard"
    assert updated["deck2"]["active"] is False
    assert updated["deck1_version_id"] == data["current"]
    assert updated["deck1_version"]["version_name"] == "Revised"
    assert updated["deck2_version_id"] == data["replacement_build"]
    assert updated["winner_id"] == updated["first_player_id"] == data["replacement"]
    assert updated["format"] == "Any"
    assert updated["date_played_iso"] == "2026-10-15T21:15:12"
    assert updated["notes"] == "Corrected matchup.\nNew observations."
    assert deck_records(data["first"], data["second"], data["replacement"]) == [
        (0, 1),
        (0, 0),
        (1, 0),
    ]

    assert client.delete(f"/api/matches/{match_id}").status_code == 204
    assert deck_records(data["first"], data["second"], data["replacement"]) == [
        (0, 0),
        (0, 0),
        (0, 0),
    ]


def test_metadata_edits_preserve_historical_versions_and_recorded_time(
    client, recorded_match
):
    data = recorded_match
    response = client.patch(
        f'/api/matches/{data["match"]["id"]}',
        json={"notes": "Updated observations", "first_player_id": None, "format": None},
    )

    assert response.status_code == 200
    updated = response.get_json()
    assert updated["deck1_version_id"] == data["historical"]
    assert updated["deck2_version_id"] == data["second_build"]
    assert updated["date_played_iso"] == data["match"]["date_played_iso"]
    assert updated["first_player_id"] is None
    assert updated["format"] is None
    assert deck_records(data["first"], data["second"]) == [(1, 0), (0, 1)]


def test_historical_versions_and_notes_can_be_explicitly_cleared(
    client, recorded_match
):
    data = recorded_match
    response = client.patch(
        f'/api/matches/{data["match"]["id"]}',
        json={"deck1_version_id": None, "deck2_version_id": None, "notes": None},
    )

    assert response.status_code == 200
    updated = response.get_json()
    assert updated["deck1_version_id"] is updated["deck1_version"] is None
    assert updated["deck2_version_id"] is updated["deck2_version"] is None
    assert updated["notes"] == ""


@pytest.mark.parametrize(
    ("replacement", "expected_version"),
    [("replacement", "replacement_build"), ("unversioned", None)],
)
def test_replacing_a_participant_resolves_its_build_without_reusing_the_old_decks_version(
    client, recorded_match, replacement, expected_version
):
    data = recorded_match
    response = client.patch(
        f'/api/matches/{data["match"]["id"]}',
        json={"deck2_id": data[replacement]},
    )

    assert response.status_code == 200
    updated = response.get_json()
    assert updated["deck1_version_id"] == data["historical"]
    assert updated["deck2_version_id"] == (
        data[expected_version] if expected_version else None
    )
    assert deck_records(data["first"], data["second"], data[replacement]) == [
        (1, 0),
        (0, 0),
        (0, 1),
    ]


def test_winner_corrections_and_undecided_results_do_not_accumulate_counters(
    client, recorded_match
):
    data = recorded_match
    match_url = f'/api/matches/{data["match"]["id"]}'
    for winner_id, expected_records in [
        (data["second"], [(0, 1), (1, 0)]),
        (None, [(0, 0), (0, 0)]),
        (data["first"], [(1, 0), (0, 1)]),
        (data["first"], [(1, 0), (0, 1)]),
    ]:
        response = client.patch(match_url, json={"winner_id": winner_id})
        assert response.status_code == 200
        assert response.get_json()["winner_id"] == winner_id
        assert response.get_json()["is_undecided"] is (winner_id is None)
        assert deck_records(data["first"], data["second"]) == expected_records

    # Reopening and saving an unchanged match should not alter its result.
    saved = client.get(match_url).get_json()
    assert (
        client.patch(
            match_url,
            json={
                key: saved[key]
                for key in (
                    "deck1_id",
                    "deck2_id",
                    "deck1_version_id",
                    "deck2_version_id",
                    "winner_id",
                    "first_player_id",
                    "format",
                    "notes",
                )
            },
        ).status_code
        == 200
    )
    assert deck_records(data["first"], data["second"]) == [(1, 0), (0, 1)]


@pytest.mark.parametrize(
    ("invalid_field", "value", "is_fixture_key", "status"),
    [
        ("deck1_id", None, False, 400),
        ("deck1_id", "second", True, 400),
        ("deck2_id", 99999, False, 404),
        ("deck1_version_id", "second_build", True, 400),
        ("deck2_version_id", 99999, False, 400),
        ("winner_id", "replacement", True, 400),
        ("first_player_id", "replacement", True, 400),
        ("format", "Unknown", False, 400),
        ("notes", ["Unexpected object"], False, 400),
        ("date_played", "invalid date", False, 400),
        ("date_played", "2026-02-30", False, 400),
    ],
)
def test_invalid_match_corrections_leave_all_fields_and_counters_unchanged(
    client, recorded_match, invalid_field, value, is_fixture_key, status
):
    data = recorded_match
    match_url = f'/api/matches/{data["match"]["id"]}'
    response = client.patch(
        match_url,
        json={
            "winner_id": data["second"],
            "notes": "Unsaved corrections",
            invalid_field: data[value] if is_fixture_key else value,
        },
    )

    assert response.status_code == status
    assert client.get(match_url).get_json() == data["match"]
    assert deck_records(data["first"], data["second"], data["replacement"]) == [
        (1, 0),
        (0, 1),
        (0, 0),
    ]


def test_changed_participants_cannot_keep_a_version_from_the_previous_deck(
    client, recorded_match
):
    data = recorded_match
    match_url = f'/api/matches/{data["match"]["id"]}'
    response = client.patch(
        match_url,
        json={
            "deck2_id": data["replacement"],
            "deck2_version_id": data["second_build"],
            "winner_id": data["replacement"],
        },
    )
    assert response.status_code == 400
    assert "must belong to its selected deck" in response.get_json()["error"]
    assert client.get(match_url).get_json() == data["match"]


def test_edit_converts_an_explicit_timezone_to_the_stored_central_time(
    client, recorded_match
):
    data = recorded_match
    response = client.patch(
        f'/api/matches/{data["match"]["id"]}',
        json={"date_played": "2026-10-15T20:45:12+00:00"},
    )
    assert response.status_code == 200
    assert response.get_json()["date_played_iso"] == "2026-10-15T15:45:12"
