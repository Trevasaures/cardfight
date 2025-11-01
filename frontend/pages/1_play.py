"""
Play page (thin)
- Random tab: roll matchup, pick winner, notes, save
- Custom tab: pick decks, first player, winner, notes, save
"""
import streamlit as st
from common import settings_expander, fetch_random, submit_match, fetch_decks
from components.dialogs import show_saved_dialog
from components.matchup_panel import current_matchup_section
from components.inputs import winner_radio, first_player_radio, notes_area, clear_keys
from components.toolbar import format_selector

st.set_page_config(page_title="Play", page_icon="🎲", layout="centered")
st.title("🎲 Play")

settings_expander()

# Show confirmation modal if a match was saved
if show_saved_dialog():
    st.stop()

# Shared format selector
mode = format_selector()

tab_random, tab_custom = st.tabs(["🎲 Random", "🛠️ Custom"])

# ---------------------- RANDOM TAB ----------------------
with tab_random:
    c1, c2 = st.columns(2)
    with c1:
        if st.button("Generate Matchup", width="stretch"):
            try:
                data = fetch_random(mode)
                st.session_state["matchup"] = data
                clear_keys("notes_random", "winner_random")  # reset widget-bound state
                st.toast("Matchup generated 🎲")
                st.rerun()
            except Exception as e:
                st.error(f"Failed to generate matchup: {e}")
    with c2:
        if st.button("Clear", width="stretch"):
            clear_keys("matchup", "notes_random", "winner_random")

    matchup = st.session_state.get("matchup")
    if matchup:
        d1, d2, first_id = matchup["deck1"], matchup["deck2"], matchup["first_player_id"]
        current_matchup_section(d1, d2, first_id)

        st.subheader("Pick the Winner")
        winner_id = winner_radio("winner_random", d1, d2)
        notes = notes_area("notes_random", "e.g., Came down to last turn, double trigger, etc.")

        if st.button("Save Result", type="primary", width="stretch"):
            try:
                fmt = "Standard" if mode == "standard" else "Stride" if mode == "stride" else "Any"
                submit_match(d1["id"], d2["id"], winner_id, notes, first_player_id=first_id, fmt=fmt)

                # queue dialog and clear panels
                st.session_state["__saved_match__"] = {
                    "title": "Match saved",
                    "mode": fmt,
                    "summary_lines": [
                        f"**{d1['name']}** vs **{d2['name']}**",
                        f"First player: **{(d1['name'] if first_id == d1['id'] else d2['name'])}**",
                        f"Winner: **{(d1['name'] if winner_id == d1['id'] else (d2['name'] if winner_id == d2['id'] else 'Undecided'))}**",
                    ],
                }
                clear_keys("matchup", "notes_random", "winner_random")
                st.rerun()
            except Exception as e:
                st.error(f"Failed to save: {e}")

# ---------------------- CUSTOM TAB ----------------------
with tab_custom:
    st.caption("Build your own matchup: pick two decks, who goes first, set winner, add notes.")
    try:
        all_decks = fetch_decks(include_inactive=False)
    except Exception as e:
        st.error(f"Failed to load decks: {e}")
        all_decks = []

    def _type_ok(t: str) -> bool:
        m = mode.lower()
        return (m == "any") or (m == "standard" and t == "Standard") or (m == "stride" and t == "Stride")

    decks = [d for d in all_decks if _type_ok(d["type"])]
    if not decks or len(decks) < 2:
        st.warning("Not enough active decks in this mode to create a custom match.")
        st.stop()

    labels = [f"{d['name']} ({d['type']})" for d in decks]
    by_label = {f"{d['name']} ({d['type']})": d for d in decks}

    left, right = st.columns(2)
    with left:
        d1_label = st.selectbox("Deck A", options=labels, index=0, key="custom_d1_label")
    with right:
        d2_label = st.selectbox("Deck B", options=labels, index=(1 if len(labels) > 1 else 0), key="custom_d2_label")

    d1, d2 = by_label[d1_label], by_label[d2_label]
    if d1["id"] == d2["id"]:
        st.error("Deck A and Deck B must be different.")
        st.stop()

    st.subheader("Who goes first?")
    first_id = first_player_radio("custom_first", d1, d2)

    st.subheader("Winner")
    winner_id = winner_radio("custom_winner", d1, d2)

    notes = notes_area("notes_custom", "e.g., Mulliganed to 5; trigger flood; misplay on T3; etc.")

    if st.button("Save Custom Match", type="primary", width="stretch"):
        try:
            fmt = "Standard" if mode == "standard" else "Stride" if mode == "stride" else "Any"
            submit_match(d1["id"], d2["id"], winner_id, notes, first_player_id=first_id, fmt=fmt)

            st.session_state["__saved_match__"] = {
                "title": "Custom match saved",
                "mode": fmt,
                "summary_lines": [
                    f"**{d1['name']}** vs **{d2['name']}**",
                    f"First player: **{(d1['name'] if first_id == d1['id'] else d2['name'])}**",
                    f"Winner: **{(d1['name'] if winner_id == d1['id'] else (d2['name'] if winner_id == d2['id'] else 'Undecided'))}**",
                ],
            }
            clear_keys("notes_custom", "custom_winner", "custom_first", "custom_d1_label", "custom_d2_label")
            st.rerun()
        except Exception as e:
            st.error(f"Failed to save: {e}")