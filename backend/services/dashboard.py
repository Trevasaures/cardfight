"""
Dashboard service.

This calculates high-level app summaries for the future web frontend dashboard.
All stats here should be safe to display directly.
"""

from __future__ import annotations

from collections import defaultdict

from backend.models import Deck, Match
from backend.services.serializers import serialize_deck, serialize_match


def get_dashboard_summary() -> dict:
    decks = Deck.query.order_by(Deck.name).all()
    matches = Match.query.order_by(Match.date_played.desc()).all()

    total_decks = len(decks)
    active_decks = sum(1 for deck in decks if deck.active)
    inactive_decks = total_decks - active_decks

    total_matches = len(matches)
    decided_matches = sum(1 for match in matches if match.winner_id is not None)
    undecided_matches = total_matches - decided_matches

    deck_stats = _calculate_deck_stats_from_matches(decks, matches)

    best_win_rate_deck = _best_win_rate(deck_stats)
    most_played_deck = _most_played(deck_stats)

    recent_matches = [serialize_match(match) for match in matches[:8]]

    return {
        "summary": {
            "total_decks": total_decks,
            "active_decks": active_decks,
            "inactive_decks": inactive_decks,
            "total_matches": total_matches,
            "decided_matches": decided_matches,
            "undecided_matches": undecided_matches,
        },
        "best_win_rate_deck": best_win_rate_deck,
        "most_played_deck": most_played_deck,
        "recent_matches": recent_matches,
    }


def _calculate_deck_stats_from_matches(decks: list[Deck], matches: list[Match]) -> list[dict]:
    stats_by_id = {
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
        if match.deck1_id not in stats_by_id or match.deck2_id not in stats_by_id:
            continue

        stats_by_id[match.deck1_id]["logged_games"] += 1
        stats_by_id[match.deck2_id]["logged_games"] += 1

        if match.winner_id is None:
            stats_by_id[match.deck1_id]["undecided"] += 1
            stats_by_id[match.deck2_id]["undecided"] += 1
            continue

        if match.winner_id == match.deck1_id:
            stats_by_id[match.deck1_id]["wins"] += 1
            stats_by_id[match.deck2_id]["losses"] += 1
        elif match.winner_id == match.deck2_id:
            stats_by_id[match.deck2_id]["wins"] += 1
            stats_by_id[match.deck1_id]["losses"] += 1

    rows = []

    for values in stats_by_id.values():
        deck = values["deck"]
        wins = values["wins"]
        losses = values["losses"]
        decided_games = wins + losses
        logged_games = values["logged_games"]

        rows.append(
            {
                "deck": serialize_deck(deck),
                "wins": wins,
                "losses": losses,
                "undecided": values["undecided"],
                "decided_games": decided_games,
                "logged_games": logged_games,
                "win_pct": round((wins / decided_games) if decided_games else 0.0, 3),
            }
        )

    return rows


def _best_win_rate(deck_stats: list[dict]) -> dict | None:
    eligible = [
        row for row in deck_stats
        if row["decided_games"] > 0
    ]

    if not eligible:
        return None

    return max(
        eligible,
        key=lambda row: (
            row["win_pct"],
            row["decided_games"],
            row["wins"],
            row["deck"]["name"].lower(),
        ),
    )


def _most_played(deck_stats: list[dict]) -> dict | None:
    eligible = [
        row for row in deck_stats
        if row["logged_games"] > 0
    ]

    if not eligible:
        return None

    return max(
        eligible,
        key=lambda row: (
            row["logged_games"],
            row["decided_games"],
            row["wins"],
            row["deck"]["name"].lower(),
        ),
    )