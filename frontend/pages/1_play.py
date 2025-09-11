"""
Page for playing matches between decks
- Fetch random matchup from backend
- Pick winner, add notes
- Submit result to backend
"""
import streamlit as st
from common import settings_expander, fetch_random, submit_match

st.set_page_config(page_title="Play", page_icon="🎲", layout="centered")
st.title("🎲 Play")

settings_expander()

mode = st.radio("Choose mode", options=["any", "standard", "stride"], index=0, horizontal=True)

col1, col2 = st.columns(2)
with col1:
    if st.button("Generate Matchup", use_container_width=True):
        try:
            data = fetch_random(mode)
            st.session_state["matchup"] = data
            st.session_state["notes"] = ""
            st.session_state["winner"] = None
            st.success("Matchup generated!")
        except Exception as e:
            st.error(str(e))

with col2:
    if st.button("Clear", use_container_width=True):
        st.session_state.pop("matchup", None)
        st.session_state.pop("notes", None)
        st.session_state.pop("winner", None)

matchup = st.session_state.get("matchup")
if matchup:
    d1 = matchup["deck1"]; d2 = matchup["deck2"]; first_id = matchup["first_player_id"]

    st.subheader("Current Matchup")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown(
            f"**{d1['name']}**  \n"
            f"Type: `{d1['type']}`  \n"
            f"Record: {d1['wins']}-{d1['losses']}  \n"
            f"{'🟢 Goes first' if d1['id'] == first_id else ''}"
        )
    with c2:
        st.markdown(
            f"**{d2['name']}**  \n"
            f"Type: `{d2['type']}`  \n"
            f"Record: {d2['wins']}-{d2['losses']}  \n"
            f"{'🟢 Goes first' if d2['id'] == first_id else ''}"
        )

    st.subheader("Pick the Winner")
    options = [d1["id"], d2["id"], None]
    labels = {
        d1["id"]: d1["name"],
        d2["id"]: d2["name"],
        None: "Undecided / Log without winner",
    }
    st.radio("Winner", options=options, index=2,
             format_func=lambda x: labels[x], horizontal=True, key="winner")

    st.text_area("Match notes (optional)", value=st.session_state.get("notes", ""),
                 key="notes", placeholder="e.g., Came down to last turn, double trigger, etc.")

    if st.button("Save Result", type="primary", use_container_width=True):
        try:
            fmt = "Standard" if mode == "standard" else "Stride" if mode == "stride" else "Any"
            submit_match(
                d1["id"], d2["id"],
                st.session_state.get("winner"),
                st.session_state.get("notes", ""),
                first_player_id=first_id,
                fmt=fmt,
            )
            st.success("Match saved!")
            st.session_state.pop("matchup", None)
            st.rerun()
        except Exception as e:
            st.error(str(e))