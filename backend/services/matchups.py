"""
Service functions for generating matchups.
- Random matchups
- Fixed matchups
"""
import random
from typing import Literal, Sequence, Tuple
from backend.models import Deck

Mode = Literal["any", "standard", "stride"]

def pool_for_mode(mode: Mode) -> Sequence[Deck]:
    m = (mode or "any").lower()
    if m == "standard":
        return Deck.query.filter_by(type="Standard").all()
    if m == "stride":
        return Deck.query.filter_by(type="Stride").all()
    return Deck.query.all()

def random_matchup(mode: Mode) -> Tuple[Deck, Deck, Deck]:
    pool = pool_for_mode(mode)
    if len(pool) < 2:
        raise ValueError(f"Not enough decks for mode='{mode}'.")
    d1, d2 = random.sample(pool, 2)
    first = random.choice([d1, d2])
    return d1, d2, first

def fixed_matchup(deck1_id: int, deck2_id: int) -> Tuple[Deck, Deck, Deck]:
    if deck1_id == deck2_id:
        raise ValueError("deck1_id and deck2_id must be different.")
    d1 = Deck.query.get(deck1_id)
    d2 = Deck.query.get(deck2_id)
    if not d1 or not d2:
        raise LookupError("One or both deck IDs do not exist.")
    first = random.choice([d1, d2])
    return d1, d2, first
