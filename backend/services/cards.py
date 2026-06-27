"""
Card catalog services.

These helpers handle card/card-printing creation, search, updates, and duplicate
protection. Routes should stay thin and call into this service layer.
"""

from sqlalchemy import or_

from backend.database import db
from backend.models import Card, CardPrinting


CARD_FIELDS = {
    "name",
    "grade",
    "nation",
    "card_type",
    "clan",
    "race",
    "power",
    "shield",
    "critical",
    "trigger_type",
    "skill_text",
    "flavor_text",
    "source",
    "external_id",
}

PRINTING_FIELDS = {
    "set_code",
    "set_name",
    "card_number",
    "rarity",
    "image_url",
    "product_url",
    "source",
    "external_id",
}


class DuplicateCardPrintingError(ValueError):
    def __init__(self, card):
        super().__init__(
            f"Card printing already exists for '{card.name}'. Use the existing card instead."
        )
        self.card = card


def _clean_string(value):
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


def _normalize_printing_value(value):
    return (_clean_string(value) or "").upper()


def _int_or_none(value, field_name):
    if value in (None, ""):
        return None

    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc


def _required_string(payload, field_name):
    value = _clean_string(payload.get(field_name))

    if not value:
        raise ValueError(f"{field_name} is required")

    return value


def _card_payload(payload):
    return {
        "name": _required_string(payload, "name"),
        "grade": _int_or_none(payload.get("grade"), "grade"),
        "nation": _clean_string(payload.get("nation")),
        "card_type": _required_string(payload, "card_type"),
        "clan": _clean_string(payload.get("clan")),
        "race": _clean_string(payload.get("race")),
        "power": _int_or_none(payload.get("power"), "power"),
        "shield": _int_or_none(payload.get("shield"), "shield"),
        "critical": _int_or_none(payload.get("critical"), "critical"),
        "trigger_type": _clean_string(payload.get("trigger_type")),
        "skill_text": _clean_string(payload.get("skill_text")) or "",
        "flavor_text": _clean_string(payload.get("flavor_text")) or "",
        "source": _clean_string(payload.get("source")) or "manual",
        "external_id": _clean_string(payload.get("external_id")),
    }


def _printing_payload(payload):
    return {
        "set_code": _normalize_printing_value(payload.get("set_code")) or None,
        "set_name": _clean_string(payload.get("set_name")),
        "card_number": _normalize_printing_value(payload.get("card_number")) or None,
        "rarity": _normalize_printing_value(payload.get("rarity")) or None,
        "image_url": _clean_string(payload.get("image_url")),
        "product_url": _clean_string(payload.get("product_url")),
        "source": _clean_string(payload.get("source")) or "manual",
        "external_id": _clean_string(payload.get("external_id")),
    }


def _has_printing_data(payload):
    return any(
        _clean_string(payload.get(field_name))
        for field_name in PRINTING_FIELDS
        if field_name != "source"
    )


def _find_printing_payload(payload):
    initial_printing = payload.get("printing")

    if isinstance(initial_printing, dict) and _has_printing_data(initial_printing):
        return _printing_payload(initial_printing)

    if _has_printing_data(payload):
        return _printing_payload(payload)

    return None


def find_duplicate_card_printing(
    name,
    set_code,
    card_number,
    rarity,
    exclude_printing_id=None,
):
    cleaned_name = _clean_string(name)
    cleaned_set_code = _normalize_printing_value(set_code)
    cleaned_card_number = _normalize_printing_value(card_number)
    cleaned_rarity = _normalize_printing_value(rarity)

    if not cleaned_name or not cleaned_set_code or not cleaned_card_number:
        return None

    query = (
        Card.query.join(CardPrinting)
        .filter(db.func.lower(Card.name) == cleaned_name.lower())
        .filter(db.func.coalesce(db.func.upper(CardPrinting.set_code), "") == cleaned_set_code)
        .filter(
            db.func.coalesce(db.func.upper(CardPrinting.card_number), "")
            == cleaned_card_number
        )
        .filter(db.func.coalesce(db.func.upper(CardPrinting.rarity), "") == cleaned_rarity)
    )

    if exclude_printing_id is not None:
        query = query.filter(CardPrinting.id != exclude_printing_id)

    return query.first()


def _raise_if_duplicate_printing(
    name,
    set_code,
    card_number,
    rarity,
    exclude_printing_id=None,
):
    duplicate = find_duplicate_card_printing(
        name=name,
        set_code=set_code,
        card_number=card_number,
        rarity=rarity,
        exclude_printing_id=exclude_printing_id,
    )

    if duplicate:
        raise DuplicateCardPrintingError(duplicate)


def get_card_or_raise(card_id):
    card = db.session.get(Card, card_id)

    if not card:
        raise LookupError("Card not found")

    return card


def get_card_printing_or_raise(printing_id):
    printing = db.session.get(CardPrinting, printing_id)

    if not printing:
        raise LookupError("Card printing not found")

    return printing


def search_cards(
    q=None,
    nation=None,
    grade=None,
    card_type=None,
    limit=50,
):
    query = Card.query

    q = _clean_string(q)

    has_filters = any(
        [
            q and len(q) >= 2,
            _clean_string(nation),
            grade not in (None, ""),
            _clean_string(card_type),
        ]
    )

    if not has_filters:
        return []

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Card.name.ilike(like),
                Card.skill_text.ilike(like),
                Card.nation.ilike(like),
                Card.card_type.ilike(like),
            )
        )

    nation = _clean_string(nation)
    if nation:
        query = query.filter(Card.nation == nation)

    if grade not in (None, ""):
        query = query.filter(Card.grade == _int_or_none(grade, "grade"))

    card_type = _clean_string(card_type)
    if card_type:
        query = query.filter(Card.card_type == card_type)

    try:
        safe_limit = int(limit)
    except (TypeError, ValueError):
        safe_limit = 50

    safe_limit = min(max(safe_limit, 1), 100)

    return query.order_by(Card.name.asc()).limit(safe_limit).all()


def create_card(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    card_data = _card_payload(payload)
    printing_data = _find_printing_payload(payload)

    if printing_data:
        _raise_if_duplicate_printing(
            name=card_data["name"],
            set_code=printing_data.get("set_code"),
            card_number=printing_data.get("card_number"),
            rarity=printing_data.get("rarity"),
        )

    card = Card(**card_data)

    db.session.add(card)
    db.session.flush()

    if printing_data:
        db.session.add(CardPrinting(card_id=card.id, **printing_data))

    db.session.commit()
    return card


def update_card(card_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    card = get_card_or_raise(card_id)

    next_values = {}

    for field_name in CARD_FIELDS:
        if field_name not in payload:
            continue

        if field_name in {"grade", "power", "shield", "critical"}:
            next_values[field_name] = _int_or_none(payload.get(field_name), field_name)
        elif field_name in {"skill_text", "flavor_text"}:
            next_values[field_name] = _clean_string(payload.get(field_name)) or ""
        elif field_name in {"name", "card_type"}:
            next_values[field_name] = _required_string(payload, field_name)
        else:
            next_values[field_name] = _clean_string(payload.get(field_name))

    next_name = next_values.get("name", card.name)

    printings = CardPrinting.query.filter_by(card_id=card.id).all()

    for printing in printings:
        _raise_if_duplicate_printing(
            name=next_name,
            set_code=printing.set_code,
            card_number=printing.card_number,
            rarity=printing.rarity,
            exclude_printing_id=printing.id,
        )

    for field_name, value in next_values.items():
        setattr(card, field_name, value)

    db.session.commit()
    return card


def add_card_printing(card_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    card = get_card_or_raise(card_id)
    printing_data = _printing_payload(payload)

    _raise_if_duplicate_printing(
        name=card.name,
        set_code=printing_data.get("set_code"),
        card_number=printing_data.get("card_number"),
        rarity=printing_data.get("rarity"),
    )

    printing = CardPrinting(card_id=card.id, **printing_data)

    db.session.add(printing)
    db.session.commit()

    return printing


def update_card_printing(printing_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    printing = get_card_printing_or_raise(printing_id)
    card = get_card_or_raise(printing.card_id)

    next_values = {
        "set_code": printing.set_code,
        "set_name": printing.set_name,
        "card_number": printing.card_number,
        "rarity": printing.rarity,
        "image_url": printing.image_url,
        "product_url": printing.product_url,
        "source": printing.source,
        "external_id": printing.external_id,
    }

    for field_name in PRINTING_FIELDS:
        if field_name not in payload:
            continue

        if field_name in {"set_code", "card_number", "rarity"}:
            next_values[field_name] = _normalize_printing_value(payload.get(field_name)) or None
        elif field_name == "source":
            next_values[field_name] = _clean_string(payload.get(field_name)) or "manual"
        else:
            next_values[field_name] = _clean_string(payload.get(field_name))

    _raise_if_duplicate_printing(
        name=card.name,
        set_code=next_values.get("set_code"),
        card_number=next_values.get("card_number"),
        rarity=next_values.get("rarity"),
        exclude_printing_id=printing.id,
    )

    for field_name, value in next_values.items():
        setattr(printing, field_name, value)

    db.session.commit()
    return printing