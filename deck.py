# Holds the deck information and such
from enum import Enum

class DeckType(Enum):
    STRIDE = "Stride"
    STANDARD = "Standard"


class Deck:
    def __init__(self, name: str, deck_type: DeckType):
        """
        :param name: Name of the deck
        :param deck_type: Must be a DeckType Enum
        """
        self.name = name
        self.deck_type = deck_type

    def __repr__(self):
        return f"Deck(name={self.name}, deck_type={self.deck_type.value})"


# Define decks here with Enums instead of strings
decks = [
    Deck("Shiranui", DeckType.STRIDE),
    Deck("Messiah", DeckType.STRIDE),
    Deck("Luard", DeckType.STRIDE),
    Deck("Eva", DeckType.STANDARD),
    Deck("Magnolia", DeckType.STANDARD),
    Deck("Prison", DeckType.STANDARD),
    Deck("Varga", DeckType.STANDARD),
    Deck("Blangdmire", DeckType.STANDARD),
    Deck("Drajeweled", DeckType.STANDARD),
    Deck("Impauldio", DeckType.STANDARD),
    Deck("Levidras", DeckType.STANDARD),
]

