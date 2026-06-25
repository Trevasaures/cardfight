"""
Shared API services for deck building.

Functions in this module handle the creation, updating, and deletion of decks, deck versions, and deck cards. 
They also provide validation and normalization of input data to ensure consistency and integrity in the database.
"""

from backend.database import db
from backend.models import Card, CardPrinting, Deck, DeckCard, DeckVersion


ALLOWED_ZONES = {"main", "ride", "g", "token", "other"}


def _clean_string(value):
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


def _int_value(value, field_name, default=None):
    if value in (None, ""):
        return default

    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc


def _bool_value(value, default=False):
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        lowered = value.strip().lower()

        if lowered in {"true", "1", "yes", "y"}:
            return True

        if lowered in {"false", "0", "no", "n"}:
            return False

    return bool(value)


def _get_deck_or_raise(deck_id):
    deck = db.session.get(Deck, deck_id)

    if not deck:
        raise LookupError("Deck not found")

    return deck


def get_deck_version_or_raise(version_id):
    version = db.session.get(DeckVersion, version_id)

    if not version:
        raise LookupError("Deck version not found")

    return version


def get_deck_card_or_raise(deck_card_id):
    entry = db.session.get(DeckCard, deck_card_id)

    if not entry:
        raise LookupError("Deck card entry not found")

    return entry


def _get_card_or_raise(card_id):
    card = db.session.get(Card, card_id)

    if not card:
        raise LookupError("Card not found")

    return card


def _get_printing_or_raise(printing_id, card_id):
    if printing_id in (None, ""):
        return None

    printing = db.session.get(CardPrinting, printing_id)

    if not printing:
        raise LookupError("Card printing not found")

    if printing.card_id != card_id:
        raise ValueError("Card printing does not belong to the selected card")

    return printing


def _normalize_zone(value):
    zone = (_clean_string(value) or "main").lower()

    if zone not in ALLOWED_ZONES:
        raise ValueError(f"zone must be one of: {', '.join(sorted(ALLOWED_ZONES))}")

    return zone


def _deactivate_other_versions(deck_id, except_version_id=None):
    query = DeckVersion.query.filter(
        DeckVersion.deck_id == deck_id,
        DeckVersion.is_active.is_(True),
    )

    if except_version_id is not None:
        query = query.filter(DeckVersion.id != except_version_id)

    for version in query.all():
        version.is_active = False


def list_deck_versions(deck_id):
    deck = _get_deck_or_raise(deck_id)

    return deck.versions.order_by(
        DeckVersion.is_active.desc(),
        DeckVersion.created_at.desc(),
    ).all()


def create_deck_version(deck_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    deck = _get_deck_or_raise(deck_id)

    version_count = deck.versions.count()
    version_name = _clean_string(payload.get("version_name")) or f"Version {version_count + 1}"
    is_active = _bool_value(payload.get("is_active"), default=True)

    if is_active:
        _deactivate_other_versions(deck.id)

    version = DeckVersion(
        deck_id=deck.id,
        version_name=version_name,
        notes=_clean_string(payload.get("notes")) or "",
        is_active=is_active,
    )

    db.session.add(version)
    db.session.commit()

    return version


def update_deck_version(version_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    version = get_deck_version_or_raise(version_id)

    if "version_name" in payload:
        version.version_name = _clean_string(payload.get("version_name")) or version.version_name

    if "notes" in payload:
        version.notes = _clean_string(payload.get("notes")) or ""

    if "is_active" in payload:
        version.is_active = _bool_value(payload.get("is_active"), default=version.is_active)

        if version.is_active:
            _deactivate_other_versions(version.deck_id, except_version_id=version.id)

    db.session.commit()

    return version


def delete_deck_version(version_id):
    version = get_deck_version_or_raise(version_id)

    db.session.delete(version)
    db.session.commit()


def add_card_to_deck_version(version_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    version = get_deck_version_or_raise(version_id)

    card_id = _int_value(payload.get("card_id"), "card_id")
    if card_id is None:
        raise ValueError("card_id is required")

    card = _get_card_or_raise(card_id)

    quantity = _int_value(payload.get("quantity"), "quantity", default=1)
    if quantity <= 0:
        raise ValueError("quantity must be greater than 0")

    printing_id = _int_value(payload.get("printing_id"), "printing_id")
    printing = _get_printing_or_raise(printing_id, card.id)

    zone = _normalize_zone(payload.get("zone"))
    sort_order = _int_value(payload.get("sort_order"), "sort_order", default=0)

    existing = DeckCard.query.filter_by(
        deck_version_id=version.id,
        card_id=card.id,
        printing_id=printing.id if printing else None,
        zone=zone,
    ).first()

    if existing:
        existing.quantity += quantity

        if "sort_order" in payload:
            existing.sort_order = sort_order

        db.session.commit()
        return existing

    entry = DeckCard(
        deck_version_id=version.id,
        card_id=card.id,
        printing_id=printing.id if printing else None,
        quantity=quantity,
        zone=zone,
        sort_order=sort_order,
    )

    db.session.add(entry)
    db.session.commit()

    return entry


def update_deck_card(deck_card_id, payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    entry = get_deck_card_or_raise(deck_card_id)

    if "quantity" in payload:
        quantity = _int_value(payload.get("quantity"), "quantity")

        if quantity is None or quantity <= 0:
            raise ValueError("quantity must be greater than 0")

        entry.quantity = quantity

    if "zone" in payload:
        entry.zone = _normalize_zone(payload.get("zone"))

    if "sort_order" in payload:
        entry.sort_order = _int_value(payload.get("sort_order"), "sort_order", default=0)

    if "printing_id" in payload:
        printing_id = _int_value(payload.get("printing_id"), "printing_id")
        printing = _get_printing_or_raise(printing_id, entry.card_id)
        entry.printing_id = printing.id if printing else None

    db.session.commit()

    return entry


def remove_deck_card(deck_card_id):
    entry = get_deck_card_or_raise(deck_card_id)

    db.session.delete(entry)
    db.session.commit()