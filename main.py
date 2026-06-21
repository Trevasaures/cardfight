import random
import requests

from deck import decks, DeckType


API_BASE = "http://127.0.0.1:5000"


def pick_decks(mode: str):
    """Pick two random decks depending on the chosen mode as a local fallback."""
    if mode == "standard":
        pool = [d for d in decks if d.deck_type == DeckType.STANDARD]
    elif mode == "stride":
        pool = [d for d in decks if d.deck_type == DeckType.STRIDE]
    else:
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
        format_played = "Standard"
    elif choice == "2":
        mode = "stride"
        format_played = "Stride"
    else:
        mode = "any"
        format_played = "Any"

    try:
        response = requests.get(
            f"{API_BASE}/api/play/random",
            params={"format": format_played},
            timeout=5,
        )
        response.raise_for_status()

        data = response.json()

        d1 = data["deck1"]
        d2 = data["deck2"]
        first = data["first_player"]
        first_id = first["id"]

        print(
            f"\nMatchup (API): "
            f"{d1['name']} ({d1['type']}) VS {d2['name']} ({d2['type']})"
        )
        print(f"→ {first['name']} goes first! (format: {format_played})\n")

        winner = input(
            f"Who won? [1] {d1['name']}  [2] {d2['name']}  [Enter for undecided]: "
        ).strip()
        notes = input("Notes (optional): ").strip()

        winner_id = None
        if winner == "1":
            winner_id = d1["id"]
        elif winner == "2":
            winner_id = d2["id"]

        payload = {
            "deck1_id": d1["id"],
            "deck2_id": d2["id"],
            "winner_id": winner_id,
            "first_player_id": first_id,
            "format": format_played,
            "notes": notes,
        }

        save_response = requests.post(
            f"{API_BASE}/api/matches",
            json=payload,
            timeout=5,
        )

        if save_response.status_code >= 400:
            print(f"Failed to save match: {save_response.text}")
        else:
            print("✅ Match saved!")

        return

    except Exception as exc:
        print(f"API not available or request failed: {exc}")
        print("Falling back to local random picker.\n")

        deck1, deck2 = pick_decks(mode)

        if deck1 and deck2:
            print(
                f"Matchup (local): {deck1.name} ({deck1.deck_type.value}) "
                f"VS {deck2.name} ({deck2.deck_type.value})"
            )

            first_player = random.choice([deck1, deck2])
            print(f"→ {first_player.name} goes first! (format: {format_played})\n")
            print("API not available; result not recorded.")


if __name__ == "__main__":
    main()