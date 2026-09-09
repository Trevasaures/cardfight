"""Command-center summaries assembled from existing lab data."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from backend.models import AcquisitionPlan, Deck, DeckVersion, Match
from backend.services.serializers import (
    serialize_acquisition_plan,
    serialize_deck,
    serialize_deck_version,
    serialize_deck_version_summary,
    serialize_match,
)


def get_dashboard_summary() -> dict:
    decks = Deck.query.order_by(Deck.name).all()
    matches = Match.query.order_by(Match.date_played.desc()).all()

    total_decks = len(decks)
    active_decks = sum(1 for deck in decks if deck.active)
    inactive_decks = total_decks - active_decks
    total_matches = len(matches)
    decided_matches = sum(
        1
        for match in matches
        if match.winner_id in {match.deck1_id, match.deck2_id}
    )
    undecided_matches = sum(1 for match in matches if match.winner_id is None)

    deck_stats = _calculate_deck_stats_from_matches(decks, matches)
    active_versions = _active_versions()
    purchase_plans = AcquisitionPlan.query.order_by(
        AcquisitionPlan.updated_at.desc(),
        AcquisitionPlan.id.desc(),
    ).all()
    build_readiness = [
        _version_brief(version)
        for version in active_versions[:3]
    ]
    resume_plan = next(
        (
            plan
            for plan in purchase_plans
            if plan.status not in {"complete", "paused"}
        ),
        None,
    )
    resume_purchase = (
        serialize_acquisition_plan(resume_plan, include_items=False)
        if resume_plan
        else None
    )
    testing_focus = _testing_focus(
        decks,
        matches,
        deck_stats,
        active_versions,
    )

    return {
        "summary": {
            "total_decks": total_decks,
            "active_decks": active_decks,
            "inactive_decks": inactive_decks,
            "total_matches": total_matches,
            "decided_matches": decided_matches,
            "undecided_matches": undecided_matches,
        },
        "best_win_rate_deck": _best_win_rate(deck_stats),
        "most_played_deck": _most_played(deck_stats),
        "recent_matches": [serialize_match(match) for match in matches[:4]],
        "command_center": {
            "resume": {
                "deck_version": (
                    _version_brief(active_versions[0])
                    if active_versions
                    else None
                ),
                "purchase_plan": resume_purchase,
            },
            "testing_focus": testing_focus,
            "build_readiness": build_readiness,
            "attention": _attention_items(
                undecided_matches,
                build_readiness,
                resume_purchase,
                testing_focus,
            ),
            "activity": _activity_feed(matches, active_versions, purchase_plans),
        },
    }


def _active_versions() -> list[DeckVersion]:
    return (
        DeckVersion.query.join(Deck)
        .filter(
            DeckVersion.is_active.is_(True),
            Deck.active.is_(True),
        )
        .order_by(
            DeckVersion.updated_at.desc(),
            DeckVersion.id.desc(),
        )
        .all()
    )


def _version_brief(version: DeckVersion) -> dict:
    payload = serialize_deck_version(version)
    rules = payload["deck_rules"]
    core_count = rules["core_card_count"]

    return {
        "id": version.id,
        "deck_id": version.deck_id,
        "version_name": version.version_name,
        "is_active": version.is_active,
        "deck": payload["deck"],
        "card_count": payload["card_count"],
        "unique_card_count": payload["unique_card_count"],
        "main_deck_count": rules["main_deck_count"],
        "ride_deck_count": rules["ride_deck_count"],
        "core_card_count": core_count,
        "required_total": rules["required_total"],
        "progress": min(core_count / rules["required_total"], 1.0),
        "is_complete": rules["is_complete"],
        "issues": rules["issues"],
        "updated_at": (
            version.updated_at.isoformat() if version.updated_at else None
        ),
    }


def _testing_focus(
    decks: list[Deck],
    matches: list[Match],
    deck_stats: list[dict],
    active_versions: list[DeckVersion],
) -> dict | None:
    active_decks = [deck for deck in decks if deck.active]
    if not active_decks:
        return None

    version_by_deck = {version.deck_id: version for version in active_versions}
    version_match_counts = defaultdict(int)
    for match in matches:
        if match.deck1_version_id:
            version_match_counts[match.deck1_version_id] += 1
        if match.deck2_version_id:
            version_match_counts[match.deck2_version_id] += 1

    untested_versions = [
        version
        for version in active_versions
        if version_match_counts[version.id] == 0
    ]
    stats_by_deck = {row["deck"]["id"]: row for row in deck_stats}

    if untested_versions:
        focus_deck = untested_versions[0].deck
        reason = "untested-version"
    else:
        focus_deck = min(
            active_decks,
            key=lambda deck: (
                stats_by_deck[deck.id]["decided_games"],
                _last_match_timestamp(matches, deck.id),
                deck.name.lower(),
            ),
        )
        reason = "low-sample"

    focus_matches = [
        match
        for match in matches
        if focus_deck.id in {match.deck1_id, match.deck2_id}
    ]
    decided_focus_matches = [
        match
        for match in focus_matches
        if match.winner_id in {match.deck1_id, match.deck2_id}
    ]
    recent_results = [
        "W" if match.winner_id == focus_deck.id else "L"
        for match in reversed(decided_focus_matches[:5])
    ]
    if reason != "untested-version" and len(recent_results) >= 3:
        if recent_results[-3:] == ["L", "L", "L"]:
            reason = "recent-losses"

    opponent, matchup = _suggested_opponent(
        focus_deck,
        active_decks,
        focus_matches,
        stats_by_deck,
    )
    active_version = version_by_deck.get(focus_deck.id)
    focus_stats = stats_by_deck[focus_deck.id]

    if reason == "untested-version" and active_version:
        title = f"Put {active_version.version_name} on the table"
        body = (
            f"{focus_deck.name}'s active version has no tagged matches yet. "
            "A decided game will establish its first clean performance signal."
        )
    elif reason == "recent-losses":
        title = f"Recheck {focus_deck.name}'s current line"
        body = (
            f"{focus_deck.name} has dropped its last three decided games. "
            "Run it again before changing the build so the pattern has another data point."
        )
    else:
        title = f"Build a stronger sample for {focus_deck.name}"
        body = (
            f"Only {focus_stats['decided_games']} decided games currently define "
            f"{focus_deck.name}'s record. One more test will make its analytics more useful."
        )

    if opponent:
        body += (
            f" {opponent.name} is the least-tested available matchup "
            f"({matchup['decided_games']} decided)."
        )

    return {
        "deck": serialize_deck(focus_deck),
        "active_version": serialize_deck_version_summary(active_version),
        "reason": reason,
        "title": title,
        "body": body,
        "record": focus_stats,
        "active_version_matches": (
            version_match_counts[active_version.id] if active_version else 0
        ),
        "last_tested_at": (
            focus_matches[0].date_played.isoformat() if focus_matches else None
        ),
        "recent_results": recent_results,
        "suggested_opponent": serialize_deck(opponent) if opponent else None,
        "suggested_matchup": matchup,
    }


def _suggested_opponent(
    focus_deck: Deck,
    active_decks: list[Deck],
    focus_matches: list[Match],
    stats_by_deck: dict[int, dict],
) -> tuple[Deck | None, dict]:
    matchup_rows = {
        deck.id: {"decided_games": 0, "wins": 0, "losses": 0}
        for deck in active_decks
        if deck.id != focus_deck.id
    }

    for match in focus_matches:
        opponent_id = (
            match.deck2_id if match.deck1_id == focus_deck.id else match.deck1_id
        )
        row = matchup_rows.get(opponent_id)
        if not row or match.winner_id not in {match.deck1_id, match.deck2_id}:
            continue
        row["decided_games"] += 1
        if match.winner_id == focus_deck.id:
            row["wins"] += 1
        else:
            row["losses"] += 1

    opponents = [deck for deck in active_decks if deck.id != focus_deck.id]
    if not opponents:
        return None, {"decided_games": 0, "wins": 0, "losses": 0}

    opponent = min(
        opponents,
        key=lambda deck: (
            matchup_rows[deck.id]["decided_games"],
            -stats_by_deck[deck.id]["logged_games"],
            deck.name.lower(),
        ),
    )
    return opponent, matchup_rows[opponent.id]


def _last_match_timestamp(matches: list[Match], deck_id: int) -> float:
    for match in matches:
        if deck_id in {match.deck1_id, match.deck2_id}:
            return match.date_played.timestamp()
    return 0.0


def _attention_items(
    undecided_matches: int,
    build_readiness: list[dict],
    purchase_plan: dict | None,
    testing_focus: dict | None,
) -> list[dict]:
    items = []

    if purchase_plan and purchase_plan["summary"]["missing_quantity"]:
        remaining_cents = purchase_plan["summary"]["remaining_cost_cents"]
        items.append(
            {
                "key": f"purchase-{purchase_plan['id']}",
                "kind": "purchase",
                "tone": "warning",
                "title": f"{purchase_plan['name']} still needs cards",
                "body": (
                    f"{purchase_plan['summary']['missing_quantity']} copies are "
                    "not yet owned or incoming."
                ),
                "value": f"${remaining_cents / 100:,.2f}",
                "to": "/order-tracker",
                "plan_id": purchase_plan["id"],
            }
        )

    incomplete = next(
        (version for version in build_readiness if not version["is_complete"]),
        None,
    )
    if incomplete:
        issue = incomplete["issues"][0] if incomplete["issues"] else "Deck list needs review"
        items.append(
            {
                "key": f"version-{incomplete['id']}",
                "kind": "build",
                "tone": "accent",
                "title": f"Finish {incomplete['deck']['name']}",
                "body": issue,
                "value": f"{incomplete['core_card_count']}/54",
                "to": "/deck-builder",
                "deck_id": incomplete["deck_id"],
                "version_id": incomplete["id"],
            }
        )

    if testing_focus and testing_focus["reason"] == "untested-version":
        items.append(
            {
                "key": f"test-{testing_focus['deck']['id']}",
                "kind": "testing",
                "tone": "positive",
                "title": "Active build needs a first test",
                "body": testing_focus["title"],
                "value": "0 games",
                "to": "/play",
                "deck_id": testing_focus["deck"]["id"],
                "opponent_id": (
                    testing_focus["suggested_opponent"]["id"]
                    if testing_focus["suggested_opponent"]
                    else None
                ),
            }
        )

    if undecided_matches:
        items.append(
            {
                "key": "undecided-matches",
                "kind": "history",
                "tone": "neutral",
                "title": "Resolve the open match log",
                "body": "Undecided results stay out of win-rate calculations until completed.",
                "value": str(undecided_matches),
                "to": "/matches",
            }
        )

    return items[:4]


def _activity_feed(
    matches: list[Match],
    versions: list[DeckVersion],
    plans: list[AcquisitionPlan],
) -> list[dict]:
    events = []

    for match in matches[:4]:
        if match.winner_id == match.deck1_id:
            winner_name = match.deck1.name
        elif match.winner_id == match.deck2_id:
            winner_name = match.deck2.name
        else:
            winner_name = "Result pending"
        events.append(
            {
                "id": f"match-{match.id}",
                "kind": "match",
                "title": f"{match.deck1.name} vs {match.deck2.name}",
                "detail": (
                    f"{winner_name} won"
                    if winner_name != "Result pending"
                    else winner_name
                ),
                "timestamp": _iso(match.date_played),
                "to": "/matches",
            }
        )

    for version in versions[:3]:
        events.append(
            {
                "id": f"version-{version.id}",
                "kind": "version",
                "title": f"{version.deck.name} · {version.version_name}",
                "detail": "Active deck version updated",
                "timestamp": _iso(version.updated_at),
                "to": "/deck-builder",
                "deck_id": version.deck_id,
                "version_id": version.id,
            }
        )

    for plan in plans[:3]:
        events.append(
            {
                "id": f"plan-{plan.id}",
                "kind": "purchase",
                "title": plan.name,
                "detail": f"Purchase plan · {plan.status}",
                "timestamp": _iso(plan.updated_at),
                "to": "/order-tracker",
                "plan_id": plan.id,
            }
        )

    return sorted(
        events,
        key=lambda event: event["timestamp"] or "",
        reverse=True,
    )[:7]


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


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
    eligible = [row for row in deck_stats if row["decided_games"] > 0]
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
    eligible = [row for row in deck_stats if row["logged_games"] > 0]
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
