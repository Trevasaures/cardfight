"""Acquisition-plan services for physical deck purchasing workflows."""

from collections import defaultdict

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


ALLOWED_PLAN_TYPES = {"new_build", "existing_deck"}
ALLOWED_LIST_SOURCES = {"empty", "deck_version"}
ALLOWED_PLAN_STATUSES = {"planning", "buying", "waiting", "complete", "paused"}
ALLOWED_BUILD_MODES = {"physical", "proxy", "mixed"}
ALLOWED_DECK_TYPES = {"Standard", "Stride"}


def _clean_string(value):
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


def _int_value(value, field_name, default=None):
    if value in (None, ""):
        return default

    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be a whole number")

    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a whole number") from exc

    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{field_name} must be a whole number")

    return parsed


def _choice(value, field_name, allowed, default=None):
    cleaned = _clean_string(value) or default

    if cleaned not in allowed:
        choices = ", ".join(sorted(allowed))
        raise ValueError(f"{field_name} must be one of: {choices}")

    return cleaned


def _get_deck_or_raise(deck_id):
    deck = db.session.get(Deck, deck_id)

    if not deck:
        raise LookupError("Deck not found")

    return deck


def _get_version_or_raise(version_id):
    version = db.session.get(DeckVersion, version_id)

    if not version:
        raise LookupError("Deck version not found")

    return version


def _get_card_or_raise(card_id):
    card = db.session.get(Card, card_id)

    if not card:
        raise LookupError("Card not found")

    return card


def _get_printing_or_raise(printing_id, card_id):
    if printing_id in (None, ""):
        return None

    printing_id = _int_value(printing_id, "printing_id")
    printing = db.session.get(CardPrinting, printing_id)

    if not printing:
        raise LookupError("Card printing not found")

    if printing.card_id != card_id:
        raise ValueError("Card printing does not belong to the selected card")

    return printing


def get_acquisition_plan_or_raise(plan_id):
    plan = db.session.get(AcquisitionPlan, plan_id)

    if not plan:
        raise LookupError("Acquisition plan not found")

    return plan


def get_acquisition_item_or_raise(item_id):
    item = db.session.get(AcquisitionPlanItem, item_id)

    if not item:
        raise LookupError("Acquisition plan item not found")

    return item


def list_acquisition_plans():
    return AcquisitionPlan.query.order_by(
        AcquisitionPlan.updated_at.desc(),
        AcquisitionPlan.id.desc(),
    ).all()


def _copy_version_items(plan, source_version):
    aggregated = defaultdict(int)

    for entry in source_version.cards.order_by(DeckCard.id.asc()).all():
        aggregated[(entry.card_id, entry.printing_id)] += entry.quantity

    for (card_id, printing_id), quantity in aggregated.items():
        source_quantity = quantity if plan.plan_type == "existing_deck" else 0
        db.session.add(
            AcquisitionPlanItem(
                plan_id=plan.id,
                card_id=card_id,
                printing_id=printing_id,
                required_quantity=quantity,
                source_quantity=source_quantity,
                owned_quantity=source_quantity,
            )
        )


def create_acquisition_plan(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    name = _clean_string(payload.get("name"))
    if not name:
        raise ValueError("name is required")

    plan_type = _choice(
        payload.get("plan_type"),
        "plan_type",
        ALLOWED_PLAN_TYPES,
        default="new_build",
    )
    list_source = _choice(
        payload.get("list_source"),
        "list_source",
        ALLOWED_LIST_SOURCES,
        default="empty",
    )
    status = _choice(
        payload.get("status"),
        "status",
        ALLOWED_PLAN_STATUSES,
        default="planning",
    )
    build_mode = _choice(
        payload.get("build_mode"),
        "build_mode",
        ALLOWED_BUILD_MODES,
        default="physical",
    )

    target_deck = None
    target_version = None
    source_version = None

    target_version_id = _int_value(
        payload.get("deck_version_id"),
        "deck_version_id",
    )
    source_version_id = _int_value(
        payload.get("source_deck_version_id"),
        "source_deck_version_id",
    )

    if plan_type == "existing_deck":
        if target_version_id is None:
            raise ValueError("deck_version_id is required for an existing deck plan")

        target_version = _get_version_or_raise(target_version_id)
        target_deck = target_version.deck

        if list_source == "deck_version" and source_version_id is None:
            source_version_id = target_version.id

    if list_source == "deck_version":
        if source_version_id is None:
            raise ValueError(
                "source_deck_version_id is required when copying a deck version"
            )

        source_version = _get_version_or_raise(source_version_id)
    elif source_version_id is not None:
        raise ValueError(
            "source_deck_version_id can only be used with a deck_version list source"
        )

    requested_deck_id = _int_value(payload.get("deck_id"), "deck_id")
    if requested_deck_id is not None:
        requested_deck = _get_deck_or_raise(requested_deck_id)

        if plan_type != "existing_deck":
            raise ValueError("deck_id can only be used for an existing deck plan")

        if target_deck and requested_deck.id != target_deck.id:
            raise ValueError("deck_id does not match the selected deck version")

        target_deck = requested_deck

    deck_type = _clean_string(payload.get("deck_type"))
    nation = _clean_string(payload.get("nation"))

    context_deck = target_deck or (source_version.deck if source_version else None)
    if context_deck:
        deck_type = deck_type or context_deck.type
        nation = nation or context_deck.nation

    if deck_type and deck_type not in ALLOWED_DECK_TYPES:
        raise ValueError("deck_type must be Standard or Stride")

    plan = AcquisitionPlan(
        name=name,
        plan_type=plan_type,
        list_source=list_source,
        status=status,
        build_mode=build_mode,
        deck_id=target_deck.id if target_deck else None,
        deck_version_id=target_version.id if target_version else None,
        source_deck_version_id=source_version.id if source_version else None,
        deck_type=deck_type,
        nation=nation,
        notes=_clean_string(payload.get("notes")) or "",
    )

    db.session.add(plan)
    db.session.flush()

    if source_version:
        _copy_version_items(plan, source_version)

    db.session.commit()
    return plan


def update_acquisition_plan(plan_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    plan = get_acquisition_plan_or_raise(plan_id)

    if "name" in payload:
        name = _clean_string(payload.get("name"))
        if not name:
            raise ValueError("name cannot be empty")
        plan.name = name

    if "status" in payload:
        plan.status = _choice(
            payload.get("status"),
            "status",
            ALLOWED_PLAN_STATUSES,
        )

    if "build_mode" in payload:
        plan.build_mode = _choice(
            payload.get("build_mode"),
            "build_mode",
            ALLOWED_BUILD_MODES,
        )

    if "deck_type" in payload:
        deck_type = _clean_string(payload.get("deck_type"))
        if deck_type and deck_type not in ALLOWED_DECK_TYPES:
            raise ValueError("deck_type must be Standard or Stride")
        plan.deck_type = deck_type

    if "nation" in payload:
        plan.nation = _clean_string(payload.get("nation"))

    if "notes" in payload:
        plan.notes = _clean_string(payload.get("notes")) or ""

    db.session.commit()
    return plan


def delete_acquisition_plan(plan_id):
    plan = get_acquisition_plan_or_raise(plan_id)
    db.session.delete(plan)
    db.session.commit()


def add_acquisition_item(plan_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    plan = get_acquisition_plan_or_raise(plan_id)
    card_id = _int_value(payload.get("card_id"), "card_id")

    if card_id is None:
        raise ValueError("card_id is required")

    card = _get_card_or_raise(card_id)
    printing = _get_printing_or_raise(payload.get("printing_id"), card.id)

    required_quantity = _int_value(
        payload.get("required_quantity"),
        "required_quantity",
        default=1,
    )
    owned_quantity = _int_value(
        payload.get("owned_quantity"),
        "owned_quantity",
        default=0,
    )
    ordered_quantity = _int_value(
        payload.get("ordered_quantity"),
        "ordered_quantity",
        default=0,
    )
    unit_price_cents = _int_value(
        payload.get("unit_price_cents"),
        "unit_price_cents",
        default=0,
    )
    source_quantity = _int_value(
        payload.get("source_quantity"),
        "source_quantity",
        default=0,
    )
    removed_quantity = _int_value(
        payload.get("removed_quantity"),
        "removed_quantity",
        default=0,
    )

    if required_quantity <= 0:
        raise ValueError("required_quantity must be greater than 0")

    for field_name, value in (
        ("source_quantity", source_quantity),
        ("removed_quantity", removed_quantity),
        ("owned_quantity", owned_quantity),
        ("ordered_quantity", ordered_quantity),
        ("unit_price_cents", unit_price_cents),
    ):
        if value < 0:
            raise ValueError(f"{field_name} cannot be negative")

    existing = AcquisitionPlanItem.query.filter_by(
        plan_id=plan.id,
        card_id=card.id,
        printing_id=printing.id if printing else None,
    ).first()

    if existing:
        existing.required_quantity += required_quantity
        if "source_quantity" in payload:
            existing.source_quantity += source_quantity
        if "removed_quantity" in payload:
            existing.removed_quantity += removed_quantity
        if "owned_quantity" in payload:
            existing.owned_quantity += owned_quantity
        if "ordered_quantity" in payload:
            existing.ordered_quantity += ordered_quantity
        if "unit_price_cents" in payload:
            existing.unit_price_cents = unit_price_cents
        db.session.commit()
        return existing

    item = AcquisitionPlanItem(
        plan_id=plan.id,
        card_id=card.id,
        printing_id=printing.id if printing else None,
        required_quantity=required_quantity,
        source_quantity=source_quantity,
        removed_quantity=removed_quantity,
        owned_quantity=owned_quantity,
        ordered_quantity=ordered_quantity,
        unit_price_cents=unit_price_cents,
        notes=_clean_string(payload.get("notes")) or "",
    )

    db.session.add(item)
    db.session.commit()
    return item


def update_acquisition_item(item_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    item = get_acquisition_item_or_raise(item_id)

    quantity_fields = {
        "required_quantity": True,
        "source_quantity": False,
        "removed_quantity": False,
        "owned_quantity": False,
        "ordered_quantity": False,
        "unit_price_cents": False,
    }

    for field_name, must_be_positive in quantity_fields.items():
        if field_name not in payload:
            continue

        value = _int_value(payload.get(field_name), field_name)

        if value is None or (must_be_positive and value <= 0):
            raise ValueError(f"{field_name} must be greater than 0")

        if value < 0:
            raise ValueError(f"{field_name} cannot be negative")

        setattr(item, field_name, value)

    if "target_quantity" in payload:
        target_quantity = _int_value(
            payload.get("target_quantity"),
            "target_quantity",
        )
        if target_quantity is None or target_quantity < 0:
            raise ValueError("target_quantity cannot be negative")

        item.required_quantity = max(item.source_quantity, target_quantity, 1)
        item.removed_quantity = max(item.source_quantity - target_quantity, 0)

    if item.removed_quantity > item.source_quantity:
        raise ValueError("removed_quantity cannot exceed the source deck quantity")

    if item.removed_quantity > item.required_quantity:
        raise ValueError("removed_quantity cannot exceed the tracked quantity")

    if "printing_id" in payload:
        printing = _get_printing_or_raise(payload.get("printing_id"), item.card_id)
        item.printing_id = printing.id if printing else None

    if "notes" in payload:
        item.notes = _clean_string(payload.get("notes")) or ""

    db.session.commit()
    return item


def receive_acquisition_item(item_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    item = get_acquisition_item_or_raise(item_id)
    quantity = _int_value(
        payload.get("quantity"),
        "quantity",
        default=item.ordered_quantity,
    )

    if quantity <= 0:
        raise ValueError("quantity must be greater than 0")

    if quantity > item.ordered_quantity:
        raise ValueError("quantity cannot exceed the number currently ordered")

    item.ordered_quantity -= quantity
    item.owned_quantity += quantity
    db.session.commit()
    return item


def remove_acquisition_item(item_id):
    item = get_acquisition_item_or_raise(item_id)
    db.session.delete(item)
    db.session.commit()
