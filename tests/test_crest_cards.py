import pytest
from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection

from backend.database import db
from backend.models import Card, CardPrinting, Deck, DeckCard, DeckVersion
from backend.schema import ensure_schema_upgrades
from backend.services.acquisition import create_acquisition_plan
from backend.services.cards import (
    DuplicateCardNameError,
    create_card,
    get_card_form_options,
    update_card,
)
from backend.services.deck_builder import (
    add_card_to_deck_version,
    create_deck_version,
    update_deck_card,
)
from backend.services.serializers import (
    serialize_acquisition_plan,
    serialize_deck_version,
)


def _version():
    deck = Deck(name="Crest deck", type="Stride", nation="Stoicheia")
    db.session.add(deck)
    db.session.flush()
    version = DeckVersion(deck_id=deck.id, version_name="Original")
    db.session.add(version)
    db.session.commit()
    return version


def _card(name="Vampire Princess of Night Fog, Nightrose", card_type="Crest", **values):
    return create_card({"name": name, "card_type": card_type, **values})


@pytest.mark.parametrize("card_type", ["Crest", "Ride Deck Crest"])
@pytest.mark.parametrize("nation", [None, "Stoicheia", "Nationless"])
def test_crests_have_no_grade_or_unit_attributes(
    app_context, client, card_type, nation
):
    response = client.post(
        "/api/cards",
        json={
            "name": "Crest test",
            "card_type": card_type,
            "nation": nation,
            "grade": 3,
            "power": 13000,
            "shield": 0,
            "critical": 1,
            "trigger_type": "Front",
            "skill_text": "[CONT]: Crest ability.",
        },
    )
    assert response.status_code == 201
    card = response.get_json()
    assert card["card_type"] == card_type
    assert card["nation"] == ("Stoicheia" if nation == "Stoicheia" else None)
    assert card["grade"] is None
    assert all(
        card[field] is None for field in ("power", "shield", "critical", "trigger_type")
    )
    assert card["skill_text"] == "[CONT]: Crest ability."
    assert card_type in get_card_form_options()["card_types"]


@pytest.mark.parametrize(
    "supplied,expected",
    [
        (" crest ", "Crest"),
        ("  ride  DECK   crest ", "Ride Deck Crest"),
    ],
)
def test_crest_type_names_are_canonical_on_create_and_update(
    app_context, supplied, expected
):
    card = _card(card_type=supplied)
    assert card.card_type == expected
    update_card(card.id, {"card_type": supplied, "grade": 4})
    assert card.card_type == expected
    assert card.grade is None


def test_crest_can_share_its_printed_name_with_unit_without_duplicates(app_context):
    unit = _card("Chronojet Dragon", "Normal Unit", grade=3)
    crest = _card("Chronojet Dragon")
    assert crest.id != unit.id
    with pytest.raises(DuplicateCardNameError):
        _card("Chronojet Dragon")
    with pytest.raises(DuplicateCardNameError):
        _card("Chronojet Dragon", "Normal Unit", grade=3)


@pytest.mark.parametrize(
    "card_type", ["Normal Unit", "Trigger Unit", "G Unit", "Normal Order"]
)
def test_non_crest_creation_requires_a_grade(app_context, card_type):
    with pytest.raises(ValueError, match="grade is required"):
        _card("Grade required", card_type)


def test_catalog_partial_edits_preserve_legacy_missing_grades(app_context):
    legacy = Card(name="Legacy metadata", card_type="Normal Unit", grade=None)
    db.session.add(legacy)
    db.session.commit()
    update_card(legacy.id, {"skill_text": "Updated text"})
    assert legacy.grade is None
    with pytest.raises(ValueError, match="grade is required"):
        update_card(legacy.id, {"grade": None})


def test_energy_and_stride_crests_coexist_outside_normal_deck_counts_and_clone(
    app_context,
):
    version = _version()
    unit = _card("Main cards", "Normal Unit", grade=3)
    add_card_to_deck_version(
        version.id, {"card_id": unit.id, "quantity": 50, "zone": "main"}
    )
    for grade in range(4):
        ride = _card(f"Ride {grade}", "Normal Unit", grade=grade)
        add_card_to_deck_version(version.id, {"card_id": ride.id, "zone": "ride"})
    assert serialize_deck_version(version)["deck_rules"]["is_complete"] is True
    nightrose = _card(nation="Stoicheia")
    energy = _card("Energy Generator", "Ride Deck Crest")
    for crest in (nightrose, energy):
        add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": "crest"})
    saved = serialize_deck_version(version)
    assert saved["totals_by_zone"] == {"crest": 2, "main": 50, "ride": 4}
    assert saved["deck_rules"]["core_card_count"] == 54
    assert saved["deck_rules"]["is_complete"] is True
    clone = create_deck_version(version.deck_id, {"source_version_id": version.id})
    assert serialize_deck_version(clone)["totals_by_zone"] == saved["totals_by_zone"]
    assert clone.cards.filter_by(zone="crest").count() == 2


@pytest.mark.parametrize("zone", ["main", "ride", "g", "token", "other"])
def test_crests_cannot_enter_unit_decks_or_other_auxiliary_zones(app_context, zone):
    version, crest = _version(), _card()
    with pytest.raises(ValueError, match="crest zone"):
        add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": zone})
    entry = add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": "crest"})
    with pytest.raises(ValueError, match="crest zone"):
        update_deck_card(entry.id, {"zone": zone})
    assert entry.zone == "crest"


@pytest.mark.parametrize("zone", ["main", "ride", "g", "token", "other"])
@pytest.mark.parametrize("next_type", ["Crest", "Ride Deck Crest"])
def test_units_cannot_enter_crest_zone_or_be_retyped_while_in_deck(
    app_context, zone, next_type
):
    version, unit = _version(), _card("A unit", "Normal Unit", grade=3)
    with pytest.raises(ValueError, match="Only crests"):
        add_card_to_deck_version(version.id, {"card_id": unit.id, "zone": "crest"})
    entry = add_card_to_deck_version(version.id, {"card_id": unit.id, "zone": zone})
    with pytest.raises(ValueError, match="incompatible deck zones"):
        update_card(unit.id, {"card_type": next_type, "name": "Changed"})
    assert unit.card_type == "Normal Unit" and unit.grade == 3 and unit.name == "A unit"
    assert entry.zone == zone


def test_crests_cannot_be_retyped_to_units_while_in_crest_zone(app_context):
    version, crest = _version(), _card()
    entry = add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": "crest"})
    with pytest.raises(ValueError, match="incompatible deck zones"):
        update_card(crest.id, {"card_type": "Normal Unit", "grade": 3})
    assert crest.card_type == "Crest" and crest.grade is None
    assert entry.zone == "crest"


def test_crest_quantity_identity_and_ride_crest_limits(app_context):
    version, crest = _version(), _card()
    first = add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": "crest"})
    with pytest.raises(ValueError, match="quantity of exactly 1"):
        update_deck_card(first.id, {"quantity": 2})
    with pytest.raises(ValueError, match="quantity of exactly 1"):
        add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": "crest"})
    printing = CardPrinting(card_id=crest.id, set_code="TEST", rarity="SP")
    db.session.add(printing)
    db.session.commit()
    with pytest.raises(ValueError, match="already included"):
        add_card_to_deck_version(
            version.id,
            {"card_id": crest.id, "printing_id": printing.id, "zone": "crest"},
        )
    energy = _card("Energy Generator", "Ride Deck Crest")
    add_card_to_deck_version(version.id, {"card_id": energy.id, "zone": "crest"})
    another = _card("Another ride crest", "Ride Deck Crest")
    with pytest.raises(ValueError, match="only one Ride Deck Crest"):
        add_card_to_deck_version(version.id, {"card_id": another.id, "zone": "crest"})
    with pytest.raises(ValueError, match="only one Ride Deck Crest"):
        update_card(crest.id, {"card_type": "Ride Deck Crest"})
    assert crest.card_type == "Crest"


def test_legacy_sqlite_zone_upgrade_preserves_entries_and_acquisition_references(
    app_context,
):
    version, unit = _version(), _card("Existing card", "Normal Unit", grade=2)
    entry = add_card_to_deck_version(version.id, {"card_id": unit.id, "quantity": 4})
    plan = create_acquisition_plan(
        {
            "name": "Existing purchase",
            "plan_type": "existing_deck",
            "list_source": "deck_version",
            "deck_version_id": version.id,
            "source_deck_version_id": version.id,
        }
    )
    plan_before = serialize_acquisition_plan(plan)
    row_before = db.session.execute(text("SELECT * FROM deck_card")).mappings().one()
    ddl = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE name='deck_card'")
    ).scalar()
    indexes = (
        db.session.execute(
            text(
                "SELECT sql FROM sqlite_master WHERE tbl_name='deck_card' AND type='index' AND sql IS NOT NULL"
            )
        )
        .scalars()
        .all()
    )
    db.session.commit()
    # Reproduce an older database inside this test's isolated in-memory fixture.
    with db.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE deck_card")
        connection.exec_driver_sql(ddl.replace(",'crest'", ""))
        for index in indexes:
            connection.exec_driver_sql(index)
        columns = ", ".join(row_before)
        values = ", ".join(":" + name for name in row_before)
        connection.execute(
            text(f"INSERT INTO deck_card ({columns}) VALUES ({values})"),
            dict(row_before),
        )
    ensure_schema_upgrades()
    ensure_schema_upgrades()
    row_after = db.session.execute(text("SELECT * FROM deck_card")).mappings().one()
    assert dict(row_after) == dict(row_before)
    assert serialize_acquisition_plan(plan) == plan_before
    assert {index["name"] for index in inspect(db.engine).get_indexes("deck_card")} == {
        "ix_deck_card_version",
        "ix_deck_card_card",
        "ix_deck_card_printing",
        "ix_deck_card_zone",
    }
    assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
    crest = _card()
    add_card_to_deck_version(version.id, {"card_id": crest.id, "zone": "crest"})
    assert db.session.get(DeckCard, entry.id).quantity == 4


def test_zone_upgrade_rolls_back_table_replacement_if_index_recreation_fails(
    app_context, monkeypatch
):
    version, unit = _version(), _card("Rollback card", "Normal Unit", grade=2)
    entry = add_card_to_deck_version(version.id, {"card_id": unit.id})
    row_before = db.session.execute(text("SELECT * FROM deck_card")).mappings().one()
    ddl = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE name='deck_card'")
    ).scalar()
    db.session.commit()
    with db.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE deck_card")
        connection.exec_driver_sql(ddl.replace(",'crest'", ""))
        connection.exec_driver_sql(
            "CREATE INDEX ix_deck_card_version ON deck_card(deck_version_id)"
        )
        columns = ", ".join(row_before)
        values = ", ".join(":" + name for name in row_before)
        connection.execute(
            text(f"INSERT INTO deck_card ({columns}) VALUES ({values})"),
            dict(row_before),
        )
    original = Connection.exec_driver_sql

    def fail_on_index(connection, statement, *args, **kwargs):
        if statement.startswith("CREATE INDEX ix_deck_card_version"):
            raise RuntimeError("Simulated migration failure")
        return original(connection, statement, *args, **kwargs)

    monkeypatch.setattr(Connection, "exec_driver_sql", fail_on_index)
    with pytest.raises(RuntimeError, match="Simulated migration failure"):
        ensure_schema_upgrades()
    assert dict(
        db.session.execute(text("SELECT * FROM deck_card")).mappings().one()
    ) == dict(row_before)
    saved_ddl = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE name='deck_card'")
    ).scalar()
    assert "'crest'" not in saved_ddl
    assert db.session.get(DeckCard, entry.id).quantity == 1
    assert "deck_card_crest_upgrade" not in inspect(db.engine).get_table_names()
