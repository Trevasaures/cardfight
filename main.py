import random
from deck import decks, DeckType

import random
from deck import decks, DeckType


def pick_decks(mode: str):
    """Pick two random decks depending on the chosen mode."""
    if mode == "standard":
        pool = [d for d in decks if d.deck_type == DeckType.STANDARD]
    elif mode == "stride":
        pool = [d for d in decks if d.deck_type == DeckType.STRIDE]
    else:  # "any"
        pool = decks

    if len(pool) < 2:
        print("Not enough decks available in this category!")
        return None, None

    return random.sample(pool, 2)


def main():
    print("Which format would you like to play?")
    print("1. Standard only")
    print("2. Stride only")
    print("3. Anything goes")

    choice = input("Enter 1, 2, or 3: ").strip()

    if choice == "1":
        mode = "standard"
    elif choice == "2":
        mode = "stride"
    else:
        mode = "any"

    deck1, deck2 = pick_decks(mode)

    if deck1 and deck2:
        print(f"\nMatchup: {deck1.name} ({deck1.deck_type.value}) "
              f"VS {deck2.name} ({deck2.deck_type.value})")

        # Randomly decide who goes first
        first_player = random.choice([deck1, deck2])
        print(f"→ {first_player.name} goes first!\n")


if __name__ == "__main__":
    main()

