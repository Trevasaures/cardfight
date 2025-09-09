"""
Service functions for generating stats.

- Versus breakdown for a deck
- Win/loss matrix for all decks
"""
from sqlalchemy import or_, case, func
from backend.database import db
from backend.models import Deck, Match

def versus_for(deck_id: int):
    subject = Deck.query.get_or_404(deck_id)
    q = Match.query.filter(or_(Match.deck1_id == deck_id, Match.deck2_id == deck_id))

    opponent_id = case(
        (Match.deck1_id == deck_id, Match.deck2_id),
        else_=Match.deck1_id
    ).label("opponent_id")
    subject_win = case(
        (Match.winner_id == deck_id, 1),
        else_=0
    ).label("subject_win")

    rows = (
        db.session.query(opponent_id, func.count().label("games"), func.sum(subject_win).label("wins"))
        .filter(or_(Match.deck1_id == deck_id, Match.deck2_id == deck_id))
        .group_by(opponent_id)
        .all()
    )

    versus = []
    type_totals = {}
    for r in rows:
        opp = Deck.query.get(r.opponent_id)
        wins = int(r.wins or 0)
        games = int(r.games or 0)
        losses = games - wins
        win_pct = (wins / games) if games else 0.0
        versus.append({
            "opponent_id": opp.id,
            "opponent_name": opp.name,
            "opponent_type": opp.type,
            "games": games, "wins": wins, "losses": losses,
            "win_pct": round(win_pct, 3),
        })
        t = opp.type
        type_totals.setdefault(t, {"games":0, "wins":0})
        type_totals[t]["games"] += games
        type_totals[t]["wins"] += wins

    type_breakdown = [
        {"opponent_type": t, "games": v["games"], "wins": v["wins"],
         "losses": v["games"] - v["wins"],
         "win_pct": round((v["wins"]/v["games"]) if v["games"] else 0.0, 3)}
        for t, v in type_totals.items()
    ]

    recent = (q.order_by(Match.date_played.desc()).limit(50)).all()
    recent_payload = []
    for m in recent:
        opp_id = m.deck2_id if m.deck1_id == deck_id else m.deck1_id
        opp = Deck.query.get(opp_id)
        recent_payload.append({
            "match_id": m.id,
            "date_played": m.date_played.isoformat(),
            "opponent_id": opp.id,
            "opponent_name": opp.name,
            "opponent_type": opp.type,
            "winner_id": m.winner_id,
            "result": "W" if m.winner_id == deck_id else ("L" if m.winner_id else "-"),
            "notes": m.notes or "",
        })

    return {
        "deck": subject.to_dict(),
        "versus": sorted(versus, key=lambda x: x["opponent_name"].lower()),
        "by_opponent_type": type_breakdown,
        "recent": recent_payload,
    }

def matrix():
    decks = Deck.query.order_by(Deck.id).all()
    ids = [d.id for d in decks]
    all_matches = Match.query.all()
    wins = {(a, b): 0 for a in ids for b in ids if a != b}
    games = {(a, b): 0 for a in ids for b in ids if a != b}

    for m in all_matches:
        a, b = m.deck1_id, m.deck2_id
        if a == b:  # should never happen, but guard anyway
            continue
        games[(a, b)] += 1
        games[(b, a)] += 1
        if m.winner_id in (a, b):
            wins[(m.winner_id, b if m.winner_id == a else a)] += 1

    table = []
    deck_by_id = {d.id: d for d in decks}
    for i in ids:
        row = {"deck_id": i, "deck_name": deck_by_id[i].name}
        for j in ids:
            if i == j:
                row[str(j)] = None
            else:
                g = games[(i, j)]
                w = wins[(i, j)]
                row[str(j)] = round((w / g), 3) if g else None
        table.append(row)

    return {"decks": [{"id": d.id, "name": d.name} for d in decks], "matrix": table}