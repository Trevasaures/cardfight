"""Card type identities shared by catalog validation and artwork processing."""

CREST_CARD_TYPES = {"Crest", "Ride Deck Crest"}


def crest_card_type(value):
    """Recognize either crest type without changing unrelated catalog labels."""
    if not isinstance(value, str):
        return None
    canonical = {"crest": "Crest", "ride deck crest": "Ride Deck Crest"}
    return canonical.get(" ".join(value.split()).lower())
