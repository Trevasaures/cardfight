from datetime import datetime, timedelta

from backend.database import db
from backend.models import Deck, Match


def test_match_history_filters_the_complete_result_set_before_paginating(
    app_context,
    client,
):
    nightrose = Deck(name="Nightrose", type="Standard")
    magnolia = Deck(name="Magnolia", type="Standard")
    rotovisor = Deck(name="Rotovisor", type="Standard")
    varga = Deck(name="Varga", type="Stride")
    db.session.add_all([nightrose, magnolia, rotovisor, varga])
    db.session.flush()

    played_at = datetime(2026, 7, 1, 18, 0)
    db.session.add_all(
        [
            Match(
                deck1=nightrose,
                deck2=magnolia,
                winner_id=magnolia.id,
                format="Standard",
                date_played=played_at,
                notes="Testing the Magnolia matchup.",
            ),
            Match(
                deck1=nightrose,
                deck2=rotovisor,
                winner_id=nightrose.id,
                format="Standard",
                date_played=played_at + timedelta(days=1),
                notes="Guard math felt comfortable.",
            ),
            Match(
                deck1=varga,
                deck2=nightrose,
                winner_id=None,
                format="Stride",
                date_played=played_at + timedelta(days=2),
                notes="Stopped before a winner was declared.",
            ),
            Match(
                deck1=magnolia,
                deck2=rotovisor,
                winner_id=rotovisor.id,
                format="Standard",
                date_played=played_at + timedelta(days=3),
                notes="Unrelated matchup.",
            ),
            Match(
                deck1=varga,
                deck2=rotovisor,
                winner_id=varga.id,
                format="Stride",
                date_played=played_at + timedelta(days=4),
                notes="Another unrelated matchup.",
            ),
        ]
    )
    db.session.commit()

    first_page = client.get(
        "/api/matches",
        query_string={"page": 1, "page_size": 2, "q": "Nightro"},
    ).get_json()
    second_page = client.get(
        "/api/matches",
        query_string={"page": 2, "page_size": 2, "q": "Nightro"},
    ).get_json()

    assert first_page["pagination"] == {
        "page": 1,
        "page_size": 2,
        "total_items": 3,
        "total_pages": 2,
        "has_next": True,
        "has_prev": False,
    }
    assert len(first_page["items"]) == 2
    assert len(second_page["items"]) == 1
    assert second_page["pagination"]["total_items"] == 3
    assert all(
        "Nightrose" in {match["deck1_name"], match["deck2_name"]}
        for match in first_page["items"] + second_page["items"]
    )

    unfiltered = client.get(
        "/api/matches",
        query_string={"page": 1, "page_size": 2},
    ).get_json()
    assert unfiltered["pagination"]["total_items"] == 5
    assert unfiltered["pagination"]["total_pages"] == 3


def test_match_history_search_and_selectors_share_the_server_side_count(
    app_context,
    client,
):
    nightrose = Deck(name="Nightrose", type="Standard")
    magnolia = Deck(name="Magnolia", type="Standard")
    varga = Deck(name="Varga", type="Stride")
    db.session.add_all([nightrose, magnolia, varga])
    db.session.flush()

    db.session.add_all(
        [
            Match(
                deck1=nightrose,
                deck2=magnolia,
                winner_id=nightrose.id,
                format="Standard",
                notes="Guard math was clean.",
            ),
            Match(
                deck1=varga,
                deck2=nightrose,
                winner_id=None,
                format="Stride",
                notes="Still testing this matchup.",
            ),
        ]
    )
    db.session.commit()

    decided = client.get(
        "/api/matches",
        query_string={"page": 1, "q": "Nightro", "result": "decided"},
    ).get_json()
    undecided = client.get(
        "/api/matches",
        query_string={"page": 1, "q": "Nightro", "result": "undecided"},
    ).get_json()
    stride = client.get(
        "/api/matches",
        query_string={"page": 1, "q": "Nightro", "format": "Stride"},
    ).get_json()
    notes = client.get(
        "/api/matches",
        query_string={"page": 1, "q": "guard math"},
    ).get_json()

    assert decided["pagination"]["total_items"] == 1
    assert decided["items"][0]["is_decided"] is True
    assert undecided["pagination"]["total_items"] == 1
    assert undecided["items"][0]["is_undecided"] is True
    assert stride["pagination"]["total_items"] == 1
    assert stride["items"][0]["format"] == "Stride"
    assert notes["pagination"]["total_items"] == 1
    assert notes["items"][0]["deck1_name"] == "Nightrose"
