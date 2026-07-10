import pytest

from backend.database import db
from backend.models import Card, Deck, DeckVersion
from backend.services.deck_builder import (
    add_card_to_deck_version,
    update_deck_card,
)
from backend.services.cards import update_card
from backend.services.serializers import serialize_deck_version


def _card(name, grade):
    card = Card(
        name=name,
        grade=grade,
        nation="Brandt Gate",
        card_type="Normal Unit",
    )
    db.session.add(card)
    db.session.flush()
    return card


def _version():
    deck = Deck(name="Rule Test Deck", type="Standard", nation="Brandt Gate")
    db.session.add(deck)
    db.session.flush()

    version = DeckVersion(deck_id=deck.id, version_name="Version 1")
    db.session.add(version)
    db.session.commit()
    return version


def test_main_deck_cannot_exceed_50_cards(app_context):
    version = _version()
    card = _card("Main Unit", 4)

    entry = add_card_to_deck_version(
        version.id,
        {"card_id": card.id, "quantity": 50, "zone": "main"},
    )

    with pytest.raises(ValueError, match="more than 50"):
        add_card_to_deck_version(
            version.id,
            {"card_id": card.id, "quantity": 1, "zone": "main"},
        )

    with pytest.raises(ValueError, match="more than 50"):
        update_deck_card(entry.id, {"quantity": 51})

    assert entry.quantity == 50


def test_ride_deck_requires_one_card_of_each_grade_zero_through_three(app_context):
    version = _version()
    ride_cards = [_card(f"Ride Grade {grade}", grade) for grade in range(4)]

    for card in ride_cards:
        add_card_to_deck_version(
            version.id,
            {"card_id": card.id, "quantity": 1, "zone": "ride"},
        )

    duplicate_grade = _card("Another Grade 2", 2)
    with pytest.raises(ValueError, match="already contains a grade 2"):
        add_card_to_deck_version(
            version.id,
            {"card_id": duplicate_grade.id, "quantity": 1, "zone": "ride"},
        )

    with pytest.raises(ValueError, match="quantity of exactly 1"):
        update_deck_card(version.cards.first().id, {"quantity": 2})


def test_grade_four_card_cannot_enter_ride_deck(app_context):
    version = _version()
    grade_four = _card("Grade Four", 4)

    with pytest.raises(ValueError, match="grade 0, 1, 2, or 3"):
        add_card_to_deck_version(
            version.id,
            {"card_id": grade_four.id, "quantity": 1, "zone": "ride"},
        )


def test_shared_card_edit_cannot_invalidate_a_ride_deck(app_context):
    version = _version()
    grade_one = _card("Ride Grade 1", 1)
    grade_two = _card("Ride Grade 2", 2)

    for card in (grade_one, grade_two):
        add_card_to_deck_version(
            version.id,
            {"card_id": card.id, "quantity": 1, "zone": "ride"},
        )

    with pytest.raises(ValueError, match="must remain grade 0, 1, 2, or 3"):
        update_card(grade_one.id, {"grade": 4})

    with pytest.raises(ValueError, match="duplicate grade 2"):
        update_card(grade_one.id, {"grade": 2})


def test_complete_deck_summary_requires_50_main_and_four_ride_cards(app_context):
    version = _version()
    main_card = _card("Main Unit", 4)
    ride_cards = [_card(f"Ride Grade {grade}", grade) for grade in range(4)]

    add_card_to_deck_version(
        version.id,
        {"card_id": main_card.id, "quantity": 50, "zone": "main"},
    )
    for card in ride_cards:
        add_card_to_deck_version(
            version.id,
            {"card_id": card.id, "quantity": 1, "zone": "ride"},
        )

    rules = serialize_deck_version(version)["deck_rules"]

    assert rules["core_card_count"] == 54
    assert rules["main_deck_count"] == 50
    assert rules["ride_deck_count"] == 4
    assert rules["ride_grades"] == [0, 1, 2, 3]
    assert rules["ride_nations"] == ["Brandt Gate"]
    assert rules["is_complete"] is True
    assert rules["issues"] == []
