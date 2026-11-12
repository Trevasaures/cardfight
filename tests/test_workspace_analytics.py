"""Analytics and maintenance share the authenticated workspace boundary."""

from base64 import urlsafe_b64encode
from datetime import datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe

import pytest

from backend.app import create_app
from backend.auth_models import AppSession, AuthAccount, utcnow
from backend.database import db
from backend.models import (
    AcquisitionPlan,
    AcquisitionPlanItem,
    Card,
    Deck,
    DeckVersion,
    Match,
)

HOST = "cardfight.example"
ORIGIN = f"https://{HOST}"
EPOCH = "disposable-analytics-epoch"
STAMP = datetime(2026, 1, 1, 12)


def _browser(application, account, *, stale_mfa=False):
    now = utcnow()
    cookie = token_urlsafe(32)
    session = AppSession(
        token_hash=sha256(cookie.encode()).hexdigest(),
        account_id=account.id,
        account_auth_version=account.auth_version,
        method="google",
        csrf_secret=token_urlsafe(32),
        restore_epoch=EPOCH,
        idle_expires_at=now + timedelta(minutes=30),
        absolute_expires_at=now + timedelta(hours=12),
        authenticated_at=now,
        provider_auth_time=now - timedelta(hours=1) if stale_mfa else now,
        mfa_verified=account.role == "admin",
    )
    db.session.add(session)
    db.session.flush()
    browser = application.test_client()
    browser.set_cookie("__Host-cardfight_session", cookie, domain=HOST)
    return browser, {
        "X-Cardfight-Session": session.public_id,
        "X-CSRF-Token": session.csrf_secret,
        "Origin": ORIGIN,
    }


def _request(browser, path, *, method="GET"):
    client, headers = browser
    return client.open(path, method=method, base_url=ORIGIN, headers=headers)


def _get(browser, path):
    response = _request(browser, path)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _add_workspace(label, owner, card, quantity):
    owner_account_id = owner.id if owner else None
    first = Deck(
        name=f"{label} starter",
        type="Standard",
        owner_account_id=owner_account_id,
        wins=11,
        losses=12,
    )
    second = Deck(
        name=f"{label} opponent",
        type="Standard",
        owner_account_id=owner_account_id,
        wins=13,
        losses=14,
    )
    version = DeckVersion(deck=first, version_name=f"{label} build", is_active=True)
    db.session.add_all([first, second, version])
    db.session.flush()

    match = Match(
        owner_account_id=owner_account_id,
        deck1_id=first.id,
        deck2_id=second.id,
        deck1_version_id=version.id,
        winner_id=first.id,
        first_player_id=first.id,
        notes=f"{label} match notes",
        date_played=STAMP,
    )
    plan = AcquisitionPlan(
        owner_account_id=owner_account_id,
        name=f"{label} purchase plan",
        deck_id=first.id,
        deck_version_id=version.id,
        updated_at=STAMP,
    )
    db.session.add_all([match, plan])
    db.session.flush()
    db.session.add(
        AcquisitionPlanItem(
            plan_id=plan.id, card_id=card.id, required_quantity=quantity
        )
    )
    return {
        "decks": (first, second),
        "version": version,
        "match": match,
        "plan": plan,
        "quantity": quantity,
    }


def _add_cross_workspace_links(owner, own, other):
    first, second = own["decks"]
    other_deck = other["decks"][0]
    for relation in (
        {"deck2_id": other_deck.id},
        {"deck1_version_id": other["version"].id},
        {"winner_id": other_deck.id},
        {"first_player_id": other_deck.id},
    ):
        values = {
            "deck1_id": first.id,
            "deck2_id": second.id,
            "winner_id": first.id,
            "first_player_id": first.id,
            **relation,
        }
        db.session.add(
            Match(
                owner_account_id=owner.id,
                notes="Cross-workspace link",
                date_played=STAMP + timedelta(days=1),
                **values,
            )
        )
    for relation in (
        {"deck_id": other_deck.id},
        {"deck_version_id": other["version"].id},
        {"source_deck_version_id": other["version"].id},
    ):
        db.session.add(
            AcquisitionPlan(
                owner_account_id=owner.id,
                name="Cross-workspace purchase link",
                updated_at=STAMP + timedelta(days=1),
                **relation,
            )
        )


@pytest.fixture()
def analytics_workspaces():
    application = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "AUTH_MODE": "oidc",
            "AUTH_PUBLIC_ORIGIN": ORIGIN,
            "AUTH_ISSUER": "https://identity.example/",
            "AUTH_CLIENT_ID": "test-client",
            "AUTH_CLIENT_SECRET": "test-client-secret",
            "AUTH_TRANSACTION_KEY": urlsafe_b64encode(b"\x17" * 32).decode(),
            "AUTH_RESTORE_EPOCH": EPOCH,
            "AUTH_ADMISSION_HOLD": False,
        }
    )
    with application.app_context():
        db.create_all()
        alpha = AuthAccount(display_name="Alpha", role="admin", admission_epoch=EPOCH)
        bravo = AuthAccount(display_name="Bravo", role="member", admission_epoch=EPOCH)
        card = Card(name="Shared catalog card", grade=1, card_type="Normal Unit")
        db.session.add_all([alpha, bravo, card])
        db.session.flush()
        workspaces = {
            "Alpha": _add_workspace("Alpha", alpha, card, 4),
            "Bravo": _add_workspace("Bravo", bravo, card, 17),
            "Legacy": _add_workspace("Legacy", None, card, 29),
        }
        _add_cross_workspace_links(alpha, workspaces["Alpha"], workspaces["Bravo"])
        browsers = {
            "Alpha": _browser(application, alpha),
            "Bravo": _browser(application, bravo),
            "stale-admin": _browser(application, alpha, stale_mfa=True),
        }
        db.session.commit()
        yield browsers, workspaces
        db.session.remove()
        db.drop_all()
        db.engine.dispose()


def test_dashboard_counts_activity_and_resume_data_are_workspace_scoped(
    analytics_workspaces,
):
    browsers, workspaces = analytics_workspaces
    for label in ("Alpha", "Bravo"):
        own = workspaces[label]
        data = _get(browsers[label], "/api/dashboard")
        assert data["summary"] == {
            "total_decks": 2,
            "active_decks": 2,
            "inactive_decks": 0,
            "total_matches": 1,
            "decided_matches": 1,
            "undecided_matches": 0,
        }
        assert [match["id"] for match in data["recent_matches"]] == [own["match"].id]
        center = data["command_center"]
        assert center["resume"]["deck_version"]["id"] == own["version"].id
        assert center["resume"]["purchase_plan"]["id"] == own["plan"].id
        assert (
            center["resume"]["purchase_plan"]["summary"]["required_quantity"]
            == own["quantity"]
        )
        assert {event["id"] for event in center["activity"]} == {
            f"match-{own['match'].id}",
            f"version-{own['version'].id}",
            f"plan-{own['plan'].id}",
        }
        assert center["testing_focus"]["suggested_opponent"]["id"] in {
            deck.id for deck in own["decks"]
        }


def test_all_analytics_views_exclude_foreign_workspaces_and_related_links(
    analytics_workspaces,
):
    browsers, workspaces = analytics_workspaces
    for label, foreign in (("Alpha", "Bravo"), ("Bravo", "Alpha")):
        browser = browsers[label]
        own = workspaces[label]
        first, second = own["decks"]
        table = _get(browser, "/api/stats/table")
        assert {row["deck_id"] for row in table} == {first.id, second.id}
        assert {row["logged_games"] for row in table} == {1}

        matrix = _get(browser, "/api/stats/matrix")
        assert {deck["id"] for deck in matrix["decks"]} == {first.id, second.id}
        assert matrix["matrix"][0][str(second.id)] == 1.0

        spotlight = _get(browser, f"/api/stats/spotlight/{first.id}")
        assert spotlight["overview"]["logged_games"] == 1
        assert spotlight["version"]["tagged_matches"] == 1
        assert [row["opponent_id"] for row in spotlight["matchups"]["rows"]] == [
            second.id
        ]
        assert [row["match_id"] for row in spotlight["recent_form"]["results"]] == [
            own["match"].id
        ]

        versus = _get(browser, f"/api/stats/versus/{first.id}")
        assert [row["opponent_id"] for row in versus["versus"]] == [second.id]
        assert versus["versus"][0]["logged_games"] == 1
        assert versus["by_opponent_type"][0]["logged_games"] == 1
        assert [row["match_id"] for row in versus["recent"]] == [own["match"].id]

        foreign_id = workspaces[foreign]["decks"][0].id
        for endpoint in ("spotlight", "versus"):
            denied = _request(browser, f"/api/stats/{endpoint}/{foreign_id}")
            absent = _request(browser, f"/api/stats/{endpoint}/99999")
            assert denied.status_code == absent.status_code == 404
            assert denied.get_json() == absent.get_json()


def test_play_lab_samples_only_active_decks_in_the_current_workspace(
    analytics_workspaces,
):
    browsers, workspaces = analytics_workspaces
    for label in ("Alpha", "Bravo"):
        matchup = _get(browsers[label], "/api/play/random?format=Standard")
        own_ids = {deck.id for deck in workspaces[label]["decks"]}
        assert {matchup["deck1"]["id"], matchup["deck2"]["id"]} == own_ids
        assert matchup["first_player"]["id"] in own_ids

    workspaces["Alpha"]["decks"][1].active = False
    db.session.commit()
    response = _request(browsers["Alpha"], "/api/play/random?format=Standard")
    assert response.status_code == 400
    assert "At least two active decks" in response.get_json()["error"]


def test_recount_requires_recent_admin_mfa_and_updates_only_its_workspace(
    analytics_workspaces,
):
    browsers, workspaces = analytics_workspaces
    before = {deck.id: (deck.wins, deck.losses) for deck in Deck.query.all()}
    match_count = Match.query.count()
    for browser, code in (
        ("Bravo", "admin_required"),
        ("stale-admin", "fresh_mfa_required"),
    ):
        denied = _request(browsers[browser], "/api/admin/recount", method="POST")
        assert denied.status_code == 403
        assert denied.get_json()["code"] == code
    assert {deck.id: (deck.wins, deck.losses) for deck in Deck.query.all()} == before

    response = _request(browsers["Alpha"], "/api/admin/recount", method="POST")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "total_wins": 1, "total_losses": 1}
    first, second = workspaces["Alpha"]["decks"]
    expected = {**before, first.id: (1, 0), second.id: (0, 1)}
    assert {deck.id: (deck.wins, deck.losses) for deck in Deck.query.all()} == expected
    assert Match.query.count() == match_count
