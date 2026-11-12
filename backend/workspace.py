"""Resolve record ownership from the authenticated request or the local lab."""

from flask import current_app
from sqlalchemy import and_, or_, select

from backend.auth import AuthError, current_account
from backend.models import (
    AcquisitionPlan,
    AcquisitionPlanItem,
    Deck,
    DeckCard,
    DeckVersion,
    Match,
)


def owner_id():
    if current_app.config["AUTH_MODE"] == "local":
        return None
    account = current_account()
    if account is None:
        raise AuthError("auth_required", 401)
    return account.account_id


def _optional_link(column, allowed_ids):
    return or_(column.is_(None), column.in_(allowed_ids))


def owned_filter(model):
    """Scope root records and their links, including legacy local records."""
    account_id = owner_id()
    deck_scope = Deck.owner_account_id == account_id
    if model is Deck:
        return deck_scope

    deck_ids = select(Deck.id).where(deck_scope).correlate(None)
    version_scope = DeckVersion.deck_id.in_(deck_ids)
    if model is DeckVersion:
        return version_scope

    version_ids = select(DeckVersion.id).where(version_scope).correlate(None)
    if model is DeckCard:
        return DeckCard.deck_version_id.in_(version_ids)
    if model is Match:
        return and_(
            Match.owner_account_id == account_id,
            Match.deck1_id.in_(deck_ids),
            Match.deck2_id.in_(deck_ids),
            _optional_link(Match.winner_id, deck_ids),
            _optional_link(Match.first_player_id, deck_ids),
            _optional_link(Match.deck1_version_id, version_ids),
            _optional_link(Match.deck2_version_id, version_ids),
        )
    if model in (AcquisitionPlan, AcquisitionPlanItem):
        plan_scope = and_(
            AcquisitionPlan.owner_account_id == account_id,
            _optional_link(AcquisitionPlan.deck_id, deck_ids),
            _optional_link(AcquisitionPlan.deck_version_id, version_ids),
            _optional_link(AcquisitionPlan.source_deck_version_id, version_ids),
        )
        if model is AcquisitionPlan:
            return plan_scope
        plan_ids = select(AcquisitionPlan.id).where(plan_scope).correlate(None)
        return AcquisitionPlanItem.plan_id.in_(plan_ids)
    raise TypeError(f"Ownership filter is undefined for {model!r}")


def owned_query(model):
    return model.query.filter(owned_filter(model))


def owned_get(model, record_id):
    # A primary-key get can return a record from the session identity map
    # without evaluating the ownership predicate.
    return owned_query(model).filter(model.id == record_id).one_or_none()
