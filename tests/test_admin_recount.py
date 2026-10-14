from backend.database import db
from backend.models import Deck, Match


def test_recount_preserves_history_and_uses_two_reads_for_any_number_of_matches(
    client, select_queries
):
    first = Deck(name="First", type="Standard", wins=99, losses=99)
    second = Deck(name="Second", type="Stride", wins=99, losses=99)
    other = Deck(name="Other", type="Standard", wins=99, losses=99)
    db.session.add_all([first, second, other])
    db.session.flush()
    first_id, second_id, other_id = first.id, second.id, other.id
    db.session.add_all(
        [
            Match(deck1_id=first_id, deck2_id=second_id, winner_id=first_id)
            for _ in range(40)
        ]
        + [
            Match(deck1_id=first_id, deck2_id=second_id, winner_id=second_id),
            Match(deck1_id=first_id, deck2_id=second_id, winner_id=None),
            Match(deck1_id=first_id, deck2_id=second_id, winner_id=other_id),
        ]
    )
    db.session.commit()
    db.session.remove()
    with select_queries() as statements:
        response = client.post("/api/admin/recount")
    assert response.get_json() == {"status": "ok", "total_wins": 41, "total_losses": 41}
    assert len(statements) == 2
    counters = {deck.id: (deck.wins, deck.losses) for deck in Deck.query.all()}
    assert counters == {first_id: (40, 1), second_id: (1, 40), other_id: (0, 0)}
