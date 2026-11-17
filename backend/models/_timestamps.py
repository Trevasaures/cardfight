"""Central time defaults for workspace and catalog records."""

from datetime import datetime
from zoneinfo import ZoneInfo


def now_central():
    return datetime.now(ZoneInfo("America/Chicago"))
