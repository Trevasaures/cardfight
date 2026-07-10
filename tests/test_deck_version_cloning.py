import pytest

from backend.database import db
from backend.models import Card, CardPrinting, Deck, DeckCard, DeckVersion
from backend.services.deck_builder import create_deck_version


def test_create_version_copies_every_deck_card_field(app_context):
    deck = Deck(name="Test Deck", type="Standard", nation="Brandt Gate")
    card = Card(name="Test Unit", grade=2, nation="Brandt Gate", card_type="Normal Unit")
    db.session.add_all([deck, card])
    db.session.flush()

    printing = CardPrinting(
        card_id=card.id,
        set_code="DZ-BT01",
        set_name="Fated Clash",
        card_number="001",
        rarity="RR",
    )
    source = DeckVersion(deck_id=deck.id, version_name="Original", is_active=True)
    db.session.add_all([printing, source])
    db.session.flush()

    source_entry = DeckCard(
        deck_version_id=source.id,
        card_id=card.id,
        printing_id=printing.id,
        quantity=4,
        zone="ride",
        sort_order=17,
    )
    db.session.add(source_entry)
    db.session.commit()

    clone = create_deck_version(
        deck.id,
        {
            "version_name": "Copied build",
            "notes": "Testing changes",
            "source_version_id": source.id,
            "is_active": True,
        },
    )

    cloned_entry = clone.cards.one()
    assert (
        cloned_entry.card_id,
        cloned_entry.printing_id,
        cloned_entry.quantity,
        cloned_entry.zone,
        cloned_entry.sort_order,
    ) == (card.id, printing.id, 4, "ride", 17)
    assert clone.is_active is True
    assert db.session.get(DeckVersion, source.id).is_active is False


def test_clone_source_must_belong_to_selected_deck(app_context):
    first_deck = Deck(name="First", type="Standard")
    second_deck = Deck(name="Second", type="Standard")
    db.session.add_all([first_deck, second_deck])
    db.session.flush()

    source = DeckVersion(deck_id=first_deck.id, version_name="Original")
    db.session.add(source)
    db.session.commit()

    with pytest.raises(ValueError, match="must belong to the selected deck"):
        create_deck_version(
            second_deck.id,
            {"source_version_id": source.id},
        )
