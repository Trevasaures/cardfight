"""Nested API data should stay complete without a query for every card."""

import pytest

from backend.database import db
from backend.models import (
    AcquisitionPlan,
    AcquisitionPlanItem,
    Card,
    CardPrinting,
    Deck,
    DeckCard,
    DeckVersion,
)
from backend.services.serializers import (
    deck_version_counts,
    serialize_acquisition_item,
    serialize_deck_card,
    serialize_deck_version,
)


def seed_workspace(card_count):
    deck = Deck(name="Query budget deck", type="Stride")
    db.session.add(deck)
    db.session.flush()
    version = DeckVersion(deck_id=deck.id, version_name="Complete card metadata")
    plan = AcquisitionPlan(name="Query budget purchase", deck_id=deck.id)
    db.session.add_all([version, plan])
    db.session.flush()

    for index in range(card_count):
        card = Card(
            name=f"Unit {index:03}",
            grade=index % 4,
            nation="Brandt Gate",
            card_type="Normal Unit",
            skill_text=f"Ability {index}",
            flavor_text=f"Flavor {index}",
        )
        db.session.add(card)
        db.session.flush()
        first = CardPrinting(card_id=card.id, set_code="FIRST", rarity="RR")
        selected = CardPrinting(card_id=card.id, set_code="SELECTED", rarity="SR")
        db.session.add_all([first, selected])
        db.session.flush()
        db.session.add(
            DeckCard(
                deck_version_id=version.id,
                card_id=card.id,
                printing_id=selected.id,
                quantity=1,
                zone="ride" if index < 4 else "main",
                sort_order=-index,
            )
        )
        db.session.add(
            AcquisitionPlanItem(
                plan_id=plan.id,
                card_id=card.id,
                printing_id=selected.id,
                required_quantity=2,
                owned_quantity=1,
                ordered_quantity=1,
                unit_price_cents=175,
            )
        )
    db.session.commit()
    return version.id, plan.id


@pytest.mark.parametrize("card_count", [1, 40])
def test_deck_details_batch_related_cards_without_changing_rows(
    client, card_count, select_queries
):
    version_id, _ = seed_workspace(card_count)
    expected = [
        serialize_deck_card(entry)
        for entry in DeckCard.query.filter_by(deck_version_id=version_id)
        .order_by(DeckCard.zone, DeckCard.sort_order, DeckCard.id)
        .all()
    ]
    # A fresh identity map models a real request rather than relying on seeding
    # or the expected-response calculation to have warmed relationships.
    db.session.remove()
    with select_queries() as statements:
        response = client.get(f"/api/deck-versions/{version_id}")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["cards"] == expected
    assert len(statements) <= 5, [sql for sql, _ in statements]
    assert sum("FROM card_printing" in sql for sql, _ in statements) == 1
    for row in payload["cards"]:
        assert row["printing"]["set_code"] == "SELECTED"
        assert row["card"]["primary_printing"]["set_code"] == "FIRST"
        assert [printing["rarity"] for printing in row["card"]["printings"]] == [
            "RR",
            "SR",
        ]


@pytest.mark.parametrize("card_count", [1, 40])
def test_purchase_details_batch_printings_and_preserve_inventory(
    client, card_count, select_queries
):
    _, plan_id = seed_workspace(card_count)
    expected = [
        serialize_acquisition_item(item)
        for item in AcquisitionPlanItem.query.filter_by(plan_id=plan_id)
        .order_by(AcquisitionPlanItem.card_id, AcquisitionPlanItem.id)
        .all()
    ]
    db.session.remove()
    with select_queries() as statements:
        response = client.get(f"/api/acquisition-plans/{plan_id}")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["items"] == expected
    assert payload["summary"]["owned_quantity"] == card_count
    assert payload["summary"]["required_quantity"] == card_count * 2
    assert payload["summary"]["remaining_cost_cents"] == 0
    assert len(statements) <= 3, [sql for sql, _ in statements]
    assert sum("FROM card_printing" in sql for sql, _ in statements) == 1


def test_dashboard_readiness_skips_printings_and_reuses_resume_summary(
    client, select_queries
):
    version_id, _ = seed_workspace(12)
    expected = serialize_deck_version(db.session.get(DeckVersion, version_id))
    db.session.remove()
    with select_queries() as statements:
        response = client.get("/api/dashboard")
    assert response.status_code == 200
    center = response.get_json()["command_center"]
    readiness = center["build_readiness"][0]
    assert readiness == center["resume"]["deck_version"]
    assert readiness["card_count"] == expected["card_count"]
    assert readiness["unique_card_count"] == expected["unique_card_count"]
    assert readiness["issues"] == expected["deck_rules"]["issues"]
    assert readiness["main_deck_count"] == expected["deck_rules"]["main_deck_count"]
    assert readiness["ride_deck_count"] == expected["deck_rules"]["ride_deck_count"]
    assert not any("FROM card_printing" in sql for sql, _ in statements)
    assert sum("FROM deck_card" in sql for sql, _ in statements) == 1


def test_shared_cards_and_grade_less_auxiliaries_keep_full_detail(
    client, select_queries
):
    version_id, _ = seed_workspace(4)
    starter = Card.query.filter_by(name="Unit 000").one()
    crest = Card(name="Grade-less crest", grade=None, card_type="Crest")
    g_unit = Card(name="Stride unit", grade=4, card_type="G Unit")
    db.session.add_all([crest, g_unit])
    db.session.flush()
    db.session.add_all(
        [
            DeckCard(
                deck_version_id=version_id, card_id=starter.id, quantity=50, zone="main"
            ),
            DeckCard(
                deck_version_id=version_id, card_id=crest.id, quantity=1, zone="crest"
            ),
            DeckCard(
                deck_version_id=version_id, card_id=g_unit.id, quantity=2, zone="g"
            ),
        ]
    )
    db.session.commit()
    expected_counts = deck_version_counts(version_id)
    expected = [
        serialize_deck_card(entry)
        for entry in DeckCard.query.filter_by(deck_version_id=version_id)
        .order_by(DeckCard.zone, DeckCard.sort_order, DeckCard.id)
        .all()
    ]
    db.session.remove()
    with select_queries() as statements:
        payload = client.get(f"/api/deck-versions/{version_id}").get_json()
    assert payload["cards"] == expected
    assert payload["deck_rules"] == expected_counts["deck_rules"]
    assert payload["card_count"] == 57
    assert payload["unique_card_count"] == 7
    assert payload["deck_rules"]["is_complete"] is True
    assert len(statements) == 4
    assert sum("FROM card_printing" in sql for sql, _ in statements) == 1
    unprinted = [
        row["card"] for row in payload["cards"] if row["zone"] in {"crest", "g"}
    ]
    assert all(
        card["printings"] == [] and card["primary_printing"] is None
        for card in unprinted
    )


def test_empty_version_skips_printing_lookup(client, select_queries):
    version_id, _ = seed_workspace(0)
    db.session.remove()
    with select_queries() as statements:
        payload = client.get(f"/api/deck-versions/{version_id}").get_json()
    assert payload["cards"] == []
    assert payload["card_count"] == payload["unique_card_count"] == 0
    assert payload["totals_by_zone"] == {}
    assert not any("FROM card_printing" in sql for sql, _ in statements)
