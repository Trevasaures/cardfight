"""
Page for displaying stats
- Table of decks with win/loss records
- Bar chart of win %
"""
import streamlit as st
import altair as alt
from common import settings_expander, fetch_stats_table

st.set_page_config(page_title="Stats", page_icon="📊", layout="wide")
st.title("📊 Stats")

settings_expander()

# ---- Controls ----
c1, c2, c3 = st.columns([2, 2, 3])
with c1:
    active_only = st.checkbox("Active only", value=False)
with c2:
    fmt = st.selectbox("Format", ["All", "Standard", "Stride"], index=0)

# ---- Fetch ----
try:
    stats = fetch_stats_table()
except Exception as e:
    st.error(str(e))
    stats = []

# ---- Filter ----
if active_only:
    stats = [r for r in stats if r.get("active", True)]
if fmt != "All":
    stats = [r for r in stats if r.get("type") == fmt]

if not stats:
    st.info("No decks found.")
else:
    # Table + chart rows
    table_rows = []
    chart_rows = []
    for r in stats:
        games = r.get("games", r["wins"] + r["losses"])
        wpct = (r.get("win_pct", 0.0) or 0.0) * 100.0
        table_rows.append({
            "Deck": r["name"],
            "Type": r["type"],
            "Wins": r["wins"],
            "Losses": r["losses"],
            "Games": games,
            "Win %": f"{wpct:.1f}%",
            "Active": r.get("active", True),
        })
        if games > 0:
            chart_rows.append({
                "deck": r["name"],
                "win_pct": wpct,
                "win_pct_label": f"{wpct:.1f}%",
            })

    table_rows.sort(key=lambda x: (float(x["Win %"].rstrip("%")), x["Games"]), reverse=True)

    st.subheader("Table")
    st.dataframe(table_rows, width="stretch", hide_index=True)

    st.subheader("Win % (bar chart)")
    if chart_rows:
        # Sort chart rows by win_pct desc
        chart_rows.sort(key=lambda x: x["win_pct"], reverse=True)
        data = alt.Data(values=chart_rows)
        chart = (
            alt.Chart(data)
            .mark_bar()
            .encode(
                x=alt.X("win_pct:Q", title="Win %"),
                y=alt.Y("deck:N", sort="-x", title="Decks"),
                tooltip=[
                    alt.Tooltip("deck:N", title="Deck:"),
                    alt.Tooltip("win_pct_label:N", title="Win Percentage:"),
                ],
            )
            .properties(height=420)
        )
        st.altair_chart(chart, use_container_width=True)
    else:
        st.info("No games recorded yet.")