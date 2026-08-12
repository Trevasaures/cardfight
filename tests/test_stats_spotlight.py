from datetime import datetime, timedelta

from backend.database import db
from backend.models import Deck, DeckVersion, Match


def _add_match(
    subject,
    opponent,
    *,
    winner,
    first_player,
    played_at,
    subject_version=None,
):
    match = Match(
        deck1=subject,
        deck2=opponent,
        deck1_version=subject_version,
        winner_id=winner.id if winner else None,
        first_player_id=first_player.id if first_player else None,
        format=subject.type,
        date_played=played_at,
    )
    db.session.add(match)
    return match


def test_performance_spotlight_builds_actionable_deck_profile(app_context, client):
    subject = Deck(
        name="Spotlight Deck",
        type="Standard",
        nation="Brandt Gate",
        nation_icon="brandt_gate.png",
    )
    alpha = Deck(name="Alpha", type="Standard", nation="Dragon Empire")
    beta = Deck(name="Beta", type="Standard", nation="Dark States")
    version = DeckVersion(
        deck=subject,
        version_name="Spotlight v2",
        is_active=True,
    )
    db.session.add_all([subject, alpha, beta, version])
    db.session.flush()

    start = datetime(2026, 1, 1, 18, 0)
    _add_match(
        subject,
        alpha,
        winner=subject,
        first_player=subject,
        played_at=start,
        subject_version=version,
    )
    _add_match(
        subject,
        alpha,
        winner=alpha,
        first_player=alpha,
        played_at=start + timedelta(days=1),
        subject_version=version,
    )
    _add_match(
        subject,
        alpha,
        winner=subject,
        first_player=subject,
        played_at=start + timedelta(days=2),
    )
    _add_match(
        subject,
        beta,
        winner=subject,
        first_player=beta,
        played_at=start + timedelta(days=3),
    )
    _add_match(
        subject,
        beta,
        winner=beta,
        first_player=subject,
        played_at=start + timedelta(days=4),
    )
    _add_match(
        subject,
        beta,
        winner=None,
        first_player=subject,
        played_at=start + timedelta(days=5),
    )
    db.session.commit()

    response = client.get(f"/api/stats/spotlight/{subject.id}")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["deck"]["name"] == "Spotlight Deck"
    assert payload["overview"] == {
        "wins": 3,
        "losses": 2,
        "undecided": 1,
        "decided_games": 5,
        "logged_games": 6,
        "win_pct": 0.6,
        "opponents_faced": 2,
        "first_match_at": start.isoformat(),
        "last_match_at": (start + timedelta(days=5)).isoformat(),
    }
    assert payload["sample"]["level"] == "developing"

    assert payload["recent_form"]["wins"] == 3
    assert payload["recent_form"]["losses"] == 2
    assert payload["recent_form"]["window"] == 5
    assert [row["result"] for row in payload["recent_form"]["results"]] == [
        "W",
        "L",
        "W",
        "W",
        "L",
    ]
    assert payload["streak"] == {
        "result": "L",
        "length": 1,
        "label": "1 game loss streak",
    }

    assert payload["turn_order"]["first"]["wins"] == 2
    assert payload["turn_order"]["first"]["losses"] == 1
    assert payload["turn_order"]["second"]["wins"] == 1
    assert payload["turn_order"]["second"]["losses"] == 1
    assert payload["turn_order"]["edge_percentage_points"] == 16.7

    assert payload["matchups"]["best"]["opponent_name"] == "Alpha"
    assert payload["matchups"]["hardest"]["opponent_name"] == "Beta"
    assert payload["version"]["active"]["version_name"] == "Spotlight v2"
    assert payload["version"]["tagged_matches"] == 2
    assert payload["version"]["active_record"]["wins"] == 1
    assert payload["version"]["active_record"]["losses"] == 1
    assert {insight["key"] for insight in payload["insights"]} == {
        "recent-form",
        "turn-order",
        "matchup-pressure",
        "active-version",
    }


def test_performance_spotlight_handles_a_deck_without_matches(app_context, client):
    deck = Deck(name="Fresh Build", type="Standard", active=True)
    db.session.add(deck)
    db.session.commit()

    response = client.get(f"/api/stats/spotlight/{deck.id}")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["overview"]["logged_games"] == 0
    assert payload["overview"]["win_pct"] == 0
    assert payload["sample"]["level"] == "early"
    assert payload["recent_form"]["results"] == []
    assert payload["turn_order"]["edge_percentage_points"] is None
    assert payload["matchups"]["best"] is None
    assert payload["version"]["active"] is None
    assert payload["insights"] == []


def test_performance_spotlight_returns_404_for_unknown_deck(client):
    response = client.get("/api/stats/spotlight/999")

    assert response.status_code == 404
    assert response.get_json() == {"error": "Deck not found"}


def test_new_matches_snapshot_each_decks_active_version(app_context, client):
    deck_one = Deck(name="Versioned One", type="Standard")
    deck_two = Deck(name="Versioned Two", type="Standard")
    old_version = DeckVersion(
        deck=deck_one,
        version_name="Old build",
        is_active=False,
    )
    active_one = DeckVersion(
        deck=deck_one,
        version_name="Current build",
        is_active=True,
    )
    active_two = DeckVersion(
        deck=deck_two,
        version_name="Opponent build",
        is_active=True,
    )
    db.session.add_all([deck_one, deck_two, old_version, active_one, active_two])
    db.session.commit()

    response = client.post(
        "/api/matches",
        json={
            "deck1_id": deck_one.id,
            "deck2_id": deck_two.id,
            "winner_id": deck_one.id,
            "first_player_id": deck_two.id,
            "format": "Standard",
        },
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["deck1_version_id"] == active_one.id
    assert payload["deck1_version"]["version_name"] == "Current build"
    assert payload["deck2_version_id"] == active_two.id
    assert payload["deck2_version"]["version_name"] == "Opponent build"
