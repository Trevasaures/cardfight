"""The zero-target upgrade preserves purchase history and rolls back on failure."""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from backend.database import db
from backend.models import AcquisitionPlan, AcquisitionPlanItem, Card, CardPrinting
from backend.schema import ensure_schema_upgrades


@pytest.fixture(autouse=True)
def clean_audit_table(clean_database):
    yield
    db.session.rollback()
    db.session.execute(text("DROP TABLE IF EXISTS purchase_audit"))
    db.session.commit()


def _legacy_plan_table():
    card = Card(name="Existing printing card", grade=1, card_type="Normal Unit")
    plan = AcquisitionPlan(name="Existing purchase")
    db.session.add_all([card, plan])
    db.session.flush()
    printing = CardPrinting(card_id=card.id, rarity="DFR", set_code="TEST")
    db.session.add(printing)
    db.session.flush()
    item = AcquisitionPlanItem(
        plan_id=plan.id,
        card_id=card.id,
        printing_id=printing.id,
        required_quantity=4,
        source_quantity=4,
        removed_quantity=1,
        owned_quantity=2,
        ordered_quantity=1,
        unit_price_cents=3000,
        notes="Keep quote and IDs",
    )
    db.session.add(item)
    db.session.commit()
    item_id = item.id
    db.session.execute(text("CREATE TABLE purchase_audit (item_id INTEGER NOT NULL)"))
    db.session.execute(
        text(
            "CREATE TRIGGER purchase_target_audit AFTER UPDATE ON acquisition_plan_item "
            "BEGIN INSERT INTO purchase_audit (item_id) VALUES (NEW.id); END"
        )
    )
    row = dict(
        db.session.execute(text("SELECT * FROM acquisition_plan_item")).mappings().one()
    )
    ddl = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE name='acquisition_plan_item'")
    ).scalar()
    objects = (
        db.session.execute(
            text(
                "SELECT sql FROM sqlite_master WHERE tbl_name='acquisition_plan_item' "
                "AND type IN ('index', 'trigger') AND sql IS NOT NULL"
            )
        )
        .scalars()
        .all()
    )
    db.session.commit()
    db.session.remove()
    with db.engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE acquisition_plan_item")
        connection.exec_driver_sql(
            ddl.replace("required_quantity >= 0", "required_quantity > 0").replace(
                "ck_acquisition_item_required_nonnegative",
                "ck_acquisition_item_required_positive",
            )
        )
        columns = ", ".join(row)
        values = ", ".join(":" + name for name in row)
        connection.execute(
            text(f"INSERT INTO acquisition_plan_item ({columns}) VALUES ({values})"),
            row,
        )
        for statement in objects:
            connection.exec_driver_sql(statement)
    return item_id, row, objects


def test_legacy_zero_target_upgrade_is_idempotent_and_preserves_rows_indexes_and_trigger():
    item_id, before, objects = _legacy_plan_table()
    ensure_schema_upgrades()
    ensure_schema_upgrades()
    after = dict(
        db.session.execute(text("SELECT * FROM acquisition_plan_item")).mappings().one()
    )
    assert after == before
    saved_objects = (
        db.session.execute(
            text(
                "SELECT sql FROM sqlite_master WHERE tbl_name='acquisition_plan_item' "
                "AND type IN ('index', 'trigger') AND sql IS NOT NULL"
            )
        )
        .scalars()
        .all()
    )
    assert sorted(saved_objects) == sorted(objects)
    assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
    assert {
        fk["referred_table"]
        for fk in inspect(db.engine).get_foreign_keys("acquisition_plan_item")
    } == {"acquisition_plan", "card", "card_printing"}
    db.session.execute(
        text(
            "UPDATE acquisition_plan_item SET required_quantity=0, removed_quantity=0 WHERE id=:id"
        ),
        {"id": item_id},
    )
    db.session.commit()
    assert db.session.get(AcquisitionPlanItem, item_id).required_quantity == 0
    assert db.session.execute(
        text("SELECT item_id FROM purchase_audit")
    ).scalars().all() == [item_id]
    with pytest.raises(IntegrityError):
        db.session.execute(
            text("UPDATE acquisition_plan_item SET required_quantity=-1 WHERE id=:id"),
            {"id": item_id},
        )
    db.session.rollback()


def test_zero_target_upgrade_rolls_back_replacement_if_index_recreation_fails(
    monkeypatch,
):
    item_id, before, _ = _legacy_plan_table()
    original = Connection.exec_driver_sql

    def fail_on_index(connection, statement, *args, **kwargs):
        if statement.startswith("CREATE INDEX ix_acquisition_item_plan"):
            raise RuntimeError("Simulated migration failure")
        return original(connection, statement, *args, **kwargs)

    monkeypatch.setattr(Connection, "exec_driver_sql", fail_on_index)
    with pytest.raises(RuntimeError, match="Simulated migration failure"):
        ensure_schema_upgrades()
    assert (
        dict(
            db.session.execute(text("SELECT * FROM acquisition_plan_item"))
            .mappings()
            .one()
        )
        == before
    )
    ddl = db.session.execute(
        text("SELECT sql FROM sqlite_master WHERE name='acquisition_plan_item'")
    ).scalar()
    assert "required_quantity > 0" in ddl
    assert (
        "acquisition_plan_item_target_upgrade"
        not in inspect(db.engine).get_table_names()
    )
    assert db.session.get(AcquisitionPlanItem, item_id).notes == before["notes"]
    assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
