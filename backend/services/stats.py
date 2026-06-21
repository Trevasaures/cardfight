"""
Service functions for API stats.

Important:
- Match history is treated as the source of truth.
- Undecided matches are counted as logged games.
- Undecided matches do not count as wins or losses.
- Win percentage is based on decided games only.
"""

from __future__ import annotations

from sqlalchemy import or_, case, func

from backend.database import db
from backend.models import Deck, Match
from backend.services.serializers import serialize_deck


def stats_table() -> list[dict]:
    decks = Deck.query.order_by(Deck.name).all()
    matches = Match.query.all()

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
        undecided = values["undecided"]
        logged_games = values["logged_games"]
        decided_games = wins + losses
        win_pct = (wins / decided_games) if decided_games else 0.0

        rows.append(
            {
                "deck_id": deck.id,
                "id": deck.id,
                "name": deck.name,
                "type": deck.type,
                "active": bool(deck.active),
                "wins": wins,
                "losses": losses,
                "undecided": undecided,
                "games": decided_games,
                "decided_games": decided_games,
                "logged_games": logged_games,
                "win_pct": round(win_pct, 3),
                "deck": serialize_deck(deck),
            }
        )

    return sorted(
        rows,
        key=lambda row: (
            row["win_pct"],
            row["decided_games"],
            row["wins"],
            row["name"].lower(),
        ),
        reverse=True,
    )


def versus_for(deck_id: int):
    subject = Deck.query.get_or_404(deck_id)

    base_query = Match.query.filter(
        or_(
            Match.deck1_id == deck_id,
            Match.deck2_id == deck_id,
        )
    )

    opponent_id = case(
        (Match.deck1_id == deck_id, Match.deck2_id),
        else_=Match.deck1_id,
    ).label("opponent_id")

    subject_win = case(
        (Match.winner_id == deck_id, 1),
        else_=0,
    ).label("subject_win")

    subject_loss = case(
        (
            (Match.winner_id.isnot(None)) & (Match.winner_id != deck_id),
            1,
        ),
        else_=0,
    ).label("subject_loss")

    undecided = case(
        (Match.winner_id.is_(None), 1),
        else_=0,
    ).label("undecided")

    rows = (
        db.session.query(
            opponent_id,
            func.count().label("logged_games"),
            func.sum(subject_win).label("wins"),
            func.sum(subject_loss).label("losses"),
            func.sum(undecided).label("undecided"),
        )
        .filter(
            or_(
                Match.deck1_id == deck_id,
                Match.deck2_id == deck_id,
            )
        )
        .group_by(opponent_id)
        .all()
    )

    versus = []
    type_totals = {}

    for row in rows:
        opponent = Deck.query.get(row.opponent_id)

        if not opponent:
            continue

        wins = int(row.wins or 0)
        losses = int(row.losses or 0)
        undecided_count = int(row.undecided or 0)
        logged_games = int(row.logged_games or 0)
        decided_games = wins + losses
        win_pct = (wins / decided_games) if decided_games else 0.0

        versus.append(
            {
                "opponent_id": opponent.id,
                "opponent_name": opponent.name,
                "opponent_type": opponent.type,
                "games": decided_games,
                "decided_games": decided_games,
                "logged_games": logged_games,
                "wins": wins,
                "losses": losses,
                "undecided": undecided_count,
                "win_pct": round(win_pct, 3),
            }
        )

        opponent_type = opponent.type

        type_totals.setdefault(
            opponent_type,
            {
                "logged_games": 0,
                "wins": 0,
                "losses": 0,
                "undecided": 0,
            },
        )

        type_totals[opponent_type]["logged_games"] += logged_games
        type_totals[opponent_type]["wins"] += wins
        type_totals[opponent_type]["losses"] += losses
        type_totals[opponent_type]["undecided"] += undecided_count

    type_breakdown = []

    for opponent_type, values in type_totals.items():
        wins = values["wins"]
        losses = values["losses"]
        decided_games = wins + losses
        logged_games = values["logged_games"]
        win_pct = (wins / decided_games) if decided_games else 0.0

        type_breakdown.append(
            {
                "opponent_type": opponent_type,
                "games": decided_games,
                "decided_games": decided_games,
                "logged_games": logged_games,
                "wins": wins,
                "losses": losses,
                "undecided": values["undecided"],
                "win_pct": round(win_pct, 3),
            }
        )

    recent_matches = base_query.order_by(Match.date_played.desc()).limit(50).all()

    recent_payload = []

    for match in recent_matches:
        opponent_id_value = match.deck2_id if match.deck1_id == deck_id else match.deck1_id
        opponent = Deck.query.get(opponent_id_value)

        if match.winner_id == deck_id:
            result = "W"
        elif match.winner_id is None:
            result = "-"
        else:
            result = "L"

        recent_payload.append(
            {
                "match_id": match.id,
                "id": match.id,
                "date_played": match.date_played.isoformat() if match.date_played else None,
                "opponent_id": opponent.id if opponent else opponent_id_value,
                "opponent_name": opponent.name if opponent else f"#{opponent_id_value}",
                "opponent_type": opponent.type if opponent else "",
                "winner_id": match.winner_id,
                "result": result,
                "notes": match.notes or "",
            }
        )

    return {
        "deck": serialize_deck(subject),
        "versus": sorted(versus, key=lambda item: item["opponent_name"].lower()),
        "by_opponent_type": sorted(
            type_breakdown,
            key=lambda item: item["opponent_type"].lower(),
        ),
        "recent": recent_payload,
    }


def matrix():
    decks = Deck.query.order_by(Deck.id).all()
    deck_ids = [deck.id for deck in decks]
    deck_by_id = {deck.id: deck for deck in decks}

    all_matches = Match.query.all()

    wins = {
        (deck_a, deck_b): 0
        for deck_a in deck_ids
        for deck_b in deck_ids
        if deck_a != deck_b
    }

    losses = {
        (deck_a, deck_b): 0
        for deck_a in deck_ids
        for deck_b in deck_ids
        if deck_a != deck_b
    }

    logged_games = {
        (deck_a, deck_b): 0
        for deck_a in deck_ids
        for deck_b in deck_ids
        if deck_a != deck_b
    }

    undecided = {
        (deck_a, deck_b): 0
        for deck_a in deck_ids
        for deck_b in deck_ids
        if deck_a != deck_b
    }

    for match in all_matches:
        deck1_id = match.deck1_id
        deck2_id = match.deck2_id

        if deck1_id == deck2_id:
            continue

        if deck1_id not in deck_by_id or deck2_id not in deck_by_id:
            continue

        logged_games[(deck1_id, deck2_id)] += 1
        logged_games[(deck2_id, deck1_id)] += 1

        if match.winner_id is None:
            undecided[(deck1_id, deck2_id)] += 1
            undecided[(deck2_id, deck1_id)] += 1
            continue

        if match.winner_id == deck1_id:
            wins[(deck1_id, deck2_id)] += 1
            losses[(deck2_id, deck1_id)] += 1
        elif match.winner_id == deck2_id:
            wins[(deck2_id, deck1_id)] += 1
            losses[(deck1_id, deck2_id)] += 1

    table = []

    for row_deck_id in deck_ids:
        row = {
            "deck_id": row_deck_id,
            "deck_name": deck_by_id[row_deck_id].name,
        }

        for col_deck_id in deck_ids:
            if row_deck_id == col_deck_id:
                row[str(col_deck_id)] = None
                continue

            matchup_wins = wins[(row_deck_id, col_deck_id)]
            matchup_losses = losses[(row_deck_id, col_deck_id)]
            decided_games = matchup_wins + matchup_losses

            row[str(col_deck_id)] = (
                round(matchup_wins / decided_games, 3)
                if decided_games
                else None
            )

        table.append(row)

    return {
        "decks": [
            {
                "id": deck.id,
                "name": deck.name,
                "type": deck.type,
                "active": deck.active,
            }
            for deck in decks
        ],
        "matrix": table,
    }