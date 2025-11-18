import random
import requests  # NEW: to talk to the backend API
from deck import decks, DeckType

API_BASE = "http://127.0.0.1:5000"  # change if needed


def pick_decks(mode: str):
    """Pick two random decks depending on the chosen mode (local fallback)."""
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
        format_played = "Standard"
    elif choice == "2":
        mode = "stride"
        format_played = "Stride"
    else:
        mode = "any"
        format_played = "Any"

    try:
        r = requests.get(f"{API_BASE}/api/random", params={"mode": mode}, timeout=5)
        r.raise_for_status()
        data = r.json()
        d1 = data["deck1"]
        d2 = data["deck2"]
        first_id = data["first_player_id"]
        print(f"\nMatchup (API): {d1['name']} ({d1['type']}) VS {d2['name']} ({d2['type']})")
        first_name = d1["name"] if d1["id"] == first_id else d2["name"]
        print(f"→ {first_name} goes first! (format: {format_played})\n")

        # Ask user if they want to log the result now
        winner = input(f"Who won? [1] {d1['name']}  [2] {d2['name']}  [Enter to skip]: ").strip()
        notes = input("Notes (optional): ").strip()
        if winner in ("1", "2"):
            winner_id = d1["id"] if winner == "1" else d2["id"]
            payload = {
                "deck1_id": d1["id"],
                "deck2_id": d2["id"],
                "winner_id": winner_id,
                "first_player_id": first_id,
                "format": format_played,
                "notes": notes,
            }
            pr = requests.post(f"{API_BASE}/api/matches", json=payload, timeout=5)
            if pr.status_code >= 400:
                print(f"Failed to save match: {pr.text}")
            else:
                print("✅ Match saved!")

        return

    except Exception:
        deck1, deck2 = pick_decks(mode)
        if deck1 and deck2:
            print(f"\nMatchup (local): {deck1.name} ({deck1.deck_type.value}) "
                  f"VS {deck2.name} ({deck2.deck_type.value})")

            # Randomly decide who goes first
            first_player = random.choice([deck1, deck2])
            print(f"→ {first_player.name} goes first! (format: {format_played})\n")

            print("API not available; result not recorded.")


if __name__ == "__main__":
    main()