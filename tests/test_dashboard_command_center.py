from datetime import datetime

from backend.database import db
from backend.models import (
    AcquisitionPlan,
    AcquisitionPlanItem,
    Card,
    Deck,
    DeckCard,
    DeckVersion,
    Match,
)


def test_command_center_connects_build_purchase_and_testing_work(client):
    focus = Deck(name="Focus Deck", type="Standard", nation="Brandt Gate")
    opponent = Deck(name="Opponent Deck", type="Standard", nation="Stoicheia")
    db.session.add_all([focus, opponent])
    db.session.flush()

    older_version = DeckVersion(
        deck_id=opponent.id,
        version_name="Opponent v1",
        is_active=True,
        updated_at=datetime(2026, 8, 20, 12, 0),
    )
    focus_version = DeckVersion(
        deck_id=focus.id,
        version_name="Focus v2",
        is_active=True,
        updated_at=datetime(2026, 8, 22, 12, 0),
    )
    db.session.add_all([older_version, focus_version])
    db.session.flush()

    cards = [
        Card(
            name=f"Ride Grade {grade}",
            grade=grade,
            nation="Brandt Gate",
            card_type="Normal Unit",
        )
        for grade in range(4)
    ]
    main_card = Card(
        name="Main Deck Unit",
        grade=1,
        nation="Brandt Gate",
        card_type="Normal Unit",
    )
    db.session.add_all(cards + [main_card])
    db.session.flush()
    db.session.add(
        DeckCard(
            deck_version_id=focus_version.id,
            card_id=main_card.id,
            quantity=50,
            zone="main",
        )
    )
    for card in cards:
        db.session.add(
            DeckCard(
                deck_version_id=focus_version.id,
                card_id=card.id,
                quantity=1,
                zone="ride",
            )
        )

    plan = AcquisitionPlan(
        name="Focus upgrades",
        status="buying",
        deck_id=focus.id,
        deck_version_id=focus_version.id,
        deck_type="Standard",
        nation="Brandt Gate",
        updated_at=datetime(2026, 8, 23, 8, 0),
    )
    db.session.add(plan)
    db.session.flush()
    db.session.add(
        AcquisitionPlanItem(
            plan_id=plan.id,
            card_id=main_card.id,
            required_quantity=4,
            owned_quantity=1,
            ordered_quantity=1,
            unit_price_cents=250,
        )
    )

    db.session.add(
        Match(
            deck1_id=focus.id,
            deck2_id=opponent.id,
            winner_id=focus.id,
            first_player_id=focus.id,
            format="Standard",
            date_played=datetime(2026, 8, 21, 19, 0),
        )
    )
    db.session.commit()

    response = client.get("/api/dashboard")

    assert response.status_code == 200
    payload = response.get_json()
    command_center = payload["command_center"]

    assert payload["summary"]["total_matches"] == 1
    assert command_center["resume"]["deck_version"]["id"] == focus_version.id
    assert command_center["resume"]["deck_version"]["is_complete"] is True
    assert command_center["resume"]["purchase_plan"]["id"] == plan.id
    assert command_center["resume"]["purchase_plan"]["summary"]["missing_quantity"] == 2
    assert command_center["resume"]["purchase_plan"]["summary"]["remaining_cost_cents"] == 500

    focus_signal = command_center["testing_focus"]
    assert focus_signal["deck"]["id"] == focus.id
    assert focus_signal["reason"] == "untested-version"
    assert focus_signal["active_version"]["id"] == focus_version.id
    assert focus_signal["suggested_opponent"]["id"] == opponent.id
    assert focus_signal["suggested_matchup"] == {
        "decided_games": 1,
        "wins": 1,
        "losses": 0,
    }

    attention_kinds = {item["kind"] for item in command_center["attention"]}
    assert {"purchase", "testing"}.issubset(attention_kinds)
    assert {event["kind"] for event in command_center["activity"]} == {
        "match",
        "purchase",
        "version",
    }


def test_command_center_handles_a_new_empty_lab(client):
    response = client.get("/api/dashboard")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["total_decks"] == 0
    assert payload["command_center"] == {
        "resume": {"deck_version": None, "purchase_plan": None},
        "testing_focus": None,
        "build_readiness": [],
        "attention": [],
        "activity": [],
    }
