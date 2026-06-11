"""
Page for displaying deck stats.

Shows:
- Deck records
- Win percentage table
- Win percentage bar chart

Note:
- Current deck W/L counters represent decided games.
- Undecided/log-only matches are not counted as wins or losses.
"""

import streamlit as st
import altair as alt

from common import api_req, settings_expander, fetch_stats_table


st.set_page_config(page_title="Stats", page_icon="📊", layout="wide")
st.title("📊 Stats")

settings_expander()


# -----------------------------
# Controls
# -----------------------------
with st.container(border=True):
    st.markdown("### Filters")

    col_active, col_format, col_recount = st.columns([1.3, 1.7, 2.4])

    with col_active:
        st.caption("Deck status")
        active_only = st.checkbox(
            "Active only",
            value=False,
        )

    with col_format:
        st.caption("Format")
        fmt = st.selectbox(
            "Format",
            ["All", "Standard", "Stride"],
            index=0,
            label_visibility="collapsed",
        )

    with col_recount:
        st.caption("Maintenance")
        if st.button(
            "↻ Recompute W/L from matches",
            help="Fix stale counters after manual DB edits.",
            width="stretch",
        ):
            try:
                api_req("POST", "/api/admin/recount")
                st.success("Recomputed from match history ✅")
                st.rerun()
            except Exception as e:
                st.error(f"Recount failed: {e}")


# -----------------------------
# Fetch stats
# -----------------------------
try:
    stats = fetch_stats_table()
except Exception as e:
    st.error(str(e))
    stats = []


# -----------------------------
# Filter stats
# -----------------------------
if active_only:
    stats = [row for row in stats if row.get("active", True)]

if fmt != "All":
    stats = [row for row in stats if row.get("type") == fmt]


if not stats:
    st.info("No decks found.")
    st.stop()


# -----------------------------
# Build table/chart data
# -----------------------------
table_rows = []
chart_rows = []

total_wins = 0
total_losses = 0
active_count = 0

for row in stats:
    wins = int(row.get("wins", 0) or 0)
    losses = int(row.get("losses", 0) or 0)
    decided_games = wins + losses
    win_pct = (wins / decided_games * 100.0) if decided_games else 0.0
    is_active = row.get("active", True)

    total_wins += wins
    total_losses += losses

    if is_active:
        active_count += 1

    table_rows.append(
        {
            "Deck": row["name"],
            "Type": row["type"],
            "Wins": wins,
            "Losses": losses,
            "Decided Games": decided_games,
            "Win %": f"{win_pct:.1f}%",
            "Active": is_active,
        }
    )

    if decided_games > 0:
        chart_rows.append(
            {
                "deck": row["name"],
                "win_pct": win_pct,
                "win_pct_label": f"{win_pct:.1f}%",
                "decided_games": decided_games,
                "record": f"{wins}-{losses}",
            }
        )


table_rows.sort(
    key=lambda x: (
        float(x["Win %"].rstrip("%")),
        x["Decided Games"],
    ),
    reverse=True,
)

chart_rows.sort(key=lambda x: x["win_pct"], reverse=True)

# -----------------------------
# Summary metrics
# -----------------------------
total_decided_games = total_wins + total_losses

try:
    matches = api_req("GET", "/api/matches")
    total_logged_games = len(matches)
    undecided_games = sum(1 for match in matches if match.get("winner_id") is None)
except Exception:
    total_logged_games = total_decided_games
    undecided_games = 0

m1, m2, m3, m4 = st.columns(4)

m1.metric("Decks Shown", len(stats))
m2.metric("Active Decks Shown", active_count)
m3.metric("Decided Games", total_decided_games)
m4.metric("Undecided Games", undecided_games)

# -----------------------------
# Table
# -----------------------------
st.subheader("Deck Records")
st.caption("Win percentage is based on decided games only.")

st.dataframe(
    table_rows,
    width="stretch",
    hide_index=True,
)


# -----------------------------
# Chart
# -----------------------------
st.subheader("Win %")

if chart_rows:
    chart = (
        alt.Chart(alt.Data(values=chart_rows))
        .mark_bar()
        .encode(
            x=alt.X("win_pct:Q", title="Win %", scale=alt.Scale(domain=[0, 100])),
            y=alt.Y("deck:N", sort="-x", title="Deck"),
            tooltip=[
                alt.Tooltip("deck:N", title="Deck"),
                alt.Tooltip("record:N", title="Record"),
                alt.Tooltip("decided_games:Q", title="Decided Games"),
                alt.Tooltip("win_pct_label:N", title="Win %"),
            ],
        )
        .properties(height=max(320, min(720, 32 * len(chart_rows))))
    )

    st.altair_chart(chart, use_container_width=True)
else:
    st.info("No decided games recorded yet.")