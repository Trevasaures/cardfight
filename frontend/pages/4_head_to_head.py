"""
Head-to-Head analysis page
- Pick a deck
- See per-opponent win rates (table + bar chart)
- See breakdown by opponent type
- See recent matches with local (America/Chicago) timestamps
"""
from datetime import datetime
from zoneinfo import ZoneInfo

import altair as alt
import streamlit as st

from common import settings_expander, fetch_decks, fetch_versus

CT = ZoneInfo("America/Chicago")


def to_ct_readable(iso: str) -> str:
    """
    Convert ISO8601 string (UTC) to America/Chicago and format as MM/DD/YYYY hh:mm AM/PM.
    Handles 'Z' and microseconds.
    """
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        base = iso.split(".")[0]
        if "+" not in base and "Z" not in iso:
            base += "+00:00"
        dt = datetime.fromisoformat(base.replace("Z", "+00:00"))
    return dt.astimezone(CT).strftime("%m/%d/%Y %I:%M %p")


# ---------------------- UI ----------------------
st.set_page_config(page_title="Head-to-Head", page_icon="🤜🤛", layout="wide")
st.title("🤜🤛 Head-to-Head")

settings_expander()

# Load active decks for selection
try:
    decks = fetch_decks(include_inactive=False)
except Exception as e:
    st.error(str(e))
    decks = []

if not decks:
    st.info("No decks found.")
    st.stop()

# Selector
choices = {f"{d['name']} ({d['type']})": d["id"] for d in decks}
pick = st.selectbox("Choose a deck", list(choices.keys()))
deck_id = choices[pick]

# Fetch versus data
try:
    data = fetch_versus(deck_id)
except Exception as e:
    st.error(str(e))
    st.stop()

versus = data.get("versus", [])
type_breakdown = data.get("by_opponent_type", [])
recent = data.get("recent", [])

# ---------- Per-opponent ----------
st.subheader("Per-opponent win rates")

rows = [{
    "Opponent": r["opponent_name"],
    "Type": r["opponent_type"],
    "Games": r["games"],
    "Wins": r["wins"],
    "Losses": r["losses"],
    "Win %": f"{r['win_pct']*100:.1f}%"
} for r in versus]

st.dataframe(rows, width="stretch", hide_index=True)

# Bar chart
chart_vals = []
for r in versus:
    if r["games"] > 0:
        pct = r["win_pct"] * 100.0
        chart_vals.append({
            "opponent": r["opponent_name"],
            "win_pct": pct,                  # numeric drives bar length
            "win_pct_label": f"{pct:.1f}%",  # pretty tooltip
        })

if chart_vals:
    st.subheader("Win percentage against opponent(s)")
    data_vals = alt.Data(values=chart_vals)
    chart = (
        alt.Chart(data_vals)
        .mark_bar()
        .encode(
            x=alt.X("win_pct:Q", title="Win %"),
            y=alt.Y("opponent:N", sort="-x", title="Opponent(s)"),
            tooltip=[
                alt.Tooltip("opponent:N", title="Opponent:"),
                alt.Tooltip("win_pct_label:N", title="Win Rate:"),
            ],
        )
        .properties(height=420)
    )
    st.altair_chart(chart, use_container_width=True)  # chart supports this fine

# ---------- By opponent type ----------
st.subheader("By opponent type")

trows = [{
    "Type": r["opponent_type"],
    "Games": r["games"],
    "Wins": r["wins"],
    "Losses": r["losses"],
    "Win %": f"{r['win_pct']*100:.1f}%"
} for r in type_breakdown]

st.dataframe(trows, width="stretch", hide_index=True)

# ---------- Recent matches ----------
st.subheader("Recent matches")

recent_rows = [{
    "Date (CT)": to_ct_readable(r["date_played"]),
    "Opponent": r["opponent_name"],
    "Type": r["opponent_type"],
    "Result": r["result"],
    "Notes": r["notes"],
} for r in recent]

st.dataframe(recent_rows, width="stretch", hide_index=True)