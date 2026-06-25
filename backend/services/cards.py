"""
Shared API serializers.

These helpers keep route/service responses consistent so the frontend does not
need to duplicate a bunch of formatting and relationship logic.
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


def _clean_string(value):
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


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
        "set_code": _clean_string(payload.get("set_code")),
        "set_name": _clean_string(payload.get("set_name")),
        "card_number": _clean_string(payload.get("card_number")),
        "rarity": _clean_string(payload.get("rarity")),
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


def get_card_or_raise(card_id):
    card = db.session.get(Card, card_id)

    if not card:
        raise LookupError("Card not found")

    return card


def search_cards(
    q=None,
    nation=None,
    grade=None,
    card_type=None,
    limit=50,
):
    query = Card.query

    q = _clean_string(q)

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

    card = Card(**_card_payload(payload))

    db.session.add(card)
    db.session.flush()

    initial_printing = payload.get("printing")

    if isinstance(initial_printing, dict):
        printing_data = _printing_payload(initial_printing)

        if _has_printing_data(printing_data):
            db.session.add(CardPrinting(card_id=card.id, **printing_data))
    elif _has_printing_data(payload):
        db.session.add(CardPrinting(card_id=card.id, **_printing_payload(payload)))

    db.session.commit()
    return card


def update_card(card_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    card = get_card_or_raise(card_id)

    for field_name in CARD_FIELDS:
        if field_name not in payload:
            continue

        if field_name in {"grade", "power", "shield", "critical"}:
            setattr(card, field_name, _int_or_none(payload.get(field_name), field_name))
        elif field_name in {"skill_text", "flavor_text"}:
            setattr(card, field_name, _clean_string(payload.get(field_name)) or "")
        elif field_name in {"name", "card_type"}:
            value = _required_string(payload, field_name)
            setattr(card, field_name, value)
        else:
            setattr(card, field_name, _clean_string(payload.get(field_name)))

    db.session.commit()
    return card


def add_card_printing(card_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    card = get_card_or_raise(card_id)
    printing = CardPrinting(card_id=card.id, **_printing_payload(payload))

    db.session.add(printing)
    db.session.commit()

    return printing