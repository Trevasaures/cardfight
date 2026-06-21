from .admin import bp_admin
from .dashboard import bp_dashboard
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
]