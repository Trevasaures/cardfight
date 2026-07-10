"""
Shared API serializers.

This module contains functions to serialize various database models into dictionaries suitable for JSON responses in the API. 
Each function takes a model instance as input and returns a dictionary representation of that instance, including related data where appropriate.
"""

from backend.database import db
from backend.models import CardPrinting, Deck, DeckCard


def _deck_rule_summary(cards, totals_by_zone):
    main_count = totals_by_zone.get("main", 0)
    ride_count = totals_by_zone.get("ride", 0)
    core_count = main_count + ride_count
    ride_grades = []
    ride_nations = []

    for entry in cards:
        if entry["zone"] != "ride":
            continue

        grade = entry["card"]["grade"] if entry.get("card") else None
        ride_grades.extend([grade] * entry["quantity"])

        nation = entry["card"].get("nation") if entry.get("card") else None
        for declared_nation in (nation or "").split(" / "):
            cleaned_nation = declared_nation.strip()
            if cleaned_nation and cleaned_nation not in ride_nations:
                ride_nations.append(cleaned_nation)

    issues = []

    if main_count < 50:
        issues.append(f"Add {50 - main_count} cards to the main deck")
    elif main_count > 50:
        issues.append(f"Remove {main_count - 50} cards from the main deck")

    if ride_count < 4:
        issues.append(f"Add {4 - ride_count} cards to the ride deck")
    elif ride_count > 4:
        issues.append(f"Remove {ride_count - 4} cards from the ride deck")

    missing_ride_grades = sorted({0, 1, 2, 3}.difference(ride_grades))
    if missing_ride_grades:
        grade_labels = ", ".join(str(grade) for grade in missing_ride_grades)
        issues.append(f"Ride deck is missing grade {grade_labels}")

    invalid_ride_grades = sorted(
        {grade for grade in ride_grades if grade not in {0, 1, 2, 3}},
        key=lambda grade: (grade is None, grade if grade is not None else 0),
    )
    if invalid_ride_grades:
        issues.append("Ride deck contains a card outside grades 0 through 3")

    return {
        "required_total": 54,
        "main_deck_limit": 50,
        "ride_deck_limit": 4,
        "core_card_count": core_count,
        "main_deck_count": main_count,
        "ride_deck_count": ride_count,
        "ride_grades": ride_grades,
        "ride_nations": ride_nations,
        "is_complete": (
            main_count == 50
            and ride_count == 4
            and set(ride_grades) == {0, 1, 2, 3}
        ),
        "issues": issues,
    }


def serialize_deck(deck):
    if not deck:
        return None

    games = deck.wins + deck.losses
    win_pct = (deck.wins / games) if games else 0.0

    return {
        "id": deck.id,
        "name": deck.name,
        "type": deck.type,
        "nation": deck.nation,
        "nation_icon": deck.nation_icon,
        "wins": deck.wins,
        "losses": deck.losses,
        "games": games,
        "decided_games": games,
        "win_pct": round(win_pct, 3),
        "active": deck.active,
        "created_at": deck.created_at.isoformat() if deck.created_at else None,
    }


def serialize_deck_version_summary(version):
    if not version:
        return None

    return {
        "id": version.id,
        "deck_id": version.deck_id,
        "version_name": version.version_name,
        "notes": version.notes,
        "is_active": version.is_active,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "updated_at": version.updated_at.isoformat() if version.updated_at else None,
    }


def serialize_match(match):
    deck1 = serialize_deck(match.deck1) if match.deck1 else None
    deck2 = serialize_deck(match.deck2) if match.deck2 else None

    winner = db.session.get(Deck, match.winner_id) if match.winner_id else None
    first_player = (
        db.session.get(Deck, match.first_player_id) if match.first_player_id else None
    )

    is_undecided = match.winner_id is None
    is_valid_winner = match.winner_id in {match.deck1_id, match.deck2_id}

    if is_undecided:
        result_status = "undecided"
    elif is_valid_winner:
        result_status = "decided"
    else:
        result_status = "invalid"

    return {
        "id": match.id,
        "deck1_id": match.deck1_id,
        "deck2_id": match.deck2_id,
        "deck1_version_id": match.deck1_version_id,
        "deck2_version_id": match.deck2_version_id,
        "winner_id": match.winner_id,
        "first_player_id": match.first_player_id,
        "format": match.format,
        "date_played": match.date_played.strftime("%m/%d/%Y %I:%M %p"),
        "date_played_iso": match.date_played.isoformat(),
        "notes": match.notes,
        "deck1": deck1,
        "deck2": deck2,
        "winner": serialize_deck(winner),
        "first_player": serialize_deck(first_player),
        "deck1_version": serialize_deck_version_summary(match.deck1_version),
        "deck2_version": serialize_deck_version_summary(match.deck2_version),
        "deck1_name": deck1["name"] if deck1 else "Unknown deck",
        "deck2_name": deck2["name"] if deck2 else "Unknown deck",
        "winner_name": winner.name if winner else None,
        "first_player_name": first_player.name if first_player else None,
        "result_status": result_status,
        "is_decided": result_status == "decided",
        "is_undecided": is_undecided,
    }


def serialize_card_printing(printing):
    if not printing:
        return None

    return {
        "id": printing.id,
        "card_id": printing.card_id,
        "set_code": printing.set_code,
        "set_name": printing.set_name,
        "card_number": printing.card_number,
        "rarity": printing.rarity,
        "image_url": printing.image_url,
        "product_url": printing.product_url,
        "source": printing.source,
        "external_id": printing.external_id,
        "created_at": printing.created_at.isoformat() if printing.created_at else None,
        "updated_at": printing.updated_at.isoformat() if printing.updated_at else None,
    }


def serialize_card(card, include_printings=True):
    if not card:
        return None

    printings = []

    if include_printings:
        printings = [
            serialize_card_printing(printing)
            for printing in card.printings.order_by(CardPrinting.id.asc()).all()
        ]

    primary_printing = printings[0] if printings else None

    return {
        "id": card.id,
        "name": card.name,
        "grade": card.grade,
        "nation": card.nation,
        "card_type": card.card_type,
        "clan": card.clan,
        "race": card.race,
        "power": card.power,
        "shield": card.shield,
        "critical": card.critical,
        "trigger_type": card.trigger_type,
        "skill_text": card.skill_text,
        "flavor_text": card.flavor_text,
        "source": card.source,
        "external_id": card.external_id,
        "primary_printing": primary_printing,
        "printings": printings,
        "created_at": card.created_at.isoformat() if card.created_at else None,
        "updated_at": card.updated_at.isoformat() if card.updated_at else None,
    }


def serialize_deck_card(entry):
    if not entry:
        return None

    return {
        "id": entry.id,
        "deck_version_id": entry.deck_version_id,
        "card_id": entry.card_id,
        "printing_id": entry.printing_id,
        "quantity": entry.quantity,
        "zone": entry.zone,
        "sort_order": entry.sort_order,
        "card": serialize_card(entry.card, include_printings=False),
        "printing": serialize_card_printing(entry.printing),
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


def serialize_deck_version(version, include_cards=True):
    if not version:
        return None

    cards = []

    if include_cards:
        cards = [
            serialize_deck_card(entry)
            for entry in version.cards.order_by(
                DeckCard.zone.asc(),
                DeckCard.sort_order.asc(),
                DeckCard.id.asc(),
            ).all()
        ]

    totals_by_zone = {}

    for entry in cards:
        zone = entry["zone"]
        totals_by_zone[zone] = totals_by_zone.get(zone, 0) + entry["quantity"]

    return {
        "id": version.id,
        "deck_id": version.deck_id,
        "version_name": version.version_name,
        "notes": version.notes,
        "is_active": version.is_active,
        "deck": serialize_deck(version.deck),
        "cards": cards,
        "card_count": sum(entry["quantity"] for entry in cards),
        "unique_card_count": len(cards),
        "totals_by_zone": totals_by_zone,
        "deck_rules": _deck_rule_summary(cards, totals_by_zone),
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "updated_at": version.updated_at.isoformat() if version.updated_at else None,
    }
