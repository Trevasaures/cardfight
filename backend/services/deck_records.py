"""Pure match-history aggregation shared by dashboard and analytics."""


def calculate_deck_records(decks, matches):
    """Count logged games separately from valid wins/losses, preserving deck order."""
    records = {
        deck.id: {
            "deck": deck,
            "wins": 0,
            "losses": 0,
            "undecided": 0,
            "logged_games": 0,
        }
        for deck in decks
    }

    for match in matches:
        if match.deck1_id not in records or match.deck2_id not in records:
            continue
        first = records[match.deck1_id]
        second = records[match.deck2_id]
        first["logged_games"] += 1
        second["logged_games"] += 1

        if match.winner_id is None:
            first["undecided"] += 1
            second["undecided"] += 1
        elif match.winner_id == match.deck1_id:
            first["wins"] += 1
            second["losses"] += 1
        elif match.winner_id == match.deck2_id:
            second["wins"] += 1
            first["losses"] += 1
        # Legacy invalid winners remain logged, but must not affect win rates.

    for record in records.values():
        decided = record["wins"] + record["losses"]
        record["decided_games"] = decided
        record["win_pct"] = round(record["wins"] / decided, 3) if decided else 0.0
    return list(records.values())
