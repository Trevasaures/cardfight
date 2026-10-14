"""Shared history aggregation preserves legacy record and matrix semantics."""

from types import SimpleNamespace

from backend.database import db
from backend.models import Deck, Match
from backend.services.deck_records import calculate_deck_records


def test_record_aggregation_keeps_undecided_and_invalid_results_out_of_win_rates():
    decks = [SimpleNamespace(id=2), SimpleNamespace(id=1), SimpleNamespace(id=3)]
    matches = [
        SimpleNamespace(deck1_id=1, deck2_id=2, winner_id=winner)
        for winner in (1, 2, None, 3)
    ]
    matches.append(SimpleNamespace(deck1_id=1, deck2_id=99, winner_id=1))
    records = calculate_deck_records(decks, matches)
    assert [row["deck"].id for row in records] == [2, 1, 3]
    for row in records[:2]:
        assert {key: value for key, value in row.items() if key != "deck"} == {
            "wins": 1,
            "losses": 1,
            "undecided": 1,
            "logged_games": 4,
            "decided_games": 2,
            "win_pct": 0.5,
        }
    assert records[2]["logged_games"] == records[2]["decided_games"] == 0
    assert records[2]["win_pct"] == 0.0


def test_dashboard_analytics_and_matchup_matrix_share_decided_results(client):
    decks = [Deck(name=name, type="Standard") for name in ("Alpha", "Beta", "Other")]
    db.session.add_all(decks)
    db.session.flush()
    first, second, other = decks
    db.session.add_all(
        [
            Match(deck1_id=first.id, deck2_id=second.id, winner_id=winner)
            for winner in (first.id, second.id, None, other.id)
        ]
    )
    db.session.commit()
    table = client.get("/api/stats/table").get_json()
    dashboard = client.get("/api/dashboard").get_json()
    best = dashboard["best_win_rate_deck"]
    matching = next(row for row in table if row["deck_id"] == best["deck"]["id"])
    for key in (
        "wins",
        "losses",
        "undecided",
        "logged_games",
        "decided_games",
        "win_pct",
    ):
        assert best[key] == matching[key]
    matrix = client.get("/api/stats/matrix").get_json()["matrix"]
    rows = {row["deck_id"]: row for row in matrix}
    assert rows[first.id][str(first.id)] is None
    assert rows[first.id][str(second.id)] == 0.5
    assert rows[second.id][str(first.id)] == 0.5
    assert rows[other.id][str(first.id)] is None
