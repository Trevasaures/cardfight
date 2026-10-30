"""Acquisition-plan services for physical deck purchasing workflows."""

from collections import defaultdict

from backend.database import db
from backend.errors import NotFoundError, ValidationError
from backend.models import (
    AcquisitionPlan,
    AcquisitionPlanItem,
    Card,
    CardPrinting,
    Deck,
    DeckCard,
    DeckVersion,
    now_central,
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
        raise ValidationError(f"{field_name} must be a whole number")

    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be a whole number") from exc

    if isinstance(value, float) and not value.is_integer():
        raise ValidationError(f"{field_name} must be a whole number")

    return parsed


def _choice(value, field_name, allowed, default=None):
    cleaned = _clean_string(value) or default

    if cleaned not in allowed:
        choices = ", ".join(sorted(allowed))
        raise ValidationError(f"{field_name} must be one of: {choices}")

    return cleaned


def _get_deck_or_raise(deck_id):
    deck = db.session.get(Deck, deck_id)

    if not deck:
        raise NotFoundError("Deck not found")

    return deck


def _get_version_or_raise(version_id):
    version = db.session.get(DeckVersion, version_id)

    if not version:
        raise NotFoundError("Deck version not found")

    return version


def _get_card_or_raise(card_id):
    card = db.session.get(Card, card_id)

    if not card:
        raise NotFoundError("Card not found")

    return card


def _get_printing_or_raise(printing_id, card_id):
    if printing_id in (None, ""):
        return None

    printing_id = _int_value(printing_id, "printing_id")
    printing = db.session.get(CardPrinting, printing_id)

    if not printing:
        raise NotFoundError("Card printing not found")

    if printing.card_id != card_id:
        raise ValidationError("Card printing does not belong to the selected card")

    return printing


def get_acquisition_plan_or_raise(plan_id):
    plan = db.session.get(AcquisitionPlan, plan_id)

    if not plan:
        raise NotFoundError("Acquisition plan not found")

    return plan


def get_acquisition_item_or_raise(item_id):
    item = db.session.get(AcquisitionPlanItem, item_id)

    if not item:
        raise NotFoundError("Acquisition plan item not found")

    return item


def _require_active_plan(plan):
    if plan.archived_at is not None:
        raise ValidationError("Restore this purchase plan before editing it")


def _item_for_printing(plan_id, card_id, printing_id):
    return AcquisitionPlanItem.query.filter_by(
        plan_id=plan_id,
        card_id=card_id,
        printing_id=printing_id,
    ).first()


def _set_item_target(item, target_quantity):
    """Change the next build while retaining its original deck quantities."""
    if target_quantity < 0:
        raise ValidationError("target_quantity cannot be negative")
    item.required_quantity = max(item.source_quantity, target_quantity)
    item.removed_quantity = max(item.source_quantity - target_quantity, 0)
    _clamp_removal_confirmation(item)


def _clamp_removal_confirmation(item):
    """A changed target cannot retain confirmation for copies no longer cut.

    Growing a cut keeps already-confirmed copies, leaving only the new cuts
    pending. Physical inventory is independent of removal from the deck.
    """
    item.confirmed_removed_quantity = min(
        item.confirmed_removed_quantity or 0, item.removed_quantity
    )
    if item.confirmed_removed_quantity == 0:
        item.removal_confirmed_at = None


def archive_acquisition_plan(plan_id):
    plan = get_acquisition_plan_or_raise(plan_id)
    if plan.archived_at is not None:
        return plan

    items = plan.items.all()
    targets = [max(item.required_quantity - item.removed_quantity, 0) for item in items]
    # Incoming copies are not received copies. Check every printing separately
    # so an overage on one card cannot hide a shortage on another.
    complete = sum(targets) > 0 and all(
        item.owned_quantity >= target and item.ordered_quantity == 0
        for item, target in zip(items, targets)
    )
    if not complete:
        raise ValidationError("Receive all planned cards before archiving this plan")

    plan.status = "complete"
    plan.archived_at = now_central()
    db.session.commit()
    return plan


def restore_acquisition_plan(plan_id):
    plan = get_acquisition_plan_or_raise(plan_id)
    plan.archived_at = None
    db.session.commit()
    return plan


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
        raise ValidationError("Request body must be a JSON object")

    name = _clean_string(payload.get("name"))
    if not name:
        raise ValidationError("name is required")

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
            raise ValidationError(
                "deck_version_id is required for an existing deck plan"
            )

        target_version = _get_version_or_raise(target_version_id)
        target_deck = target_version.deck

        if list_source == "deck_version" and source_version_id is None:
            source_version_id = target_version.id

    if list_source == "deck_version":
        if source_version_id is None:
            raise ValidationError(
                "source_deck_version_id is required when copying a deck version"
            )

        source_version = _get_version_or_raise(source_version_id)
    elif source_version_id is not None:
        raise ValidationError(
            "source_deck_version_id can only be used with a deck_version list source"
        )

    requested_deck_id = _int_value(payload.get("deck_id"), "deck_id")
    if requested_deck_id is not None:
        requested_deck = _get_deck_or_raise(requested_deck_id)

        if plan_type != "existing_deck":
            raise ValidationError("deck_id can only be used for an existing deck plan")

        if target_deck and requested_deck.id != target_deck.id:
            raise ValidationError("deck_id does not match the selected deck version")

        target_deck = requested_deck

    deck_type = _clean_string(payload.get("deck_type"))
    nation = _clean_string(payload.get("nation"))

    context_deck = target_deck or (source_version.deck if source_version else None)
    if context_deck:
        deck_type = deck_type or context_deck.type
        nation = nation or context_deck.nation

    if deck_type and deck_type not in ALLOWED_DECK_TYPES:
        raise ValidationError("deck_type must be Standard or Stride")

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
        raise ValidationError("Request body must be a JSON object")

    plan = get_acquisition_plan_or_raise(plan_id)
    _require_active_plan(plan)

    if "name" in payload:
        name = _clean_string(payload.get("name"))
        if not name:
            raise ValidationError("name cannot be empty")
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
            raise ValidationError("deck_type must be Standard or Stride")
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
        raise ValidationError("Request body must be a JSON object")

    plan = get_acquisition_plan_or_raise(plan_id)
    _require_active_plan(plan)
    card_id = _int_value(payload.get("card_id"), "card_id")

    if card_id is None:
        raise ValidationError("card_id is required")

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
        raise ValidationError("required_quantity must be greater than 0")

    for field_name, value in (
        ("source_quantity", source_quantity),
        ("removed_quantity", removed_quantity),
        ("owned_quantity", owned_quantity),
        ("ordered_quantity", ordered_quantity),
        ("unit_price_cents", unit_price_cents),
    ):
        if value < 0:
            raise ValidationError(f"{field_name} cannot be negative")

    existing = _item_for_printing(plan.id, card.id, printing.id if printing else None)

    if existing:
        if (
            "unit_price_cents" in payload
            and unit_price_cents != existing.unit_price_cents
        ):
            raise ValidationError(
                "This printing already has a price. Edit its existing line to change it"
            )
        if "source_quantity" in payload or "removed_quantity" in payload:
            # Legacy callers may explicitly import tracked/source quantities.
            existing.required_quantity += required_quantity
        else:
            target = max(existing.required_quantity - existing.removed_quantity, 0)
            _set_item_target(existing, target + required_quantity)
        if "source_quantity" in payload:
            existing.source_quantity += source_quantity
        if "removed_quantity" in payload:
            existing.removed_quantity += removed_quantity
        if "owned_quantity" in payload:
            existing.owned_quantity += owned_quantity
        if "ordered_quantity" in payload:
            existing.ordered_quantity += ordered_quantity
        _clamp_removal_confirmation(existing)
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
        raise ValidationError("Request body must be a JSON object")

    item = get_acquisition_item_or_raise(item_id)
    _require_active_plan(item.plan)

    if "printing_id" in payload:
        printing = _get_printing_or_raise(payload.get("printing_id"), item.card_id)
        printing_id = printing.id if printing else None
        if printing_id != item.printing_id:
            if _item_for_printing(item.plan_id, item.card_id, printing_id):
                raise ValidationError(
                    "This printing is already in the plan. Split quantities into its existing line"
                )
            # Check saved inventory before applying the payload: zeroing these
            # fields in the same request must not silently relabel physical cards.
            if item.source_quantity or item.owned_quantity or item.ordered_quantity:
                raise ValidationError(
                    "Keep existing copies on their printing and split the target instead"
                )
            item.printing_id = printing_id
            item.printing = printing
            # A quote belongs to a printing, not to the shared gameplay card.
            if "unit_price_cents" not in payload:
                item.unit_price_cents = 0

    quantity_fields = (
        "required_quantity",
        "source_quantity",
        "removed_quantity",
        "owned_quantity",
        "ordered_quantity",
        "unit_price_cents",
    )

    for field_name in quantity_fields:
        if field_name not in payload:
            continue

        value = _int_value(payload.get(field_name), field_name)

        if value is None:
            raise ValidationError(f"{field_name} must be a whole number")

        if value < 0:
            raise ValidationError(f"{field_name} cannot be negative")

        setattr(item, field_name, value)

    if "target_quantity" in payload:
        target_quantity = _int_value(
            payload.get("target_quantity"),
            "target_quantity",
        )
        if target_quantity is None or target_quantity < 0:
            raise ValidationError("target_quantity cannot be negative")

        _set_item_target(item, target_quantity)

    if item.removed_quantity > item.source_quantity:
        raise ValidationError("removed_quantity cannot exceed the source deck quantity")

    if item.removed_quantity > item.required_quantity:
        raise ValidationError("removed_quantity cannot exceed the tracked quantity")

    if "notes" in payload:
        item.notes = _clean_string(payload.get("notes")) or ""

    _clamp_removal_confirmation(item)
    db.session.commit()
    return item


def update_acquisition_removal(item_id, payload):
    """Confirm deck cuts separately from restoring purchase targets or stock."""
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")

    item = get_acquisition_item_or_raise(item_id)
    _require_active_plan(item.plan)
    action = _choice(
        payload.get("action"),
        "action",
        {"confirm", "undo_confirmation", "restore_target"},
    )
    if action == "restore_target":
        if item.source_quantity <= 0:
            raise ValidationError("This line has no source-deck copies to restore")
        _set_item_target(item, item.source_quantity)
    elif action == "confirm":
        if item.removed_quantity <= 0:
            raise ValidationError("This line has no outgoing copies to mark removed")
        newly_confirmed = item.confirmed_removed_quantity < item.removed_quantity
        item.confirmed_removed_quantity = item.removed_quantity
        # Keep repeated confirmations harmless, including the recorded date.
        if newly_confirmed or item.removal_confirmed_at is None:
            item.removal_confirmed_at = now_central()
    else:
        item.confirmed_removed_quantity = 0
        item.removal_confirmed_at = None

    db.session.commit()
    return item.plan


def split_acquisition_item(item_id, payload):
    """Allocate targets to another printing in one transaction, never inventory.

    Owned, incoming, and source-deck copies keep their original identity. An
    existing destination keeps its quote and notes; a new one starts unowned.
    """
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")

    item = get_acquisition_item_or_raise(item_id)
    plan = item.plan
    _require_active_plan(plan)
    if payload.get("inventory_policy") != "keep_original":
        raise ValidationError(
            "Confirm that on-hand and incoming copies stay on their original printing"
        )

    printing = _get_printing_or_raise(payload.get("printing_id"), item.card_id)
    if printing is None:
        raise ValidationError("Choose a specific destination printing")
    if printing.id == item.printing_id:
        raise ValidationError("Choose a different printing to split into")

    quantity = _int_value(payload.get("quantity"), "quantity")
    if quantity is None or quantity <= 0:
        raise ValidationError("quantity must be greater than 0")
    target = max(item.required_quantity - item.removed_quantity, 0)
    if quantity > target:
        raise ValidationError("quantity cannot exceed the original target")
    remaining = target - quantity
    price = _int_value(payload.get("unit_price_cents"), "unit_price_cents", default=0)
    if price < 0:
        raise ValidationError("unit_price_cents cannot be negative")
    destination = _item_for_printing(plan.id, item.card_id, printing.id)
    if destination and "unit_price_cents" in payload:
        if price != destination.unit_price_cents:
            raise ValidationError(
                "This printing already has a price. Edit its existing line to change it"
            )

    # Validate both sides before mutation so an invalid split cannot partially
    # reduce the original target or overwrite the destination's purchase data.
    _set_item_target(item, remaining)
    if destination:
        destination_target = max(
            destination.required_quantity - destination.removed_quantity, 0
        )
        _set_item_target(destination, destination_target + quantity)
    else:
        db.session.add(
            AcquisitionPlanItem(
                plan_id=plan.id,
                card_id=item.card_id,
                printing_id=printing.id,
                required_quantity=quantity,
                unit_price_cents=price,
                notes=_clean_string(payload.get("notes")) or "",
            )
        )
    db.session.commit()
    return plan


def receive_acquisition_item(item_id, payload):
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")

    item = get_acquisition_item_or_raise(item_id)
    _require_active_plan(item.plan)
    quantity = _int_value(
        payload.get("quantity"),
        "quantity",
        default=item.ordered_quantity,
    )

    if quantity <= 0:
        raise ValidationError("quantity must be greater than 0")

    if quantity > item.ordered_quantity:
        raise ValidationError("quantity cannot exceed the number currently ordered")

    item.ordered_quantity -= quantity
    item.owned_quantity += quantity
    db.session.commit()
    return item


def batch_acquisition_items(plan_id, payload):
    """Update a selection in one transaction, validating it before any mutation."""
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")

    plan = get_acquisition_plan_or_raise(plan_id)
    _require_active_plan(plan)
    action = _choice(payload.get("action"), "action", {"mark_incoming", "receive"})
    requested_ids = payload.get("item_ids")
    if not isinstance(requested_ids, list) or not requested_ids:
        raise ValidationError("Select at least one card line")
    item_ids = [_int_value(value, "item_ids") for value in requested_ids]
    if any(value is None or value <= 0 for value in item_ids):
        raise ValidationError("item_ids must contain positive whole numbers")
    if len(set(item_ids)) != len(item_ids):
        raise ValidationError("Select each card line only once")

    items = AcquisitionPlanItem.query.filter(
        AcquisitionPlanItem.plan_id == plan.id,
        AcquisitionPlanItem.id.in_(item_ids),
    ).all()
    if len(items) != len(item_ids):
        raise ValidationError(
            "Every selected card line must belong to this purchase plan"
        )

    # Compute from saved quantities rather than client counts. This also keeps
    # an already-ready line harmless when a mixed selection is updated.
    quantities = [
        (
            item.ordered_quantity
            if action == "receive"
            else max(
                item.required_quantity
                - item.removed_quantity
                - item.owned_quantity
                - item.ordered_quantity,
                0,
            )
        )
        for item in items
    ]
    if not any(quantities):
        raise ValidationError(
            "No incoming cards to receive"
            if action == "receive"
            else "Selected cards are already accounted for"
        )

    for item, quantity in zip(items, quantities):
        if action == "receive":
            item.ordered_quantity -= quantity
            item.owned_quantity += quantity
        else:
            item.ordered_quantity += quantity
    db.session.commit()
    return plan


def remove_acquisition_item(item_id):
    item = get_acquisition_item_or_raise(item_id)
    _require_active_plan(item.plan)
    if item.source_quantity > 0 or item.removed_quantity > 0:
        raise ValidationError(
            "Keep this source-deck line as removal history. Change its target or restore it instead"
        )
    db.session.delete(item)
    db.session.commit()
