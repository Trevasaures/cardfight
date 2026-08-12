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
from backend.models import Deck, DeckVersion, Match
from backend.services.serializers import serialize_deck, serialize_deck_version_summary


def _record_payload(matches, deck_id: int) -> dict:
    wins = sum(1 for match in matches if match.winner_id == deck_id)
    losses = sum(
        1
        for match in matches
        if match.winner_id in {match.deck1_id, match.deck2_id}
        and match.winner_id != deck_id
    )
    undecided_count = sum(1 for match in matches if match.winner_id is None)
    decided_games = wins + losses

    return {
        "wins": wins,
        "losses": losses,
        "undecided": undecided_count,
        "decided_games": decided_games,
        "logged_games": len(matches),
        "win_pct": round(wins / decided_games, 3) if decided_games else 0.0,
    }


def _sample_maturity(decided_games: int) -> dict:
    if decided_games >= 20:
        return {
            "level": "established",
            "label": "Established sample",
            "message": "Twenty or more decided games give this profile a stable foundation.",
        }
    if decided_games >= 10:
        return {
            "level": "meaningful",
            "label": "Meaningful sample",
            "message": "There is enough match history to read patterns with reasonable context.",
        }
    if decided_games >= 5:
        return {
            "level": "developing",
            "label": "Developing sample",
            "message": "Useful signals are emerging, but a few results can still move the percentages.",
        }
    return {
        "level": "early",
        "label": "Early sample",
        "message": "Treat these percentages as directional until more matches are logged.",
    }


def _subject_version(match, deck_id: int):
    if match.deck1_id == deck_id:
        return match.deck1_version
    return match.deck2_version


def _match_result(match, deck_id: int) -> str:
    if match.winner_id is None:
        return "U"
    if match.winner_id == deck_id:
        return "W"
    if match.winner_id in {match.deck1_id, match.deck2_id}:
        return "L"
    return "U"


def _match_spotlight_row(match, deck_id: int) -> dict:
    opponent = match.deck2 if match.deck1_id == deck_id else match.deck1
    version = _subject_version(match, deck_id)

    if match.first_player_id == deck_id:
        turn_order = "first"
    elif match.first_player_id in {match.deck1_id, match.deck2_id}:
        turn_order = "second"
    else:
        turn_order = "unknown"

    return {
        "match_id": match.id,
        "date_played": match.date_played.isoformat() if match.date_played else None,
        "opponent_id": opponent.id if opponent else None,
        "opponent_name": opponent.name if opponent else "Unknown opponent",
        "opponent_nation": opponent.nation if opponent else None,
        "result": _match_result(match, deck_id),
        "turn_order": turn_order,
        "version_id": version.id if version else None,
        "version_name": version.version_name if version else None,
    }


def _insight(
    key: str,
    tone: str,
    eyebrow: str,
    title: str,
    body: str,
    value: str,
) -> dict:
    return {
        "key": key,
        "tone": tone,
        "eyebrow": eyebrow,
        "title": title,
        "body": body,
        "value": value,
    }


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


def performance_spotlight(deck_id: int) -> dict:
    deck = db.session.get(Deck, deck_id)
    if not deck:
        raise LookupError("Deck not found")

    matches = (
        Match.query.filter(
            or_(
                Match.deck1_id == deck_id,
                Match.deck2_id == deck_id,
            )
        )
        .order_by(Match.date_played.asc(), Match.id.asc())
        .all()
    )
    decided_matches = [
        match
        for match in matches
        if match.winner_id in {match.deck1_id, match.deck2_id}
    ]
    overview = _record_payload(matches, deck_id)
    sample = {
        **_sample_maturity(overview["decided_games"]),
        "decided_games": overview["decided_games"],
    }

    recent_matches = decided_matches[-10:]
    recent_record = _record_payload(recent_matches, deck_id)
    recent_delta = recent_record["win_pct"] - overview["win_pct"]

    if recent_record["decided_games"] < 3:
        trend = "early"
        trend_label = "Building a baseline"
    elif recent_delta >= 0.08:
        trend = "rising"
        trend_label = "Trending upward"
    elif recent_delta <= -0.08:
        trend = "cooling"
        trend_label = "Below the full record"
    else:
        trend = "steady"
        trend_label = "Holding steady"

    streak_result = None
    streak_length = 0
    for match in reversed(decided_matches):
        result = _match_result(match, deck_id)
        if streak_result is None:
            streak_result = result
        if result != streak_result:
            break
        streak_length += 1

    first_matches = [match for match in matches if match.first_player_id == deck_id]
    second_matches = [
        match
        for match in matches
        if match.first_player_id in {match.deck1_id, match.deck2_id}
        and match.first_player_id != deck_id
    ]
    unknown_order_matches = [
        match
        for match in matches
        if match.first_player_id not in {match.deck1_id, match.deck2_id}
    ]
    going_first = _record_payload(first_matches, deck_id)
    going_second = _record_payload(second_matches, deck_id)
    unknown_order = _record_payload(unknown_order_matches, deck_id)
    turn_order_edge = None
    if going_first["decided_games"] and going_second["decided_games"]:
        turn_order_edge = round(
            (going_first["win_pct"] - going_second["win_pct"]) * 100,
            1,
        )

    matchup_matches = {}
    matchup_decks = {}
    for match in matches:
        opponent = match.deck2 if match.deck1_id == deck_id else match.deck1
        if not opponent:
            continue
        matchup_decks[opponent.id] = opponent
        matchup_matches.setdefault(opponent.id, []).append(match)

    matchups = []
    for opponent_id, opponent_matches in matchup_matches.items():
        opponent = matchup_decks[opponent_id]
        matchups.append(
            {
                "opponent_id": opponent.id,
                "opponent_name": opponent.name,
                "opponent_nation": opponent.nation,
                "opponent_type": opponent.type,
                **_record_payload(opponent_matches, deck_id),
            }
        )

    matchups.sort(
        key=lambda row: (
            row["decided_games"],
            row["logged_games"],
            row["opponent_name"].lower(),
        ),
        reverse=True,
    )
    matchup_candidates = [row for row in matchups if row["decided_games"] >= 2]
    if not matchup_candidates:
        matchup_candidates = [row for row in matchups if row["decided_games"] > 0]

    best_matchup = (
        max(
            matchup_candidates,
            key=lambda row: (
                row["win_pct"],
                row["decided_games"],
                row["wins"],
            ),
        )
        if matchup_candidates
        else None
    )
    hardest_matchup = (
        min(
            matchup_candidates,
            key=lambda row: (
                row["win_pct"],
                -row["decided_games"],
                row["opponent_name"].lower(),
            ),
        )
        if matchup_candidates
        else None
    )

    versions = deck.versions.order_by(
        DeckVersion.is_active.desc(),
        DeckVersion.updated_at.desc(),
        DeckVersion.id.desc(),
    ).all()
    active_version = next((version for version in versions if version.is_active), None)
    tagged_matches = [match for match in matches if _subject_version(match, deck_id)]
    active_version_matches = [
        match
        for match in tagged_matches
        if active_version and _subject_version(match, deck_id).id == active_version.id
    ]
    active_version_record = _record_payload(active_version_matches, deck_id)

    insights = []
    if recent_record["decided_games"]:
        delta_points = round(recent_delta * 100, 1)
        if trend == "rising":
            insights.append(
                _insight(
                    "recent-form",
                    "positive",
                    "Recent form",
                    "The latest run is outperforming the full record",
                    f"The last {recent_record['decided_games']} decided games are "
                    f"{recent_record['wins']}-{recent_record['losses']}, a "
                    f"{abs(delta_points):.1f}-point lift over the overall win rate.",
                    f"+{abs(delta_points):.1f} pts",
                )
            )
        elif trend == "cooling":
            insights.append(
                _insight(
                    "recent-form",
                    "warning",
                    "Recent form",
                    "The latest run is below the deck's baseline",
                    f"The last {recent_record['decided_games']} decided games are "
                    f"{recent_record['wins']}-{recent_record['losses']}, "
                    f"{abs(delta_points):.1f} points below the overall win rate.",
                    f"-{abs(delta_points):.1f} pts",
                )
            )
        else:
            insights.append(
                _insight(
                    "recent-form",
                    "neutral",
                    "Recent form",
                    "The latest results are tracking the full record",
                    f"The last {recent_record['decided_games']} decided games are "
                    f"{recent_record['wins']}-{recent_record['losses']} with no major "
                    "departure from the deck's longer-term performance.",
                    f"{delta_points:+.1f} pts",
                )
            )

    if turn_order_edge is not None:
        if abs(turn_order_edge) < 5:
            insights.append(
                _insight(
                    "turn-order",
                    "neutral",
                    "Turn order",
                    "Performance is balanced across turn order",
                    "Going first and going second are within five percentage points, "
                    "so turn order is not yet a strong separator in the recorded results.",
                    f"{abs(turn_order_edge):.1f} pt gap",
                )
            )
        else:
            favored = "first" if turn_order_edge > 0 else "second"
            insights.append(
                _insight(
                    "turn-order",
                    "positive" if turn_order_edge > 0 else "accent",
                    "Turn order",
                    f"The deck is stronger going {favored}",
                    f"Its going-{favored} win rate leads the other turn-order split by "
                    f"{abs(turn_order_edge):.1f} percentage points.",
                    f"{abs(turn_order_edge):.1f} pts",
                )
            )

    if hardest_matchup:
        insights.append(
            _insight(
                "matchup-pressure",
                "danger" if hardest_matchup["win_pct"] < 0.4 else "warning",
                "Pressure point",
                f"{hardest_matchup['opponent_name']} is the toughest repeated matchup",
                f"The recorded matchup is {hardest_matchup['wins']}-"
                f"{hardest_matchup['losses']} across "
                f"{hardest_matchup['decided_games']} decided games.",
                f"{hardest_matchup['win_pct'] * 100:.1f}%",
            )
        )

    if active_version:
        if active_version_record["logged_games"]:
            version_body = (
                f"{active_version.version_name} is tagged in "
                f"{active_version_record['logged_games']} logged matches."
            )
            version_value = (
                f"{active_version_record['wins']}-{active_version_record['losses']}"
            )
        else:
            version_body = (
                "Select this version when logging future matches to build a clean "
                "before-and-after performance baseline."
            )
            version_value = "Ready to track"
        insights.append(
            _insight(
                "active-version",
                "accent",
                "Active build",
                active_version.version_name,
                version_body,
                version_value,
            )
        )

    return {
        "deck": serialize_deck(deck),
        "overview": {
            **overview,
            "opponents_faced": len(matchups),
            "first_match_at": (
                matches[0].date_played.isoformat()
                if matches and matches[0].date_played
                else None
            ),
            "last_match_at": (
                matches[-1].date_played.isoformat()
                if matches and matches[-1].date_played
                else None
            ),
        },
        "sample": sample,
        "recent_form": {
            **recent_record,
            "window": len(recent_matches),
            "delta_percentage_points": round(recent_delta * 100, 1),
            "trend": trend,
            "trend_label": trend_label,
            "results": [
                _match_spotlight_row(match, deck_id) for match in recent_matches
            ],
        },
        "streak": {
            "result": streak_result,
            "length": streak_length,
            "label": (
                f"{streak_length} game {'win' if streak_result == 'W' else 'loss'} streak"
                if streak_result and streak_length
                else "No decided streak yet"
            ),
        },
        "turn_order": {
            "first": going_first,
            "second": going_second,
            "unknown": unknown_order,
            "edge_percentage_points": turn_order_edge,
        },
        "matchups": {
            "best": best_matchup,
            "hardest": hardest_matchup,
            "rows": matchups,
            "minimum_repeated_sample": 2,
        },
        "version": {
            "active": serialize_deck_version_summary(active_version),
            "active_record": active_version_record,
            "tagged_matches": len(tagged_matches),
            "available_versions": len(versions),
        },
        "insights": insights,
    }


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
