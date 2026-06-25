from .admin import bp_admin
from .cards import bp_cards
from .dashboard import bp_dashboard
from .deck_builder import bp_deck_builder
from .decks import bp_decks
from .matches import bp_matches
from .play import bp_play
from .stats import bp_stats


all_blueprints = [
    bp_decks,
    bp_matches,
    bp_play,
    bp_stats,
    bp_admin,
    bp_dashboard,
    bp_cards,
    bp_deck_builder,
]