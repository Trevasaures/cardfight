"""
Matches Manager
- Filter/search matches
- Edit winner/first player/notes/date/format
- Delete match (with confirmation)
"""
from datetime import datetime
import streamlit as st
from common import (
    settings_expander, fetch_decks, fetch_matches,
    update_match_api, delete_match_api
)

st.set_page_config(page_title="Matches", page_icon="📝", layout="wide")
st.title("📝 Matches")
settings_expander()

# -------------- Filters --------------
fl, fc, fr = st.columns([3, 2, 3])
with fl:
    try:
        active_decks = fetch_decks(include_inactive=False)
    except Exception as e:
        st.error(str(e))
        active_decks = []
    deck_map = {f"{d['name']} ({d['type']})": d["id"] for d in active_decks}
    deck_label = st.selectbox("Filter by deck (optional)", ["— All —"] + list(deck_map.keys()))
    deck_id = deck_map.get(deck_label) if deck_label != "— All —" else None

with fc:
    fmt = st.selectbox("Format", ["All", "Standard", "Stride", "Any"], index=0)

with fr:
    cols = st.columns(2)
    with cols[0]:
        since = st.date_input("Since", value=None)
    with cols[1]:
        until = st.date_input("Until", value=None)

st.write("")
qcol1, qcol2 = st.columns([2, 1])
with qcol1:
    q = st.text_input("Search notes")
with qcol2:
    result = st.selectbox("Result (relative to deck filter)", ["Any", "W", "L", "-"], index=0,
                          help="If a deck is selected, filter by its result.")

params = {}
if deck_id: params["deck_id"] = deck_id
if fmt != "All": params["format"] = fmt
if result != "Any": params["result"] = result
if since: params["since"] = since.isoformat()
if until: params["until"] = until.isoformat()
if q: params["q"] = q

# -------------- Load --------------
try:
    rows = fetch_matches(params)
except Exception as e:
    st.error(f"Failed to load matches: {e}")
    rows = []

if not rows:
    st.info("No matches found.")
    st.stop()

# -------------- Table --------------
st.subheader("Results")

def _row_key(m): return f"row_{m['id']}"

for m in rows:
    box = st.container(border=True)
    with box:
        hdr = st.columns([3, 3, 2, 9, 2])
        with hdr[0]:
            st.markdown(f"**{m['deck1_name']}** vs **{m['deck2_name']}**")
        with hdr[1]:
            st.caption(f"Format: {m.get('format') or '—'}")
            st.caption(f"Date: {m['date_played']}")
        with hdr[2]:
            result_text = "—"
            if m["winner_id"] == m["deck1_id"]:
                result_text = f"Winner: {m['deck1_name']}"
            elif m["winner_id"] == m["deck2_id"]:
                result_text = f"Winner: {m['deck2_name']}"
            st.caption(result_text)
        with hdr[3]:
            st.caption(f"First: {m['deck1_name'] if m.get('first_player_id') == m['deck1_id'] else (m['deck2_name'] if m.get('first_player_id') == m['deck2_id'] else '—')}")
        with hdr[4]:
            c1, c2 = st.columns(2)
            if c1.button("Edit", key=_row_key(m)+"_edit"):
                st.session_state["__edit_match__"] = m
                st.rerun()
            if c2.button("🗑️", key=_row_key(m)+"_del"):
                st.session_state["__delete_match__"] = m
                st.rerun()

        if m.get("notes"):
            st.markdown(f"**Notes:** {m['notes']}")

# -------------- Delete dialog --------------
if "__delete_match__" in st.session_state:
    target = st.session_state["__delete_match__"]

    @st.dialog("Confirm delete")
    def _del_dialog():
        st.error(f"Delete match {target['deck1_name']} vs {target['deck2_name']}?")
        colx, coly = st.columns([4,1])
        with colx:
            if st.button("Cancel"):
                st.session_state.pop("__delete_match__", None); st.rerun()
        with coly:
            if st.button("Delete", type="primary"):
                try:
                    delete_match_api(target["id"])
                    st.session_state.pop("__delete_match__", None)
                    st.success("Deleted.")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))
    _del_dialog()

# -------------- Edit dialog --------------
if "__edit_match__" in st.session_state:
    m = st.session_state["__edit_match__"]
    d1_id, d2_id = m["deck1_id"], m["deck2_id"]
    d1_name, d2_name = m["deck1_name"], m["deck2_name"]

    @st.dialog("Edit match")
    def _edit_dialog():
        fmt_val = st.selectbox(
            "Format",
            ["Standard", "Stride", "Any", "—"],
            index=(["Standard","Stride","Any","—"].index(m.get("format") or "—"))
        )

        # First player
        fp = st.radio(
            "First player",
            options=[d1_id, d2_id, None],
            index=0 if m.get("first_player_id") == d1_id else 1 if m.get("first_player_id") == d2_id else 2,
            format_func=lambda x: d1_name if x == d1_id else d2_name if x == d2_id else "—",
            horizontal=True,
        )

        # Winner
        win = st.radio(
            "Winner",
            options=[d1_id, d2_id, None],
            index=0 if m.get("winner_id") == d1_id else 1 if m.get("winner_id") == d2_id else 2,
            format_func=lambda x: d1_name if x == d1_id else d2_name if x == d2_id else "Undecided",
            horizontal=True,
        )

        notes = st.text_area("Notes", value=m.get("notes", ""))

        st.divider()

        # ---------- Button Row ----------
        btn_left, spacer, btn_right = st.columns([3, 7, 4])

        with btn_left:
            if st.button("Cancel"):
                st.session_state.pop("__edit_match__", None)
                st.rerun()

        with btn_right:
            if st.button("Save changes", type="primary", key="save_btn"):
                try:
                    payload = {
                        "format": (None if fmt_val == "—" else fmt_val),
                        "first_player_id": fp,
                        "winner_id": win,
                        "notes": notes,
                    }
                    update_match_api(m["id"], payload)
                    st.session_state.pop("__edit_match__", None)
                    st.success("Saved.")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))
    _edit_dialog()