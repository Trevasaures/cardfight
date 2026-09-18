from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from backend.database import db
from backend.models import Card, CardPrinting


def seed_cards(count):
    cards = [
        Card(
            name=f"Catalog card {index:03}",
            grade=index % 5,
            nation="Brandt Gate",
            card_type="Normal Unit",
        )
        for index in range(count)
    ]
    db.session.add_all(cards)
    db.session.commit()
    return cards


def get_page(client, **params):
    response = client.get("/api/cards/library", query_string=params)
    assert response.status_code == 200
    return response.get_json()


def test_default_page_is_small_and_last_page_has_correct_counts(client):
    seed_cards(53)
    first = get_page(client)
    assert len(first["items"]) == 24
    assert first["pagination"] == {
        "page": 1, "page_size": 24, "total_items": 53, "total_pages": 3,
        "has_next": True, "has_prev": False,
    }
    last = get_page(client, page=3)
    assert len(last["items"]) == 5
    assert last["pagination"]["has_next"] is False
    assert last["pagination"]["has_prev"] is True
    assert last["items"][0]["name"] == "Catalog card 048"


@pytest.mark.parametrize("size,expected", [(500, 100), (0, 1), (-1, 1), ("invalid", 24)])
def test_page_size_is_bounded(client, size, expected):
    seed_cards(105)
    result = get_page(client, page_size=size)
    assert len(result["items"]) == expected
    assert result["pagination"]["page_size"] == expected


@pytest.mark.parametrize("page,expected", [(0, 1), (-4, 1), ("invalid", 1), (999999, 3)])
def test_page_is_clamped_to_available_results(client, page, expected):
    seed_cards(53)
    result = get_page(client, page=page)
    assert result["pagination"]["page"] == expected
    assert result["items"]


def test_empty_catalog_has_one_empty_page(client):
    result = get_page(client, page=99)
    assert result["items"] == []
    assert result["pagination"] == {
        "page": 1, "page_size": 24, "total_items": 0, "total_pages": 1,
        "has_next": False, "has_prev": False,
    }


def test_filters_search_full_catalog_before_paging_without_printing_duplicates(client):
    cards = seed_cards(80)
    for index, card in enumerate(cards[60:]):
        # Two matching printings must still count as one card.
        for rarity in ("RRR", "SR"):
            db.session.add(CardPrinting(
                card_id=card.id, set_code="DZ-SS15", set_name="The Legendary Vanguards",
                card_number=f"DZ-SS15/{index:03}", rarity=rarity,
            ))
    db.session.commit()

    result = get_page(
        client, q="legendary", set_code="dz-ss15", nation="Brandt Gate",
        grade=3, card_type="Normal Unit", page_size=3, page=2,
    )
    assert result["pagination"]["total_items"] == 4
    assert result["pagination"]["total_pages"] == 2
    assert [card["name"] for card in result["items"]] == ["Catalog card 078"]
    assert len(result["items"][0]["printings"]) == 2

    # A filter applied from a later page must not leave empty phantom pages.
    result = get_page(client, q="Catalog card 079", page=4)
    assert result["pagination"]["page"] == 1
    assert result["pagination"]["total_items"] == 1


def test_single_character_search_is_not_silently_ignored(client):
    seed_cards(3)
    assert get_page(client, q="Z")["pagination"]["total_items"] == 0


@pytest.mark.parametrize("sort,expected", [
    ("name_asc", ["Alpha", "Beta", "Gamma", "Unknown"]),
    ("name_desc", ["Unknown", "Gamma", "Beta", "Alpha"]),
    ("grade_asc", ["Gamma", "Alpha", "Beta", "Unknown"]),
    ("grade_desc", ["Alpha", "Beta", "Gamma", "Unknown"]),
    ("newest", ["Unknown", "Gamma", "Beta", "Alpha"]),
    ("updated", ["Alpha", "Beta", "Gamma", "Unknown"]),
])
def test_sorting_is_applied_before_pagination(client, sort, expected):
    start = datetime(2026, 1, 1)
    for index, (name, grade) in enumerate([
        ("Alpha", 3), ("Beta", 3), ("Gamma", 0), ("Unknown", None),
    ]):
        db.session.add(Card(
            name=name, grade=grade, card_type="Normal Unit",
            created_at=start + timedelta(days=index),
            updated_at=start - timedelta(days=index),
        ))
    db.session.commit()
    first = get_page(client, sort=sort, page_size=2)
    second = get_page(client, sort=sort, page_size=2, page=2)
    assert [card["name"] for card in first["items"] + second["items"]] == expected


def test_sort_ties_use_stable_ids_across_pages(client):
    for _ in range(7):
        db.session.add(Card(name="Same name", grade=3, card_type="Normal Unit"))
    db.session.commit()
    pages = [get_page(client, page=page, page_size=3) for page in (1, 2, 3)]
    ids = [card["id"] for page in pages for card in page["items"]]
    assert len(ids) == len(set(ids)) == 7
    assert ids == sorted(ids)


@pytest.mark.parametrize("params", [{"sort": "not-a-sort"}, {"grade": "invalid"}])
def test_invalid_filter_or_sort_returns_validation_error(client, params):
    response = client.get("/api/cards/library", query_string=params)
    assert response.status_code == 400
    assert "error" in response.get_json()


@pytest.mark.parametrize("page_size", [1, 24, 48])
def test_printings_load_in_one_query_only_for_the_requested_page(client, page_size):
    cards = seed_cards(80)
    for card in cards:
        for rarity in ("RRR", "SR"):
            db.session.add(CardPrinting(card_id=card.id, set_code="DZ-BT01", rarity=rarity))
    db.session.commit()
    statements = []

    def capture(_connection, _cursor, statement, parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append((statement, parameters))

    event.listen(db.engine, "before_cursor_execute", capture)
    try:
        result = get_page(client, page_size=page_size)
    finally:
        event.remove(db.engine, "before_cursor_execute", capture)

    # Count, page, printings: never N+1 queries as the page grows.
    assert len(statements) == 3
    printing_query, printing_ids = statements[-1]
    assert "card_printing.card_id IN" in printing_query
    assert set(printing_ids) == {card["id"] for card in result["items"]}
    for card in result["items"]:
        assert [printing["rarity"] for printing in card["printings"]] == ["RRR", "SR"]
        assert card["primary_printing"] == card["printings"][0]


def test_cards_without_printings_keep_the_existing_response_shape(client):
    seed_cards(1)
    card = get_page(client)["items"][0]
    assert card["printings"] == []
    assert card["primary_printing"] is None
