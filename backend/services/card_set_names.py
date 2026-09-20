SET_CODE_NAMES = {
    # Add/update these over time.
    # Standard sets
    "D-BT01": "Genesis of the Five Greats",
    "D-BT02": "A Brush with the Legends",
    "D-BT03": "Advance of Intertwined Stars",
    "D-BT04": "Awakening of Chakrabarthi",
    "D-BT05": "Triumphant Return of the Brave Heroes",
    "D-BT06": "Blazing Dragon Reborn",
    "D-BT07": "Raging Flames Against Emerald Storm",
    "D-BT08": "Minerva Rising",
    "D-BT09": "Dragontree Invasion",
    "D-BT10": "Dragon Masquerade",
    "D-BT11": "Clash of the Heroes",
    "D-BT12": "Evenfall Onslaught",
    "D-BT13": "Flight of Chakrabarthi",

    # Standard sets (DZ)
    "DZ-BT01": "Fated Clash",
    "DZ-BT02": "Illusionless Strife",
    "DZ-BT03": "Dimensional Transcendence",
    "DZ-BT04": "Destined Showdown",
    "DZ-BT05": "Omniscient Awakening",
    "DZ-BT06": "Generation Dragenesis",
    "DZ-BT07": "Moon Fangs & Cerulean Blaze",
    "DZ-BT08": "Knights of Rebirth",
    "DZ-BT09": "Super Brave Detonation",
    "DZ-BT10": "Dragonsoul Resonance",
    "DZ-BT11": "Symphony of Might & Bloom",
    "DZ-BT12": "Chasm of Lost Souls",
    "DZ-BT13": "Parallactic Clash",
    "DZ-BT14": "Envoys of the Crimson Moon",
    "DZ-BT15": "Strike of Illusionary Shadows",
    "DZ-BT16": "Parallactic Dawn",
    "DZ-BT17": "Parallactic Fate",
}


class DuplicateCardSetError(ValueError):
    """Raised when a set code would collide with existing metadata."""


class CardSetInUseError(ValueError):
    """Raised when deletion would orphan printing metadata."""

    def __init__(self, set_code: str, usage_count: int):
        super().__init__(
            f"{set_code} is used by {usage_count} card printing(s). "
            "Update the set instead of deleting it."
        )
        self.usage_count = usage_count


def normalize_set_code(set_code: str | None) -> str | None:
    if not set_code:
        return None

    normalized = str(set_code).strip().upper()
    return normalized or None


def _clean_set_name(set_name: str | None) -> str | None:
    if not set_name:
        return None

    cleaned = str(set_name).strip()
    return cleaned or None


def lookup_set_name(set_code: str | None) -> str | None:
    normalized_code = normalize_set_code(set_code)
    if not normalized_code:
        return None

    built_in_name = SET_CODE_NAMES.get(normalized_code)
    if built_in_name:
        return built_in_name

    from flask import has_app_context

    if not has_app_context():
        return None

    from backend.models import CardPrinting, CardSet

    custom_set = CardSet.query.filter_by(code=normalized_code).first()
    if custom_set:
        return custom_set.name

    existing_printing = (
        CardPrinting.query.filter(
            CardPrinting.set_code == normalized_code,
            CardPrinting.set_name.isnot(None),
            CardPrinting.set_name != "",
        )
        .order_by(CardPrinting.updated_at.desc(), CardPrinting.id.desc())
        .first()
    )
    return existing_printing.set_name if existing_printing else None


def list_set_options() -> list[dict[str, str]]:
    """Combine built-in, saved, and historically used set metadata."""
    from backend.models import CardPrinting, CardSet

    options: dict[str, str] = {}

    for set_code, set_name in (
        CardPrinting.query.with_entities(
            CardPrinting.set_code,
            CardPrinting.set_name,
        )
        .filter(
            CardPrinting.set_code.isnot(None),
            CardPrinting.set_code != "",
            CardPrinting.set_name.isnot(None),
            CardPrinting.set_name != "",
        )
        .order_by(CardPrinting.updated_at.desc(), CardPrinting.id.desc())
        .all()
    ):
        normalized_code = normalize_set_code(set_code)
        cleaned_name = _clean_set_name(set_name)
        if normalized_code and cleaned_name:
            options.setdefault(normalized_code, cleaned_name)

    for custom_set in CardSet.query.all():
        options[custom_set.code] = custom_set.name

    options.update(SET_CODE_NAMES)

    return [
        {"code": code, "name": name}
        for code, name in sorted(options.items())
    ]


def list_custom_sets() -> list[dict]:
    """Return user-managed sets with their current printing usage counts."""
    from backend.database import db
    from backend.models import CardPrinting

    usage_by_code = dict(
        db.session.query(
            db.func.upper(CardPrinting.set_code),
            db.func.count(CardPrinting.id),
        )
        .filter(
            CardPrinting.set_code.isnot(None),
            CardPrinting.set_code != "",
        )
        .group_by(db.func.upper(CardPrinting.set_code))
        .all()
    )

    return [
        {
            "code": option["code"],
            "name": option["name"],
            "usage_count": int(usage_by_code.get(option["code"], 0)),
        }
        for option in list_set_options()
        if option["code"] not in SET_CODE_NAMES
    ]


def _validate_set_fields(set_code, set_name) -> tuple[str, str]:
    normalized_code = normalize_set_code(set_code)
    cleaned_name = _clean_set_name(set_name)

    if not normalized_code:
        raise ValueError("code is required")
    if not cleaned_name:
        raise ValueError("name is required")
    if len(normalized_code) > 80:
        raise ValueError("code must be 80 characters or fewer")
    if len(cleaned_name) > 160:
        raise ValueError("name must be 160 characters or fewer")

    return normalized_code, cleaned_name


def save_custom_set(payload: dict) -> tuple[dict[str, str], bool]:
    """Create a reusable custom set and return whether it was newly saved."""
    from backend.database import db
    from backend.models import CardSet

    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    set_code, set_name = _validate_set_fields(
        payload.get("code"),
        payload.get("name"),
    )

    built_in_name = SET_CODE_NAMES.get(set_code)
    if built_in_name:
        if built_in_name.casefold() != set_name.casefold():
            raise DuplicateCardSetError(
                f"{set_code} already exists as '{built_in_name}' in the built-in catalog"
            )
        return {"code": set_code, "name": built_in_name}, False

    custom_set = CardSet.query.filter_by(code=set_code).first()
    if custom_set:
        if custom_set.name.casefold() != set_name.casefold():
            raise DuplicateCardSetError(
                f"{set_code} already exists as '{custom_set.name}'. "
                "Use Manage reusable card sets to update it."
            )
        return {"code": custom_set.code, "name": custom_set.name}, False

    historical_name = lookup_set_name(set_code)
    if historical_name and historical_name.casefold() != set_name.casefold():
        raise DuplicateCardSetError(
            f"{set_code} is already used as '{historical_name}' by a card printing"
        )

    custom_set = CardSet(code=set_code, name=historical_name or set_name)
    db.session.add(custom_set)

    db.session.commit()
    return {"code": custom_set.code, "name": custom_set.name}, True


def update_custom_set(current_code: str, payload: dict) -> dict:
    """Update a managed set and cascade its metadata to linked printings."""
    from backend.database import db
    from backend.models import CardPrinting, CardSet

    normalized_current_code = normalize_set_code(current_code)
    custom_set = CardSet.query.filter_by(code=normalized_current_code).first()
    if not custom_set:
        historical_name = lookup_set_name(normalized_current_code)
        if not historical_name or normalized_current_code in SET_CODE_NAMES:
            raise LookupError("Custom card set not found")
        current_name = historical_name
    else:
        current_name = custom_set.name
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")

    next_code, next_name = _validate_set_fields(
        payload.get("code", normalized_current_code),
        payload.get("name", current_name),
    )

    built_in_name = SET_CODE_NAMES.get(next_code)
    if built_in_name:
        raise DuplicateCardSetError(
            f"{next_code} already exists as '{built_in_name}' in the built-in catalog"
        )

    duplicate_query = CardSet.query.filter(CardSet.code == next_code)
    if custom_set:
        duplicate_query = duplicate_query.filter(CardSet.id != custom_set.id)
    duplicate_set = duplicate_query.first()
    if duplicate_set:
        raise DuplicateCardSetError(
            f"{next_code} already exists as '{duplicate_set.name}'"
        )

    if next_code != normalized_current_code:
        conflicting_printing = CardPrinting.query.filter(
            db.func.upper(CardPrinting.set_code) == next_code,
        ).first()
        if conflicting_printing:
            raise DuplicateCardSetError(
                f"{next_code} is already used by another card printing"
            )

    linked_printings = CardPrinting.query.filter(
        db.func.upper(CardPrinting.set_code) == normalized_current_code,
    )
    usage_count = linked_printings.count()
    linked_printings.update(
        {
            CardPrinting.set_code: next_code,
            CardPrinting.set_name: next_name,
        },
        synchronize_session=False,
    )

    if custom_set is None:
        custom_set = CardSet(code=next_code, name=next_name)
        db.session.add(custom_set)
    else:
        custom_set.code = next_code
        custom_set.name = next_name
    db.session.commit()

    return {
        "code": custom_set.code,
        "name": custom_set.name,
        "usage_count": usage_count,
    }


def delete_custom_set(set_code: str):
    """Delete an unused managed set while protecting linked printings."""
    from backend.database import db
    from backend.models import CardPrinting, CardSet

    normalized_code = normalize_set_code(set_code)
    custom_set = CardSet.query.filter_by(code=normalized_code).first()
    if not custom_set:
        usage_count = CardPrinting.query.filter(
            db.func.upper(CardPrinting.set_code) == normalized_code,
        ).count()
        if usage_count:
            raise CardSetInUseError(normalized_code, usage_count)
        raise LookupError("Custom card set not found")

    usage_count = CardPrinting.query.filter(
        db.func.upper(CardPrinting.set_code) == custom_set.code,
    ).count()
    if usage_count:
        raise CardSetInUseError(custom_set.code, usage_count)

    db.session.delete(custom_set)
    db.session.commit()


def remember_custom_set(set_code: str | None, set_name: str | None):
    """Stage unknown set metadata in the current card-writing transaction."""
    from backend.database import db
    from backend.models import CardSet

    normalized_code = normalize_set_code(set_code)
    cleaned_name = _clean_set_name(set_name)

    if (
        not normalized_code
        or not cleaned_name
        or normalized_code in SET_CODE_NAMES
    ):
        return

    if CardSet.query.filter_by(code=normalized_code).first() is None:
        db.session.add(CardSet(code=normalized_code, name=cleaned_name))
